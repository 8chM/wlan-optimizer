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
import type { Recommendation, RecommendationContext } from '../types';
import { EMPTY_CONTEXT } from '../types';
import { createRFConfig } from '$lib/heatmap/rf-engine';
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
