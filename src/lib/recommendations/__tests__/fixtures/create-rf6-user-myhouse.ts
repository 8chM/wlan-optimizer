/**
 * RF6: User My House — enhanced regression fixture for "dein Haus" golden gate.
 *
 * Based on RF3 layout (18×12m EG) but with 4 APs, different channels,
 * `required_for_new_ap` policy, 3 candidates, and a constraint zone.
 *
 * Layout: 18m × 12m EG — German single-family house (Erdgeschoss)
 *
 *   ┌──────────┬──────────┬──────────┐
 *   │ Buero    │  Flur    │ Kueche   │  y=0..5
 *   │ (3,3)    │  (9,3)   │ (15,3)   │
 *   │          │  AP-flur │ AP-kue   │
 *   ├──────────┤          ├──────────┤  y=5 (partial wall)
 *   │ Wohn-    │          │ Ess-     │
 *   │ zimmer   │          │ zimmer   │  y=5..12
 *   │ AP-wohn  │          │ AP-ess   │
 *   │ (3,8)    │          │ (15,9)   │
 *   └──────────┴──────────┴──────────┘
 *
 * - 4 APs:
 *   - ap-wohn  (3,8 ch36 TX20) — Wohnzimmer, strong
 *   - ap-flur  (9,3 ch44 TX17) — Flur, moderate TX → gap potential
 *   - ap-kueche(15,3 ch36 TX18)— Kueche, ch36 conflict with ap-wohn
 *   - ap-ess   (15,9 ch48 TX15)— Esszimmer, weak TX → coverage concern
 *   → Channel conflict: ap-wohn & ap-kueche both ch36
 *   → ap-ess low TX → needs boost or is candidate for disable
 *
 * - 6 Walls (same as RF3):
 *   - Aussenwand Nord/Sued (15dB concrete)
 *   - Innenwand Buero (8dB brick), Kueche (5dB drywall)
 *   - Trennwand Sued-L (4dB wood), Sued-R (5dB drywall)
 *
 * - 3 PriorityZones:
 *   - Buero (mustHaveCoverage, weight 1.0)
 *   - Wohnzimmer (weight 0.9)
 *   - Kueche (weight 0.7)
 *
 * - candidatePolicy: required_for_new_ap
 * - 3 CandidateLocations: Flur-Mitte (9,6), Buero-Ecke (2,1), Esszimmer-Mitte (14,8)
 * - constraintZones: 1 forbidden zone in Flur doorway area
 */

import type { APConfig, WallData } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { RecommendationContext, CandidateLocation, PriorityZone, ConstraintZone } from '../../types';
import { EMPTY_CONTEXT } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────

function ap(id: string, x: number, y: number, overrides?: Partial<APConfig>): APConfig {
  return {
    id, x, y, txPowerDbm: 20, antennaGainDbi: 4.0, enabled: true,
    mounting: 'ceiling', orientationDeg: 0, heightM: 2.5,
    ...overrides,
  };
}

function apResp(id: string, x: number, y: number, ch5: number, overrides?: Partial<AccessPointResponse>): AccessPointResponse {
  return {
    id, floor_id: 'floor-1', ap_model_id: 'dap-x2810', x, y,
    label: id, enabled: true, mounting: 'ceiling', orientation_deg: 0, height_m: 2.5,
    tx_power_5ghz_dbm: 20, tx_power_24ghz_dbm: 17, tx_power_6ghz_dbm: null,
    channel_5ghz: ch5, channel_24ghz: 1, channel_6ghz: null,
    channel_width: '80', band_steering_enabled: false,
    ip_address: null, ssid: null, created_at: '', updated_at: '',
    ap_model: {
      id: 'dap-x2810', name: 'DAP-X2810', manufacturer: 'D-Link',
      antenna_gain_24ghz_dbi: 3.2, antenna_gain_5ghz_dbi: 4.3, antenna_gain_6ghz_dbi: 4.3,
    },
    ...overrides,
  } as unknown as AccessPointResponse;
}

// ─── Wall crossing ───────────────────────────────────────────────

interface WallDef {
  x1: number; y1: number; x2: number; y2: number;
  att: number;
}

function crossesWall(ax: number, ay: number, bx: number, by: number, w: WallDef): boolean {
  if (w.x1 === w.x2) {
    const wx = w.x1;
    if ((ax < wx && bx >= wx) || (ax >= wx && bx < wx)) {
      const t = (wx - ax) / (bx - ax);
      const yInt = ay + t * (by - ay);
      return yInt >= Math.min(w.y1, w.y2) && yInt <= Math.max(w.y1, w.y2);
    }
  } else if (w.y1 === w.y2) {
    const wy = w.y1;
    if ((ay < wy && by >= wy) || (ay >= wy && by < wy)) {
      const t = (wy - ay) / (by - ay);
      const xInt = ax + t * (bx - ax);
      return xInt >= Math.min(w.x1, w.x2) && xInt <= Math.max(w.x1, w.x2);
    }
  }
  return false;
}

// ─── RF6: User My House ──────────────────────────────────────────

export function createRf6UserMyhouse() {
  const W = 18, H = 12;

  const aps = [
    ap('ap-wohn', 3, 8, { txPowerDbm: 20 }),
    ap('ap-flur', 9, 3, { txPowerDbm: 17 }),
    ap('ap-kueche', 15, 3, { txPowerDbm: 18 }),
    ap('ap-ess', 15, 9, { txPowerDbm: 15 }),   // 4th AP: weak, in Esszimmer
  ];
  const apResps = [
    apResp('ap-wohn', 3, 8, 36, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-flur', 9, 3, 44, { tx_power_5ghz_dbm: 17 }),
    apResp('ap-kueche', 15, 3, 36, { tx_power_5ghz_dbm: 18 }),   // ch36 conflict with ap-wohn
    apResp('ap-ess', 15, 9, 48, { tx_power_5ghz_dbm: 15 }),      // ch48, weak TX
  ];

  // 6 walls (same as RF3)
  const walls: WallData[] = [
    { segments: [{ x1: 0, y1: 0, x2: 18, y2: 0 }], attenuationDb: 15, baseThicknessCm: 25, actualThicknessCm: 25, materialLabel: 'Concrete (exterior)' },
    { segments: [{ x1: 0, y1: 12, x2: 18, y2: 12 }], attenuationDb: 15, baseThicknessCm: 25, actualThicknessCm: 25, materialLabel: 'Concrete (exterior)' },
    { segments: [{ x1: 6, y1: 0, x2: 6, y2: 5 }], attenuationDb: 8, baseThicknessCm: 15, actualThicknessCm: 15, materialLabel: 'Brick' },
    { segments: [{ x1: 12, y1: 0, x2: 12, y2: 5 }], attenuationDb: 5, baseThicknessCm: 10, actualThicknessCm: 10, materialLabel: 'Drywall' },
    { segments: [{ x1: 6, y1: 5, x2: 6, y2: 12 }], attenuationDb: 4, baseThicknessCm: 8, actualThicknessCm: 8, materialLabel: 'Wood' },
    { segments: [{ x1: 12, y1: 5, x2: 12, y2: 12 }], attenuationDb: 5, baseThicknessCm: 10, actualThicknessCm: 10, materialLabel: 'Drywall' },
  ];

  const wallDefs: WallDef[] = [
    { x1: 0, y1: 0, x2: 18, y2: 0, att: 15 },
    { x1: 0, y1: 12, x2: 18, y2: 12, att: 15 },
    { x1: 6, y1: 0, x2: 6, y2: 5, att: 8 },
    { x1: 12, y1: 0, x2: 12, y2: 5, att: 5 },
    { x1: 6, y1: 5, x2: 6, y2: 12, att: 4 },
    { x1: 12, y1: 5, x2: 12, y2: 12, att: 5 },
  ];

  const bounds = { width: W, height: H, originX: 0, originY: 0 };

  const total = W * H;
  const rssiGrid = new Float32Array(total);
  const apIndexGrid = new Uint8Array(total);
  const deltaGrid = new Float32Array(total);
  const overlapCountGrid = new Uint8Array(total);
  const uplinkLimitedGrid = new Uint8Array(total);
  const secondBestApIndexGrid = new Uint8Array(total);

  const apPositions = [{ x: 3, y: 8 }, { x: 9, y: 3 }, { x: 15, y: 3 }, { x: 15, y: 9 }];
  const apTx = [20, 17, 18, 15];
  const numAps = 4;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const signals: number[] = [];

      for (let a = 0; a < numAps; a++) {
        const dist = Math.max(1, Math.sqrt((c - apPositions[a]!.x) ** 2 + (r - apPositions[a]!.y) ** 2));
        let rssi = apTx[a]! - 40 - 35 * Math.log10(dist);

        for (const wd of wallDefs) {
          if (crossesWall(apPositions[a]!.x, apPositions[a]!.y, c, r, wd)) {
            rssi -= wd.att;
          }
        }
        signals.push(rssi);
      }

      // Find best and second-best
      let bestIdx = 0, bestRssi = signals[0]!;
      let secondIdx = -1, secondRssi = -Infinity;

      for (let a = 1; a < numAps; a++) {
        if (signals[a]! > bestRssi) {
          secondIdx = bestIdx; secondRssi = bestRssi;
          bestIdx = a; bestRssi = signals[a]!;
        } else if (signals[a]! > secondRssi) {
          secondIdx = a; secondRssi = signals[a]!;
        }
      }
      if (secondIdx < 0) secondIdx = bestIdx === 0 ? 1 : 0;

      rssiGrid[idx] = bestRssi;
      apIndexGrid[idx] = bestIdx;
      secondBestApIndexGrid[idx] = secondIdx;
      deltaGrid[idx] = bestRssi - secondRssi;
      overlapCountGrid[idx] = (bestRssi - secondRssi) < 6 ? 2 : 1;
      uplinkLimitedGrid[idx] = 0;
    }
  }

  // Coverage bins
  let excellent = 0, good = 0, fair = 0, poor = 0, none = 0;
  for (let i = 0; i < total; i++) {
    const v = rssiGrid[i]!;
    if (v >= -50) excellent++;
    else if (v >= -60) good++;
    else if (v >= -70) fair++;
    else if (v >= -80) poor++;
    else none++;
  }

  const stats: HeatmapStats = {
    minRSSI: -90, maxRSSI: -30, avgRSSI: -55, calculationTimeMs: 10,
    gridStep: 1.0, lodLevel: 2, totalCells: total, gridWidth: W, gridHeight: H,
    apIds: ['ap-wohn', 'ap-flur', 'ap-kueche', 'ap-ess'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  // PriorityZones
  const priorityZones: PriorityZone[] = [
    { zoneId: 'pz-buero', label: 'Buero', x: 1, y: 1, width: 4, height: 3, weight: 1.0, targetBand: 'either', mustHaveCoverage: true },
    { zoneId: 'pz-wohnzimmer', label: 'Wohnzimmer', x: 1, y: 6, width: 4, height: 5, weight: 0.9, targetBand: 'either', mustHaveCoverage: false },
    { zoneId: 'pz-kueche', label: 'Kueche', x: 13, y: 1, width: 4, height: 3, weight: 0.7, targetBand: 'either', mustHaveCoverage: false },
  ];

  // CandidateLocations — 3 candidates
  const candidates: CandidateLocation[] = [
    {
      id: 'cand-flur-mitte', x: 9, y: 6, label: 'Flur Mitte (Decke)',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
    {
      id: 'cand-buero-ecke', x: 2, y: 1, label: 'Buero Ecke (Wand)',
      mountingOptions: ['wall'], hasLan: false, hasPoe: false, hasPower: true,
      preferred: false, forbidden: false,
    },
    {
      id: 'cand-esszimmer', x: 14, y: 8, label: 'Esszimmer Mitte (Decke)',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: false, hasPower: true,
      preferred: false, forbidden: false,
    },
  ];

  // ConstraintZone — forbidden area in Flur doorway
  const constraintZones: ConstraintZone[] = [
    {
      id: 'cz-flur-tuer', type: 'no_new_ap',
      x: 8, y: 0, width: 2, height: 2,
      weight: 1.0, notes: 'Flur Eingang',
    },
  ];

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    priorityZones,
    candidates,
    candidatePolicy: 'required_for_new_ap',
    constraintZones,
  };

  return { aps, apResps, walls, bounds, stats, ctx };
}
