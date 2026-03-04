/**
 * Demo Geometry Verification Report
 *
 * Tests the RF model against the actual demo project geometry ("Demo Wohnung").
 * Uses inspectPoint() to verify calculations at 6 critical points.
 *
 * Geometry: 15m x 10m, ceiling height 2.7m
 *
 *   (0,0)─────────────────(7,0)─────────────────(15,0)
 *   │ Brick 20dB            │ Brick 20dB           │
 *   │                       │ wall-inner-1          │
 *   │    AP1 (3.5, 3.0)     │ Light Wall 6dB       │
 *   │    ceiling             │   AP2 (11.0, 3.0)    │
 *   │                       │   ceiling              │
 *   │                       │                        │
 *   ├───────────────────(7,6)┘                       │
 *   │(0,6) wall-inner-2     (extends to 10,6)       │
 *   │      Light Wall 6dB                            │
 *   │                                                │
 *   │    AP3 (3.5, 8.0)                              │
 *   │    wall mount, orient=0°                       │
 *   │                                                │
 *   (0,10)──────────────────────────────────────(15,10)
 *
 * Rooms:
 *   Top-left  (0-7, 0-6):   AP1 — Wohnzimmer
 *   Top-right (7-15, 0-6):  AP2 — Buero (wall-inner-1 divides)
 *   Bottom    (0-10, 6-10): AP3 — Schlafzimmer (wall-inner-2 divides)
 *   Bottom-right open area: x>10, y>6 — no horizontal wall
 */

import { describe, it, expect } from 'vitest';
import { inspectPoint, type PointDebugResult, type PerApDebug } from '../point-inspector';
import type { APConfig, WallData, FloorBounds } from '../worker-types';
import {
  REFERENCE_LOSS,
  PATH_LOSS_EXPONENTS,
  DEFAULT_RECEIVER_GAIN_DBI,
  MIN_DISTANCE,
  DEFAULT_RECEIVER_HEIGHT_M,
  CLIENT_TX_POWER,
  CLIENT_ANTENNA_GAIN_DBI,
} from '../rf-engine';

// ─── Demo Geometry Setup ────────────────────────────────────────

const BAND = '5ghz' as const;
const BOUNDS: FloorBounds = { width: 15, height: 10 };

/**
 * APs matching demo project mock data (5GHz band).
 * Source: src/lib/api/mock-data.ts
 */
const DEMO_APS: APConfig[] = [
  {
    id: 'ap-living',
    x: 3.5,
    y: 3.0,
    heightM: 2.5,
    txPowerDbm: 20,
    antennaGainDbi: 5,
    enabled: true,
    mounting: 'ceiling',
    orientationDeg: 0,
  },
  {
    id: 'ap-office',
    x: 11.0,
    y: 3.0,
    heightM: 2.5,
    txPowerDbm: 20,
    antennaGainDbi: 5,
    enabled: true,
    mounting: 'ceiling',
    orientationDeg: 0,
  },
  {
    id: 'ap-bedroom',
    x: 3.5,
    y: 8.0,
    heightM: 2.5,
    txPowerDbm: 17,
    antennaGainDbi: 5,
    enabled: true,
    mounting: 'wall',
    orientationDeg: 0,
  },
];

/**
 * Walls matching demo project mock data (5GHz band).
 * 4 outer brick walls + 2 inner Light Wall dividers.
 * Brick (mat-brick): 20 dB at 5GHz, 17.5 cm
 * Light Wall (Q01): 6 dB at 5GHz, 10 cm
 */
const DEMO_WALLS: WallData[] = [
  // Outer walls — Brick
  { segments: [{ x1: 0, y1: 0, x2: 15, y2: 0 }], attenuationDb: 20, baseThicknessCm: 17.5, actualThicknessCm: 17.5, materialLabel: 'Brick Wall (medium)' },
  { segments: [{ x1: 15, y1: 0, x2: 15, y2: 10 }], attenuationDb: 20, baseThicknessCm: 17.5, actualThicknessCm: 17.5, materialLabel: 'Brick Wall (medium)' },
  { segments: [{ x1: 0, y1: 10, x2: 15, y2: 10 }], attenuationDb: 20, baseThicknessCm: 17.5, actualThicknessCm: 17.5, materialLabel: 'Brick Wall (medium)' },
  { segments: [{ x1: 0, y1: 0, x2: 0, y2: 10 }], attenuationDb: 20, baseThicknessCm: 17.5, actualThicknessCm: 17.5, materialLabel: 'Brick Wall (medium)' },
  // Inner wall 1 — vertical divider
  { segments: [{ x1: 7, y1: 0, x2: 7, y2: 6 }], attenuationDb: 6, baseThicknessCm: 10, actualThicknessCm: 10, materialLabel: 'Light Wall' },
  // Inner wall 2 — horizontal divider
  { segments: [{ x1: 0, y1: 6, x2: 10, y2: 6 }], attenuationDb: 6, baseThicknessCm: 10, actualThicknessCm: 10, materialLabel: 'Light Wall' },
];

/**
 * Extended walls with a glass door on inner wall 2 (synthetic, for door dedup test).
 * Door at (4,6)→(5,6) with 3 dB attenuation overlaps the Light Wall 6 dB segment.
 */
const DEMO_WALLS_WITH_DOOR: WallData[] = [
  ...DEMO_WALLS,
  { segments: [{ x1: 4, y1: 6, x2: 5, y2: 6 }], attenuationDb: 3, baseThicknessCm: 3, actualThicknessCm: 3, materialLabel: 'Glass Door' },
];

// ─── RF Constants ───────────────────────────────────────────────

const PL_1M = REFERENCE_LOSS['5ghz']; // 46.42 dB
const N = PATH_LOSS_EXPONENTS['5ghz']; // 3.2
const RX_GAIN = DEFAULT_RECEIVER_GAIN_DBI; // -3 dBi
const RX_HEIGHT = DEFAULT_RECEIVER_HEIGHT_M; // 1.0 m
const CLIENT_TX = CLIENT_TX_POWER['5ghz']; // 12 dBm
const CLIENT_GAIN = CLIENT_ANTENNA_GAIN_DBI; // -3 dBi

// ─── Manual Calculation Helpers ─────────────────────────────────

function manual3DDistance(apX: number, apY: number, apH: number, pX: number, pY: number): number {
  const dx = pX - apX;
  const dy = pY - apY;
  const dz = apH - RX_HEIGHT;
  return Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy + dz * dz));
}

function manualPathLoss(d3D: number): number {
  return PL_1M + 10 * N * Math.log10(d3D);
}

function manualDL(txPwr: number, antGain: number, mounting: number, pathLoss: number, wallLoss: number): number {
  return txPwr + antGain + RX_GAIN + mounting - pathLoss - wallLoss;
}

function manualUL(antGain: number, pathLoss: number, wallLoss: number): number {
  return CLIENT_TX + CLIENT_GAIN + antGain - pathLoss - wallLoss;
}

// ─── Report Formatting ─────────────────────────────────────────

function formatApDebug(ap: PerApDebug, rank: number): string {
  const star = ap.isBest ? ' ★' : '';
  const lines = [
    `  ── ${ap.apId}${star} (Rang ${rank}) ──`,
    `    2D-Distanz: ${ap.distance2D}m  |  3D-Distanz: ${ap.distance3D}m`,
    `    Path Loss (Freifeld): ${ap.pathLossDb} dB`,
    `    Mounting: ${ap.mountingType}/${ap.mountingSector}  Faktor: ${ap.mountingFactorDb} dB  Winkel: ${ap.mountingAngleDiff}°`,
    `    Wände getroffen: ${ap.wallsHit}  |  Objekt-Verluste: ${ap.wallLossDb} dB`,
  ];

  if (ap.segmentHits.length > 0) {
    lines.push('    Segment-Treffer:');
    for (let i = 0; i < ap.segmentHits.length; i++) {
      const h = ap.segmentHits[i]!;
      lines.push(
        `      ${i + 1}. ${h.materialLabel}  base=${h.baseAttenuationDb}dB  scale=${h.thicknessScale}x  → ${h.attenuationDb}dB` +
        `  at (${h.hitX},${h.hitY})  seg (${h.segX1},${h.segY1})→(${h.segX2},${h.segY2})`,
      );
    }
  } else {
    lines.push('    Segment-Treffer: keine (freie Sicht)');
  }

  lines.push(
    `    DL RSSI: ${ap.downlinkRssi} dBm  |  UL RSSI: ${ap.uplinkRssi} dBm  |  Effective: ${ap.effectiveRssi} dBm`,
  );
  return lines.join('\n');
}

function formatResult(label: string, r: PointDebugResult): string {
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
    lines.push(formatApDebug(r.perAp[i]!, i + 1));
    lines.push('');
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════

describe('Demo Geometry Verification Report (5GHz)', () => {
  // ── Header ──
  it('prints geometry and RF constants', () => {
    console.log('\n' + '═'.repeat(70));
    console.log('DEMO GEOMETRY VERIFICATION REPORT — 5 GHz Band');
    console.log('═'.repeat(70));
    console.log('\nGeometrie: 15m × 10m, Deckenhoehe 2.7m');
    console.log('\nAccess Points:');
    console.log('  AP1 (ap-living):   (3.5, 3.0)  h=2.5m  ceiling  tx=20dBm  gain=5dBi');
    console.log('  AP2 (ap-office):   (11.0, 3.0) h=2.5m  ceiling  tx=20dBm  gain=5dBi');
    console.log('  AP3 (ap-bedroom):  (3.5, 8.0)  h=2.5m  wall     tx=17dBm  gain=5dBi  orient=0°');
    console.log('\nWände:');
    console.log('  4× Außenwand Brick 20dB (17.5cm)');
    console.log('  wall-inner-1: (7,0)→(7,6)   Light Wall 6dB (10cm) — vertikaler Raumteiler');
    console.log('  wall-inner-2: (0,6)→(10,6)  Light Wall 6dB (10cm) — horizontaler Raumteiler');
    console.log(`\nRF-Konstanten (5GHz):`);
    console.log(`  PL(1m)=${PL_1M}dB  n=${N}  RX_Gain=${RX_GAIN}dBi  MIN_DIST=${MIN_DISTANCE}m  RX_Height=${RX_HEIGHT}m`);
    console.log(`  Client: TX=${CLIENT_TX}dBm  Gain=${CLIENT_GAIN}dBi`);
    console.log(`  DL = TxPwr + AntGain + RxGain + Mounting - [PL(1m) + 10·n·log10(d3D)] - WallLoss`);
    console.log(`  UL = ClientTX + ClientGain + APGain - [PL(1m) + 10·n·log10(d3D)] - WallLoss`);
    console.log(`  Effective RSSI = min(DL, UL)`);
    expect(true).toBe(true);
  });

  // ─── P1: Übergang zum rechten Raum ───────────────────────────
  describe('P1: (8, 3) — Übergang mittlerer Bereich → rechter Raum', () => {
    const r = inspectPoint(8, 3, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report', () => {
      console.log(formatResult('P1: Übergang zum rechten Raum', r));
    });

    it('AP2 is best (closest, no walls)', () => {
      expect(r.bestApId).toBe('ap-office');
    });

    it('AP1 crosses exactly 1 wall (inner-1 at x=7)', () => {
      const ap1 = r.perAp.find(a => a.apId === 'ap-living')!;
      expect(ap1.wallsHit).toBe(1);
      expect(ap1.wallLossDb).toBe(6);
      expect(ap1.segmentHits[0]?.materialLabel).toBe('Light Wall');
    });

    it('AP2 crosses 0 walls (same room)', () => {
      const ap2 = r.perAp.find(a => a.apId === 'ap-office')!;
      expect(ap2.wallsHit).toBe(0);
      expect(ap2.wallLossDb).toBe(0);
    });

    it('AP3 crosses 2 walls (inner-2 at y=6 + inner-1 at x=7)', () => {
      const ap3 = r.perAp.find(a => a.apId === 'ap-bedroom')!;
      expect(ap3.wallsHit).toBe(2);
      expect(ap3.wallLossDb).toBe(12);
    });

    it('manual DL/UL check AP2', () => {
      const ap2 = r.perAp.find(a => a.apId === 'ap-office')!;
      const d3D = manual3DDistance(11, 3, 2.5, 8, 3);
      const pl = manualPathLoss(d3D);
      const dl = manualDL(20, 5, -2, pl, 0);
      const ul = manualUL(5, pl, 0);
      expect(ap2.downlinkRssi).toBeCloseTo(dl, 0);
      expect(ap2.uplinkRssi).toBeCloseTo(ul, 0);
      console.log(`    Manual AP2: d3D=${d3D.toFixed(2)}m  PL=${pl.toFixed(1)}dB  DL=${dl.toFixed(1)}  UL=${ul.toFixed(1)} ✓`);
    });

    it('manual DL/UL check AP1', () => {
      const ap1 = r.perAp.find(a => a.apId === 'ap-living')!;
      const d3D = manual3DDistance(3.5, 3, 2.5, 8, 3);
      const pl = manualPathLoss(d3D);
      const dl = manualDL(20, 5, -2, pl, 6);
      const ul = manualUL(5, pl, 6);
      expect(ap1.downlinkRssi).toBeCloseTo(dl, 0);
      expect(ap1.uplinkRssi).toBeCloseTo(ul, 0);
      console.log(`    Manual AP1: d3D=${d3D.toFixed(2)}m  PL=${pl.toFixed(1)}dB  DL=${dl.toFixed(1)}  UL=${ul.toFixed(1)} ✓`);
    });
  });

  // ─── P2: Linker unterer Bereich ──────────────────────────────
  describe('P2: (2, 9) — linker unterer Bereich, hinter Innenwänden', () => {
    const r = inspectPoint(2, 9, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report', () => {
      console.log(formatResult('P2: Linker unterer Bereich', r));
    });

    it('AP3 is best (closest, same room)', () => {
      expect(r.bestApId).toBe('ap-bedroom');
    });

    it('AP1 crosses 1 wall (inner-2 at y=6)', () => {
      const ap1 = r.perAp.find(a => a.apId === 'ap-living')!;
      expect(ap1.wallsHit).toBe(1);
      expect(ap1.wallLossDb).toBe(6);
    });

    it('AP2 crosses 2 walls (inner-1 + inner-2)', () => {
      const ap2 = r.perAp.find(a => a.apId === 'ap-office')!;
      expect(ap2.wallsHit).toBe(2);
      expect(ap2.wallLossDb).toBe(12);
    });

    it('AP3 crosses 0 walls (same room)', () => {
      const ap3 = r.perAp.find(a => a.apId === 'ap-bedroom')!;
      expect(ap3.wallsHit).toBe(0);
      expect(ap3.wallLossDb).toBe(0);
    });

    it('AP3 mounting sector is back (point is behind wall-mount)', () => {
      const ap3 = r.perAp.find(a => a.apId === 'ap-bedroom')!;
      // AP3 faces right (orient=0°), point (2,9) is upper-left → back sector
      expect(ap3.mountingSector).toBe('back');
      expect(ap3.mountingFactorDb).toBe(-15);
    });

    it('manual DL/UL check AP3', () => {
      const ap3 = r.perAp.find(a => a.apId === 'ap-bedroom')!;
      const d3D = manual3DDistance(3.5, 8, 2.5, 2, 9);
      const pl = manualPathLoss(d3D);
      const dl = manualDL(17, 5, -15, pl, 0);
      const ul = manualUL(5, pl, 0);
      expect(ap3.downlinkRssi).toBeCloseTo(dl, 0);
      expect(ap3.uplinkRssi).toBeCloseTo(ul, 0);
      console.log(`    Manual AP3: d3D=${d3D.toFixed(2)}m  PL=${pl.toFixed(1)}dB  DL=${dl.toFixed(1)} (−15 mount)  UL=${ul.toFixed(1)} ✓`);
    });
  });

  // ─── P3: Hinter AP3 (Back Sector) ────────────────────────────
  describe('P3: (1, 8) — hinter AP3 (Back Sector, Wandmontage)', () => {
    const r = inspectPoint(1, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report', () => {
      console.log(formatResult('P3: Hinter AP3 (Back Sector)', r));
    });

    it('AP3 is still best despite -15dB mounting penalty', () => {
      expect(r.bestApId).toBe('ap-bedroom');
    });

    it('AP3 sector is back with 180° diff', () => {
      const ap3 = r.perAp.find(a => a.apId === 'ap-bedroom')!;
      expect(ap3.mountingSector).toBe('back');
      expect(ap3.mountingAngleDiff).toBe(180);
      expect(ap3.mountingFactorDb).toBe(-15);
    });

    it('AP1 crosses 1 wall (inner-2)', () => {
      const ap1 = r.perAp.find(a => a.apId === 'ap-living')!;
      expect(ap1.wallsHit).toBe(1);
      expect(ap1.wallLossDb).toBe(6);
    });
  });

  // ─── P3b: Vor AP3 (Front Sector) — Asymmetrie-Vergleich ─────
  describe('P3b: (6, 8) — vor AP3 (Front Sector, Vergleichspunkt)', () => {
    const rFront = inspectPoint(6, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);
    const rBack = inspectPoint(1, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report', () => {
      console.log(formatResult('P3b: Vor AP3 (Front Sector)', rFront));
    });

    it('AP3 front sector confirmed', () => {
      const ap3 = rFront.perAp.find(a => a.apId === 'ap-bedroom')!;
      expect(ap3.mountingSector).toBe('front');
      expect(ap3.mountingFactorDb).toBe(0);
    });

    it('mounting asymmetry: front vs back = 15 dB DL difference at same distance', () => {
      const ap3Front = rFront.perAp.find(a => a.apId === 'ap-bedroom')!;
      const ap3Back = rBack.perAp.find(a => a.apId === 'ap-bedroom')!;

      // Both points are at same horizontal distance (2.5m) from AP3
      expect(ap3Front.distance2D).toBeCloseTo(ap3Back.distance2D, 1);
      expect(ap3Front.distance3D).toBeCloseTo(ap3Back.distance3D, 1);

      // DL difference should be exactly 15 dB (mounting factor)
      const dlDiff = ap3Front.downlinkRssi - ap3Back.downlinkRssi;
      expect(dlDiff).toBeCloseTo(15, 0);

      // UL is identical (no mounting factor in uplink)
      expect(ap3Front.uplinkRssi).toBeCloseTo(ap3Back.uplinkRssi, 0);

      console.log('\n  ── Mounting Asymmetrie-Vergleich (AP3, gleiche Distanz) ──');
      console.log(`    Front (6,8): DL=${ap3Front.downlinkRssi} dBm  UL=${ap3Front.uplinkRssi} dBm  Eff=${ap3Front.effectiveRssi} dBm`);
      console.log(`    Back  (1,8): DL=${ap3Back.downlinkRssi} dBm  UL=${ap3Back.uplinkRssi} dBm  Eff=${ap3Back.effectiveRssi} dBm`);
      console.log(`    DL-Differenz: ${dlDiff.toFixed(1)} dB (= Mounting-Penalty)`);
      console.log(`    UL-Differenz: ${(ap3Front.uplinkRssi - ap3Back.uplinkRssi).toFixed(1)} dB (= 0, kein Mounting im Uplink)`);
      console.log(`    Eff-Differenz: ${(ap3Front.effectiveRssi - ap3Back.effectiveRssi).toFixed(1)} dB`);
    });
  });

  // ─── P4: Tür-Segment (synthetisch) ──────────────────────────
  describe('P4: (4.5, 8.5) — Strahl durch Glastür (synthetisch)', () => {
    // Point in bottom-left room, ray from AP1 crosses inner wall 2 at y=6
    // At x=4.5 the door segment (4,6)→(5,6) overlaps the wall (0,6)→(10,6)
    // Expected: door (3dB) replaces wall (6dB) at intersection

    const rWithDoor = inspectPoint(4.5, 8.5, DEMO_APS, DEMO_WALLS_WITH_DOOR, BOUNDS, BAND);
    const rWithoutDoor = inspectPoint(4.5, 8.5, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report with door', () => {
      console.log(formatResult('P4: Strahl durch Glastür (mit Door-Segment)', rWithDoor));
    });

    it('AP1 ray through door: wall (6dB) replaced by door (3dB)', () => {
      const ap1 = rWithDoor.perAp.find(a => a.apId === 'ap-living')!;
      // Ray from (3.5,3) to (4.5,8.5) crosses y=6 at x ≈ 4.09
      // x=4.09 is within door segment [4,5] → door hit
      const doorHit = ap1.segmentHits.find(h => h.materialLabel === 'Glass Door');
      expect(doorHit).toBeDefined();
      expect(doorHit!.attenuationDb).toBe(3);

      // Should NOT also count the Light Wall at same point
      const wallHitAtSameT = ap1.segmentHits.filter(h =>
        h.materialLabel === 'Light Wall' && Math.abs(h.hitY - doorHit!.hitY) < 0.1,
      );
      expect(wallHitAtSameT.length).toBe(0);
    });

    it('door reduces wall loss by 3 dB vs without door', () => {
      const ap1With = rWithDoor.perAp.find(a => a.apId === 'ap-living')!;
      const ap1Without = rWithoutDoor.perAp.find(a => a.apId === 'ap-living')!;

      // Without door: wall = 6dB. With door: wall replaced by door = 3dB
      const lossDiff = ap1Without.wallLossDb - ap1With.wallLossDb;
      expect(lossDiff).toBeCloseTo(3, 0);

      console.log('\n  ── Tür-Ersetzung Vergleich (AP1→P4) ──');
      console.log(`    Ohne Tür: WallLoss=${ap1Without.wallLossDb}dB  (1× Light Wall 6dB)`);
      console.log(`    Mit Tür:  WallLoss=${ap1With.wallLossDb}dB  (1× Glass Door 3dB ersetzt Light Wall)`);
      console.log(`    Differenz: ${lossDiff.toFixed(1)} dB — Tür ersetzt Wand korrekt ✓`);
    });

    it('AP3 in same room — door has no effect', () => {
      const ap3With = rWithDoor.perAp.find(a => a.apId === 'ap-bedroom')!;
      const ap3Without = rWithoutDoor.perAp.find(a => a.apId === 'ap-bedroom')!;
      expect(ap3With.wallLossDb).toBe(ap3Without.wallLossDb);
      expect(ap3With.wallLossDb).toBe(0);
    });
  });

  // ─── P5: Rechter unterer Bereich (Lücke in Wand) ─────────────
  describe('P5: (12, 8) — rechter unterer Bereich (Lücke in horizontaler Wand)', () => {
    const r = inspectPoint(12, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report', () => {
      console.log(formatResult('P5: Rechter unterer Bereich (Wandlücke)', r));
    });

    it('AP2 ray passes through wall gap (no wall at x=12, y=6)', () => {
      const ap2 = r.perAp.find(a => a.apId === 'ap-office')!;
      // wall-inner-2 only extends to x=10, ray at x≈11.6 misses it
      // wall-inner-1 is at x=7, ray goes from (11,3) to (12,8): doesn't cross x=7
      expect(ap2.wallsHit).toBe(0);
      expect(ap2.wallLossDb).toBe(0);
    });

    it('AP1 crosses 2 walls to reach this point', () => {
      const ap1 = r.perAp.find(a => a.apId === 'ap-living')!;
      // Ray from (3.5,3) to (12,8) crosses inner-1 at x=7 and inner-2 at y=6
      expect(ap1.wallsHit).toBe(2);
      expect(ap1.wallLossDb).toBe(12);
    });

    it('AP2 is best (no walls, closer than AP1)', () => {
      expect(r.bestApId).toBe('ap-office');
    });
  });

  // ─── P6: Direkt neben AP1 (Nahfeld) ──────────────────────────
  describe('P6: (3.5, 3.0) — direkt unter AP1 (Minimum Distance Test)', () => {
    const r = inspectPoint(3.5, 3.0, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

    it('report', () => {
      console.log(formatResult('P6: Direkt unter AP1 (Nahfeld)', r));
    });

    it('AP1 is best with strongest signal', () => {
      expect(r.bestApId).toBe('ap-living');
    });

    it('AP1 distance clamped to MIN_DISTANCE or height-only', () => {
      const ap1 = r.perAp.find(a => a.apId === 'ap-living')!;
      // 2D distance is 0, 3D distance = height diff = 2.5 - 1.0 = 1.5m
      expect(ap1.distance2D).toBe(0);
      expect(ap1.distance3D).toBe(1.5);
    });
  });

  // ─── Zusammenfassende Bewertung ──────────────────────────────
  describe('Bewertung', () => {
    it('prints summary evaluation', () => {
      const p1 = inspectPoint(8, 3, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);
      const p2 = inspectPoint(2, 9, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);
      const p3back = inspectPoint(1, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);
      const p3front = inspectPoint(6, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);
      const p4door = inspectPoint(4.5, 8.5, DEMO_APS, DEMO_WALLS_WITH_DOOR, BOUNDS, BAND);
      const p5 = inspectPoint(12, 8, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);
      const p6 = inspectPoint(3.5, 3, DEMO_APS, DEMO_WALLS, BOUNDS, BAND);

      console.log('\n' + '═'.repeat(70));
      console.log('ZUSAMMENFASSENDE BEWERTUNG');
      console.log('═'.repeat(70));

      // 1. Segment-Treffer
      console.log('\n1. SEGMENTTREFFER LOGISCH KORREKT?');
      console.log('   P1 (8,3): AP1 trifft wall-inner-1 bei x=7 ✓ (Strahl kreuzt vertikale Wand)');
      console.log('   P2 (2,9): AP2 trifft inner-1 + inner-2 ✓ (diagonal durch beide Wände)');
      console.log('   P5 (12,8): AP2 trifft NICHTS ✓ (Strahl durch Wandlücke x>10)');

      // 2. Wandmontage-Asymmetrie
      const ap3f = p3front.perAp.find(a => a.apId === 'ap-bedroom')!;
      const ap3b = p3back.perAp.find(a => a.apId === 'ap-bedroom')!;
      const dlDiff = ap3f.downlinkRssi - ap3b.downlinkRssi;
      const effDiff = ap3f.effectiveRssi - ap3b.effectiveRssi;
      console.log('\n2. WANDMONTAGE-ASYMMETRIE DEUTLICH GENUG?');
      console.log(`   Front (6,8) vs Back (1,8) bei gleicher Distanz ${ap3f.distance2D}m:`);
      console.log(`   DL-Unterschied: ${dlDiff.toFixed(1)} dB — ${dlDiff >= 14 ? 'JA, sehr deutlich ✓' : 'NEIN, zu gering ✗'}`);
      console.log(`   Eff-Unterschied: ${effDiff.toFixed(1)} dB — ${effDiff >= 8 ? 'JA, signifikant ✓' : 'Moderat'}`);
      console.log(`   Bewertung: Front=${ap3f.effectiveRssi}dBm (excellent) vs Back=${ap3b.effectiveRssi}dBm`);

      // 3. Tür/Fenster Ersetzung
      const ap1d = p4door.perAp.find(a => a.apId === 'ap-living')!;
      const doorHit = ap1d.segmentHits.find(h => h.materialLabel === 'Glass Door');
      console.log('\n3. TUER/FENSTER ERSETZEN WAND KORREKT?');
      console.log(`   Tür-Treffer: ${doorHit ? 'JA' : 'NEIN'} — ${doorHit ? `Glass Door ${doorHit.attenuationDb}dB statt Light Wall 6dB ✓` : '✗'}`);
      console.log(`   Dedup-Logik: niedrigere Dämpfung gewinnt ✓`);

      // 4. Heatmap-Signalstärken plausibel?
      console.log('\n4. SIGNALSTÄRKEN PLAUSIBEL?');
      const results = [
        { label: 'P1 (8,3) Raumübergang', eff: p1.effectiveRssi, best: p1.bestApId },
        { label: 'P2 (2,9) hinter Wänden', eff: p2.effectiveRssi, best: p2.bestApId },
        { label: 'P3 (1,8) back sector', eff: p3back.effectiveRssi, best: p3back.bestApId },
        { label: 'P3b(6,8) front sector', eff: p3front.effectiveRssi, best: p3front.bestApId },
        { label: 'P5 (12,8) Wandlücke', eff: p5.effectiveRssi, best: p5.bestApId },
        { label: 'P6 (3.5,3) Nahfeld', eff: p6.effectiveRssi, best: p6.bestApId },
      ];
      for (const r of results) {
        const quality = r.eff >= -50 ? 'excellent' : r.eff >= -65 ? 'good' : r.eff >= -75 ? 'fair' : r.eff >= -85 ? 'poor' : 'none';
        console.log(`   ${r.label}: ${r.eff} dBm [${quality}] best=${r.best}`);
      }

      // 5. Uplink-Begrenzung
      console.log('\n5. UPLINK ALS BEGRENZENDER FAKTOR?');
      for (const r of [p1, p2, p3back, p3front, p5, p6]) {
        const best = r.perAp[0]!;
        const limiter = best.effectiveRssi === best.downlinkRssi ? 'DL' : 'UL';
        console.log(`   (${r.pointX},${r.pointY}): DL=${best.downlinkRssi} UL=${best.uplinkRssi} → Limiter=${limiter}`);
      }

      console.log('\n' + '═'.repeat(70));
      console.log('ENDE REPORT');
      console.log('═'.repeat(70));
    });
  });
});
