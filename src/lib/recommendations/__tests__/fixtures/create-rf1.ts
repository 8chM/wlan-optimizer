/**
 * RF1: Home-Office Scenario — realistic regression fixture.
 *
 * Layout: 30m × 15m apartment
 * - 3 APs: Wohnzimmer (7,5), Buero (22,8), Flur (15,3)
 * - 2 Walls: Concrete (x=14, 12dB), Drywall (x=20, 5dB)
 * - 1 PriorityZone: Buero (mustHaveCoverage)
 * - candidatePolicy: required_for_new_ap
 * - 1 CandidateLocation: Flur ceiling (15,3)
 */

import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { RecommendationContext, CandidateLocation, PriorityZone } from '../../types';
import { EMPTY_CONTEXT } from '../../types';

// ─── Helpers (same as regression-fixtures.ts) ─────────────────────

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

// ─── RF1: Home-Office ────────────────────────────────────────────

export function createRf1HomeOffice() {
  const W = 30, H = 15;

  // 3 APs on different channels
  const aps = [
    ap('ap-wohnzimmer', 7, 5, { txPowerDbm: 20 }),
    ap('ap-buero', 22, 8, { txPowerDbm: 18 }),
    ap('ap-flur', 15, 3, { txPowerDbm: 17 }),
  ];
  const apResps = [
    apResp('ap-wohnzimmer', 7, 5, 36, { tx_power_5ghz_dbm: 20 }),
    apResp('ap-buero', 22, 8, 44, { tx_power_5ghz_dbm: 18 }),
    apResp('ap-flur', 15, 3, 48, { tx_power_5ghz_dbm: 17 }),
  ];

  // 2 Walls
  const walls: WallData[] = [
    {
      segments: [{ x1: 14, y1: 0, x2: 14, y2: 15 }],
      attenuationDb: 12,
      baseThicknessCm: 20,
      actualThicknessCm: 20,
      materialLabel: 'Concrete',
    },
    {
      segments: [{ x1: 20, y1: 0, x2: 20, y2: 15 }],
      attenuationDb: 5,
      baseThicknessCm: 10,
      actualThicknessCm: 10,
      materialLabel: 'Drywall',
    },
  ];

  const bounds = { width: W, height: H, originX: 0, originY: 0 };

  // Build grids with distance-based RSSI + wall attenuation
  const total = W * H;
  const rssiGrid = new Float32Array(total);
  const apIndexGrid = new Uint8Array(total);
  const deltaGrid = new Float32Array(total);
  const overlapCountGrid = new Uint8Array(total);
  const uplinkLimitedGrid = new Uint8Array(total);
  const secondBestApIndexGrid = new Uint8Array(total);

  const apPositions = [{ x: 7, y: 5 }, { x: 22, y: 8 }, { x: 15, y: 3 }];
  const apTx = [20, 18, 17];

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const signals: number[] = [];

      for (let a = 0; a < 3; a++) {
        const dist = Math.max(1, Math.sqrt((c - apPositions[a]!.x) ** 2 + (r - apPositions[a]!.y) ** 2));
        let rssi = apTx[a]! - 40 - 35 * Math.log10(dist);

        // Wall attenuation: count wall crossings between AP and cell
        const apX = apPositions[a]!.x;
        const wallXs = [14, 20];
        const wallAtts = [12, 5];
        for (let w = 0; w < 2; w++) {
          const wx = wallXs[w]!;
          if ((apX < wx && c >= wx) || (apX >= wx && c < wx)) {
            rssi -= wallAtts[w]!;
          }
        }
        signals.push(rssi);
      }

      // Find best and second-best AP
      let bestIdx = 0, bestRssi = signals[0]!;
      let secondIdx = 1, secondRssi = signals[1]!;
      if (secondRssi > bestRssi) {
        [bestIdx, secondIdx] = [secondIdx, bestIdx];
        [bestRssi, secondRssi] = [secondRssi, bestRssi];
      }
      for (let a = 2; a < 3; a++) {
        if (signals[a]! > bestRssi) {
          secondIdx = bestIdx; secondRssi = bestRssi;
          bestIdx = a; bestRssi = signals[a]!;
        } else if (signals[a]! > secondRssi) {
          secondIdx = a; secondRssi = signals[a]!;
        }
      }

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
    apIds: ['ap-wohnzimmer', 'ap-buero', 'ap-flur'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  // PriorityZone: Buero
  const priorityZones: PriorityZone[] = [{
    zoneId: 'pz-buero', label: 'Buero', x: 20, y: 6, width: 6, height: 5,
    weight: 1.0, targetBand: 'either', mustHaveCoverage: true,
  }];

  // CandidateLocation: Flur ceiling
  const candidates: CandidateLocation[] = [{
    id: 'cand-flur', x: 15, y: 3, label: 'Flur Decke',
    mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
    preferred: false, forbidden: false,
  }];

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    priorityZones,
    candidates,
    candidatePolicy: 'required_for_new_ap',
  };

  return { aps, apResps, walls, bounds, stats, ctx };
}
