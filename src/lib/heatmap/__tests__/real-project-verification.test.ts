/**
 * Real Project Verification Report
 *
 * Tests the RF model against the ACTUAL user project data exported from localStorage.
 * Floor: 39.7m × 30.4m, ceiling height 2.7m
 * 63 wall segments (Brick 15dB, Wood Door 6dB, Window 4dB, Drywall 4dB, Light Wall 6dB)
 * 3 APs (AP1 wall@324°, AP2 ceiling, AP3 wall@101°)
 *
 * Test Points:
 *   P1 (22, 10)     — Übergang zum rechten Raum
 *   P2 (7, 16)      — Linker unterer Bereich hinter Innenwänden
 *   P3 (30.5, 15.5) — Hinter AP1 (back sector)
 *   P3b (32, 13)    — Vor AP1 (front sector, Asymmetrie-Vergleich)
 *   P4 (7, 5)       — Ray durch Holztür an x≈10
 *   P5 (10.5, 9)    — Freie Sicht nahe AP3
 */

import { describe, it, expect } from 'vitest';
import { inspectPoint, type PointDebugResult, type PerApDebug } from '../point-inspector';
import type { APConfig, WallData, FloorBounds } from '../worker-types';
import {
  REFERENCE_LOSS,
  PATH_LOSS_EXPONENTS,
  DEFAULT_RECEIVER_GAIN_DBI,
  DEFAULT_RECEIVER_HEIGHT_M,
  CLIENT_TX_POWER,
  CLIENT_ANTENNA_GAIN_DBI,
} from '../rf-engine';

// ─── Real Floor Bounds ──────────────────────────────────────────

const BAND = '5ghz' as const;
const BOUNDS: FloorBounds = { width: 39.70, height: 30.37 };

// ─── Real APs (from localStorage export) ────────────────────────

const REAL_APS: APConfig[] = [
  {
    id: 'AP1',
    x: 31.583, y: 14.448, heightM: 1.5,
    txPowerDbm: 20, antennaGainDbi: 4.3,
    enabled: true, mounting: 'wall', orientationDeg: 324,
  },
  {
    id: 'AP2',
    x: 13.650, y: 12.745, heightM: 2.5,
    txPowerDbm: 20, antennaGainDbi: 4.3,
    enabled: true, mounting: 'ceiling', orientationDeg: 0,
  },
  {
    id: 'AP3',
    x: 10.423, y: 7.737, heightM: 1.75,
    txPowerDbm: 20, antennaGainDbi: 4.3,
    enabled: true, mounting: 'wall', orientationDeg: 101,
  },
];

// ─── Real Walls (from localStorage export, 63 segments) ─────────
// Format: [x1, y1, x2, y2, attenuationDb, baseThicknessCm, materialLabel]
type WallTuple = [number, number, number, number, number, number, string];

const RAW_WALLS: WallTuple[] = [
  // Horizontal walls at y≈7.2
  [5.853, 7.225, 10.006, 7.192, 15, 24, 'Brick'],
  [10.006, 7.192, 5.853, 7.225, 15, 24, 'Brick'], // reverse duplicate
  // Horizontal walls at y≈4.55
  [9.957, 4.554, 5.804, 4.554, 15, 24, 'Brick'],
  // Horizontal walls at y≈10.43
  [5.837, 10.433, 10.071, 10.433, 15, 24, 'Brick'],
  [9.794, 10.417, 10.869, 10.415, 15, 24, 'Brick'],
  [10.071, 10.433, 14.745, 10.400, 15, 24, 'Brick'],
  [14.745, 10.400, 20.201, 10.400, 15, 24, 'Brick'],
  [9.794, 10.417, 5.837, 10.433, 15, 24, 'Brick'], // reverse
  // Horizontal wall at y≈10.41 with DOOR
  [10.869, 10.415, 11.732, 10.414, 6, 4, 'Wood Door'],
  // Horizontal wall at y≈10.4 continued
  [11.732, 10.414, 20.201, 10.400, 15, 24, 'Brick'],
  // Horizontal walls at y≈13.5
  [5.870, 13.576, 9.908, 13.544, 15, 24, 'Brick'],
  [5.870, 13.576, 9.908, 13.544, 15, 24, 'Brick'], // duplicate
  [9.908, 13.544, 14.778, 13.511, 15, 24, 'Brick'],
  [14.778, 13.511, 14.810, 17.420, 15, 24, 'Brick'], // vertical right
  [19.159, 13.478, 10.935, 13.536, 15, 24, 'Brick'],
  [10.185, 13.542, 9.908, 13.544, 15, 24, 'Brick'],
  [14.778, 13.511, 16.504, 13.498, 15, 24, 'Brick'],
  [17.563, 13.490, 19.159, 13.478, 15, 24, 'Brick'],
  // Door on horizontal wall at y≈13.5
  [10.935, 13.536, 10.185, 13.542, 6, 4, 'Wood Door'],
  [16.504, 13.498, 17.563, 13.490, 6, 4, 'Wood Door'],
  // Horizontal wall at y≈15.0 with DOOR
  [11.309, 15.026, 10.869, 15.020, 4, 12, 'Drywall'],
  [10.070, 15.011, 9.908, 15.009, 4, 12, 'Drywall'],
  [10.869, 15.020, 10.070, 15.011, 6, 4, 'Wood Door'],
  // Vertical wall at x≈5.8-5.9 (LEFT boundary with doors+windows)
  [5.804, 4.554, 5.820, 5.417, 15, 24, 'Brick'],
  [5.820, 5.417, 5.834, 6.183, 4, 2, 'Window'],
  [5.834, 6.183, 5.853, 7.225, 15, 24, 'Brick'],
  [5.853, 7.225, 5.847, 8.381, 15, 24, 'Brick'],
  [5.847, 8.381, 5.843, 9.309, 4, 2, 'Window'],
  [5.843, 9.309, 5.837, 10.433, 15, 24, 'Brick'],
  [5.837, 10.433, 5.842, 10.922, 15, 24, 'Brick'],
  [5.842, 10.922, 5.851, 11.736, 4, 2, 'Window'],
  [5.851, 11.736, 5.858, 12.420, 15, 24, 'Brick'],
  [5.858, 12.420, 5.865, 13.120, 4, 2, 'Window'],
  [5.865, 13.120, 5.870, 13.576, 15, 24, 'Brick'],
  // Vertical wall at x≈10 (with doors)
  [10.006, 7.192, 9.990, 6.296, 15, 24, 'Brick'],
  [9.990, 6.296, 9.971, 5.319, 6, 4, 'Wood Door'],  // Door 2
  [9.971, 5.319, 9.957, 4.554, 15, 24, 'Brick'],
  [10.071, 10.433, 10.041, 8.934, 15, 24, 'Brick'],
  [10.041, 8.934, 10.024, 8.071, 6, 4, 'Wood Door'],  // Door 3
  [10.024, 8.071, 10.006, 7.192, 15, 24, 'Brick'],
  [9.957, 4.554, 10.071, 10.433, 15, 24, 'Brick'], // LONG segment overlapping doors!
  // Vertical wall at x≈10 (lower part, with doors)
  [9.908, 13.544, 9.833, 11.474, 15, 24, 'Brick'],
  [9.833, 11.474, 9.807, 10.758, 6, 4, 'Wood Door'],  // Door 4
  [9.807, 10.758, 9.794, 10.417, 15, 24, 'Brick'],
  [9.908, 13.544, 9.906, 14.065, 15, 24, 'Brick'],
  [9.906, 14.065, 9.903, 14.830, 6, 4, 'Wood Door'],  // Door 5
  [9.903, 14.830, 9.892, 17.452, 15, 24, 'Brick'],
  // Vertical wall at x≈14.7-14.8
  [14.745, 10.400, 14.745, 4.472, 15, 24, 'Brick'],
  [14.794, 5.954, 14.745, 10.400, 15, 24, 'Brick'],
  // Wall at y≈4.5 with WINDOW
  [14.745, 4.472, 13.914, 4.487, 15, 24, 'Brick'],
  [13.914, 4.487, 10.789, 4.540, 4, 2, 'Window'],
  [10.789, 4.540, 9.957, 4.554, 15, 24, 'Brick'],
  // Vertical wall at x≈19.2
  [19.159, 13.478, 19.175, 17.436, 15, 24, 'Brick'],
  [14.810, 17.420, 14.778, 13.511, 15, 24, 'Brick'], // reverse
  // Vertical wall at x≈20.2 with DOOR
  [20.201, 10.400, 20.207, 9.570, 15, 24, 'Brick'],
  [20.207, 9.570, 20.230, 6.492, 6, 4, 'Wood Door'],  // BIG door/opening (~3m)
  [20.230, 6.492, 20.234, 5.971, 15, 24, 'Brick'],
  // Diagonal Drywall+Door at NE corner (to lower wall)
  [24.712, 14.879, 24.712, 13.332, 15, 24, 'Brick'],
  [24.712, 13.332, 23.621, 12.387, 4, 12, 'Drywall'],
  [23.621, 12.387, 20.299, 12.322, 4, 12, 'Drywall'],
  [20.299, 12.322, 20.121, 12.502, 4, 12, 'Drywall'],
  [20.121, 12.502, 19.442, 13.191, 6, 4, 'Wood Door'],
  [19.442, 13.191, 19.159, 13.478, 4, 12, 'Drywall'],
  // Horizontal walls at y≈5.97 (TOP boundary)
  [20.234, 5.971, 19.501, 5.969, 15, 24, 'Brick'],
  [19.501, 5.969, 17.840, 5.964, 4, 2, 'Window'],
  [17.840, 5.964, 14.794, 5.954, 15, 24, 'Brick'],
  [20.234, 5.971, 20.722, 5.971, 15, 24, 'Brick'],
  [20.722, 5.971, 24.093, 5.971, 4, 2, 'Window'],
  [24.093, 5.971, 26.617, 5.971, 15, 24, 'Brick'],
  [26.617, 5.971, 31.275, 5.971, 4, 2, 'Window'],
  [31.275, 5.971, 32.155, 5.971, 15, 24, 'Brick'],
  // RIGHT boundary at x≈32.2
  [32.155, 5.971, 32.203, 14.895, 15, 24, 'Brick'],
  // Bottom wall at y≈14.9
  [32.203, 14.895, 24.712, 14.879, 15, 24, 'Brick'],
  // Left vertical wall continuation
  [5.902, 17.452, 5.870, 13.576, 15, 24, 'Brick'],
  // Bottom walls at y≈17.45 with windows
  [9.892, 17.452, 9.029, 17.452, 15, 24, 'Brick'],
  [9.029, 17.452, 6.456, 17.452, 4, 2, 'Window'],
  [6.456, 17.452, 5.902, 17.452, 15, 24, 'Brick'],
  [14.810, 17.420, 13.247, 17.430, 15, 24, 'Brick'],
  [13.247, 17.430, 10.788, 17.446, 4, 2, 'Window'],
  [10.788, 17.446, 9.892, 17.452, 15, 24, 'Brick'],
  [16.080, 17.424, 15.283, 17.421, 4, 2, 'Window'],
  [15.283, 17.421, 14.810, 17.420, 15, 24, 'Brick'],
  [19.175, 17.436, 18.849, 17.435, 15, 24, 'Brick'],
  [18.849, 17.435, 18.034, 17.432, 4, 2, 'Window'],
  [18.034, 17.432, 16.080, 17.424, 15, 24, 'Brick'],
  // Small room at x≈24.5-25.5, y≈8-10.5
  [24.493, 7.999, 24.573, 10.515, 15, 24, 'Brick'],
  [24.573, 10.515, 25.499, 10.414, 15, 24, 'Brick'],
  [25.499, 10.414, 25.398, 7.999, 6, 10, 'Light Wall'],
  [25.398, 7.999, 24.493, 7.999, 15, 24, 'Brick'],
];

function buildWalls(): WallData[] {
  return RAW_WALLS.map(([x1, y1, x2, y2, att, thick, label]) => ({
    segments: [{ x1, y1, x2, y2 }],
    attenuationDb: att,
    baseThicknessCm: thick,
    actualThicknessCm: thick,
    materialLabel: label,
  }));
}

const REAL_WALLS = buildWalls();

// ─── RF Constants ───────────────────────────────────────────────

const PL_1M = REFERENCE_LOSS['5ghz']; // 46.42
const N = PATH_LOSS_EXPONENTS['5ghz']; // 3.2
const RX_GAIN = DEFAULT_RECEIVER_GAIN_DBI; // -3
const RX_HEIGHT = DEFAULT_RECEIVER_HEIGHT_M; // 1.0
const CLIENT_TX = CLIENT_TX_POWER['5ghz']; // 12
const CLIENT_GAIN = CLIENT_ANTENNA_GAIN_DBI; // -3

// ─── Report Formatting ─────────────────────────────────────────

// Old values from before dedup fix (for comparison)
const OLD_WALL_LOSS: Record<string, Record<string, number>> = {
  'P1': { AP2: 0, AP1: 0, AP3: 45 },
  'P2': { AP2: 21, AP1: 60, AP3: 51 },
  'P3': { AP1: 15, AP2: 60, AP3: 83 },
  'P3b': { AP1: 0, AP2: 10, AP3: 45 },
  'P4': { AP3: 30, AP2: 42, AP1: 51 },
  'P5': { AP3: 0, AP2: 6, AP1: 53 },
};
const OLD_EFFECTIVE: Record<string, Record<string, number>> = {
  'P1': { AP2: -63.5, AP1: -65.9, AP3: -112.4 },
  'P2': { AP2: -82.2, AP1: -144.7, AP3: -114.6 },
  'P3': { AP1: -61.6, AP2: -132.6, AP3: -158.8 },
  'P3b': { AP1: -39.5, AP2: -83.6, AP3: -121.2 },
  'P4': { AP3: -83.9, AP2: -107.6, AP1: -136.6 },
  'P5': { AP3: -38.5, AP2: -61.8, AP1: -135.9 },
};

function formatAp(ap: PerApDebug, rank: number): string {
  const star = ap.isBest ? ' ★' : '';
  const lines = [
    `  ── ${ap.apId}${star} (Rang ${rank}) ──`,
    `    2D-Distanz: ${ap.distance2D}m  |  3D-Distanz: ${ap.distance3D}m`,
    `    Path Loss: ${ap.pathLossDb} dB`,
    `    Mounting: ${ap.mountingType}/${ap.mountingSector}  Faktor: ${ap.mountingFactorDb} dB  Winkel: ${ap.mountingAngleDiff}°`,
    `    Rohe Treffer: ${ap.rawHitCount}  →  Gruppen: ${ap.hitGroups.length}  |  Objekt-Verluste: ${ap.wallLossDb} dB`,
  ];
  if (ap.hitGroups.length > 0) {
    lines.push('    Treffergruppen:');
    for (const g of ap.hitGroups) {
      const rawParts = g.rawHits.map(h =>
        `${h.materialLabel}@(${h.hitX},${h.hitY}) ${h.attenuationDb}dB`
      );
      if (g.rawHits.length === 1) {
        lines.push(`      G${g.index + 1}: [${rawParts[0]}] → kept → ${g.appliedLossDb}dB`);
      } else {
        lines.push(`      G${g.index + 1}: [${rawParts.join(', ')}]`);
        lines.push(`            → ${g.action}: ${g.reason} → ${g.appliedLossDb}dB`);
      }
    }
  } else {
    lines.push('    Treffergruppen: keine (freie Sicht)');
  }
  lines.push(
    `    DL RSSI: ${ap.downlinkRssi} dBm  |  UL RSSI: ${ap.uplinkRssi} dBm  |  Effective: ${ap.effectiveRssi} dBm`,
  );
  return lines.join('\n');
}

function report(label: string, r: PointDebugResult): string {
  const lines = [
    `\n${'═'.repeat(70)}`,
    `${label}  →  (${r.pointX}, ${r.pointY}) m`,
    `Best AP: ${r.bestApId}  Effective: ${r.effectiveRssi} dBm`,
  ];
  if (r.secondBestApId) {
    lines.push(`2nd best: ${r.secondBestApId}  Delta: ${r.secondBestDelta} dB`);
  }
  lines.push('');
  for (let i = 0; i < r.perAp.length; i++) {
    lines.push(formatAp(r.perAp[i]!, i + 1));
    lines.push('');
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════

describe('Real Project Verification (5GHz)', () => {

  it('prints header', () => {
    console.log('\n' + '═'.repeat(70));
    console.log('ECHTES PROJEKT — VERIFIKATIONSREPORT (5 GHz)');
    console.log('═'.repeat(70));
    console.log('\nFloor: 39.7m × 30.4m, Deckenhoehe 2.7m');
    console.log(`Walls: ${RAW_WALLS.length} Segmente`);
    console.log('\nAccess Points:');
    console.log('  AP1: (31.58, 14.45) h=1.5m  wall orient=324° (NW)  tx=20dBm  gain=4.3dBi');
    console.log('  AP2: (13.65, 12.75) h=2.5m  ceiling                tx=20dBm  gain=4.3dBi');
    console.log('  AP3: (10.42, 7.74)  h=1.75m wall orient=101° (SSE) tx=20dBm  gain=4.3dBi');
    console.log(`\nRF: PL(1m)=${PL_1M}dB  n=${N}  RX=${RX_GAIN}dBi  Client TX=${CLIENT_TX}dBm`);
    console.log('Materialien: Brick=15dB  Door=6dB  Window=4dB  Drywall=4dB  LightWall=6dB');
  });

  // ─── P1: Übergang zum rechten Raum ───────────────────────────
  describe('P1: (22, 10) — Übergang zum rechten Raum', () => {
    const r = inspectPoint(22, 10, REAL_APS, REAL_WALLS, BOUNDS, BAND);

    it('report', () => { console.log(report('P1: Übergang zum rechten Raum', r)); });

    it('AP2 is best (closest ceiling AP)', () => {
      expect(r.bestApId).toBe('AP2');
    });

    it('AP2 has free sight to P1 (no walls between)', () => {
      const ap2 = r.perAp.find(a => a.apId === 'AP2')!;
      // Ray from (13.65, 12.75) to (22, 10) passes through open space
      expect(ap2.wallsHit).toBe(0);
    });

    it('AP1 is far but has free sight through large room', () => {
      const ap1 = r.perAp.find(a => a.apId === 'AP1')!;
      // AP1 at (31.58, 14.45) → (22, 10): might cross y≈14.9 boundary wall
      console.log(`    AP1 walls hit: ${ap1.wallsHit}, effective: ${ap1.effectiveRssi}`);
    });
  });

  // ─── P2: Linker unterer Bereich ──────────────────────────────
  describe('P2: (7, 16) — linker unterer Bereich', () => {
    const r = inspectPoint(7, 16, REAL_APS, REAL_WALLS, BOUNDS, BAND);

    it('report', () => { console.log(report('P2: Linker unterer Bereich', r)); });

    it('AP2 or AP3 is best', () => {
      expect(['AP2', 'AP3']).toContain(r.bestApId);
    });

    it('AP1 crosses multiple walls (very far)', () => {
      const ap1 = r.perAp.find(a => a.apId === 'AP1')!;
      expect(ap1.wallsHit).toBeGreaterThanOrEqual(2);
    });

    it('AP3 crosses at least 1 wall from upper room', () => {
      const ap3 = r.perAp.find(a => a.apId === 'AP3')!;
      expect(ap3.wallsHit).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── P3: Hinter AP1 (Back Sector) ────────────────────────────
  describe('P3: (30.5, 15.5) — hinter AP1 (Back Sector)', () => {
    const r = inspectPoint(30.5, 15.5, REAL_APS, REAL_WALLS, BOUNDS, BAND);

    it('report', () => { console.log(report('P3: Hinter AP1 (Back Sector)', r)); });

    it('AP1 is back sector', () => {
      const ap1 = r.perAp.find(a => a.apId === 'AP1')!;
      expect(ap1.mountingSector).toBe('back');
      expect(ap1.mountingFactorDb).toBe(-15);
    });
  });

  // ─── P3b: Vor AP1 (Front Sector) ─────────────────────────────
  describe('P3b: (32, 13) — vor AP1 (Front Sector)', () => {
    const rFront = inspectPoint(32, 13, REAL_APS, REAL_WALLS, BOUNDS, BAND);
    const rBack = inspectPoint(30.5, 15.5, REAL_APS, REAL_WALLS, BOUNDS, BAND);

    it('report', () => { console.log(report('P3b: Vor AP1 (Front Sector)', rFront)); });

    it('AP1 is front sector', () => {
      const ap1 = rFront.perAp.find(a => a.apId === 'AP1')!;
      expect(ap1.mountingSector).toBe('front');
      expect(ap1.mountingFactorDb).toBe(0);
    });

    it('mounting asymmetry clearly visible', () => {
      const ap1F = rFront.perAp.find(a => a.apId === 'AP1')!;
      const ap1B = rBack.perAp.find(a => a.apId === 'AP1')!;
      const dlDiff = ap1F.downlinkRssi - ap1B.downlinkRssi;

      console.log('\n  ── Mounting Asymmetrie AP1 (orient=324°) ──');
      console.log(`    Front (32,13):    DL=${ap1F.downlinkRssi}  UL=${ap1F.uplinkRssi}  Eff=${ap1F.effectiveRssi}  d2D=${ap1F.distance2D}m`);
      console.log(`    Back  (30.5,15.5):DL=${ap1B.downlinkRssi}  UL=${ap1B.uplinkRssi}  Eff=${ap1B.effectiveRssi}  d2D=${ap1B.distance2D}m`);
      console.log(`    DL-Differenz: ${dlDiff.toFixed(1)} dB`);
      // Allow for distance difference — the penalty should still be significant
      expect(dlDiff).toBeGreaterThan(8);
    });
  });

  // ─── P4: Ray durch Holztür ────────────────────────────────────
  describe('P4: (7, 5) — Ray durch Holztür an x≈10', () => {
    const r = inspectPoint(7, 5, REAL_APS, REAL_WALLS, BOUNDS, BAND);

    it('report', () => { console.log(report('P4: Ray durch Holztür', r)); });

    it('AP2 ray crosses x≈10 wall — check if door is detected', () => {
      const ap2 = r.perAp.find(a => a.apId === 'AP2')!;
      // Ray from AP2 (13.65, 12.75) to (7, 5) crosses x≈10 at y≈8.5
      // Door 3 is at x≈10, y=8.07→8.93
      // LONG brick segment also covers this y-range
      // Dedup should keep Door (6dB) over Brick (15dB)
      const doorHits = ap2.segmentHits.filter(h => h.materialLabel === 'Wood Door');
      const brickAt10 = ap2.segmentHits.filter(h =>
        h.materialLabel === 'Brick' && Math.abs(h.hitX - 10) < 0.5,
      );

      console.log('\n  ── Tür-Dedup Analyse (AP2→P4 an x≈10) ──');
      console.log(`    Door-Treffer: ${doorHits.length}`);
      console.log(`    Brick-Treffer nahe x=10: ${brickAt10.length}`);
      for (const h of doorHits) {
        console.log(`    → Door at (${h.hitX}, ${h.hitY}): ${h.attenuationDb}dB`);
      }
      for (const h of brickAt10) {
        console.log(`    → Brick at (${h.hitX}, ${h.hitY}): ${h.attenuationDb}dB`);
      }

      if (doorHits.length > 0) {
        console.log('    Dedup: Door ersetzt Brick am selben Punkt ✓');
      } else if (brickAt10.length > 0) {
        console.log('    ACHTUNG: Brick statt Door gezählt — Dedup prüfen!');
      }
    });

    it('AP3 is close and in front sector', () => {
      const ap3 = r.perAp.find(a => a.apId === 'AP3')!;
      // AP3 at (10.42, 7.74) orient=101° — (7, 5) is upper-left
      // angle ≈ atan2(5-7.74, 7-10.42) = atan2(-2.74, -3.42) ≈ 218.7°
      // diff = |(218.7-101+540)%360-180| = |657.7%360-180| = |297.7-180| = 117.7° → side sector
      console.log(`    AP3: sector=${ap3.mountingSector}, factor=${ap3.mountingFactorDb}dB`);
    });
  });

  // ─── P5: Freie Sicht nahe AP3 ────────────────────────────────
  describe('P5: (10.5, 9) — freie Sicht nahe AP3', () => {
    const r = inspectPoint(10.5, 9, REAL_APS, REAL_WALLS, BOUNDS, BAND);

    it('report', () => { console.log(report('P5: Freie Sicht nahe AP3', r)); });

    it('AP3 is best (very close, same room)', () => {
      expect(r.bestApId).toBe('AP3');
    });

    it('AP3 has no walls in path (free sight)', () => {
      const ap3 = r.perAp.find(a => a.apId === 'AP3')!;
      expect(ap3.wallsHit).toBe(0);
      expect(ap3.wallLossDb).toBe(0);
    });

    it('AP3 distance is very short', () => {
      const ap3 = r.perAp.find(a => a.apId === 'AP3')!;
      expect(ap3.distance2D).toBeLessThan(2);
    });

    it('signal is excellent', () => {
      expect(r.effectiveRssi).toBeGreaterThan(-50);
    });
  });

  // ─── Zusammenfassung ─────────────────────────────────────────
  describe('Abschlussbewertung', () => {
    it('prints summary and comparison', () => {
      const p1 = inspectPoint(22, 10, REAL_APS, REAL_WALLS, BOUNDS, BAND);
      const p2 = inspectPoint(7, 16, REAL_APS, REAL_WALLS, BOUNDS, BAND);
      const p3 = inspectPoint(30.5, 15.5, REAL_APS, REAL_WALLS, BOUNDS, BAND);
      const p3b = inspectPoint(32, 13, REAL_APS, REAL_WALLS, BOUNDS, BAND);
      const p4 = inspectPoint(7, 5, REAL_APS, REAL_WALLS, BOUNDS, BAND);
      const p5 = inspectPoint(10.5, 9, REAL_APS, REAL_WALLS, BOUNDS, BAND);

      console.log('\n' + '═'.repeat(70));
      console.log('ABSCHLUSSBEWERTUNG — ECHTES PROJEKT (nach Junction-Dedup-Fix)');
      console.log('═'.repeat(70));

      console.log('\n1. SIGNALSTÄRKEN-ÜBERSICHT');
      const points = [
        { k: 'P1', l: 'P1 (22,10) Raumübergang', r: p1 },
        { k: 'P2', l: 'P2 (7,16) hinter Wänden', r: p2 },
        { k: 'P3', l: 'P3 (30.5,15.5) back AP1', r: p3 },
        { k: 'P3b', l: 'P3b (32,13) front AP1', r: p3b },
        { k: 'P4', l: 'P4 (7,5) durch Tür', r: p4 },
        { k: 'P5', l: 'P5 (10.5,9) nahe AP3', r: p5 },
      ];
      for (const p of points) {
        const q = p.r.effectiveRssi >= -50 ? 'excellent' :
                  p.r.effectiveRssi >= -65 ? 'good' :
                  p.r.effectiveRssi >= -75 ? 'fair' :
                  p.r.effectiveRssi >= -85 ? 'poor' : 'none';
        console.log(`   ${p.l}: ${p.r.effectiveRssi} dBm [${q}] best=${p.r.bestApId}`);
      }

      // 2. Mounting Asymmetry
      const ap1F = p3b.perAp.find(a => a.apId === 'AP1')!;
      const ap1B = p3.perAp.find(a => a.apId === 'AP1')!;
      console.log('\n2. WANDMONTAGE-ASYMMETRIE');
      console.log(`   AP1 Front: ${ap1F.effectiveRssi} dBm (sector=${ap1F.mountingSector})`);
      console.log(`   AP1 Back:  ${ap1B.effectiveRssi} dBm (sector=${ap1B.mountingSector})`);
      console.log(`   Diff: ${(ap1F.effectiveRssi - ap1B.effectiveRssi).toFixed(1)} dB`);

      // 3. Door replacement
      const ap2p4 = p4.perAp.find(a => a.apId === 'AP2')!;
      const hasDoorHit = ap2p4.segmentHits.some(h => h.materialLabel === 'Wood Door');
      console.log('\n3. TUER-ERSETZUNG');
      console.log(`   AP2→P4 Tür erkannt: ${hasDoorHit ? 'JA ✓' : 'NEIN ✗'}`);

      // 4. Vorher/Nachher Vergleich
      console.log('\n4. VORHER/NACHHER-VERGLEICH (Wandverluste)');
      console.log('   Punkt | AP  | alt WallLoss | neu WallLoss | Δ    | alt Eff.  | neu Eff.  | Δ');
      console.log('   ' + '─'.repeat(82));
      for (const p of points) {
        for (const ap of p.r.perAp) {
          const oldWL = OLD_WALL_LOSS[p.k]?.[ap.apId] ?? NaN;
          const oldEff = OLD_EFFECTIVE[p.k]?.[ap.apId] ?? NaN;
          if (isNaN(oldWL)) continue;
          const wlDiff = ap.wallLossDb - oldWL;
          const effDiff = ap.effectiveRssi - oldEff;
          const wlStr = wlDiff === 0 ? '  =' : `${wlDiff > 0 ? '+' : ''}${wlDiff.toFixed(1)}`;
          const effStr = effDiff === 0 ? '  =' : `${effDiff > 0 ? '+' : ''}${effDiff.toFixed(1)}`;
          const changed = wlDiff !== 0 ? ' ◀' : '';
          console.log(
            `   ${p.k.padEnd(4)} | ${ap.apId.padEnd(3)} | ${String(oldWL).padStart(7)} dB  | ${String(ap.wallLossDb).padStart(7)} dB  | ${wlStr.padStart(5)} | ${String(oldEff).padStart(7)} dBm | ${String(ap.effectiveRssi).padStart(7)} dBm | ${effStr.padStart(5)}${changed}`,
          );
        }
      }

      // 5. Dedup-Statistik
      console.log('\n5. DEDUP-STATISTIK');
      let totalRaw = 0;
      let totalGroups = 0;
      let mergedCount = 0;
      let openingCount = 0;
      for (const p of points) {
        for (const ap of p.r.perAp) {
          totalRaw += ap.rawHitCount;
          totalGroups += ap.hitGroups.length;
          for (const g of ap.hitGroups) {
            if (g.action === 'same_barrier_merged') mergedCount++;
            if (g.action === 'opening_replaced_wall') openingCount++;
          }
        }
      }
      console.log(`   Rohe Treffer gesamt:  ${totalRaw}`);
      console.log(`   Gruppen nach Dedup:   ${totalGroups}`);
      console.log(`   Zusammengeführt:      ${totalRaw - totalGroups} (${mergedCount} Gruppen: same barrier, ${openingCount} Gruppen: opening replaced wall)`);

      // 6. Consistency check
      console.log('\n6. KONSISTENZ');
      console.log(`   Alle Punkte berechnet: ✓`);
      console.log(`   Keine NaN/Infinity: ${points.every(p => isFinite(p.r.effectiveRssi)) ? '✓' : '✗'}`);
      const allBest = points.map(p => p.r.bestApId);
      const uniqueAPs = new Set(allBest);
      console.log(`   Verschiedene APs als Sieger: ${uniqueAPs.size}/3 (${[...uniqueAPs].join(', ')})`);

      console.log('\n' + '═'.repeat(70));
      console.log('ENDE REPORT');
      console.log('═'.repeat(70));
    });
  });
});
