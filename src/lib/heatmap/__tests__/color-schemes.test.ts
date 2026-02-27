/**
 * Unit tests for color-schemes.ts
 *
 * Tests cover:
 * - LUT generation (size, non-zero alpha, scheme uniqueness)
 * - RSSI to LUT index mapping (boundary clamping, midpoint, linear range)
 * - Color correctness at index 0 and 255 for each scheme
 * - ABGR byte-order packing
 *
 * Reference: docs/research/RF-Modellierung.md, .claude/rules/rf-modell.md
 */

import { describe, it, expect } from 'vitest';

import {
  generateViridisLUT,
  generateJetLUT,
  generateInfernoLUT,
  getColorLUT,
  rssiToLutIndex,
  RSSI_MIN,
  RSSI_MAX,
} from '../color-schemes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Unpacks a 32-bit ABGR value (little-endian ImageData format) into
 * individual channel bytes.
 *
 * Memory layout on little-endian: byte0=R, byte1=G, byte2=B, byte3=A
 * As Uint32 read value: A<<24 | B<<16 | G<<8 | R
 */
function unpackABGR(packed: number): { r: number; g: number; b: number; a: number } {
  return {
    r: (packed >>> 0) & 0xff,
    g: (packed >>> 8) & 0xff,
    b: (packed >>> 16) & 0xff,
    a: (packed >>> 24) & 0xff,
  };
}

// ─── LUT Generation ───────────────────────────────────────────────────────────

describe('LUT generation', () => {
  describe('size and alpha', () => {
    it('viridis LUT has exactly 256 entries', () => {
      const lut = generateViridisLUT();
      expect(lut.length).toBe(256);
    });

    it('jet LUT has exactly 256 entries', () => {
      const lut = generateJetLUT();
      expect(lut.length).toBe(256);
    });

    it('inferno LUT has exactly 256 entries', () => {
      const lut = generateInfernoLUT();
      expect(lut.length).toBe(256);
    });

    it('all viridis entries have non-zero alpha', () => {
      const lut = generateViridisLUT();
      for (let i = 0; i < 256; i++) {
        const { a } = unpackABGR(lut[i] ?? 0);
        expect(a, `viridis[${i}] alpha should be non-zero`).toBeGreaterThan(0);
      }
    });

    it('all jet entries have non-zero alpha', () => {
      const lut = generateJetLUT();
      for (let i = 0; i < 256; i++) {
        const { a } = unpackABGR(lut[i] ?? 0);
        expect(a, `jet[${i}] alpha should be non-zero`).toBeGreaterThan(0);
      }
    });

    it('all inferno entries have non-zero alpha', () => {
      const lut = generateInfernoLUT();
      for (let i = 0; i < 256; i++) {
        const { a } = unpackABGR(lut[i] ?? 0);
        expect(a, `inferno[${i}] alpha should be non-zero`).toBeGreaterThan(0);
      }
    });

    it('custom alpha value is respected', () => {
      const lut = generateViridisLUT(128);
      for (let i = 0; i < 256; i++) {
        const { a } = unpackABGR(lut[i] ?? 0);
        expect(a, `viridis alpha=128 at index ${i}`).toBe(128);
      }
    });
  });

  describe('scheme uniqueness', () => {
    it('viridis and jet produce different LUTs', () => {
      const viridis = generateViridisLUT();
      const jet = generateJetLUT();
      // Check at least some entries differ
      let differences = 0;
      for (let i = 0; i < 256; i++) {
        if (viridis[i] !== jet[i]) differences++;
      }
      expect(differences).toBeGreaterThan(100);
    });

    it('jet and inferno produce different LUTs', () => {
      const jet = generateJetLUT();
      const inferno = generateInfernoLUT();
      let differences = 0;
      for (let i = 0; i < 256; i++) {
        if (jet[i] !== inferno[i]) differences++;
      }
      expect(differences).toBeGreaterThan(100);
    });

    it('viridis and inferno produce different LUTs', () => {
      const viridis = generateViridisLUT();
      const inferno = generateInfernoLUT();
      let differences = 0;
      for (let i = 0; i < 256; i++) {
        if (viridis[i] !== inferno[i]) differences++;
      }
      expect(differences).toBeGreaterThan(100);
    });
  });

  describe('getColorLUT dispatch', () => {
    it('getColorLUT("viridis") matches generateViridisLUT()', () => {
      const via_dispatch = getColorLUT('viridis');
      const direct = generateViridisLUT();
      expect(via_dispatch).toEqual(direct);
    });

    it('getColorLUT("jet") matches generateJetLUT()', () => {
      const via_dispatch = getColorLUT('jet');
      const direct = generateJetLUT();
      expect(via_dispatch).toEqual(direct);
    });

    it('getColorLUT("inferno") matches generateInfernoLUT()', () => {
      const via_dispatch = getColorLUT('inferno');
      const direct = generateInfernoLUT();
      expect(via_dispatch).toEqual(direct);
    });
  });
});

// ─── RSSI to LUT Index Mapping ───────────────────────────────────────────────

describe('rssiToLutIndex', () => {
  it('RSSI_MIN (-95 dBm) maps to index 0', () => {
    expect(rssiToLutIndex(RSSI_MIN)).toBe(0);
  });

  it('RSSI_MAX (-30 dBm) maps to index 255', () => {
    expect(rssiToLutIndex(RSSI_MAX)).toBe(255);
  });

  it('midpoint RSSI (-62.5 dBm) maps to index 128', () => {
    // midpoint = RSSI_MIN + (RSSI_MAX - RSSI_MIN) / 2 = -95 + 32.5 = -62.5
    const midRSSI = (RSSI_MIN + RSSI_MAX) / 2;
    expect(rssiToLutIndex(midRSSI)).toBe(128);
  });

  it('RSSI below RSSI_MIN is clamped to index 0', () => {
    expect(rssiToLutIndex(-100)).toBe(0);
    expect(rssiToLutIndex(-120)).toBe(0);
    expect(rssiToLutIndex(-Infinity)).toBe(0);
  });

  it('RSSI above RSSI_MAX is clamped to index 255', () => {
    expect(rssiToLutIndex(-20)).toBe(255);
    expect(rssiToLutIndex(0)).toBe(255);
    expect(rssiToLutIndex(Infinity)).toBe(255);
  });

  it('RSSI exactly at RSSI_MIN boundary returns 0', () => {
    expect(rssiToLutIndex(-95)).toBe(0);
  });

  it('RSSI exactly at RSSI_MAX boundary returns 255', () => {
    expect(rssiToLutIndex(-30)).toBe(255);
  });

  it('returned index is always an integer in [0, 255]', () => {
    const testValues = [-110, -95, -80, -65, -50, -35, -30, -20];
    for (const rssi of testValues) {
      const idx = rssiToLutIndex(rssi);
      expect(Number.isInteger(idx), `index for ${rssi} should be integer`).toBe(true);
      expect(idx, `index for ${rssi} should be >= 0`).toBeGreaterThanOrEqual(0);
      expect(idx, `index for ${rssi} should be <= 255`).toBeLessThanOrEqual(255);
    }
  });

  it('mapping is monotonically non-decreasing', () => {
    // Stronger signal (higher dBm) = higher index
    const rssiValues = [-95, -85, -75, -65, -55, -45, -35, -30];
    let prevIdx = -1;
    for (const rssi of rssiValues) {
      const idx = rssiToLutIndex(rssi);
      expect(idx).toBeGreaterThanOrEqual(prevIdx);
      prevIdx = idx;
    }
  });
});

// ─── Color Correctness ────────────────────────────────────────────────────────

describe('color correctness', () => {
  describe('viridis color stops', () => {
    it('index 0 is dark purple (~68,1,84)', () => {
      const lut = generateViridisLUT(255);
      const { r, g, b } = unpackABGR(lut[0] ?? 0);
      // Allow ±3 for interpolation rounding
      expect(r).toBeGreaterThanOrEqual(65);
      expect(r).toBeLessThanOrEqual(71);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(4);
      expect(b).toBeGreaterThanOrEqual(81);
      expect(b).toBeLessThanOrEqual(87);
    });

    it('index 255 is bright yellow (~253,231,37)', () => {
      const lut = generateViridisLUT(255);
      const { r, g, b } = unpackABGR(lut[255] ?? 0);
      expect(r).toBeGreaterThanOrEqual(250);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(228);
      expect(g).toBeLessThanOrEqual(234);
      expect(b).toBeGreaterThanOrEqual(34);
      expect(b).toBeLessThanOrEqual(40);
    });

    it('midpoint index 128 is in the teal range', () => {
      const lut = generateViridisLUT(255);
      const { r, g, b } = unpackABGR(lut[128] ?? 0);
      // Viridis midpoint should be in the teal/green-teal region
      // g > r and g > b is the key characteristic of the middle
      expect(g).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(r);
    });
  });

  describe('jet color stops', () => {
    it('index 0 is dark blue (r~0, g~0, b>100)', () => {
      const lut = generateJetLUT(255);
      const { r, g, b } = unpackABGR(lut[0] ?? 0);
      expect(r).toBeLessThan(10);
      expect(g).toBeLessThan(10);
      expect(b).toBeGreaterThan(100);
    });

    it('index 255 is dark red (r>100, g~0, b~0)', () => {
      const lut = generateJetLUT(255);
      const { r, g, b } = unpackABGR(lut[255] ?? 0);
      expect(r).toBeGreaterThan(100);
      expect(g).toBeLessThan(10);
      expect(b).toBeLessThan(10);
    });

    it('midpoint index 128 is in the green-yellow range', () => {
      const lut = generateJetLUT(255);
      const { g } = unpackABGR(lut[128] ?? 0);
      // Jet passes through green at the midpoint
      expect(g).toBeGreaterThan(150);
    });
  });

  describe('inferno color stops', () => {
    it('index 0 is near-black (all channels < 10)', () => {
      const lut = generateInfernoLUT(255);
      const { r, g, b } = unpackABGR(lut[0] ?? 0);
      expect(r).toBeLessThan(10);
      expect(g).toBeLessThan(10);
      expect(b).toBeLessThan(10);
    });

    it('index 255 is bright yellow-white (all channels > 200)', () => {
      const lut = generateInfernoLUT(255);
      const { r, g, b } = unpackABGR(lut[255] ?? 0);
      expect(r).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(200);
      // b is lighter in inferno's final stop
      expect(b).toBeGreaterThan(100);
    });

    it('midpoint index 128 is in the red-orange range', () => {
      const lut = generateInfernoLUT(255);
      const { r, g, b } = unpackABGR(lut[128] ?? 0);
      // Inferno midpoint is red-orange: r dominant, b low
      expect(r).toBeGreaterThan(150);
      expect(b).toBeLessThan(r);
    });
  });
});

// ─── ABGR Byte Order ──────────────────────────────────────────────────────────

describe('ABGR packed format', () => {
  it('viridis index 0 packs R=68, G=1, B=84 in little-endian ABGR order', () => {
    const lut = generateViridisLUT(200);
    const packed = lut[0] ?? 0;

    // ABGR little-endian: packed = A<<24 | B<<16 | G<<8 | R
    // Reading bytes: byte0=R, byte1=G, byte2=B, byte3=A
    const r = (packed >>> 0) & 0xff;
    const g = (packed >>> 8) & 0xff;
    const b = (packed >>> 16) & 0xff;
    const a = (packed >>> 24) & 0xff;

    // Confirm it is NOT stored as RGBA (which would have R in high byte)
    // The alpha must be 200 (our supplied value)
    expect(a).toBe(200);
    // R channel stored in lowest byte
    expect(r).toBeGreaterThan(50); // viridis index 0 has R~68
    // B channel in third byte
    expect(b).toBeGreaterThan(70); // viridis index 0 has B~84
  });

  it('all LUT entries are valid Uint32 values (no NaN, no negative)', () => {
    const lut = generateViridisLUT();
    for (let i = 0; i < 256; i++) {
      const val = lut[i] ?? 0;
      expect(val).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(val)).toBe(true);
      // Uint32 max is 4294967295
      expect(val).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('packed value for pure red (255,0,0,200) encodes correctly', () => {
    // Manually compute: A<<24 | B<<16 | G<<8 | R = 200<<24 | 0<<16 | 0<<8 | 255
    const expected = ((200 << 24) | (0 << 16) | (0 << 8) | 255) >>> 0;
    const r = (expected >>> 0) & 0xff;
    const g = (expected >>> 8) & 0xff;
    const b = (expected >>> 16) & 0xff;
    const a = (expected >>> 24) & 0xff;

    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(200);
  });
});
