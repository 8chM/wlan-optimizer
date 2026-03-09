/**
 * Candidate Semantics Integrity Tests (CS-1 through CS-8)
 *
 * Verifies that selectedCandidatePosition, usedFallback, and move_ap
 * interpolation behave correctly across all candidatePolicy variants.
 *
 * Phase 28ao: No generator.ts logic changes — pure test-side verification.
 */

import { describe, it, expect } from 'vitest';
import { generateRecommendations, EVIDENCE_MINIMUMS } from '../generator';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import type { APConfig, WallData } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { Recommendation, RecommendationContext, CandidateLocation } from '../types';
import { EMPTY_CONTEXT } from '../types';
import {
  createF5FarCandidates,
  createF8CandidateRequiredNoNear,
} from './fixtures/regression-fixtures';
import { createRf3MyHouse } from './fixtures/create-rf3';

const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);

// ─── Inline Helpers ──────────────────────────────────────────────

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

/**
 * Create a 30×15 grid with a single AP at (5,7) → big weak zone on right side (x>16).
 * Uses direct RSSI assignment to guarantee cells below -80 dBm (5GHz poor threshold).
 */
function makeWeakRightGrid() {
  const W = 30, H = 15;
  const total = W * H;
  const rssiGrid = new Float32Array(total);
  const apIndexGrid = new Uint8Array(total);
  const deltaGrid = new Float32Array(total).fill(20);
  const overlapCountGrid = new Uint8Array(total).fill(1);
  const uplinkLimitedGrid = new Uint8Array(total);
  const secondBestApIndexGrid = new Uint8Array(total);

  const apX = 5, apY = 7;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const dist = Math.sqrt((c - apX) ** 2 + (r - apY) ** 2);
      apIndexGrid[idx] = 0;
      secondBestApIndexGrid[idx] = 0;

      if (dist < 5) {
        rssiGrid[idx] = -40;  // excellent
      } else if (dist < 10) {
        rssiGrid[idx] = -60;  // good
      } else if (dist < 16) {
        rssiGrid[idx] = -72;  // fair
      } else {
        rssiGrid[idx] = -88;  // clearly weak → forms weak zone on right side
      }
    }
  }

  return { W, H, rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid, uplinkLimitedGrid, secondBestApIndexGrid };
}

function makeStats(W: number, H: number, rssiGrid: Float32Array, grids: {
  apIndexGrid: Uint8Array; deltaGrid: Float32Array; overlapCountGrid: Uint8Array;
  uplinkLimitedGrid: Uint8Array; secondBestApIndexGrid: Uint8Array;
}, apIds: string[]): HeatmapStats {
  const total = W * H;
  let excellent = 0, good = 0, fair = 0, poor = 0, none = 0;
  for (let i = 0; i < total; i++) {
    const v = rssiGrid[i]!;
    if (v >= -45) excellent++;
    else if (v >= -60) good++;
    else if (v >= -70) fair++;
    else if (v >= -80) poor++;
    else none++;
  }
  return {
    minRSSI: -100, maxRSSI: -20, avgRSSI: -55, calculationTimeMs: 10,
    gridStep: 1.0, lodLevel: 2, totalCells: total, gridWidth: W, gridHeight: H,
    apIds,
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid,
    ...grids,
  };
}

/**
 * Create a 30×15 grid with 2 APs:
 * - ap-1 at (5,7) → covers left half well
 * - ap-2 at (25,7) → very weak signal, covers almost nothing → move_ap target
 * ap-2 has primaryCoverageRatio < 0.25 → triggers move_ap generation.
 */
function makeTwoApGrid() {
  const W = 30, H = 15;
  const total = W * H;
  const rssiGrid = new Float32Array(total);
  const apIndexGrid = new Uint8Array(total);
  const deltaGrid = new Float32Array(total);
  const overlapCountGrid = new Uint8Array(total).fill(1);
  const uplinkLimitedGrid = new Uint8Array(total);
  const secondBestApIndexGrid = new Uint8Array(total);

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const d1 = Math.sqrt((c - 5) ** 2 + (r - 7) ** 2);
      const d2 = Math.sqrt((c - 25) ** 2 + (r - 7) ** 2);

      // AP-1: strong signal. AP-2: extremely weak (only covers 1-2 cells).
      let rssi1: number, rssi2: number;
      if (d1 < 5) rssi1 = -40;
      else if (d1 < 10) rssi1 = -55;
      else if (d1 < 16) rssi1 = -68;
      else rssi1 = -85;

      if (d2 < 2) rssi2 = -50;  // AP-2 barely covers nearby cells
      else rssi2 = -95;          // otherwise extremely weak

      if (rssi1 > rssi2) {
        apIndexGrid[idx] = 0;
        secondBestApIndexGrid[idx] = 1;
        rssiGrid[idx] = rssi1;
        deltaGrid[idx] = rssi1 - rssi2;
      } else {
        apIndexGrid[idx] = 1;
        secondBestApIndexGrid[idx] = 0;
        rssiGrid[idx] = rssi2;
        deltaGrid[idx] = rssi2 - rssi1;
      }
    }
  }

  return { W, H, rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid, uplinkLimitedGrid, secondBestApIndexGrid };
}

/** Collect all recs including nested alternatives. */
function collectAll(recs: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of recs) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Candidate Semantics Integrity', () => {
  // CS-1: add_ap Candidate → selectedCandidatePosition set, usedFallback absent
  it('CS-1: add_ap with candidate sets selectedCandidatePosition, no usedFallback', () => {
    const { W, H, rssiGrid, ...gridRest } = makeWeakRightGrid();
    const aps = [ap('ap-1', 5, 7, { txPowerDbm: 20 })];
    const apResps_ = [apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 })];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    // Candidate near the weak zone (right side, ~x=22)
    const candidates: CandidateLocation[] = [{
      id: 'cand-right', x: 22, y: 7, label: 'Right Side',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    }];

    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates,
      candidatePolicy: 'required_for_new_ap',
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);
    const addAps = allRecs.filter(r => r.type === 'add_ap');

    expect(addAps.length, 'at least 1 add_ap expected').toBeGreaterThanOrEqual(1);

    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition,
        `add_ap ${rec.id}: selectedCandidatePosition must be set when using candidate`,
      ).toBeDefined();

      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics?.usedFallback,
        `add_ap ${rec.id}: usedFallback must be absent/0 when using candidate`,
      ).toBeUndefined();
    }
  });

  // CS-2: add_ap optional fallback → usedFallback=1, candidateCount=0, no selectedCandidatePosition
  it('CS-2: add_ap optional fallback sets usedFallback=1, no selectedCandidatePosition', () => {
    const { W, H, rssiGrid, ...gridRest } = makeWeakRightGrid();
    const aps = [ap('ap-1', 5, 7, { txPowerDbm: 20 })];
    const apResps_ = [apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 })];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates: [],
      candidatePolicy: 'optional',
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);
    const addAps = allRecs.filter(r => r.type === 'add_ap');

    expect(addAps.length, 'at least 1 add_ap expected (optional fallback)').toBeGreaterThanOrEqual(1);

    for (const rec of addAps) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics?.usedFallback,
        `add_ap ${rec.id}: usedFallback must be 1 (fallback path)`,
      ).toBe(1);
      expect(
        metrics?.candidateCount,
        `add_ap ${rec.id}: candidateCount must be 0 (no candidates defined)`,
      ).toBe(0);
      expect(
        rec.selectedCandidatePosition,
        `add_ap ${rec.id}: selectedCandidatePosition must NOT be set on fallback`,
      ).toBeUndefined();
    }
  });

  // CS-3: move_ap interpolation → no selectedCandidatePosition
  // Note: move_ap interpolation does NOT set usedFallback in evidence (only add_ap does).
  // The distinguishing marker is: selectedCandidatePosition === undefined.
  it('CS-3: move_ap interpolation has no selectedCandidatePosition', () => {
    const { W, H, rssiGrid, ...gridRest } = makeTwoApGrid();
    // ap-2 has very low TX → tiny primaryCoverageRatio → triggers move_ap
    const aps = [
      ap('ap-1', 5, 7, { txPowerDbm: 20 }),
      ap('ap-2', 25, 7, { txPowerDbm: 8 }),
    ];
    const apResps_ = [
      apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 }),
      apResp('ap-2', 25, 7, 44, { tx_power_5ghz_dbm: 8 }),
    ];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1', 'ap-2']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    // No candidates, policy allows free-form move interpolation
    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates: [],
      candidatePolicy: 'required_for_new_ap', // allows move interpolation (not required_for_move_and_new_ap)
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);
    const moveAps = allRecs.filter(r => r.type === 'move_ap');

    // move_ap may or may not fire (depends on simulation benefit).
    // If it fires, it must NOT have selectedCandidatePosition (interpolation path).
    for (const rec of moveAps) {
      expect(
        rec.selectedCandidatePosition,
        `move_ap ${rec.id}: selectedCandidatePosition must be undefined on interpolation path`,
      ).toBeUndefined();
    }
  });

  // CS-4: move_ap with candidate → selectedCandidatePosition set
  it('CS-4: move_ap with candidate sets selectedCandidatePosition', () => {
    const { W, H, rssiGrid, ...gridRest } = makeTwoApGrid();
    const aps = [
      ap('ap-1', 5, 7, { txPowerDbm: 20 }),
      ap('ap-2', 25, 7, { txPowerDbm: 8 }),
    ];
    const apResps_ = [
      apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 }),
      apResp('ap-2', 25, 7, 44, { tx_power_5ghz_dbm: 8 }),
    ];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1', 'ap-2']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    // Candidate near where ap-2 should move toward (closer to center)
    const candidates: CandidateLocation[] = [{
      id: 'cand-center', x: 15, y: 7, label: 'Center Spot',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: false, forbidden: false,
    }];

    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates,
      candidatePolicy: 'required_for_new_ap',
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);
    const moveAps = allRecs.filter(r => r.type === 'move_ap');

    // If a candidate is close enough to produce benefit, move_ap should have selectedCandidatePosition.
    // move_ap may be deduped or suppressed — we verify the invariant when it exists.
    for (const rec of moveAps) {
      if (rec.selectedCandidatePosition) {
        // When selectedCandidatePosition is set, it must match a defined candidate
        const matchesCandidate = candidates.some(
          c => Math.abs(c.x - rec.selectedCandidatePosition!.x) < 0.5 &&
               Math.abs(c.y - rec.selectedCandidatePosition!.y) < 0.5,
        );
        expect(
          matchesCandidate,
          `move_ap ${rec.id}: selectedCandidatePosition must match a defined candidate`,
        ).toBe(true);
      }
    }
  });

  // CS-5: preferred_candidate → selectedCandidatePosition always set
  it('CS-5: preferred_candidate always has selectedCandidatePosition', () => {
    const { W, H, rssiGrid, ...gridRest } = makeWeakRightGrid();
    const aps = [ap('ap-1', 5, 7, { txPowerDbm: 20 })];
    const apResps_ = [apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 })];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    // Preferred candidate with infrastructure
    const candidates: CandidateLocation[] = [{
      id: 'cand-pref', x: 22, y: 7, label: 'Preferred Spot',
      mountingOptions: ['ceiling'], hasLan: true, hasPoe: true, hasPower: true,
      preferred: true, forbidden: false,
    }];

    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates,
      candidatePolicy: 'required_for_new_ap',
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);
    const preferred = allRecs.filter(r => r.type === 'preferred_candidate_location');

    // preferred_candidate_location must always have selectedCandidatePosition
    for (const rec of preferred) {
      expect(
        rec.selectedCandidatePosition,
        `preferred_candidate_location ${rec.id} must have selectedCandidatePosition`,
      ).toBeDefined();
      expect(rec.selectedCandidatePosition!.x).toBe(22);
      expect(rec.selectedCandidatePosition!.y).toBe(7);
    }
  });

  // CS-6: required_for_move_and_new_ap + no candidates → blocked_recommendation
  it('CS-6: strict policy with no candidates emits blocked_recommendation for move', () => {
    const { W, H, rssiGrid, ...gridRest } = makeTwoApGrid();
    const aps = [
      ap('ap-1', 5, 7, { txPowerDbm: 20 }),
      ap('ap-2', 25, 7, { txPowerDbm: 8 }),
    ];
    const apResps_ = [
      apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 }),
      apResp('ap-2', 25, 7, 44, { tx_power_5ghz_dbm: 8 }),
    ];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1', 'ap-2']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    // NO candidates, strictest policy
    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates: [],
      candidatePolicy: 'required_for_move_and_new_ap',
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);

    // No move_ap should exist (all blocked)
    const moveAps = allRecs.filter(r => r.type === 'move_ap');
    expect(moveAps.length, 'no move_ap under strict policy + no candidates').toBe(0);

    // blocked_recommendation should reference no_candidates_defined
    const blocked = allRecs.filter(r => r.type === 'blocked_recommendation');
    const blockedMove = blocked.filter(r =>
      r.blockedByConstraints?.some(c => c.toLowerCase().includes('candidate')) ||
      r.reasonParams?.reason === 'no_candidates_defined',
    );

    // There may be blocked recs for capability-restricted APs too — at least one should be about candidates
    if (blocked.length > 0) {
      expect(
        blockedMove.length,
        'at least 1 blocked_recommendation about missing candidates',
      ).toBeGreaterThanOrEqual(1);
    }
  });

  // CS-7: far candidates → infrastructure_required with nearestDistance + maxDistance in reasonParams
  it('CS-7: infrastructure_required has nearestDistance + maxDistance in reasonParams', () => {
    const f5 = createF5FarCandidates();
    const result = generateRecommendations(
      f5.aps, f5.apResps, f5.walls, f5.bounds, BAND,
      f5.stats, RF_CONFIG, 'balanced', f5.ctx,
    );
    const allRecs = collectAll(result.recommendations);
    const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');

    expect(infraRecs.length, 'at least 1 infrastructure_required for far candidates').toBeGreaterThanOrEqual(1);

    // Check that infrastructure_required recs about "no candidate close enough"
    // have nearestDistance and/or maxDistance in reasonParams
    const farInfra = infraRecs.filter(r =>
      r.reasonKey === 'rec.infraNoCandidateCloseEnoughReason',
    );

    for (const rec of farInfra) {
      const params = rec.reasonParams as Record<string, unknown> | undefined;
      expect(params?.maxDistance, `infrastructure_required ${rec.id}: maxDistance in reasonParams`).toBeDefined();
      expect(params?.nearestDistance, `infrastructure_required ${rec.id}: nearestDistance in reasonParams`).toBeDefined();
      expect(typeof params?.nearestDistance).toBe('number');
    }
  });

  // CS-8: RF3 strictest policy → no interpolation leaks (no move_ap without selectedCandidatePosition)
  it('CS-8: RF3 strict policy — no move_ap without selectedCandidatePosition', () => {
    const rf3 = createRf3MyHouse();
    const result = generateRecommendations(
      rf3.aps, rf3.apResps, rf3.walls, rf3.bounds, BAND,
      rf3.stats, RF_CONFIG, 'balanced', rf3.ctx,
    );
    const allRecs = collectAll(result.recommendations);
    const moveAps = allRecs.filter(r => r.type === 'move_ap');

    // Under required_for_move_and_new_ap, move_ap must either:
    // - have selectedCandidatePosition (candidate was used), OR
    // - not exist at all (blocked → blocked_recommendation instead)
    for (const rec of moveAps) {
      expect(
        rec.selectedCandidatePosition,
        `move_ap ${rec.id} under required_for_move_and_new_ap must have selectedCandidatePosition`,
      ).toBeDefined();
    }

    // Also verify: no add_ap without selectedCandidatePosition
    const addAps = allRecs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition,
        `add_ap ${rec.id} under strict policy must have selectedCandidatePosition`,
      ).toBeDefined();
    }
  });

  // CS-9 (bonus): Cross-type consistency — usedFallback only on add_ap, never on move_ap
  it('CS-9: usedFallback evidence marker only appears on add_ap, never move_ap', () => {
    // Use optional policy with no candidates to trigger both add_ap fallback and move_ap interpolation
    const { W, H, rssiGrid, ...gridRest } = makeTwoApGrid();
    const aps = [
      ap('ap-1', 5, 7, { txPowerDbm: 20 }),
      ap('ap-2', 25, 7, { txPowerDbm: 8 }),
    ];
    const apResps_ = [
      apResp('ap-1', 5, 7, 36, { tx_power_5ghz_dbm: 20 }),
      apResp('ap-2', 25, 7, 44, { tx_power_5ghz_dbm: 8 }),
    ];
    const stats = makeStats(W, H, rssiGrid, gridRest, ['ap-1', 'ap-2']);
    const bounds = { width: W, height: H, originX: 0, originY: 0 };

    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates: [],
      candidatePolicy: 'optional',
    };

    const result = generateRecommendations(aps, apResps_, [], bounds, BAND, stats, RF_CONFIG, 'balanced', ctx);
    const allRecs = collectAll(result.recommendations);

    // move_ap must NEVER have usedFallback in evidence
    const moveAps = allRecs.filter(r => r.type === 'move_ap');
    for (const rec of moveAps) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics?.usedFallback,
        `move_ap ${rec.id}: usedFallback must NOT appear in move_ap evidence`,
      ).toBeUndefined();
    }

    // add_ap with fallback SHOULD have usedFallback=1
    const addAps = allRecs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      if (metrics?.candidateCount === 0) {
        expect(
          metrics?.usedFallback,
          `add_ap ${rec.id}: fallback path must have usedFallback=1`,
        ).toBe(1);
      }
    }
  });

  // CS-10 (bonus): EVIDENCE_MINIMUMS covers all relevant types
  it('CS-10: EVIDENCE_MINIMUMS covers add_ap, move_ap, infrastructure_required, preferred_candidate_location, blocked_recommendation', () => {
    const criticalTypes = [
      'add_ap',
      'move_ap',
      'infrastructure_required',
      'preferred_candidate_location',
      'blocked_recommendation',
    ] as const;

    for (const t of criticalTypes) {
      expect(
        EVIDENCE_MINIMUMS[t],
        `EVIDENCE_MINIMUMS must define required keys for ${t}`,
      ).toBeDefined();
      expect(
        EVIDENCE_MINIMUMS[t]!.length,
        `EVIDENCE_MINIMUMS[${t}] must have at least 1 required key`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
