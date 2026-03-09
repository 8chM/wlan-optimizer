/**
 * RF3: My House — realistic multi-room regression fixture.
 *
 * Layout: 18m × 12m EG (Erdgeschoss) — typical German single-family house
 *
 *   ┌──────────┬──────────┬──────────┐
 *   │ Buero    │  Flur    │ Kueche   │  y=0..5
 *   │ (3,3)    │  (9,3)   │ (15,3)   │
 *   │          │  AP-flur │          │
 *   ├──────────┤          ├──────────┤  y=5 (horizontal wall, partial)
 *   │ Wohn-    │          │ Ess-     │
 *   │ zimmer   │          │ zimmer   │  y=5..12
 *   │ AP-wohn  │          │          │
 *   │ (3,8)    │          │ (15,9)   │
 *   └──────────┴──────────┴──────────┘
 *
 * - 3 APs: ap-wohn (3,8 ch36 TX20), ap-flur (9,3 ch44 TX17), ap-kueche (15,3 ch36 TX18)
 *   → Channel conflict: ap-wohn & ap-kueche both ch36
 *   → ap-flur low TX → coverage gap in Esszimmer corner
 * - 6 Walls:
 *   - Aussenwand Nord  (y=0, 0..18, 15dB concrete)
 *   - Aussenwand Sued  (y=12, 0..18, 15dB concrete)
 *   - Innenwand Buero  (x=6, y=0..5, 8dB brick)
 *   - Innenwand Kueche (x=12, y=0..5, 5dB drywall)
 *   - Trennwand Sued-L (x=6, y=5..12, 4dB wood)
 *   - Trennwand Sued-R (x=12, y=5..12, 5dB drywall)
 * - 3 PriorityZones:
 *   - Buero (1,1,4,3, mustHaveCoverage, weight 1.0)
 *   - Wohnzimmer (1,6,4,5, weight 0.9)
 *   - Kueche (13,1,4,3, weight 0.6)
 * - candidatePolicy: required_for_move_and_new_ap (strictest)
 * - 2 CandidateLocations: Flur-Mitte (9,6) + Esszimmer-Decke (15,9)
 * - No candidates near far corners → tests blocked_recommendation / infrastructure_required
 */

import type { APConfig, WallData } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { RecommendationContext, CandidateLocation, PriorityZone } from '../../types';
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

// ─── RF3: My House ───────────────────────────────────────────────

export function createRf3MyHouse() {
  const W = 18, H = 12;

  const aps = [
    ap('ap-wohn', 3, 8, { txPowerDbm: 20 }),
    ap('ap-flur', 9, 3, { txPowerDbm: 17 }),
    ap('ap-kueche', 15, 3, { txPowerDbm: 18 }),
  ];
  const apResps = [
    apResp('ap-wohn', 3, 8, 36, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-flur', 9, 3, 44, { tx_power_5ghz_dbm: 17 }),
    apResp('ap-kueche', 15, 3, 36, { tx_power_5ghz_dbm: 18 }),  // ch36 conflict with ap-wohn
  ];

  // 6 walls
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

  const apPositions = [{ x: 3, y: 8 }, { x: 9, y: 3 }, { x: 15, y: 3 }];
  const apTx = [20, 17, 18];
  const numAps = 3;

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
    apIds: ['ap-wohn', 'ap-flur', 'ap-kueche'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  // PriorityZones
  const priorityZones: PriorityZone[] = [
    { zoneId: 'pz-buero', label: 'Buero', x: 1, y: 1, width: 4, height: 3, weight: 1.0, targetBand: 'either', mustHaveCoverage: true },
    { zoneId: 'pz-wohnzimmer', label: 'Wohnzimmer', x: 1, y: 6, width: 4, height: 5, weight: 0.9, targetBand: 'either', mustHaveCoverage: false },
    { zoneId: 'pz-kueche', label: 'Kueche', x: 13, y: 1, width: 4, height: 3, weight: 0.6, targetBand: 'either', mustHaveCoverage: false },
  ];

  // CandidateLocations — deliberately limited to test strict policy
  const candidates: CandidateLocation[] = [
    {
      id: 'cand-flur-mitte', x: 9, y: 6, label: 'Flur Mitte (Decke)',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
    {
      id: 'cand-esszimmer', x: 15, y: 9, label: 'Esszimmer Decke',
      mountingOptions: ['ceiling'], hasLan: false, hasPoe: false, hasPower: true,
      preferred: false, forbidden: false,
    },
  ];

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    priorityZones,
    candidates,
    candidatePolicy: 'required_for_move_and_new_ap',  // Strictest policy
  };

  return { aps, apResps, walls, bounds, stats, ctx };
}
