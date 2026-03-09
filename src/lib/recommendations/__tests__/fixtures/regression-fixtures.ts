/**
 * Real-world regression fixtures for recommendation engine testing.
 *
 * F1: Dense AP cluster — forces channel graph-coloring diversification
 * F2: Roaming vs Coverage — sticky high, gap low
 * F3: Uplink-limited floor — 75% uplink limited
 *
 * All grids are deterministic (no randomness, no timing).
 */

import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { RecommendationContext, CandidateLocation } from '../../types';
import { EMPTY_CONTEXT } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────

function ap(id: string, x: number, y: number, overrides?: Partial<APConfig>): APConfig {
  return {
    id, x, y, txPowerDbm: 20, antennaGainDbi: 4.0, enabled: true,
    mounting: 'ceiling', orientationDeg: 0, heightM: 2.5,
    ...overrides,
  };
}

function apResp(id: string, x: number, y: number, ch5 = 36, overrides?: Partial<AccessPointResponse>): AccessPointResponse {
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

function makeGrids(w: number, h: number) {
  const total = w * h;
  return {
    rssiGrid: new Float32Array(total),
    apIndexGrid: new Uint8Array(total),
    deltaGrid: new Float32Array(total).fill(20),
    overlapCountGrid: new Uint8Array(total).fill(1),
    uplinkLimitedGrid: new Uint8Array(total),
    secondBestApIndexGrid: new Uint8Array(total).fill(1),
  };
}

function makeStats(w: number, h: number, grids: ReturnType<typeof makeGrids>, coverage: { excellent: number; good: number; fair: number; poor: number; none: number }, apIds: string[]): HeatmapStats {
  const total = w * h;
  return {
    minRSSI: -90, maxRSSI: -30, avgRSSI: -55, calculationTimeMs: 10,
    gridStep: 1.0, lodLevel: 2, totalCells: total, gridWidth: w, gridHeight: h,
    apIds,
    coverageBins: {
      excellent: coverage.excellent,
      good: coverage.good,
      fair: coverage.fair,
      poor: coverage.poor,
      none: coverage.none,
    },
    ...grids,
  };
}

// ─── F1: Dense AP Cluster (4 APs, 5GHz, all same channel) ────────

export function createF1DenseCluster() {
  const W = 20, H = 20;
  // 4 APs in a tight cluster at 3m spacing, all on channel 36
  const aps = [
    ap('ap-1', 8, 8),
    ap('ap-2', 11, 8),
    ap('ap-3', 8, 11),
    ap('ap-4', 11, 11),
  ];
  const apResps = [
    apResp('ap-1', 8, 8, 36),
    apResp('ap-2', 11, 8, 36),
    apResp('ap-3', 8, 11, 36),
    apResp('ap-4', 11, 11, 36),
  ];

  const grids = makeGrids(W, H);
  // Each AP covers a quadrant with decent signal; overlap in center
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      // Assign primary AP based on quadrant
      if (c < 10 && r < 10) { grids.apIndexGrid[idx] = 0; grids.secondBestApIndexGrid[idx] = 1; }
      else if (c >= 10 && r < 10) { grids.apIndexGrid[idx] = 1; grids.secondBestApIndexGrid[idx] = 0; }
      else if (c < 10 && r >= 10) { grids.apIndexGrid[idx] = 2; grids.secondBestApIndexGrid[idx] = 3; }
      else { grids.apIndexGrid[idx] = 3; grids.secondBestApIndexGrid[idx] = 2; }
      // Strong signal everywhere (dense cluster = good coverage)
      grids.rssiGrid[idx] = -45;
      grids.overlapCountGrid[idx] = 2;
      // Low delta in overlap zone (center area)
      const distToCenter = Math.sqrt((c - 9.5) ** 2 + (r - 9.5) ** 2);
      grids.deltaGrid[idx] = distToCenter < 5 ? 4 : 15;
    }
  }

  const stats = makeStats(W, H, grids, {
    excellent: 300, good: 80, fair: 15, poor: 5, none: 0,
  }, ['ap-1', 'ap-2', 'ap-3', 'ap-4']);

  return { aps, apResps, walls: [] as WallData[], bounds: { width: W, height: H, originX: 0, originY: 0 }, stats, ctx: EMPTY_CONTEXT };
}

// ─── F2: Roaming vs Coverage (2 APs, high sticky, low gap) ───────

export function createF2RoamingConflict() {
  const W = 30, H = 10;
  // 2 APs with partial overlap; AP-1 dominates most cells → sticky situation
  const aps = [
    ap('ap-1', 8, 5, { txPowerDbm: 23 }),
    ap('ap-2', 22, 5, { txPowerDbm: 17 }),
  ];
  const apResps = [
    apResp('ap-1', 8, 5, 36, { tx_power_5ghz_dbm: 23 }),
    apResp('ap-2', 22, 5, 44, { tx_power_5ghz_dbm: 17 }),
  ];

  const grids = makeGrids(W, H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const distAp1 = Math.sqrt((c - 8) ** 2 + (r - 5) ** 2);
      const distAp2 = Math.sqrt((c - 22) ** 2 + (r - 5) ** 2);

      // AP-1 signal stronger due to higher TX power → dominates more area
      const rssi1 = -40 - distAp1 * 2.5;
      const rssi2 = -46 - distAp2 * 2.5;

      if (rssi1 > rssi2) {
        grids.apIndexGrid[idx] = 0;
        grids.secondBestApIndexGrid[idx] = 1;
        grids.rssiGrid[idx] = rssi1;
        grids.deltaGrid[idx] = rssi1 - rssi2;
      } else {
        grids.apIndexGrid[idx] = 1;
        grids.secondBestApIndexGrid[idx] = 0;
        grids.rssiGrid[idx] = rssi2;
        grids.deltaGrid[idx] = rssi2 - rssi1;
      }
    }
  }

  const stats = makeStats(W, H, grids, {
    excellent: 150, good: 100, fair: 30, poor: 15, none: 5,
  }, ['ap-1', 'ap-2']);

  return { aps, apResps, walls: [] as WallData[], bounds: { width: W, height: H, originX: 0, originY: 0 }, stats, ctx: EMPTY_CONTEXT };
}

// ─── F3: Uplink-Limited Floor (75% uplink limited) ───────────────

export function createF3UplinkLimited() {
  const W = 20, H = 10;
  // 1 AP with moderate coverage; 75% of floor is uplink-limited
  const aps = [ap('ap-1', 5, 5, { txPowerDbm: 20 })];
  const apResps = [apResp('ap-1', 5, 5)];

  const grids = makeGrids(W, H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const dist = Math.sqrt((c - 5) ** 2 + (r - 5) ** 2);
      grids.apIndexGrid[idx] = 0;
      grids.secondBestApIndexGrid[idx] = 0;

      // Signal degrades with distance
      if (dist < 4) {
        grids.rssiGrid[idx] = -45;
      } else if (dist < 8) {
        grids.rssiGrid[idx] = -65;
      } else {
        grids.rssiGrid[idx] = -85; // Weak zone
      }

      // 75% of floor is uplink-limited
      grids.uplinkLimitedGrid[idx] = (c + r * W) % 4 !== 0 ? 1 : 0;
    }
  }

  const stats = makeStats(W, H, grids, {
    excellent: 30, good: 40, fair: 40, poor: 50, none: 40,
  }, ['ap-1']);

  return { aps, apResps, walls: [] as WallData[], bounds: { width: W, height: H, originX: 0, originY: 0 }, stats, ctx: EMPTY_CONTEXT };
}

// ─── F4: No-New-Cable (required policy, no candidates) ───────────

export function createF4NoNewCable() {
  const W = 20, H = 10;
  // 1 AP in corner → large weak zone on opposite side, but NO candidates defined
  // Policy: required_for_new_ap → only infrastructure_required, never add_ap
  const aps = [ap('ap-1', 3, 5, { txPowerDbm: 17 })];
  const apResps = [apResp('ap-1', 3, 5, 36, { tx_power_5ghz_dbm: 17 })];

  const grids = makeGrids(W, H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const dist = Math.sqrt((c - 3) ** 2 + (r - 5) ** 2);
      grids.apIndexGrid[idx] = 0;
      grids.secondBestApIndexGrid[idx] = 0;

      if (dist < 4) {
        grids.rssiGrid[idx] = -45;
      } else if (dist < 8) {
        grids.rssiGrid[idx] = -65;
      } else {
        grids.rssiGrid[idx] = -88; // Clearly weak zone on the right side
      }
    }
  }

  const stats = makeStats(W, H, grids, {
    excellent: 25, good: 35, fair: 40, poor: 55, none: 45,
  }, ['ap-1']);

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    candidates: [],
    candidatePolicy: 'required_for_new_ap',
  };

  return { aps, apResps, walls: [] as WallData[], bounds: { width: W, height: H, originX: 0, originY: 0 }, stats, ctx };
}

// ─── F5: Far Candidates (all candidates > maxDistance) ───────────

export function createF5FarCandidates() {
  const W = 20, H = 10;
  // 1 AP in corner → weak zone on the right side
  // 2 candidates defined, but both are > 8m from the weak zone ideal position
  const aps = [ap('ap-1', 3, 5, { txPowerDbm: 17 })];
  const apResps = [apResp('ap-1', 3, 5, 36, { tx_power_5ghz_dbm: 17 })];

  const grids = makeGrids(W, H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const dist = Math.sqrt((c - 3) ** 2 + (r - 5) ** 2);
      grids.apIndexGrid[idx] = 0;
      grids.secondBestApIndexGrid[idx] = 0;

      if (dist < 4) {
        grids.rssiGrid[idx] = -45;
      } else if (dist < 8) {
        grids.rssiGrid[idx] = -65;
      } else {
        grids.rssiGrid[idx] = -88;
      }
    }
  }

  const stats = makeStats(W, H, grids, {
    excellent: 25, good: 35, fair: 40, poor: 55, none: 45,
  }, ['ap-1']);

  // Candidates at (1,1) and (2,9) — both far from weak zone (right side, around x=15)
  const candidates: CandidateLocation[] = [
    {
      id: 'cand-1', x: 1, y: 1, label: 'Near-AP Spot',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
    {
      id: 'cand-2', x: 2, y: 9, label: 'Corner Spot',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    },
  ];

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    candidates,
    candidatePolicy: 'required_for_new_ap',
  };

  return { aps, apResps, walls: [] as WallData[], bounds: { width: W, height: H, originX: 0, originY: 0 }, stats, ctx };
}

// ─── F3b: Uplink-Limited with mustHaveCoverage PZ ────────────────

export function createF3UplinkWithMustHavePZ() {
  const base = createF3UplinkLimited();
  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    candidatePolicy: 'optional',
    priorityZones: [{
      zoneId: 'pz-1', label: 'Must-Cover Zone', x: 14, y: 3, width: 5, height: 4,
      weight: 1.0, targetBand: 'either', mustHaveCoverage: true,
    }],
  };
  return { ...base, ctx };
}
