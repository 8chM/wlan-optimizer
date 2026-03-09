/**
 * RF4: User Live — realistic large apartment / small office fixture.
 *
 * Layout: 22m × 16m — 5 rooms, open floorplan in center
 *
 *   ┌──────────┬──────────────┬──────────┐
 *   │ Arbeit   │  Wohn/Ess    │ Schlaf   │  y=0..8
 *   │ (3,4)    │  (11,4)      │ (19,4)   │
 *   │ AP-arb   │  AP-wohn     │ AP-schl  │
 *   ├──────────┤              ├──────────┤  y=8
 *   │ Bad      │  Flur        │ Kind     │  y=8..16
 *   │          │  (11,12)     │ (19,12)  │
 *   │          │  AP-flur     │ AP-kind  │
 *   └──────────┴──────────────┴──────────┘
 *
 * - 5 APs:
 *   ap-arbeit  (3,4   ch36 TX20) — Arbeitszimmer
 *   ap-wohn    (11,4  ch44 TX22) — Wohn/Esszimmer (high TX)
 *   ap-schlaf  (19,4  ch36 TX18) — Schlafzimmer (ch36 conflict with ap-arbeit)
 *   ap-flur    (11,12 ch48 TX15) — Flur (low TX → gap in Bad corner)
 *   ap-kind    (19,12 ch44 TX19) — Kinderzimmer (ch44 conflict with ap-wohn)
 *
 * - 5 Walls:
 *   - Innenwand links   (x=7,  y=0..8,   6dB brick)
 *   - Innenwand rechts  (x=15, y=0..16,  5dB drywall)
 *   - Quergang oben     (y=8,  x=0..7,   4dB wood)
 *   - Quergang unten    (y=8,  x=15..22, 5dB drywall)
 *   - Aussenwand nord   (y=0,  x=0..22,  12dB concrete)
 *
 * - 2 PriorityZones:
 *   - Arbeitszimmer (1,1,5,6, mustHaveCoverage, weight 1.0)
 *   - Kinderzimmer  (16,9,5,6, weight 0.8)
 *
 * - candidatePolicy: 'optional' — tests fallback add_ap path
 * - 1 CandidateLocation: Flur-Sued (11,14) — limited supply
 *
 * Interesting properties:
 * - 2 channel conflicts (ch36 pair + ch44 pair) → tests multi-conflict resolution
 * - 5 APs → channel pool tighter → tests bounded channel recs
 * - Optional policy → tests fallback evidence (usedFallback, candidateCount)
 * - Low TX on ap-flur → coverage gap → may trigger add_ap or TX boost
 * - High TX on ap-wohn → overlap → may trigger TX reduction
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

// ─── RF4: User Live ─────────────────────────────────────────────

export function createRf4UserLive() {
  const W = 22, H = 16;

  const aps = [
    ap('ap-arbeit', 3, 4, { txPowerDbm: 20 }),
    ap('ap-wohn', 11, 4, { txPowerDbm: 22 }),
    ap('ap-schlaf', 19, 4, { txPowerDbm: 18 }),
    ap('ap-flur', 11, 12, { txPowerDbm: 15 }),
    ap('ap-kind', 19, 12, { txPowerDbm: 19 }),
  ];
  const apResps = [
    apResp('ap-arbeit', 3, 4, 36, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-wohn', 11, 4, 44, { tx_power_5ghz_dbm: 22 }),
    apResp('ap-schlaf', 19, 4, 36, { tx_power_5ghz_dbm: 18 }),   // ch36 conflict with ap-arbeit
    apResp('ap-flur', 11, 12, 48, { tx_power_5ghz_dbm: 15 }),    // low TX
    apResp('ap-kind', 19, 12, 44, { tx_power_5ghz_dbm: 19 }),    // ch44 conflict with ap-wohn
  ];

  // 5 walls
  const walls: WallData[] = [
    { segments: [{ x1: 7, y1: 0, x2: 7, y2: 8 }], attenuationDb: 6, baseThicknessCm: 12, actualThicknessCm: 12, materialLabel: 'Brick' },
    { segments: [{ x1: 15, y1: 0, x2: 15, y2: 16 }], attenuationDb: 5, baseThicknessCm: 10, actualThicknessCm: 10, materialLabel: 'Drywall' },
    { segments: [{ x1: 0, y1: 8, x2: 7, y2: 8 }], attenuationDb: 4, baseThicknessCm: 8, actualThicknessCm: 8, materialLabel: 'Wood' },
    { segments: [{ x1: 15, y1: 8, x2: 22, y2: 8 }], attenuationDb: 5, baseThicknessCm: 10, actualThicknessCm: 10, materialLabel: 'Drywall' },
    { segments: [{ x1: 0, y1: 0, x2: 22, y2: 0 }], attenuationDb: 12, baseThicknessCm: 20, actualThicknessCm: 20, materialLabel: 'Concrete (exterior)' },
  ];

  const wallDefs: WallDef[] = [
    { x1: 7, y1: 0, x2: 7, y2: 8, att: 6 },
    { x1: 15, y1: 0, x2: 15, y2: 16, att: 5 },
    { x1: 0, y1: 8, x2: 7, y2: 8, att: 4 },
    { x1: 15, y1: 8, x2: 22, y2: 8, att: 5 },
    { x1: 0, y1: 0, x2: 22, y2: 0, att: 12 },
  ];

  const bounds = { width: W, height: H, originX: 0, originY: 0 };

  const total = W * H;
  const rssiGrid = new Float32Array(total);
  const apIndexGrid = new Uint8Array(total);
  const deltaGrid = new Float32Array(total);
  const overlapCountGrid = new Uint8Array(total);
  const uplinkLimitedGrid = new Uint8Array(total);
  const secondBestApIndexGrid = new Uint8Array(total);

  const apPositions = [
    { x: 3, y: 4 }, { x: 11, y: 4 }, { x: 19, y: 4 },
    { x: 11, y: 12 }, { x: 19, y: 12 },
  ];
  const apTx = [20, 22, 18, 15, 19];
  const numAps = 5;

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
    apIds: ['ap-arbeit', 'ap-wohn', 'ap-schlaf', 'ap-flur', 'ap-kind'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  // PriorityZones
  const priorityZones: PriorityZone[] = [
    { zoneId: 'pz-arbeit', label: 'Arbeitszimmer', x: 1, y: 1, width: 5, height: 6, weight: 1.0, targetBand: 'either', mustHaveCoverage: true },
    { zoneId: 'pz-kind', label: 'Kinderzimmer', x: 16, y: 9, width: 5, height: 6, weight: 0.8, targetBand: 'either', mustHaveCoverage: false },
  ];

  // CandidateLocations — only 1, to test limited candidate scenarios
  const candidates: CandidateLocation[] = [
    {
      id: 'cand-flur-sued', x: 11, y: 14, label: 'Flur Sued (Decke)',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
  ];

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    priorityZones,
    candidates,
    candidatePolicy: 'optional',  // Tests fallback add_ap path
  };

  return { aps, apResps, walls, bounds, stats, ctx };
}
