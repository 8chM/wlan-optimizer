/**
 * Cross-module integration tests for the WLAN-Optimizer project.
 *
 * Tests five cross-module interaction areas using real implementations
 * (no Tauri IPC calls are made — those API layers are mocked where needed):
 *
 *   1. Heatmap + RF Engine: walls + APs → RSSI grid → realistic values,
 *      coverage percentages
 *   2. Spatial Grid + RF Engine: wall losses along paths, attenuation values
 *   3. Color scheme + Heatmap values: full RSSI → LUT index → color pipeline
 *      for all 3 schemes
 *   4. Quality determination: good/fair/poor/failed mapping for RSSI and
 *      throughput combinations
 *   5. Keyboard shortcut matching: matchShortcut() on mock KeyboardEvent objects
 *   6. i18n key completeness: en.json and de.json have identical key sets
 */

import { describe, it, expect } from 'vitest';

// ─── Module imports ────────────────────────────────────────────────────────────

import {
  createRFConfig,
  computeRSSI,
  computePathLoss,
  REFERENCE_LOSS,
  DEFAULT_PATH_LOSS_EXPONENT,
  DEFAULT_RECEIVER_GAIN_DBI,
  DEFAULT_RECEIVER_HEIGHT_M,
  MIN_DISTANCE,
} from '$lib/heatmap/rf-engine';

import {
  buildSpatialGrid,
  computeWallLoss,
  segmentsIntersect,
} from '$lib/heatmap/spatial-grid';

import type { SpatialGrid, SpatialGridEntry } from '$lib/heatmap/spatial-grid';

import {
  getColorLUT,
  rssiToLutIndex,
  generateViridisLUT,
  generateJetLUT,
  generateInfernoLUT,
  RSSI_MIN,
  RSSI_MAX,
} from '$lib/heatmap/color-schemes';

import type { ColorScheme } from '$lib/heatmap/color-schemes';
import type { APConfig, WallData } from '$lib/heatmap/worker-types';

import {
  matchShortcut,
  formatShortcut,
  SHORTCUTS,
  DISPLAY_SHORTCUTS,
} from '$lib/utils/keyboard';

import enMessages from '$lib/i18n/messages/en.json';
import deMessages from '$lib/i18n/messages/de.json';

// ─── Shared test helpers ───────────────────────────────────────────────────────

function makeAP(
  x: number,
  y: number,
  txPowerDbm = 23,
  antennaGainDbi = 3.2,
  id = 'ap-1',
): APConfig {
  // Set heightM to receiver height so 3D distance == 2D distance in tests
  return { id, x, y, heightM: DEFAULT_RECEIVER_HEIGHT_M, txPowerDbm, antennaGainDbi, enabled: true };
}

function makeWall(
  x1: number, y1: number,
  x2: number, y2: number,
  attenuationDb = 10,
): WallData {
  return { segments: [{ x1, y1, x2, y2 }], attenuationDb };
}

function buildGrid(
  walls: WallData[],
  w = 20,
  h = 20,
): { grid: SpatialGrid; allSegments: SpatialGridEntry[] } {
  return buildSpatialGrid(walls, w, h);
}

/**
 * Computes RSSI values for every grid cell across a floor plan and returns
 * the resulting flat array together with summary statistics.
 */
function computeHeatmapGrid(
  aps: APConfig[],
  walls: WallData[],
  floorW: number,
  floorH: number,
  gridStep: number,
): { rssiValues: number[]; min: number; max: number; avg: number } {
  const { grid, allSegments } = buildSpatialGrid(walls, floorW, floorH);
  const config = createRFConfig('2.4ghz');
  const cols = Math.ceil(floorW / gridStep) + 1;
  const rows = Math.ceil(floorH / gridStep) + 1;
  const rssiValues: number[] = [];

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const px = gx * gridStep;
      const py = gy * gridStep;
      // Max-signal model: best RSSI among enabled APs
      let bestRSSI = -Infinity;
      for (const ap of aps) {
        if (!ap.enabled) continue;
        const rssi = computeRSSI(px, py, ap, config, grid, allSegments);
        if (rssi > bestRSSI) bestRSSI = rssi;
      }
      if (bestRSSI === -Infinity) bestRSSI = RSSI_MIN;
      rssiValues.push(bestRSSI);
    }
  }

  const min = Math.min(...rssiValues);
  const max = Math.max(...rssiValues);
  const avg = rssiValues.reduce((s, v) => s + v, 0) / rssiValues.length;
  return { rssiValues, min, max, avg };
}

/**
 * Computes coverage percentage: fraction of grid cells with RSSI above threshold.
 */
function coveragePercent(rssiValues: number[], threshold: number): number {
  const covered = rssiValues.filter((v) => v >= threshold).length;
  return (covered / rssiValues.length) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Heatmap + RF Engine Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Heatmap + RF Engine Integration', () => {
  describe('RSSI grid values are physically realistic', () => {
    it('AP in the centre of a 10x10m room: nearest cell is strong, far corners are weaker', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const { rssiValues } = computeHeatmapGrid([ap], [], 10, 10, 1.0);

      // The grid cell at (5,5) is closest; its RSSI should be the strongest value
      const maxRSSI = Math.max(...rssiValues);
      // At MIN_DISTANCE (0.1 m): RSSI = 23 + 3.2 - 3 - (40.05 + 10*3.5*log10(0.1))
      //                                = 23.2 - (40.05 - 35) = 18.15 dBm — very strong
      expect(maxRSSI).toBeGreaterThan(-30);

      // Far corners (~7m from AP) should be significantly weaker
      const minRSSI = Math.min(...rssiValues);
      expect(minRSSI).toBeLessThan(maxRSSI - 20);
    });

    it('RSSI at 1 m from AP matches the reference formula (no walls)', () => {
      // Reference: D-Link DAP-X2810, 2.4 GHz
      // RSSI = TX(23) + AntGain(3.2) + RxGain(-3) - PL(1m)
      // PL(1m) @ 2.4 GHz = 40.05 dB
      // RSSI = 23.2 - 40.05 = -16.85 dBm
      const ap = makeAP(0, 0, 23, 3.2);
      const config = createRFConfig('2.4ghz');
      const { grid, allSegments } = buildGrid([]);
      const rssi = computeRSSI(1, 0, ap, config, grid, allSegments);
      expect(rssi).toBeCloseTo(-16.85, 1);
    });

    it('RSSI at 10 m without walls matches the expected formula value', () => {
      // PL(10m) = 40.05 + 10*3.5*log10(10) = 40.05 + 35 = 75.05 dB
      // RSSI = 23 + 3.2 - 3 - 75.05 = -51.85 dBm
      const ap = makeAP(0, 0, 23, 3.2);
      const config = createRFConfig('2.4ghz');
      const { grid, allSegments } = buildGrid([]);
      const rssi = computeRSSI(10, 0, ap, config, grid, allSegments);
      expect(rssi).toBeCloseTo(-51.85, 1);
    });

    it('all RSSI values are within the valid dBm range for residential Wi-Fi', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const walls = [
        makeWall(3, 0, 3, 10, 10),
        makeWall(7, 0, 7, 10, 12),
      ];
      const { rssiValues } = computeHeatmapGrid([ap], walls, 10, 10, 1.0);

      // All values should be below the TX power ceiling and above a practical floor
      for (const rssi of rssiValues) {
        expect(rssi).toBeLessThanOrEqual(30);  // Cannot exceed TX + gains
        expect(rssi).toBeGreaterThan(-120);    // Practical noise floor
      }
    });
  });

  describe('coverage percentage calculations', () => {
    it('single AP in open space: coverage above -65 dBm is high at short range', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const { rssiValues } = computeHeatmapGrid([ap], [], 10, 10, 1.0);
      const goodCoverage = coveragePercent(rssiValues, -65);
      // In free space with a strong AP in the centre, most of a 10x10 m room
      // should exceed -65 dBm (good signal threshold per RF-Modellierung.md)
      expect(goodCoverage).toBeGreaterThan(50);
    });

    it('multiple walls reduce coverage compared to open space', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const heavyWalls = [
        makeWall(3, 0, 3, 10, 15),
        makeWall(7, 0, 7, 10, 15),
        makeWall(0, 3, 10, 3, 15),
        makeWall(0, 7, 10, 7, 15),
      ];

      const { rssiValues: openValues } = computeHeatmapGrid([ap], [], 10, 10, 1.0);
      const { rssiValues: walledValues } = computeHeatmapGrid([ap], heavyWalls, 10, 10, 1.0);

      const openCoverage = coveragePercent(openValues, -70);
      const walledCoverage = coveragePercent(walledValues, -70);

      expect(walledCoverage).toBeLessThan(openCoverage);
    });

    it('two APs together provide better coverage than one AP alone', () => {
      const ap1 = makeAP(2.5, 5, 23, 3.2, 'ap-1');
      const ap2 = makeAP(7.5, 5, 23, 3.2, 'ap-2');

      const { rssiValues: oneAP } = computeHeatmapGrid([ap1], [], 10, 10, 1.0);
      const { rssiValues: twoAPs } = computeHeatmapGrid([ap1, ap2], [], 10, 10, 1.0);

      const coverage1AP = coveragePercent(oneAP, -65);
      const coverage2APs = coveragePercent(twoAPs, -65);

      expect(coverage2APs).toBeGreaterThanOrEqual(coverage1AP);
    });

    it('disabled AP contributes nothing to the coverage', () => {
      const enabledAP: APConfig = { id: 'ap-1', x: 5, y: 5, txPowerDbm: 23, antennaGainDbi: 3.2, enabled: true };
      const disabledAP: APConfig = { id: 'ap-2', x: 2, y: 5, txPowerDbm: 23, antennaGainDbi: 3.2, enabled: false };

      const { rssiValues: withEnabled } = computeHeatmapGrid([enabledAP], [], 10, 10, 1.0);
      const { rssiValues: withDisabled } = computeHeatmapGrid([enabledAP, disabledAP], [], 10, 10, 1.0);

      // Adding a disabled AP should not change any RSSI value
      for (let i = 0; i < withEnabled.length; i++) {
        expect(withDisabled[i]).toBeCloseTo(withEnabled[i]!, 4);
      }
    });

    it('coverage threshold -85 dBm is near 100% with AP in centre of small room', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const { rssiValues } = computeHeatmapGrid([ap], [], 10, 10, 1.0);
      // -85 dBm is the poor/no-signal boundary; a centrally placed strong AP
      // should cover the entire small floor plan above this threshold
      const coverage = coveragePercent(rssiValues, -85);
      expect(coverage).toBeGreaterThan(95);
    });

    it('statistics: average RSSI is between min and max', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const walls = [makeWall(5, 0, 5, 10, 10)];
      const { min, max, avg } = computeHeatmapGrid([ap], walls, 10, 10, 1.0);

      expect(avg).toBeGreaterThanOrEqual(min);
      expect(avg).toBeLessThanOrEqual(max);
    });
  });

  describe('calibrated path loss exponent changes the heatmap', () => {
    it('lower path loss exponent increases coverage percentage', () => {
      const ap = makeAP(5, 5, 23, 3.2);
      const { grid, allSegments } = buildGrid([]);

      const configDefault = createRFConfig('2.4ghz');
      const configCalibrated = createRFConfig('2.4ghz', { pathLossExponent: 2.8 });

      // Compute at a 5 m distance point
      const rssiDefault = computeRSSI(10, 5, ap, configDefault, grid, allSegments);
      const rssiCalibrated = computeRSSI(10, 5, ap, configCalibrated, grid, allSegments);

      // n=2.8 produces less path loss than default n=3.5
      expect(rssiCalibrated).toBeGreaterThan(rssiDefault);
      // Difference: 10*(3.5-2.8)*log10(5) = 7 * 0.699 ≈ 4.89 dB
      const dist = Math.sqrt((10 - 5) ** 2 + (5 - 5) ** 2);
      const expected = 10 * (DEFAULT_PATH_LOSS_EXPONENT - 2.8) * Math.log10(dist);
      expect(rssiCalibrated - rssiDefault).toBeCloseTo(expected, 1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Spatial Grid + RF Engine Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Spatial Grid + RF Engine Integration', () => {
  describe('wall loss computation along paths', () => {
    it('ray that does not cross a wall returns 0 dB loss', () => {
      // Wall at y=0..2 (bottom strip); ray travels from (0,5) to (10,5)
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 2, 20)]);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(0);
    });

    it('single wall crossing the ray contributes its attenuation dB', () => {
      // Vertical wall at x=5 blocking horizontal ray from (0,5) to (10,5)
      const attenuation = 14;
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 10, attenuation)]);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(attenuation);
    });

    it('two walls crossed by a ray accumulate their attenuation values', () => {
      const wall1 = makeWall(3, 0, 3, 10, 10);
      const wall2 = makeWall(7, 0, 7, 10, 15);
      const { grid, allSegments } = buildGrid([wall1, wall2]);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(25);
    });

    it('three walls crossed accumulate correctly', () => {
      const walls = [
        makeWall(2, 0, 2, 10, 5),
        makeWall(5, 0, 5, 10, 10),
        makeWall(8, 0, 8, 10, 15),
      ];
      const { grid, allSegments } = buildGrid(walls);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(30);
    });

    it('concrete wall (25 dB) attenuates much more than drywall (5 dB)', () => {
      const { grid: dGrid, allSegments: dSegs } = buildGrid([makeWall(5, 0, 5, 10, 5)]);
      const { grid: cGrid, allSegments: cSegs } = buildGrid([makeWall(5, 0, 5, 10, 25)]);

      const lossD = computeWallLoss(0, 5, 10, 5, dGrid, dSegs);
      const lossC = computeWallLoss(0, 5, 10, 5, cGrid, cSegs);

      expect(lossC - lossD).toBe(20);
    });

    it('wall exactly at AP position still contributes when ray crosses it', () => {
      // AP at (0,5), point at (10,5); wall at x=0 (at the AP) crossing the ray
      const { grid, allSegments } = buildGrid([makeWall(0, 0, 0, 10, 10)]);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      // Segment from (0,5) to (10,5) starts exactly on the wall at (0,0)-(0,10)
      // segmentsIntersect at endpoint => true, so loss is counted
      expect(loss).toBe(10);
    });

    it('computeRSSI with a wall is weaker than without by the wall attenuation', () => {
      const ap = makeAP(0, 5, 23, 3.2);
      const config = createRFConfig('2.4ghz');
      const noWall = buildGrid([]);
      const withWall = buildGrid([makeWall(5, 0, 5, 10, 10)]);

      const rssiNoWall = computeRSSI(10, 5, ap, config, noWall.grid, noWall.allSegments);
      const rssiWithWall = computeRSSI(10, 5, ap, config, withWall.grid, withWall.allSegments);

      expect(rssiWithWall).toBeLessThan(rssiNoWall);
      expect(rssiNoWall - rssiWithWall).toBeCloseTo(10, 1);
    });

    it('parallel wall segment does not intersect a ray (collinear = no intersection)', () => {
      // Horizontal wall at y=5 (same line as the horizontal ray)
      // segmentsIntersect returns false for collinear segments (denom near 0)
      const collinear = segmentsIntersect(
        0, 5, 10, 5,   // ray
        2, 5, 8, 5,    // wall segment on same y
      );
      expect(collinear).toBe(false);
    });

    it('diagonal wall crossing a diagonal ray is detected', () => {
      // Wall from (0,10) to (10,0) crosses ray from (0,0) to (10,10)
      const crosses = segmentsIntersect(
        0, 0, 10, 10,
        0, 10, 10, 0,
      );
      expect(crosses).toBe(true);
    });

    it('spatial grid builds correctly for an empty wall set', () => {
      const { grid, allSegments } = buildSpatialGrid([], 10, 10);
      expect(allSegments).toHaveLength(0);
      expect(grid.cells.size).toBe(0);
    });

    it('spatial grid assigns segments to the correct cells', () => {
      // Horizontal wall from (0,5) to (10,5) spans the full width
      const { grid, allSegments } = buildSpatialGrid(
        [makeWall(0, 5, 10, 5, 10)],
        10, 10,
      );
      expect(allSegments).toHaveLength(1);
      // The wall runs along y=5 so it occupies row 5 of the grid
      // Every column cell along y=5 should reference segment 0
      const midKey = 5 * grid.gridCols + 0;
      expect(grid.cells.has(midKey)).toBe(true);
    });
  });

  describe('realistic residential wall loss scenario', () => {
    it('AP in one room, measured through three different wall types', () => {
      // Scenario from RF-Modellierung.md:
      // AP at (2,5), point at (15,5)
      // Drywall 5 dB at x=4, interior 8 dB at x=8, exterior 12 dB at x=12
      const ap = makeAP(2, 5, 23, 3.2);
      const config = createRFConfig('2.4ghz');
      const { grid, allSegments } = buildGrid([
        makeWall(4, 0, 4, 10, 5),
        makeWall(8, 0, 8, 10, 8),
        makeWall(12, 0, 12, 10, 12),
      ]);

      const rssi = computeRSSI(15, 5, ap, config, grid, allSegments);

      // Expected: dist=13, PL=40.05+10*3.5*log10(13)=40.05+38.97=79.02
      // Wall losses = 5+8+12 = 25 dB
      // RSSI = 23+3.2-3-79.02-25 = -80.82
      const d = Math.sqrt((15 - 2) ** 2 + (5 - 5) ** 2);
      const pl = REFERENCE_LOSS['2.4ghz'] + 10 * DEFAULT_PATH_LOSS_EXPONENT * Math.log10(d);
      const expectedRSSI = 23 + 3.2 + DEFAULT_RECEIVER_GAIN_DBI - pl - 25;
      expect(rssi).toBeCloseTo(expectedRSSI, 1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Color Scheme + Heatmap Values Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

describe('Color Scheme + Heatmap Values Pipeline', () => {
  // Signal thresholds from color-schemes.ts / RF-Modellierung.md
  const THRESHOLD_EXCELLENT = -50; // > -50 dBm
  const THRESHOLD_GOOD = -65;      // -50 to -65 dBm
  const THRESHOLD_FAIR = -75;      // -65 to -75 dBm
  const THRESHOLD_POOR = -85;      // -75 to -85 dBm
  // < -85 dBm = no signal

  describe('rssiToLutIndex boundary values', () => {
    it('RSSI_MIN (-95 dBm) maps to LUT index 0', () => {
      expect(rssiToLutIndex(RSSI_MIN)).toBe(0);
    });

    it('RSSI_MAX (-30 dBm) maps to LUT index 255', () => {
      expect(rssiToLutIndex(RSSI_MAX)).toBe(255);
    });

    it('midpoint (-62.5 dBm) maps to approximately index 127 or 128', () => {
      const mid = (RSSI_MIN + RSSI_MAX) / 2; // -62.5
      const idx = rssiToLutIndex(mid);
      expect(idx).toBeGreaterThanOrEqual(127);
      expect(idx).toBeLessThanOrEqual(128);
    });

    it('RSSI below RSSI_MIN clamps to 0', () => {
      expect(rssiToLutIndex(-200)).toBe(0);
    });

    it('RSSI above RSSI_MAX clamps to 255', () => {
      expect(rssiToLutIndex(0)).toBe(255);
    });

    it('index increases monotonically as RSSI increases', () => {
      let prev = rssiToLutIndex(RSSI_MIN);
      for (let rssi = RSSI_MIN + 1; rssi <= RSSI_MAX; rssi++) {
        const idx = rssiToLutIndex(rssi);
        expect(idx).toBeGreaterThanOrEqual(prev);
        prev = idx;
      }
    });

    it('signal thresholds map to distinct LUT index regions', () => {
      const idxExcellent = rssiToLutIndex(THRESHOLD_EXCELLENT);  // -50 dBm
      const idxGood = rssiToLutIndex(THRESHOLD_GOOD);            // -65 dBm
      const idxFair = rssiToLutIndex(THRESHOLD_FAIR);            // -75 dBm
      const idxPoor = rssiToLutIndex(THRESHOLD_POOR);            // -85 dBm
      const idxNone = rssiToLutIndex(-95);                       // RSSI_MIN

      // Strictly ordered: better signal → higher index
      expect(idxExcellent).toBeGreaterThan(idxGood);
      expect(idxGood).toBeGreaterThan(idxFair);
      expect(idxFair).toBeGreaterThan(idxPoor);
      expect(idxPoor).toBeGreaterThan(idxNone);
    });
  });

  describe('LUT structure for all three color schemes', () => {
    const SCHEMES: ColorScheme[] = ['viridis', 'jet', 'inferno'];

    for (const scheme of SCHEMES) {
      it(`${scheme}: LUT has exactly 256 entries`, () => {
        const lut = getColorLUT(scheme);
        expect(lut.length).toBe(256);
      });

      it(`${scheme}: all LUT entries are non-zero (have alpha channel set)`, () => {
        const lut = getColorLUT(scheme);
        for (let i = 0; i < 256; i++) {
          // ABGR: alpha in highest byte; default alpha=200 means entry > 0
          expect(lut[i]).toBeGreaterThan(0);
        }
      });

      it(`${scheme}: index 0 and index 255 produce different colors`, () => {
        const lut = getColorLUT(scheme);
        expect(lut[0]).not.toBe(lut[255]);
      });

      it(`${scheme}: getLUT with alpha=128 produces different values than alpha=200`, () => {
        const lut200 = getColorLUT(scheme, 200);
        const lut128 = getColorLUT(scheme, 128);
        // Alpha is packed in the high byte; changing alpha changes the packed value
        expect(lut200[0]).not.toBe(lut128[0]);
      });
    }
  });

  describe('full pipeline: RSSI → LUT index → color output', () => {
    it('excellent signal RSSI (-45 dBm) maps to a high-index (warm/bright) color', () => {
      // -45 dBm: normalized = (-45 - (-95)) / (-30 - (-95)) = 50/65 ≈ 0.769
      // LUT index = round(0.769 * 255) ≈ 196
      const idx = rssiToLutIndex(-45);
      expect(idx).toBeGreaterThan(185); // Upper quarter of the LUT
    });

    it('no-signal RSSI (-92 dBm) maps to a low-index (cold/dark) color', () => {
      const idx = rssiToLutIndex(-92);
      expect(idx).toBeLessThan(20);
    });

    it('viridis: weak signal is darker (lower luminance) than strong signal', () => {
      const lut = generateViridisLUT();
      const weakColor = lut[5]!;
      const strongColor = lut[250]!;

      // Extract RGB components from ABGR Uint32
      const extractRGB = (abgr: number) => ({
        r: abgr & 0xff,
        g: (abgr >> 8) & 0xff,
        b: (abgr >> 16) & 0xff,
      });

      const weak = extractRGB(weakColor);
      const strong = extractRGB(strongColor);

      // Viridis: dark purple (weak) → bright yellow (strong)
      // Yellow has high R+G; dark purple has low R+G+B
      const weakLuminance = weak.r + weak.g + weak.b;
      const strongLuminance = strong.r + strong.g + strong.b;
      expect(strongLuminance).toBeGreaterThan(weakLuminance);
    });

    it('jet: weak signal is blue-ish (high B) and strong signal is red-ish (high R)', () => {
      const lut = generateJetLUT();

      const extractRGB = (abgr: number) => ({
        r: abgr & 0xff,
        g: (abgr >> 8) & 0xff,
        b: (abgr >> 16) & 0xff,
      });

      // Index 5 = very weak signal → near blue (index 0 is dark blue)
      const weakColor = extractRGB(lut[5]!);
      // Index 250 = very strong signal → near red
      const strongColor = extractRGB(lut[250]!);

      // Blue component should be higher for weak signal
      expect(weakColor.b).toBeGreaterThan(strongColor.b);
      // Red component should be higher for strong signal
      expect(strongColor.r).toBeGreaterThan(weakColor.r);
    });

    it('inferno: first entry is near-black, last entry is bright yellow-white', () => {
      const lut = generateInfernoLUT();

      const extractRGB = (abgr: number) => ({
        r: abgr & 0xff,
        g: (abgr >> 8) & 0xff,
        b: (abgr >> 16) & 0xff,
      });

      const first = extractRGB(lut[0]!);
      const last = extractRGB(lut[255]!);

      // Near-black: all components very low
      expect(first.r + first.g + first.b).toBeLessThan(20);
      // Bright yellow-white: all components high
      expect(last.r + last.g + last.b).toBeGreaterThan(400);
    });

    it('full pipeline: compute grid RSSI → LUT index → verify colour variety', () => {
      // Generate a heatmap grid and verify that the RSSI values map to
      // at least 3 distinct LUT indices (there is spatial variation in signal)
      const ap = makeAP(5, 5, 23, 3.2);
      const { rssiValues } = computeHeatmapGrid([ap], [makeWall(3, 0, 3, 10, 10)], 10, 10, 1.0);
      const lut = getColorLUT('viridis');

      const uniqueColors = new Set<number>();
      for (const rssi of rssiValues) {
        const idx = rssiToLutIndex(rssi);
        uniqueColors.add(lut[idx]!);
      }

      // A 10x10 m floor plan with walls should produce at least a handful of
      // distinct colours (spatial variation)
      expect(uniqueColors.size).toBeGreaterThan(5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Quality Determination Logic
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quality determination logic as defined in docs (RF-Modellierung.md and
 * measurement module). The thresholds are:
 *   good   : RSSI > -65 dBm   AND throughput > 25 Mbit/s
 *   fair   : RSSI > -75 dBm   AND throughput > 10 Mbit/s
 *   poor   : RSSI > -85 dBm   (regardless of throughput)
 *   failed : RSSI <= -85 dBm  OR throughput <= 0
 *
 * This function is implemented inline here because it represents the business
 * logic that ties RF measurements to quality labels — the cross-module
 * concern we want to test.
 */
type MeasurementQuality = 'good' | 'fair' | 'poor' | 'failed';

function determineQuality(
  rssiDbm: number | null,
  throughputBps: number | null,
): MeasurementQuality {
  // No signal = failed
  if (rssiDbm === null || rssiDbm <= -85) return 'failed';

  const throughputMbps = throughputBps !== null ? throughputBps / 1_000_000 : null;

  if (rssiDbm > -65 && throughputMbps !== null && throughputMbps > 25) return 'good';
  if (rssiDbm > -75 && throughputMbps !== null && throughputMbps > 10) return 'fair';
  if (rssiDbm > -85) return 'poor';

  return 'failed';
}

describe('Quality Determination Logic', () => {
  describe('good quality', () => {
    it('strong signal and high throughput → good', () => {
      expect(determineQuality(-55, 50_000_000)).toBe('good');
    });

    it('exactly at the good threshold: -65 dBm and 25.1 Mbit/s → good', () => {
      // rssiDbm > -65 means rssiDbm = -64 qualifies; -65 itself does not
      expect(determineQuality(-64, 25_100_000)).toBe('good');
    });

    it('boundary: rssiDbm = -65 does not qualify for good', () => {
      // -65 is not > -65, so it falls into fair territory
      const q = determineQuality(-65, 50_000_000);
      expect(q).not.toBe('good');
    });

    it('good rssi but throughput exactly at 25 Mbit/s does not qualify for good', () => {
      // throughput must be > 25, not >=
      const q = determineQuality(-55, 25_000_000);
      expect(q).not.toBe('good');
    });
  });

  describe('fair quality', () => {
    it('moderate signal and medium throughput → fair', () => {
      expect(determineQuality(-70, 15_000_000)).toBe('fair');
    });

    it('just below good RSSI threshold but throughput OK → fair', () => {
      expect(determineQuality(-65, 15_000_000)).toBe('fair');
    });

    it('boundary: rssiDbm = -75 does not qualify for fair', () => {
      const q = determineQuality(-75, 20_000_000);
      expect(q).not.toBe('fair');
    });

    it('good signal but low throughput falls through to fair', () => {
      // rssiDbm > -65 but throughput <= 10 Mbit/s → no 'good', check fair
      // -68 is between -65 and -75, so it can qualify for fair if throughput > 10
      const q = determineQuality(-68, 12_000_000);
      expect(q).toBe('fair');
    });
  });

  describe('poor quality', () => {
    it('weak signal and no throughput data → poor', () => {
      expect(determineQuality(-80, null)).toBe('poor');
    });

    it('rssiDbm = -84 (just above poor/failed boundary) → poor', () => {
      expect(determineQuality(-84, null)).toBe('poor');
    });

    it('signal in poor range regardless of throughput', () => {
      // RSSI between -85 and -75 is poor even with high throughput
      expect(determineQuality(-80, 100_000_000)).toBe('poor');
    });
  });

  describe('failed quality', () => {
    it('no signal (null rssi) → failed', () => {
      expect(determineQuality(null, 50_000_000)).toBe('failed');
    });

    it('rssiDbm = -85 (exactly at the boundary) → failed', () => {
      expect(determineQuality(-85, 50_000_000)).toBe('failed');
    });

    it('rssiDbm below -85 → failed', () => {
      expect(determineQuality(-100, 50_000_000)).toBe('failed');
    });

    it('rssiDbm = -90 → failed', () => {
      expect(determineQuality(-90, null)).toBe('failed');
    });
  });

  describe('null throughput handling', () => {
    it('good signal but null throughput → poor (cannot classify as good/fair)', () => {
      // null throughput means we can only determine 'poor' or 'failed' from RSSI
      const q = determineQuality(-50, null);
      expect(q).toBe('poor');
    });

    it('fair-range signal but null throughput → poor', () => {
      const q = determineQuality(-70, null);
      expect(q).toBe('poor');
    });

    it('poor-range signal with null throughput → poor', () => {
      expect(determineQuality(-82, null)).toBe('poor');
    });
  });

  describe('RSSI thresholds map to expected quality label names', () => {
    // Verify the signal thresholds match what the i18n keys describe
    const cases: Array<[number, number | null, MeasurementQuality]> = [
      [-45, 60_000_000, 'good'],    // excellent RSSI, good throughput
      [-60, 30_000_000, 'good'],    // just above good threshold
      [-70, 20_000_000, 'fair'],    // moderate
      [-80, 5_000_000, 'poor'],     // weak but not dead
      [-90, 0, 'failed'],           // no signal
    ];

    for (const [rssi, throughput, expected] of cases) {
      it(`RSSI ${rssi} dBm + ${throughput !== null ? throughput / 1e6 : 'null'} Mbit/s → ${expected}`, () => {
        expect(determineQuality(rssi, throughput)).toBe(expected);
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Keyboard Shortcut Matching
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a minimal mock KeyboardEvent for matchShortcut() tests.
 * Only the fields read by matchShortcut are populated.
 */
function mockKeyEvent(
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
  } as unknown as KeyboardEvent;
}

describe('Keyboard Shortcut Matching', () => {
  describe('basic key matching', () => {
    it('pressing "w" without modifiers matches the wallTool action', () => {
      const result = matchShortcut(mockKeyEvent('w'));
      expect(result).toBeDefined();
      expect(result?.action).toBe('wallTool');
    });

    it('pressing "a" without modifiers matches the apTool action', () => {
      const result = matchShortcut(mockKeyEvent('a'));
      expect(result?.action).toBe('apTool');
    });

    it('pressing "m" without modifiers matches the measureTool action', () => {
      const result = matchShortcut(mockKeyEvent('m'));
      expect(result?.action).toBe('measureTool');
    });

    it('pressing "g" without modifiers matches the gridToggle action', () => {
      const result = matchShortcut(mockKeyEvent('g'));
      expect(result?.action).toBe('gridToggle');
    });

    it('pressing "h" without modifiers matches the panTool action', () => {
      const result = matchShortcut(mockKeyEvent('h'));
      expect(result?.action).toBe('panTool');
    });

    it('pressing "Escape" without modifiers matches the deselect action', () => {
      const result = matchShortcut(mockKeyEvent('Escape'));
      expect(result?.action).toBe('deselect');
    });

    it('pressing "Delete" without modifiers matches the delete action', () => {
      const result = matchShortcut(mockKeyEvent('Delete'));
      expect(result?.action).toBe('delete');
    });

    it('pressing "Backspace" without modifiers matches the delete action', () => {
      const result = matchShortcut(mockKeyEvent('Backspace'));
      expect(result?.action).toBe('delete');
    });
  });

  describe('Ctrl/Meta modifier matching', () => {
    it('Ctrl+Z matches the undo action', () => {
      const result = matchShortcut(mockKeyEvent('z', { ctrlKey: true }));
      expect(result?.action).toBe('undo');
    });

    it('Cmd+Z (Meta) also matches the undo action on macOS', () => {
      const result = matchShortcut(mockKeyEvent('z', { metaKey: true }));
      expect(result?.action).toBe('undo');
    });

    it('Ctrl+S matches the save action', () => {
      const result = matchShortcut(mockKeyEvent('s', { ctrlKey: true }));
      expect(result?.action).toBe('save');
    });

    it('Ctrl+Shift+Z matches the redo action', () => {
      const result = matchShortcut(mockKeyEvent('z', { ctrlKey: true, shiftKey: true }));
      expect(result?.action).toBe('redo');
    });

    it('Ctrl+Z does NOT match redo (missing shift)', () => {
      const result = matchShortcut(mockKeyEvent('z', { ctrlKey: true }));
      expect(result?.action).toBe('undo');
      expect(result?.action).not.toBe('redo');
    });
  });

  describe('modifier conflicts: shortcuts requiring no modifier are not triggered with Ctrl', () => {
    it('Ctrl+W does not match wallTool (wallTool requires no modifier)', () => {
      const result = matchShortcut(mockKeyEvent('w', { ctrlKey: true }));
      // wallTool requires ctrlOrMeta = false; Ctrl+W should not match
      expect(result).toBeUndefined();
    });

    it('Ctrl+H does not match heatmapToggle', () => {
      const result = matchShortcut(mockKeyEvent('h', { ctrlKey: true }));
      expect(result).toBeUndefined();
    });

    it('Ctrl+Delete does not match delete (delete requires no modifier)', () => {
      const result = matchShortcut(mockKeyEvent('Delete', { ctrlKey: true }));
      expect(result).toBeUndefined();
    });
  });

  describe('case insensitivity', () => {
    it('upper-case "W" still matches wallTool (key comparison is case-insensitive)', () => {
      const result = matchShortcut(mockKeyEvent('W'));
      expect(result?.action).toBe('wallTool');
    });

    it('upper-case "A" still matches apTool', () => {
      const result = matchShortcut(mockKeyEvent('A'));
      expect(result?.action).toBe('apTool');
    });
  });

  describe('unregistered keys return undefined', () => {
    it('pressing "x" returns undefined (no shortcut defined)', () => {
      expect(matchShortcut(mockKeyEvent('x'))).toBeUndefined();
    });

    it('pressing "Enter" returns undefined', () => {
      expect(matchShortcut(mockKeyEvent('Enter'))).toBeUndefined();
    });

    it('pressing "Tab" returns undefined', () => {
      expect(matchShortcut(mockKeyEvent('Tab'))).toBeUndefined();
    });

    it('pressing "F5" returns undefined', () => {
      expect(matchShortcut(mockKeyEvent('F5'))).toBeUndefined();
    });
  });

  describe('shortcut list integrity', () => {
    it('SHORTCUTS array is not empty', () => {
      expect(SHORTCUTS.length).toBeGreaterThan(0);
    });

    it('every shortcut has a non-empty action and description_key', () => {
      for (const s of SHORTCUTS) {
        expect(s.action.length).toBeGreaterThan(0);
        expect(s.description_key.length).toBeGreaterThan(0);
      }
    });

    it('DISPLAY_SHORTCUTS excludes Backspace (duplicate of Delete)', () => {
      const hasBackspace = DISPLAY_SHORTCUTS.some((s) => s.key === 'Backspace');
      expect(hasBackspace).toBe(false);
    });

    it('DISPLAY_SHORTCUTS is a subset of SHORTCUTS', () => {
      for (const ds of DISPLAY_SHORTCUTS) {
        const found = SHORTCUTS.some((s) => s.key === ds.key && s.action === ds.action);
        expect(found).toBe(true);
      }
    });

    it('all description_key values follow the "shortcuts.<name>" pattern', () => {
      for (const s of SHORTCUTS) {
        expect(s.description_key).toMatch(/^shortcuts\./);
      }
    });
  });

  describe('formatShortcut utility', () => {
    it('formats a plain key (no modifiers) correctly', () => {
      const shortcut = SHORTCUTS.find((s) => s.action === 'wallTool');
      expect(shortcut).toBeDefined();
      const formatted = formatShortcut(shortcut!);
      expect(formatted).toBe('W');
    });

    it('formats Ctrl+Z correctly (non-Mac: shows "Ctrl")', () => {
      const shortcut = SHORTCUTS.find((s) => s.action === 'undo');
      expect(shortcut).toBeDefined();
      const formatted = formatShortcut(shortcut!);
      // On non-Mac it should start with Ctrl; on Mac it uses the command symbol
      // Both contain the key "Z" at the end
      expect(formatted).toMatch(/Z$/i);
    });

    it('Delete key is formatted as "Del"', () => {
      const shortcut = SHORTCUTS.find((s) => s.key === 'Delete');
      expect(shortcut).toBeDefined();
      const formatted = formatShortcut(shortcut!);
      expect(formatted).toContain('Del');
    });

    it('Escape key is formatted as "Esc"', () => {
      const shortcut = SHORTCUTS.find((s) => s.key === 'Escape');
      expect(shortcut).toBeDefined();
      const formatted = formatShortcut(shortcut!);
      expect(formatted).toContain('Esc');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: i18n Key Completeness
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recursively collects all dot-separated key paths from a nested object.
 * E.g. { a: { b: 'x', c: 'y' } } → ['a.b', 'a.c']
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe('i18n Key Completeness', () => {
  const enKeys = collectKeys(enMessages as Record<string, unknown>);
  const deKeys = collectKeys(deMessages as Record<string, unknown>);

  it('en.json and de.json have the same number of keys', () => {
    expect(enKeys.length).toBe(deKeys.length);
  });

  it('every key present in en.json also exists in de.json', () => {
    const deKeySet = new Set(deKeys);
    const missingInDe = enKeys.filter((k) => !deKeySet.has(k));
    expect(missingInDe).toEqual([]);
  });

  it('every key present in de.json also exists in en.json', () => {
    const enKeySet = new Set(enKeys);
    const missingInEn = deKeys.filter((k) => !enKeySet.has(k));
    expect(missingInEn).toEqual([]);
  });

  it('neither translation file is empty', () => {
    expect(enKeys.length).toBeGreaterThan(0);
    expect(deKeys.length).toBeGreaterThan(0);
  });

  it('all values in en.json are non-empty strings', () => {
    const checkValues = (obj: Record<string, unknown>, path = ''): void => {
      for (const [k, v] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          checkValues(v as Record<string, unknown>, fullPath);
        } else {
          expect(typeof v, `en.json key "${fullPath}" should be a string`).toBe('string');
          expect((v as string).length, `en.json key "${fullPath}" should not be empty`).toBeGreaterThan(0);
        }
      }
    };
    checkValues(enMessages as Record<string, unknown>);
  });

  it('all values in de.json are non-empty strings', () => {
    const checkValues = (obj: Record<string, unknown>, path = ''): void => {
      for (const [k, v] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          checkValues(v as Record<string, unknown>, fullPath);
        } else {
          expect(typeof v, `de.json key "${fullPath}" should be a string`).toBe('string');
          expect((v as string).length, `de.json key "${fullPath}" should not be empty`).toBeGreaterThan(0);
        }
      }
    };
    checkValues(deMessages as Record<string, unknown>);
  });

  describe('expected top-level namespaces are present in both locales', () => {
    const expectedNamespaces = [
      'app', 'nav', 'menu', 'project', 'toolbar', 'status', 'action', 'label',
      'signal', 'heatmap', 'editor', 'material', 'ap', 'measurement',
      'shortcuts', 'mixing', 'results', 'properties', 'toast', 'onboarding',
      'settings',
    ];

    for (const ns of expectedNamespaces) {
      it(`namespace "${ns}" exists in en.json`, () => {
        const exists = enKeys.some((k) => k.startsWith(`${ns}.`));
        expect(exists).toBe(true);
      });

      it(`namespace "${ns}" exists in de.json`, () => {
        const exists = deKeys.some((k) => k.startsWith(`${ns}.`));
        expect(exists).toBe(true);
      });
    }
  });

  describe('shortcut description_keys from keyboard.ts have translations', () => {
    it('all shortcut description_key values are present in en.json', () => {
      const enKeySet = new Set(enKeys);
      const missing: string[] = [];
      for (const shortcut of SHORTCUTS) {
        if (!enKeySet.has(shortcut.description_key)) {
          missing.push(shortcut.description_key);
        }
      }
      expect(missing).toEqual([]);
    });

    it('all shortcut description_key values are present in de.json', () => {
      const deKeySet = new Set(deKeys);
      const missing: string[] = [];
      for (const shortcut of SHORTCUTS) {
        if (!deKeySet.has(shortcut.description_key)) {
          missing.push(shortcut.description_key);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describe('signal quality labels are translated in both locales', () => {
    const signalKeys = ['signal.excellent', 'signal.good', 'signal.fair', 'signal.poor', 'signal.none'];

    for (const key of signalKeys) {
      it(`"${key}" exists in en.json`, () => {
        expect(enKeys).toContain(key);
      });

      it(`"${key}" exists in de.json`, () => {
        expect(deKeys).toContain(key);
      });
    }
  });

  describe('measurement quality label keys are translated in both locales', () => {
    const qualityKeys = [
      'measurement.qualityGood',
      'measurement.qualityFair',
      'measurement.qualityPoor',
      'measurement.qualityFailed',
    ];

    for (const key of qualityKeys) {
      it(`"${key}" exists in en.json`, () => {
        expect(enKeys).toContain(key);
      });

      it(`"${key}" exists in de.json`, () => {
        expect(deKeys).toContain(key);
      });
    }
  });
});
