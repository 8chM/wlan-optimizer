/**
 * Candidate Realism Integrity Tests — Drift-Proof for "No-new-cable / Candidate-only" logic.
 *
 * Prevents accidental re-introduction of phantom position suggestions.
 * Tests run against multiple fixtures with different CandidatePolicy settings.
 *
 * CR-1: required policies → add_ap/preferred_candidate must have selectedCandidatePosition
 * CR-2: required_for_new_ap + empty candidates → no add_ap, no preferred_candidate_location
 * CR-3: required_for_move_and_new_ap → no interpolation-fallback move_ap
 * CR-4: optional policy → fallback add_ap must carry usedFallback=1 + candidateCount=0
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateRecommendations } from '../generator';
import type { Recommendation, RecommendationContext, CandidateLocation } from '../types';
import { EMPTY_CONTEXT } from '../types';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import type { APConfig } from '$lib/heatmap/worker-types';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import {
  createF4NoNewCable,
  createF5FarCandidates,
  createF8CandidateRequiredNoNear,
} from './fixtures/regression-fixtures';
import { createRf2UserHouse } from './fixtures/create-rf2';
import { loadExportedFixture } from './fixtures/load-exported-fixture';
import type { ExportedFixture } from '../fixture-export';

const __testdir = dirname(fileURLToPath(import.meta.url));
const BAND = '5ghz' as const;
const RF = createRFConfig(BAND);

function collectAll(list: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of list) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

function run(fixture: ReturnType<typeof createF4NoNewCable>, ctxOverride?: RecommendationContext) {
  const ctx = ctxOverride ?? fixture.ctx;
  return generateRecommendations(
    fixture.aps, fixture.apResps, fixture.walls, fixture.bounds,
    BAND, fixture.stats, RF, 'balanced', ctx,
  );
}

// ─── CR-1: required policies → selectedCandidatePosition required ────────

describe('CR-1: required policies → add_ap/preferred_candidate must have selectedCandidatePosition', () => {
  const fixtures = [
    { name: 'F4-no-new-cable (required_for_new_ap)', create: createF4NoNewCable },
    { name: 'F5-far-candidates (required_for_new_ap)', create: createF5FarCandidates },
    { name: 'F8-candidate-required-no-near (required_for_move_and_new_ap)', create: createF8CandidateRequiredNoNear },
    { name: 'RF2-user-house (required_for_new_ap)', create: createRf2UserHouse },
  ];

  for (const { name, create } of fixtures) {
    it(`CR-1: ${name} → no phantom add_ap`, () => {
      const f = create();
      const result = run(f);
      const allRecs = collectAll(result.recommendations);

      const addApRecs = allRecs.filter(r => r.type === 'add_ap');
      for (const rec of addApRecs) {
        expect(
          rec.selectedCandidatePosition,
          `add_ap ${rec.id} in ${name} must have selectedCandidatePosition`,
        ).toBeDefined();
      }

      const prefRecs = allRecs.filter(r => r.type === 'preferred_candidate_location');
      for (const rec of prefRecs) {
        expect(
          rec.selectedCandidatePosition,
          `preferred_candidate_location ${rec.id} in ${name} must have selectedCandidatePosition`,
        ).toBeDefined();
      }
    });
  }

  // Also test rf2 via JSON round-trip
  it('CR-1: RF2 JSON round-trip → no phantom add_ap', () => {
    const json = JSON.parse(
      readFileSync(join(__testdir, 'real-fixtures', 'rf2-user-house-5ghz.json'), 'utf-8'),
    ) as ExportedFixture;
    const loaded = loadExportedFixture(json);
    const result = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );
    const allRecs = collectAll(result.recommendations);

    for (const rec of allRecs.filter(r => r.type === 'add_ap' || r.type === 'preferred_candidate_location')) {
      expect(
        rec.selectedCandidatePosition,
        `${rec.type} ${rec.id} in RF2 JSON must have selectedCandidatePosition`,
      ).toBeDefined();
    }
  });
});

// ─── CR-2: required_for_new_ap + empty candidates → zero add_ap ─────────

describe('CR-2: required_for_new_ap + empty candidates → no add_ap, no preferred_candidate', () => {
  it('CR-2a: F4 (no candidates defined) → zero add_ap + zero preferred_candidate', () => {
    const f = createF4NoNewCable();
    expect(f.ctx.candidatePolicy, 'F4 must use required_for_new_ap').toBe('required_for_new_ap');
    expect(f.ctx.candidates.length, 'F4 must have zero candidates').toBe(0);

    const result = run(f);
    const allRecs = collectAll(result.recommendations);

    expect(allRecs.filter(r => r.type === 'add_ap').length, 'no add_ap without candidates').toBe(0);
    expect(
      allRecs.filter(r => r.type === 'preferred_candidate_location').length,
      'no preferred_candidate without candidates',
    ).toBe(0);
  });

  it('CR-2b: RF2 with candidates cleared → zero add_ap', () => {
    const f = createRf2UserHouse();
    const ctx: RecommendationContext = {
      ...f.ctx,
      candidates: [],
      candidatePolicy: 'required_for_new_ap',
    };
    const result = run(f, ctx);
    const allRecs = collectAll(result.recommendations);

    expect(allRecs.filter(r => r.type === 'add_ap').length, 'no add_ap when candidates cleared').toBe(0);
    expect(
      allRecs.filter(r => r.type === 'preferred_candidate_location').length,
      'no preferred_candidate when candidates cleared',
    ).toBe(0);
  });
});

// ─── CR-3: required_for_move_and_new_ap → no interpolation moves ────────

describe('CR-3: required_for_move_and_new_ap → no interpolation-fallback move_ap', () => {
  it('CR-3a: F8 (required_for_move_and_new_ap) → move_ap must have selectedCandidatePosition or be blocked', () => {
    const f = createF8CandidateRequiredNoNear();
    expect(f.ctx.candidatePolicy).toBe('required_for_move_and_new_ap');

    const result = run(f);
    const allRecs = collectAll(result.recommendations);

    const moveRecs = allRecs.filter(r => r.type === 'move_ap');
    for (const rec of moveRecs) {
      const isBlocked = rec.type === 'blocked_recommendation';
      expect(
        rec.selectedCandidatePosition != null || isBlocked,
        `move_ap ${rec.id} must have selectedCandidatePosition or be blocked (no interpolation)`,
      ).toBe(true);
    }
  });

  it('CR-3b: RF2 forced to required_for_move_and_new_ap + no candidates → no interpolation moves', () => {
    const f = createRf2UserHouse();
    const ctx: RecommendationContext = {
      ...f.ctx,
      candidates: [],
      candidatePolicy: 'required_for_move_and_new_ap',
    };
    const result = run(f, ctx);
    const allRecs = collectAll(result.recommendations);

    const moveRecs = allRecs.filter(r => r.type === 'move_ap');
    for (const rec of moveRecs) {
      expect(
        rec.selectedCandidatePosition,
        `move_ap ${rec.id} must have selectedCandidatePosition (no interpolation with required_for_move_and_new_ap + empty candidates)`,
      ).toBeDefined();
    }

    // Also: no add_ap
    expect(allRecs.filter(r => r.type === 'add_ap').length, 'no add_ap without candidates').toBe(0);
  });
});

// ─── CR-4: optional policy → fallback add_ap must carry evidence ─────────

describe('CR-4: optional policy → fallback add_ap carries usedFallback=1 + candidateCount=0', () => {
  it('CR-4a: F4 with optional policy → fallback add_ap has correct evidence', () => {
    const f = createF4NoNewCable();
    const ctx: RecommendationContext = {
      ...f.ctx,
      candidatePolicy: 'optional',
      candidates: [],
    };
    const result = run(f, ctx);
    const allRecs = collectAll(result.recommendations);

    const addApRecs = allRecs.filter(r => r.type === 'add_ap');
    for (const rec of addApRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(metrics?.usedFallback, `add_ap ${rec.id} must have usedFallback=1`).toBe(1);
      expect(metrics?.candidateCount, `add_ap ${rec.id} must have candidateCount=0`).toBe(0);
      expect(
        rec.selectedCandidatePosition,
        `fallback add_ap ${rec.id} must NOT have selectedCandidatePosition`,
      ).toBeUndefined();
    }
  });

  it('CR-4b: RF2 with optional policy + no candidates → fallback add_ap evidence correct', () => {
    const f = createRf2UserHouse();
    const ctx: RecommendationContext = {
      ...f.ctx,
      candidatePolicy: 'optional',
      candidates: [],
    };
    const result = run(f, ctx);
    const allRecs = collectAll(result.recommendations);

    const addApRecs = allRecs.filter(r => r.type === 'add_ap');
    // With 4 APs and good coverage, RF2 may or may not produce add_ap.
    // If it does, it must carry fallback evidence.
    for (const rec of addApRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(metrics?.usedFallback, `add_ap ${rec.id} must have usedFallback=1`).toBe(1);
      expect(metrics?.candidateCount, `add_ap ${rec.id} must have candidateCount=0`).toBe(0);
      expect(
        rec.selectedCandidatePosition,
        `fallback add_ap ${rec.id} must NOT have selectedCandidatePosition`,
      ).toBeUndefined();
    }
  });
});

// ─── AQ: "No-Cable" Reality Pack (Phase 28aq) ───────────────────

// Inline helpers for AQ-5 (many weak zones)
function aqAp(id: string, x: number, y: number, overrides?: Partial<APConfig>): APConfig {
  return {
    id, x, y, txPowerDbm: 20, antennaGainDbi: 4.0, enabled: true,
    mounting: 'ceiling', orientationDeg: 0, heightM: 2.5,
    ...overrides,
  };
}

function aqApResp(id: string, x: number, y: number, ch5 = 36, overrides?: Partial<AccessPointResponse>): AccessPointResponse {
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
 * Create a large grid (50×30) with 1 AP in a corner → produces many distinct weak zones
 * far from the AP (cells < -80 dBm). Enough distance to form 5+ separated weak clusters.
 */
function createManyWeakZones() {
  const W = 50, H = 30;
  const total = W * H;
  const rssiGrid = new Float32Array(total);
  const apIndexGrid = new Uint8Array(total);
  const deltaGrid = new Float32Array(total).fill(20);
  const overlapCountGrid = new Uint8Array(total).fill(1);
  const uplinkLimitedGrid = new Uint8Array(total);
  const secondBestApIndexGrid = new Uint8Array(total);

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const dist = Math.sqrt((c - 5) ** 2 + (r - 5) ** 2);
      apIndexGrid[idx] = 0;
      secondBestApIndexGrid[idx] = 0;

      if (dist < 8) rssiGrid[idx] = -40;
      else if (dist < 15) rssiGrid[idx] = -60;
      else if (dist < 22) rssiGrid[idx] = -72;
      else rssiGrid[idx] = -88; // Large weak area
    }
  }

  let excellent = 0, good = 0, fair = 0, poor = 0, none = 0;
  for (let i = 0; i < total; i++) {
    const v = rssiGrid[i]!;
    if (v >= -45) excellent++;
    else if (v >= -60) good++;
    else if (v >= -70) fair++;
    else if (v >= -80) poor++;
    else none++;
  }

  const stats: HeatmapStats = {
    minRSSI: -88, maxRSSI: -40, avgRSSI: -60, calculationTimeMs: 10,
    gridStep: 1.0, lodLevel: 2, totalCells: total, gridWidth: W, gridHeight: H,
    apIds: ['ap-1'],
    coverageBins: { excellent, good, fair, poor, none },
    rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid,
    uplinkLimitedGrid, secondBestApIndexGrid,
  };

  return {
    aps: [aqAp('ap-1', 5, 5, { txPowerDbm: 17 })],
    apResps: [aqApResp('ap-1', 5, 5, 36, { tx_power_5ghz_dbm: 17 })],
    walls: [] as import('$lib/heatmap/worker-types').WallData[],
    bounds: { width: W, height: H, originX: 0, originY: 0 },
    stats,
  };
}

describe('AQ: No-Cable Reality Pack (Phase 28aq)', () => {
  // AQ-1: required_for_new_ap + 0 candidates → max 2 infra_required, kein add_ap
  it('AQ-1: required_for_new_ap + 0 candidates → max 2 infra_required, no add_ap', () => {
    const f = createF4NoNewCable();
    expect(f.ctx.candidatePolicy).toBe('required_for_new_ap');
    expect(f.ctx.candidates.length).toBe(0);

    const result = run(f);
    const allRecs = collectAll(result.recommendations);

    // No add_ap under required policy with 0 candidates
    expect(allRecs.filter(r => r.type === 'add_ap').length, 'no add_ap').toBe(0);

    // infra_required capped at 2
    const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');
    expect(infraRecs.length, 'infra_required capped at 2').toBeLessThanOrEqual(2);

    // All infra_required must have priority: high + severity: warning
    for (const rec of infraRecs) {
      expect(rec.priority, `infra_required ${rec.id} must be priority high`).toBe('high');
      expect(rec.severity, `infra_required ${rec.id} must be severity warning`).toBe('warning');
    }
  });

  // AQ-2: required_for_move_and_new_ap + far candidates → blocked_recommendation with nearestDistance/maxDistance
  it('AQ-2: required_for_move_and_new_ap + far candidates → blocked with nearestDistance/maxDistance', () => {
    const f = createF8CandidateRequiredNoNear();
    expect(f.ctx.candidatePolicy).toBe('required_for_move_and_new_ap');

    const result = run(f);
    const allRecs = collectAll(result.recommendations);

    const blocked = allRecs.filter(r => r.type === 'blocked_recommendation');
    // The blocked rec must now include richer evidence
    for (const rec of blocked) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      const params = rec.reasonParams as Record<string, unknown> | undefined;

      // Check evidence includes candidate-related info for move-blocked recs
      if (params?.reason === 'no_candidate_close_enough' || params?.reason === 'no_candidates_defined') {
        expect(
          metrics?.candidateCount != null,
          `blocked ${rec.id}: evidence must include candidateCount`,
        ).toBe(true);
        expect(
          metrics?.candidatePolicy != null,
          `blocked ${rec.id}: evidence must include candidatePolicy`,
        ).toBe(true);
        expect(
          params?.maxDistance != null,
          `blocked ${rec.id}: reasonParams must include maxDistance`,
        ).toBe(true);
      }
    }
  });

  // AQ-3: optional + 0 candidates → add_ap fallback with correct evidence
  it('AQ-3: optional + 0 candidates → add_ap fallback with usedFallback=1, candidateCount=0, no selectedCandidatePosition', () => {
    const f = createF4NoNewCable();
    const ctx: RecommendationContext = {
      ...f.ctx,
      candidatePolicy: 'optional',
      candidates: [],
    };
    const result = run(f, ctx);
    const allRecs = collectAll(result.recommendations);

    const addAps = allRecs.filter(r => r.type === 'add_ap');
    expect(addAps.length, 'at least 1 add_ap with optional fallback').toBeGreaterThanOrEqual(1);

    for (const rec of addAps) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(metrics?.usedFallback, `add_ap ${rec.id}: usedFallback=1`).toBe(1);
      expect(metrics?.candidateCount, `add_ap ${rec.id}: candidateCount=0`).toBe(0);
      expect(rec.selectedCandidatePosition, `add_ap ${rec.id}: no selectedCandidatePosition`).toBeUndefined();
    }
  });

  // AQ-4: infra_required always includes candidateCount in evidence + candidatePolicy in reasonParams
  it('AQ-4: infra_required evidence includes candidateCount, reasonParams includes candidatePolicy', () => {
    // Test with F4 (no candidates) and F5 (far candidates) — both produce infra_required
    for (const create of [createF4NoNewCable, createF5FarCandidates]) {
      const f = create();
      const result = run(f);
      const allRecs = collectAll(result.recommendations);

      const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');
      for (const rec of infraRecs) {
        const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
        expect(
          metrics?.candidateCount != null,
          `infra_required ${rec.id}: evidence must include candidateCount`,
        ).toBe(true);

        // candidatePolicy is a string → lives in reasonParams, not in numeric metrics
        const params = rec.reasonParams as Record<string, unknown> | undefined;
        expect(
          params?.candidatePolicy != null,
          `infra_required ${rec.id}: reasonParams must include candidatePolicy`,
        ).toBe(true);
      }
    }
  });

  // AQ-5: infra_required cap = 2 even with many weak zones
  it('AQ-5: infra_required capped at 2 even with large weak area', () => {
    const f = createManyWeakZones();
    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidates: [],
      candidatePolicy: 'required_for_new_ap',
    };

    const result = generateRecommendations(
      f.aps, f.apResps, f.walls, f.bounds,
      BAND, f.stats, RF, 'balanced', ctx,
    );
    const allRecs = collectAll(result.recommendations);

    const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');
    expect(infraRecs.length, 'infra_required capped at 2').toBeLessThanOrEqual(2);

    // No add_ap under required policy
    expect(allRecs.filter(r => r.type === 'add_ap').length, 'no add_ap').toBe(0);

    // All infra_required must have priority: high
    for (const rec of infraRecs) {
      expect(rec.priority, `infra_required ${rec.id} must be high priority`).toBe('high');
      expect(rec.severity, `infra_required ${rec.id} must be warning`).toBe('warning');
    }
  });
});
