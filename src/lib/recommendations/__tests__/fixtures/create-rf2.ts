/**
 * RF2: User House Scenario — realistic regression fixture.
 *
 * Layout: 25m × 20m single-floor house
 * - 4 APs: Wohnzimmer (6,10), Kueche (18,4), Schlafzimmer (22,16), Keller-AP (4,3 low TX)
 * - 3 Walls:
 *   - Tragende Wand (y=8, x=0..25, 10dB concrete)
 *   - Innenwand (x=12, y=0..8, 5dB drywall)
 *   - Innenwand (x=16, y=8..20, 4dB wood)
 * - 2 PriorityZones:
 *   - Home-Office (20,14,4,5, mustHaveCoverage)
 *   - Wohnzimmer-Media (3,8,8,6, weight=0.8)
 * - candidatePolicy: required_for_new_ap
 * - 2 CandidateLocations: Flur (12,12) + Gaestezimmer (20,3)
 * - Channel conflicts: ap-wohnzimmer & ap-keller both on ch36
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
    id, floor_id: 'floor-1', ap_model_id: 'test', x, y,
    label: id, enabled: true, mounting: 'ceiling', orientation_deg: 0, height_m: 2.5,
    tx_power_5ghz_dbm: 20, tx_power_24ghz_dbm: 17, tx_power_6ghz_dbm: null,
    channel_5ghz: ch5, channel_24ghz: 1, channel_6ghz: null,
    channel_width: '80', band_steering_enabled: false,
    ip_address: null, ssid: null, created_at: '', updated_at: '',
    ap_model: {
      id: 'test', name: 'Test AP', manufacturer: 'Test',
      antenna_gain_24ghz_dbi: 3.2, antenna_gain_5ghz_dbi: 4.3, antenna_gain_6ghz_dbi: 4.3,
    },
    ...overrides,
  } as unknown as AccessPointResponse;
}

// ─── Wall crossing helper ────────────────────────────────────────

interface WallDef {
  x1: number; y1: number; x2: number; y2: number;
  att: number;
}

/** Check if line from (ax,ay) to (bx,by) crosses a wall segment. */
function crossesWall(ax: number, ay: number, bx: number, by: number, w: WallDef): boolean {
  if (w.x1 === w.x2) {
    // Vertical wall
    const wx = w.x1;
    if ((ax < wx && bx >= wx) || (ax >= wx && bx < wx)) {
      // Check y range
      const t = (wx - ax) / (bx - ax);
      const yIntersect = ay + t * (by - ay);
      return yIntersect >= Math.min(w.y1, w.y2) && yIntersect <= Math.max(w.y1, w.y2);
    }
  } else if (w.y1 === w.y2) {
    // Horizontal wall
    const wy = w.y1;
    if ((ay < wy && by >= wy) || (ay >= wy && by < wy)) {
      const t = (wy - ay) / (by - ay);
      const xIntersect = ax + t * (bx - ax);
      return xIntersect >= Math.min(w.x1, w.x2) && xIntersect <= Math.max(w.x1, w.x2);
    }
  }
  return false;
}

// ─── RF2: User House ─────────────────────────────────────────────

export function createRf2UserHouse() {
  const W = 25, H = 20;

  // 4 APs — note channel conflict: ap-wohnzimmer & ap-keller both on ch36
  const aps = [
    ap('ap-wohnzimmer', 6, 10, { txPowerDbm: 20 }),
    ap('ap-kueche', 18, 4, { txPowerDbm: 19 }),
    ap('ap-schlafzimmer', 22, 16, { txPowerDbm: 17 }),
    ap('ap-keller', 4, 3, { txPowerDbm: 14 }),  // Low TX, weak
  ];
  const apResps = [
    apResp('ap-wohnzimmer', 6, 10, 36, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-kueche', 18, 4, 44, { tx_power_5ghz_dbm: 19 }),
    apResp('ap-schlafzimmer', 22, 16, 48, { tx_power_5ghz_dbm: 17 }),
    apResp('ap-keller', 4, 3, 36, { tx_power_5ghz_dbm: 14 }),  // Same ch as wohnzimmer!
  ];

  // 3 Walls
  const walls: WallData[] = [
    {
      segments: [{ x1: 0, y1: 8, x2: 25, y2: 8 }],
      attenuationDb: 10,
      baseThicknessCm: 20,
      actualThicknessCm: 20,
      materialLabel: 'Concrete',
    },
    {
      segments: [{ x1: 12, y1: 0, x2: 12, y2: 8 }],
      attenuationDb: 5,
      baseThicknessCm: 10,
      actualThicknessCm: 10,
      materialLabel: 'Drywall',
    },
    {
      segments: [{ x1: 16, y1: 8, x2: 16, y2: 20 }],
      attenuationDb: 4,
      baseThicknessCm: 8,
      actualThicknessCm: 8,
      materialLabel: 'Wood',
    },
  ];

  const wallDefs: WallDef[] = [
    { x1: 0, y1: 8, x2: 25, y2: 8, att: 10 },
    { x1: 12, y1: 0, x2: 12, y2: 8, att: 5 },
    { x1: 16, y1: 8, x2: 16, y2: 20, att: 4 },
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
    { x: 6, y: 10 }, { x: 18, y: 4 }, { x: 22, y: 16 }, { x: 4, y: 3 },
  ];
  const apTx = [20, 19, 17, 14];
  const numAps = 4;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const signals: number[] = [];

      for (let a = 0; a < numAps; a++) {
        const dist = Math.max(1, Math.sqrt((c - apPositions[a]!.x) ** 2 + (r - apPositions[a]!.y) ** 2));
        let rssi = apTx[a]! - 40 - 35 * Math.log10(dist);

        // Wall attenuation
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

  // Count coverage bins
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
    apIds: ['ap-wohnzimmer', 'ap-kueche', 'ap-schlafzimmer', 'ap-keller'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  // PriorityZones
  const priorityZones: PriorityZone[] = [
    {
      zoneId: 'pz-homeoffice', label: 'Home-Office', x: 20, y: 14, width: 4, height: 5,
      weight: 1.0, targetBand: 'either', mustHaveCoverage: true,
    },
    {
      zoneId: 'pz-wohnzimmer', label: 'Wohnzimmer Media', x: 3, y: 8, width: 8, height: 6,
      weight: 0.8, targetBand: 'either', mustHaveCoverage: false,
    },
  ];

  // CandidateLocations
  const candidates: CandidateLocation[] = [
    {
      id: 'cand-flur', x: 12, y: 12, label: 'Flur Decke',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
    {
      id: 'cand-gaeste', x: 20, y: 3, label: 'Gaestezimmer',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: false, hasPower: true,
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
