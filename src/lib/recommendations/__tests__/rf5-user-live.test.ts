/**
 * RF5: User Live v2 — 6 invariant regression tests.
 *
 * Loads rf5-user-live-5ghz.json via loadExportedFixture (round-trip).
 * Scenario: 30×20m office, 6 APs (2 channel conflicts: ch36 + ch44),
 * 6 walls, 2 PZ (Open Space mustHaveCoverage), 2 candidates,
 * candidatePolicy=required_for_new_ap, ~47% uplink-limited cells.
 *
 * First RF fixture with real uplink limitation — exercises
 * UPLINK_SUPPRESS_ADD_MOVE, UPLINK_BLOCK_ROAMING, and band_limit_warning.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateRecommendations, EVIDENCE_MINIMUMS } from '../generator';
import { loadExportedFixture } from './fixtures/load-exported-fixture';
import type { Recommendation } from '../types';
import { RECOMMENDATION_CATEGORIES } from '../types';
import type { ExportedFixture } from '../fixture-export';

const __testdir = dirname(fileURLToPath(import.meta.url));
const fixtureJson = JSON.parse(
  readFileSync(join(__testdir, 'real-fixtures', 'rf5-user-live-5ghz.json'), 'utf-8'),
) as ExportedFixture;

const loaded = loadExportedFixture(fixtureJson);
const result = generateRecommendations(
  loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
  loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
);
const recs = result.recommendations;

function collectAll(list: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of list) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

describe('RF5: User Live v2 (JSON fixture, uplink-limited)', () => {
  it('RF5-1: No phantom add_ap — required policy enforces selectedCandidatePosition', () => {
    const policy = loaded.ctx.candidatePolicy;
    expect(
      policy === 'required_for_new_ap' || policy === 'required_for_move_and_new_ap',
      `RF5 must use a required policy, got ${policy}`,
    ).toBe(true);

    const allRecs = collectAll(recs);
    const addAps = allRecs.filter(r => r.type === 'add_ap');

    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition != null,
        `add_ap ${rec.id} must have selectedCandidatePosition (policy=${policy})`,
      ).toBe(true);
    }

    // No phantom placements
    const phantomAdds = allRecs.filter(
      r => r.type === 'add_ap' && r.selectedCandidatePosition == null,
    );
    expect(phantomAdds.length, 'no phantom add_ap').toBe(0);
  });

  it('RF5-2: No move_ap interpolation under required policy', () => {
    const policy = loaded.ctx.candidatePolicy;

    const allRecs = collectAll(recs);
    const moveRecs = allRecs.filter(r => r.type === 'move_ap');

    if (policy === 'required_for_move_and_new_ap') {
      // Strict: move_ap must have selectedCandidatePosition
      for (const rec of moveRecs) {
        expect(
          rec.selectedCandidatePosition != null,
          `move_ap ${rec.id} must have selectedCandidatePosition under strict policy`,
        ).toBe(true);
      }
    }

    // Under required_for_new_ap, moves can use interpolation
    // but still must not create phantom add_ap
    const phantomAdds = allRecs.filter(
      r => r.type === 'add_ap' && r.selectedCandidatePosition == null,
    );
    expect(phantomAdds.length, 'no phantom add_ap from move fallback').toBe(0);
  });

  it('RF5-3: infra_required bounded — max 2, high priority when candidateCount=0', () => {
    const allRecs = collectAll(recs);
    const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');

    expect(
      infraRecs.length,
      `${infraRecs.length} infrastructure_required recs, max 2`,
    ).toBeLessThanOrEqual(2);

    for (const rec of infraRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics != null && Object.keys(metrics).length > 0,
        `infrastructure_required ${rec.id} must have non-empty evidence`,
      ).toBe(true);

      // When candidateCount is 0, priority should be high
      if (metrics?.candidateCount === 0) {
        expect(
          rec.priority,
          `infra_required ${rec.id} with candidateCount=0 should be high priority`,
        ).toBe('high');
      }
    }
  });

  it('RF5-4: Roaming: no actionable TX if demoted — informational only', () => {
    const allRecs = collectAll(recs);
    const roamingRecs = allRecs.filter(
      r => r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost',
    );

    for (const rec of roamingRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      const marginalBenefit = metrics?.marginalBenefit as number | undefined;

      // Demoted roaming recs must be informational
      if (marginalBenefit === 1) {
        const cat = RECOMMENDATION_CATEGORIES[rec.type];
        expect(cat, `demoted roaming ${rec.id} must be informational`).toBe('informational');
      }

      // No roaming rec should be critical
      expect(rec.severity, `roaming ${rec.id} severity`).not.toBe('critical');
    }

    // sticky_client_risk always informational
    for (const rec of allRecs.filter(r => r.type === 'sticky_client_risk')) {
      expect(RECOMMENDATION_CATEGORIES[rec.type]).toBe('informational');
    }
  });

  it('RF5-5: Channel bounded — max 1 per AP, max 5 total, correct param', () => {
    const allRecs = collectAll(recs);
    const channelRecs = allRecs.filter(r => r.type === 'change_channel');

    // Max 1 per AP
    const perAp = new Map<string, number>();
    for (const rec of channelRecs) {
      for (const apId of rec.affectedApIds) {
        perAp.set(apId, (perAp.get(apId) ?? 0) + 1);
      }
    }
    for (const [apId, count] of perAp) {
      expect(count, `AP ${apId}: ${count} change_channel, max 1`).toBeLessThanOrEqual(1);
    }

    // Max total bounded
    expect(channelRecs.length, 'channel recs bounded').toBeLessThanOrEqual(5);

    // Correct band-specific parameter
    for (const rec of channelRecs) {
      expect(rec.suggestedChange?.parameter).toBe('channel_5ghz');
    }
  });

  it('RF5-6: Evidence minimums — all recs satisfy EVIDENCE_MINIMUMS', () => {
    const allRecs = collectAll(recs);
    for (const rec of allRecs) {
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (!required) continue;
      const keys = Object.keys(rec.evidence?.metrics ?? {});
      const hasAtLeastOne = required.some(k => keys.includes(k));
      expect(
        hasAtLeastOne,
        `${rec.type} (${rec.id}): needs [${required.join(', ')}], got [${keys.join(', ')}]`,
      ).toBe(true);
    }
  });
});
