/**
 * Unit tests for rf-engine.ts (T-8c-09)
 *
 * Tests the ITU-R P.1238 indoor path loss model:
 *   PL(d) = PL(1m) + 10 * n * log10(d) + Sum(wall_losses)
 *   RSSI  = TX_Power + Antenna_Gain + Receiver_Gain - PL(d)
 *
 * Reference values from docs/research/RF-Modellierung.md:
 *   PL(1m) @ 2.4 GHz = 40.05 dB
 *   PL(1m) @ 5 GHz   = 46.42 dB
 *   PL(1m) @ 6 GHz   = 47.96 dB
 *   n (residential)   = 3.5 (default)
 *   Receiver gain      = -3 dBi (smartphone default)
 *
 * NOTE: rf-engine.ts imports computeWallLoss from spatial-grid.ts.
 * We mock that module so rf-engine tests run independently.
 * The wall-loss behaviour is tested separately in spatial-grid.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock spatial-grid before importing rf-engine ─────────────────────────────
// vi.mock is hoisted by vitest to the top of the file, before all imports.
vi.mock('../spatial-grid', () => ({
  computeWallLoss: vi.fn(() => 0),
}));

import {
  REFERENCE_LOSS,
  DEFAULT_PATH_LOSS_EXPONENT,
  PATH_LOSS_EXPONENTS,
  DEFAULT_RECEIVER_GAIN_DBI,
  MIN_DISTANCE,
  createRFConfig,
  computePathLoss,
  computeRSSI,
  type RFConfig,
} from '../rf-engine';

import { computeWallLoss } from '../spatial-grid';

import type { APConfig } from '../worker-types';
import type { SpatialGrid, SpatialGridEntry } from '../spatial-grid';
import { DEFAULT_RECEIVER_HEIGHT_M } from '../rf-engine';

// Minimal stubs — contents irrelevant because computeWallLoss is mocked
const EMPTY_GRID: SpatialGrid = {
  cells: new Map(),
  gridCols: 1,
  gridRows: 1,
  cellSize: 1,
  originX: 0,
  originY: 0,
};
const EMPTY_SEGMENTS: SpatialGridEntry[] = [];

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeAP(
  x: number,
  y: number,
  txPowerDbm = 23,
  antennaGainDbi = 3.2,
  enabled = true,
): APConfig {
  // Set heightM to receiver height so 3D distance == 2D distance in tests
  return { id: 'test-ap', x, y, heightM: DEFAULT_RECEIVER_HEIGHT_M, txPowerDbm, antennaGainDbi, enabled };
}

/** Wraps computeRSSI with the empty grid stubs (wall loss is mocked). */
function callComputeRSSI(
  px: number, py: number, ap: APConfig, config: RFConfig,
): number {
  return computeRSSI(px, py, ap, config, EMPTY_GRID, EMPTY_SEGMENTS);
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('RF model constants', () => {
  it('REFERENCE_LOSS at 2.4 GHz is 40.05 dB', () => {
    expect(REFERENCE_LOSS['2.4ghz']).toBeCloseTo(40.05, 2);
  });

  it('REFERENCE_LOSS at 5 GHz is 46.42 dB', () => {
    expect(REFERENCE_LOSS['5ghz']).toBeCloseTo(46.42, 2);
  });

  it('REFERENCE_LOSS at 6 GHz is 47.96 dB', () => {
    expect(REFERENCE_LOSS['6ghz']).toBeCloseTo(47.96, 2);
  });

  it('DEFAULT_PATH_LOSS_EXPONENT is 3.5', () => {
    expect(DEFAULT_PATH_LOSS_EXPONENT).toBe(3.5);
  });

  it('DEFAULT_RECEIVER_GAIN_DBI is -3', () => {
    expect(DEFAULT_RECEIVER_GAIN_DBI).toBe(-3);
  });

  it('MIN_DISTANCE is positive and prevents log(0) singularity', () => {
    expect(MIN_DISTANCE).toBeGreaterThan(0);
    expect(MIN_DISTANCE).toBeLessThanOrEqual(1.0);
  });
});

// ─── createRFConfig ───────────────────────────────────────────────────────────

describe('createRFConfig', () => {
  it('creates default config for 2.4 GHz with correct reference loss and band exponent', () => {
    const config = createRFConfig('2.4ghz');
    expect(config.referenceLoss).toBeCloseTo(40.05, 2);
    expect(config.pathLossExponent).toBe(PATH_LOSS_EXPONENTS['2.4ghz']);
    expect(config.receiverGain).toBe(DEFAULT_RECEIVER_GAIN_DBI);
  });

  it('creates default config for 5 GHz with correct reference loss', () => {
    const config = createRFConfig('5ghz');
    expect(config.referenceLoss).toBeCloseTo(46.42, 2);
  });

  it('creates default config for 6 GHz with correct reference loss', () => {
    const config = createRFConfig('6ghz');
    expect(config.referenceLoss).toBeCloseTo(47.96, 2);
  });

  it('overrides pathLossExponent when provided', () => {
    const config = createRFConfig('5ghz', { pathLossExponent: 2.8 });
    expect(config.pathLossExponent).toBe(2.8);
    expect(config.referenceLoss).toBeCloseTo(46.42, 2);
  });

  it('overrides receiverGain when provided', () => {
    const config = createRFConfig('2.4ghz', { receiverGain: -1 });
    expect(config.receiverGain).toBe(-1);
  });

  it('all overrides can be set simultaneously', () => {
    const config = createRFConfig('2.4ghz', {
      referenceLoss: 42.0,
      pathLossExponent: 2.5,
      receiverGain: 0,
    });
    expect(config.referenceLoss).toBe(42.0);
    expect(config.pathLossExponent).toBe(2.5);
    expect(config.receiverGain).toBe(0);
  });
});

// ─── computePathLoss ──────────────────────────────────────────────────────────

describe('computePathLoss', () => {
  const config24 = createRFConfig('2.4ghz');
  const config5 = createRFConfig('5ghz');
  const config6 = createRFConfig('6ghz');

  describe('reference distance of 1m', () => {
    it('at 1m returns exactly PL(1m) for 2.4 GHz', () => {
      // PL(1m) = 40.05 + 10*3.5*log10(1) = 40.05 + 0 = 40.05
      const pl = computePathLoss(1, config24);
      expect(pl).toBeCloseTo(40.05, 2);
    });

    it('at 1m returns exactly PL(1m) for 5 GHz', () => {
      const pl = computePathLoss(1, config5);
      expect(pl).toBeCloseTo(46.42, 2);
    });

    it('at 1m returns exactly PL(1m) for 6 GHz', () => {
      const pl = computePathLoss(1, config6);
      expect(pl).toBeCloseTo(47.96, 2);
    });
  });

  describe('known distances', () => {
    it('at 10m for 2.4 GHz: PL = 40.05 + 30 = 70.05 dB', () => {
      // log10(10) = 1, n=3.0 for 2.4 GHz, so 10 * 3.0 * 1 = 30
      const pl = computePathLoss(10, config24);
      expect(pl).toBeCloseTo(70.05, 2);
    });

    it('at 10m for 5 GHz: PL = 46.42 + 32 = 78.42 dB', () => {
      // n=3.2 for 5 GHz, so 10 * 3.2 * 1 = 32
      const pl = computePathLoss(10, config5);
      expect(pl).toBeCloseTo(78.42, 2);
    });

    it('at 100m for 2.4 GHz: PL = 40.05 + 60 = 100.05 dB', () => {
      // log10(100) = 2, n=3.0, so 10 * 3.0 * 2 = 60
      const pl = computePathLoss(100, config24);
      expect(pl).toBeCloseTo(100.05, 2);
    });

    it('at 5m for 2.4 GHz: PL = 40.05 + 10*3.0*log10(5)', () => {
      const n = PATH_LOSS_EXPONENTS['2.4ghz'];
      const expected = 40.05 + 10 * n * Math.log10(5);
      const pl = computePathLoss(5, config24);
      expect(pl).toBeCloseTo(expected, 4);
    });
  });

  describe('minimum distance clamping', () => {
    it('at 0m uses MIN_DISTANCE and does not crash', () => {
      const pl = computePathLoss(0, config24);
      const expected = 40.05 + 10 * 3.5 * Math.log10(MIN_DISTANCE);
      expect(pl).toBeCloseTo(expected, 2);
    });

    it('at distance below MIN_DISTANCE is clamped to MIN_DISTANCE result', () => {
      const plTiny = computePathLoss(0.01, config24);
      const plMin = computePathLoss(MIN_DISTANCE, config24);
      expect(plTiny).toBeCloseTo(plMin, 4);
    });

    it('at negative distance uses MIN_DISTANCE (no crash)', () => {
      const plNeg = computePathLoss(-5, config24);
      const plMin = computePathLoss(MIN_DISTANCE, config24);
      expect(plNeg).toBeCloseTo(plMin, 4);
    });
  });

  describe('path loss exponent influence', () => {
    it('higher path loss exponent produces greater path loss at distances > 1m', () => {
      const configLow = createRFConfig('2.4ghz', { pathLossExponent: 2.0 });
      const configHigh = createRFConfig('2.4ghz', { pathLossExponent: 4.0 });
      expect(computePathLoss(10, configHigh)).toBeGreaterThan(computePathLoss(10, configLow));
    });

    it('calibrated n=2.8 differs from default n=3.0 by 2 dB at 10m', () => {
      // Difference = 10*(3.0 - 2.8)*log10(10) = 10*0.2*1 = 2.0 dB
      const plDefault = computePathLoss(10, createRFConfig('2.4ghz'));
      const plCalibrated = computePathLoss(10, createRFConfig('2.4ghz', { pathLossExponent: 2.8 }));
      expect(plDefault - plCalibrated).toBeCloseTo(2.0, 2);
    });
  });

  describe('band comparison', () => {
    it('5 GHz has more path loss than 2.4 GHz at the same distance', () => {
      // Reference loss diff: 46.42 - 40.05 = 6.37, plus exponent diff at 10m: (3.2-3.0)*10 = 2
      const diff = computePathLoss(10, config5) - computePathLoss(10, config24);
      expect(diff).toBeCloseTo(8.37, 1);
    });

    it('6 GHz has more path loss than 5 GHz at the same distance', () => {
      // Reference diff: 47.96 - 46.42 = 1.54, plus exponent diff at 10m: (3.3-3.2)*10 = 1
      const diff = computePathLoss(10, config6) - computePathLoss(10, config5);
      expect(diff).toBeCloseTo(2.54, 1);
    });

    it('band difference grows with distance due to different exponents', () => {
      const diff10 = computePathLoss(10, config5) - computePathLoss(10, config24);
      const diff50 = computePathLoss(50, config5) - computePathLoss(50, config24);
      // Higher exponent for 5 GHz means the gap widens at greater distances
      expect(diff50).toBeGreaterThan(diff10);
    });
  });
});

// ─── computeRSSI ──────────────────────────────────────────────────────────────

describe('computeRSSI', () => {
  beforeEach(() => {
    vi.mocked(computeWallLoss).mockReturnValue(0);
  });

  describe('DAP-X2810 reference values at 2.4 GHz (n=3.0)', () => {
    const config = createRFConfig('2.4ghz');

    it('at 1m (AP at origin, receiver at x=1): RSSI = 23 + 3.2 - 3 - 40.05 = -16.85 dBm', () => {
      const ap = makeAP(0, 0, 23, 3.2);
      const rssi = callComputeRSSI(1, 0, ap, config);
      expect(rssi).toBeCloseTo(-16.85, 1);
    });

    it('at 10m (AP at origin, receiver at x=10): RSSI = 23 + 3.2 - 3 - 70.05 = -46.85 dBm', () => {
      // PL = 40.05 + 10*3.0*1 = 70.05
      const ap = makeAP(0, 0, 23, 3.2);
      const rssi = callComputeRSSI(10, 0, ap, config);
      expect(rssi).toBeCloseTo(-46.85, 1);
    });
  });

  describe('DAP-X2810 reference values at 5 GHz (n=3.2)', () => {
    const config = createRFConfig('5ghz');

    it('at 1m: RSSI = 26 + 4.3 - 3 - 46.42 = -19.12 dBm', () => {
      const ap = makeAP(0, 0, 26, 4.3);
      const rssi = callComputeRSSI(1, 0, ap, config);
      expect(rssi).toBeCloseTo(-19.12, 1);
    });

    it('at 10m: RSSI = 26 + 4.3 - 3 - 78.42 = -51.12 dBm', () => {
      // PL = 46.42 + 10*3.2*1 = 78.42
      const ap = makeAP(0, 0, 26, 4.3);
      const rssi = callComputeRSSI(10, 0, ap, config);
      expect(rssi).toBeCloseTo(-51.12, 1);
    });
  });

  describe('wall loss integration (mocked)', () => {
    const config = createRFConfig('2.4ghz');
    // Baseline: AP at origin, receiver at 10m, no walls
    // PL = 40.05 + 10*3.0*1 = 70.05
    // RSSI_base = 23 + 3.2 - 3 - 70.05 = -46.85 dBm
    const BASE_RSSI = 23 + 3.2 + (-3) - 70.05;

    it('one wall with 10 dB attenuation decreases RSSI by 10 dB', () => {
      vi.mocked(computeWallLoss).mockReturnValue(10);
      const ap = makeAP(0, 0, 23, 3.2);
      const rssi = callComputeRSSI(10, 0, ap, config);
      expect(rssi).toBeCloseTo(BASE_RSSI - 10, 1);
    });

    it('one wall with 25 dB attenuation (concrete) decreases RSSI by 25 dB', () => {
      vi.mocked(computeWallLoss).mockReturnValue(25);
      const ap = makeAP(0, 0, 23, 3.2);
      const rssi = callComputeRSSI(10, 0, ap, config);
      expect(rssi).toBeCloseTo(BASE_RSSI - 25, 1);
    });

    it('three walls with cumulative 42 dB attenuation (5+12+25) decreases RSSI by 42 dB', () => {
      vi.mocked(computeWallLoss).mockReturnValue(42);
      const ap = makeAP(0, 0, 23, 3.2);
      const rssi = callComputeRSSI(10, 0, ap, config);
      expect(rssi).toBeCloseTo(BASE_RSSI - 42, 1);
    });

    it('computeWallLoss is called with (apX, apY, pointX, pointY, grid, segments)', () => {
      vi.mocked(computeWallLoss).mockReturnValue(0);
      const ap = makeAP(3, 7, 23, 3.2);
      callComputeRSSI(9, 2, ap, config);
      expect(vi.mocked(computeWallLoss)).toHaveBeenCalledWith(
        3, 7,   // AP position
        9, 2,   // receiver position
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('RSSI formula linearity', () => {
    const config = createRFConfig('2.4ghz');

    it('doubling TX power by 6 dB increases RSSI by 6 dB', () => {
      const ap20 = makeAP(0, 0, 20, 3.2);
      const ap26 = makeAP(0, 0, 26, 3.2);
      const rssi20 = callComputeRSSI(5, 0, ap20, config);
      const rssi26 = callComputeRSSI(5, 0, ap26, config);
      expect(rssi26 - rssi20).toBeCloseTo(6, 4);
    });

    it('antenna gain increase of 5 dBi increases RSSI by 5 dB', () => {
      const apLow = makeAP(0, 0, 23, 0);
      const apHigh = makeAP(0, 0, 23, 5);
      const rssiLow = callComputeRSSI(5, 0, apLow, config);
      const rssiHigh = callComputeRSSI(5, 0, apHigh, config);
      expect(rssiHigh - rssiLow).toBeCloseTo(5, 4);
    });

    it('receiver gain change of 5 dBi changes RSSI by 5 dB', () => {
      const config0 = createRFConfig('2.4ghz', { receiverGain: 0 });
      const configM5 = createRFConfig('2.4ghz', { receiverGain: -5 });
      const ap = makeAP(0, 0, 23, 3.2);
      const rssi0 = callComputeRSSI(5, 0, ap, config0);
      const rssiM5 = callComputeRSSI(5, 0, ap, configM5);
      expect(rssi0 - rssiM5).toBeCloseTo(5, 4);
    });
  });

  describe('distance calculation', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(0, 0, 23, 3.2);

    it('2D Euclidean distance: point (3,4) = 5m equals point (5,0) = 5m for RSSI', () => {
      const rssiDiag = callComputeRSSI(3, 4, ap, config);
      const rssiAxis = callComputeRSSI(5, 0, ap, config);
      expect(rssiDiag).toBeCloseTo(rssiAxis, 4);
    });

    it('receiver at AP position (d=0) uses MIN_DISTANCE — finite RSSI returned', () => {
      const apAt55 = makeAP(5, 5, 23, 3.2);
      expect(() => callComputeRSSI(5, 5, apAt55, config)).not.toThrow();
      const rssi = callComputeRSSI(5, 5, apAt55, config);
      expect(Number.isFinite(rssi)).toBe(true);
    });

    it('RSSI at AP position matches expected MIN_DISTANCE calculation', () => {
      const rssiAtAP = callComputeRSSI(0, 0, ap, config);
      const n = PATH_LOSS_EXPONENTS['2.4ghz'];
      const expectedPL = 40.05 + 10 * n * Math.log10(MIN_DISTANCE);
      const expectedRSSI = 23 + 3.2 + (-3) - expectedPL;
      expect(rssiAtAP).toBeCloseTo(expectedRSSI, 4);
    });
  });

  describe('edge cases', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(0, 0, 23, 3.2);

    it('very large distance (50m) produces a finite RSSI value', () => {
      const rssi = callComputeRSSI(50, 0, ap, config);
      expect(Number.isFinite(rssi)).toBe(true);
    });

    it('signal at 50m is weaker than at 10m', () => {
      const rssi10 = callComputeRSSI(10, 0, ap, config);
      const rssi50 = callComputeRSSI(50, 0, ap, config);
      expect(rssi50).toBeLessThan(rssi10);
    });

    it('5 GHz RSSI is weaker than 2.4 GHz RSSI for same AP parameters', () => {
      const rssi24 = callComputeRSSI(10, 0, ap, createRFConfig('2.4ghz'));
      const rssi5 = callComputeRSSI(10, 0, ap, createRFConfig('5ghz'));
      expect(rssi5).toBeLessThan(rssi24);
    });

    it('computeWallLoss is called exactly once per computeRSSI invocation', () => {
      vi.clearAllMocks();
      callComputeRSSI(10, 0, ap, config);
      expect(vi.mocked(computeWallLoss)).toHaveBeenCalledTimes(1);
    });
  });
});
