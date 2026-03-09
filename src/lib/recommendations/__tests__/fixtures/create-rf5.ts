/**
 * RF5: User Live v2 — office/co-working space with uplink limitation.
 *
 * Layout: 30m × 20m open-plan office with meeting rooms
 *
 *   ┌──────────┬──────────┬──────────┬──────────┐
 *   │ Meeting1 │ Open     │ Open     │ Meeting2 │  y=0..10
 *   │ (3,5)    │ (10,5)   │ (20,5)   │ (27,5)   │
 *   │ AP-mtg1  │ AP-open1 │ AP-open2 │ AP-mtg2  │
 *   ├──────────┤          │          ├──────────┤  y=10
 *   │ Kitchen  │          │          │ Server   │  y=10..20
 *   │          │  (10,15) │ (20,15)  │          │
 *   │          │  AP-lo1  │ AP-lo2   │          │
 *   └──────────┴──────────┴──────────┴──────────┘
 *
 * - 6 APs:
 *   ap-mtg1   (3,5   ch36 TX20) — Meeting 1
 *   ap-open1  (10,5  ch44 TX22) — Open Space left
 *   ap-open2  (20,5  ch36 TX22) — Open Space right (ch36 conflict with mtg1)
 *   ap-mtg2   (27,5  ch48 TX20) — Meeting 2
 *   ap-lo1    (10,15 ch52 TX16) — Lounge left (low TX)
 *   ap-lo2    (20,15 ch44 TX16) — Lounge right (ch44 conflict with open1, low TX)
 *
 * - 6 Walls:
 *   - Meeting1 rechts  (x=7,  y=0..10, 8dB glass+frame)
 *   - Meeting2 links   (x=23, y=0..10, 8dB glass+frame)
 *   - Kitchen rechts   (x=7,  y=10..20, 6dB brick)
 *   - Server links     (x=23, y=10..20, 10dB concrete)
 *   - Quergang oben    (y=10, x=0..7,  4dB wood)
 *   - Quergang unten   (y=10, x=23..30, 4dB wood)
 *
 * - 2 PriorityZones:
 *   - Open Space (8,1,14,8, mustHaveCoverage, weight 1.0)
 *   - Meeting 1  (1,1,5,8, weight 0.9)
 *
 * - candidatePolicy: 'required_for_new_ap'
 * - 2 CandidateLocations: Lounge Mitte (15,15) + Kitchen Decke (3,15)
 *
 * Special: ~35% of cells have uplinkLimited=1 (edges + behind walls)
 * This triggers uplink-suppress logic for add_ap/move_ap recommendations.
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

// ─── RF5: User Live v2 ──────────────────────────────────────────

export function createRf5UserLiveV2() {
  const W = 30, H = 20;

  const aps = [
    ap('ap-mtg1', 3, 5, { txPowerDbm: 20 }),
    ap('ap-open1', 10, 5, { txPowerDbm: 22 }),
    ap('ap-open2', 20, 5, { txPowerDbm: 22 }),
    ap('ap-mtg2', 27, 5, { txPowerDbm: 20 }),
    ap('ap-lo1', 10, 15, { txPowerDbm: 16 }),
    ap('ap-lo2', 20, 15, { txPowerDbm: 16 }),
  ];
  const apResps = [
    apResp('ap-mtg1', 3, 5, 36, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-open1', 10, 5, 44, { tx_power_5ghz_dbm: 22 }),
    apResp('ap-open2', 20, 5, 36, { tx_power_5ghz_dbm: 22 }),   // ch36 conflict with mtg1
    apResp('ap-mtg2', 27, 5, 48, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-lo1', 10, 15, 52, { tx_power_5ghz_dbm: 16 }),    // low TX
    apResp('ap-lo2', 20, 15, 44, { tx_power_5ghz_dbm: 16 }),    // ch44 conflict with open1, low TX
  ];

  // 6 walls
  const walls: WallData[] = [
    { segments: [{ x1: 7, y1: 0, x2: 7, y2: 10 }], attenuationDb: 8, baseThicknessCm: 12, actualThicknessCm: 12, materialLabel: 'Glass+Frame' },
    { segments: [{ x1: 23, y1: 0, x2: 23, y2: 10 }], attenuationDb: 8, baseThicknessCm: 12, actualThicknessCm: 12, materialLabel: 'Glass+Frame' },
    { segments: [{ x1: 7, y1: 10, x2: 7, y2: 20 }], attenuationDb: 6, baseThicknessCm: 12, actualThicknessCm: 12, materialLabel: 'Brick' },
    { segments: [{ x1: 23, y1: 10, x2: 23, y2: 20 }], attenuationDb: 10, baseThicknessCm: 20, actualThicknessCm: 20, materialLabel: 'Concrete' },
    { segments: [{ x1: 0, y1: 10, x2: 7, y2: 10 }], attenuationDb: 4, baseThicknessCm: 8, actualThicknessCm: 8, materialLabel: 'Wood' },
    { segments: [{ x1: 23, y1: 10, x2: 30, y2: 10 }], attenuationDb: 4, baseThicknessCm: 8, actualThicknessCm: 8, materialLabel: 'Wood' },
  ];

  const wallDefs: WallDef[] = [
    { x1: 7, y1: 0, x2: 7, y2: 10, att: 8 },
    { x1: 23, y1: 0, x2: 23, y2: 10, att: 8 },
    { x1: 7, y1: 10, x2: 7, y2: 20, att: 6 },
    { x1: 23, y1: 10, x2: 23, y2: 20, att: 10 },
    { x1: 0, y1: 10, x2: 7, y2: 10, att: 4 },
    { x1: 23, y1: 10, x2: 30, y2: 10, att: 4 },
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
    { x: 3, y: 5 }, { x: 10, y: 5 }, { x: 20, y: 5 },
    { x: 27, y: 5 }, { x: 10, y: 15 }, { x: 20, y: 15 },
  ];
  const apTx = [20, 22, 22, 20, 16, 16];
  const numAps = 6;

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

      // Uplink limitation: cells at edges (behind walls) + far corners
      // ~35% of cells marked as uplink-limited
      const isEdge = c < 3 || c >= W - 3 || r < 2 || r >= H - 2;
      const isBehindWall = (c < 7 && r >= 10) || (c >= 23 && r >= 10);
      uplinkLimitedGrid[idx] = (isEdge || isBehindWall) ? 1 : 0;
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
    apIds: ['ap-mtg1', 'ap-open1', 'ap-open2', 'ap-mtg2', 'ap-lo1', 'ap-lo2'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  // PriorityZones
  const priorityZones: PriorityZone[] = [
    { zoneId: 'pz-open', label: 'Open Space', x: 8, y: 1, width: 14, height: 8, weight: 1.0, targetBand: 'either', mustHaveCoverage: true },
    { zoneId: 'pz-mtg1', label: 'Meeting 1', x: 1, y: 1, width: 5, height: 8, weight: 0.9, targetBand: 'either', mustHaveCoverage: false },
  ];

  // CandidateLocations
  const candidates: CandidateLocation[] = [
    {
      id: 'cand-lounge-mitte', x: 15, y: 15, label: 'Lounge Mitte (Decke)',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
    {
      id: 'cand-kitchen', x: 3, y: 15, label: 'Kitchen Decke',
      mountingOptions: ['ceiling'], hasLan: false, hasPoe: false, hasPower: true,
      preferred: false, forbidden: false,
    },
  ];

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    priorityZones,
    candidates,
    candidatePolicy: 'required_for_new_ap',
  };

  return { aps, apResps, walls, bounds, stats, ctx };
}
