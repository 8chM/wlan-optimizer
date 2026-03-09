/**
 * RF2: User House — invariant regression tests.
 *
 * Loads the exported JSON fixture via loadExportedFixture (round-trip test)
 * and verifies 5 invariants against the recommendation engine output.
 *
 * Scenario: 25×20m house, 4 APs (2 on ch36 = conflict), 3 walls,
 * 2 PriorityZones, 2 candidates, candidatePolicy=required_for_new_ap.
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
  readFileSync(join(__testdir, 'real-fixtures', 'rf2-user-house-5ghz.json'), 'utf-8'),
) as ExportedFixture;

const loaded = loadExportedFixture(fixtureJson);
const result = generateRecommendations(
  loaded.aps,
  loaded.accessPoints,
  loaded.walls,
  loaded.bounds,
  loaded.band,
  loaded.stats,
  loaded.rfConfig,
  loaded.profile,
  loaded.ctx,
);
const recs = result.recommendations;

/** Recursively collect all recommendations including nested alternatives. */
function collectAll(list: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of list) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

describe('RF2: User House (JSON fixture round-trip)', () => {
  it('RF2-1: No-Phantom-Placement — add_ap must reference candidate when policy required', () => {
    const candidateIds = new Set(loaded.ctx.candidates.map(c => c.id));
    const policy = loaded.ctx.candidatePolicy;
    expect(
      policy === 'required_for_new_ap' || policy === 'required_for_move_and_new_ap',
      'candidatePolicy must be a required variant for this test',
    ).toBe(true);

    const addAps = recs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition != null,
        `add_ap rec ${rec.id} must have selectedCandidatePosition when candidatePolicy=${policy}. ` +
        `Available candidates: ${[...candidateIds].join(', ')}`,
      ).toBe(true);
    }
  });

  it('RF2-2: No-New-Cable-Mode — no add_ap when no candidates close enough → infrastructure_required', () => {
    // With candidatePolicy=required_for_new_ap:
    // If no candidate is suitable, engine should emit infrastructure_required, NOT add_ap at phantom position
    const allRecs = collectAll(recs);
    const phantomAdds = allRecs.filter(
      r => r.type === 'add_ap' && r.selectedCandidatePosition == null,
    );
    expect(
      phantomAdds.length,
      'No add_ap should lack a selectedCandidatePosition with required policy',
    ).toBe(0);

    // Any infrastructure_required must carry evidence about candidates/policy
    const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');
    for (const rec of infraRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      const hasCandidateEvidence = metrics &&
        ('candidateCount' in metrics || 'allUnsuitable' in metrics || 'policy' in metrics);
      expect(
        hasCandidateEvidence,
        `infrastructure_required ${rec.id} must have candidate-related evidence ` +
        `(candidateCount/allUnsuitable/policy), got: ${JSON.stringify(metrics)}`,
      ).toBeTruthy();
    }
  });

  it('RF2-3: Channel Spam Invariant — max 1 change_channel per AP, max 2 total', () => {
    const allRecs = collectAll(recs);
    const channelRecs = allRecs.filter(r => r.type === 'change_channel');

    // Max 1 change_channel per AP
    const perAp = new Map<string, number>();
    for (const rec of channelRecs) {
      for (const apId of rec.affectedApIds) {
        perAp.set(apId, (perAp.get(apId) ?? 0) + 1);
      }
    }
    for (const [apId, count] of perAp) {
      expect(
        count,
        `AP ${apId} has ${count} change_channel recs, max is 1`,
      ).toBeLessThanOrEqual(1);
    }

    // Total actionable change_channel max 2 (pool exhaustion behavior)
    const actionable = channelRecs.filter(r => RECOMMENDATION_CATEGORIES[r.type] === 'actionable_config');
    expect(
      actionable.length,
      `Actionable change_channel count ${actionable.length} exceeds max 2`,
    ).toBeLessThanOrEqual(2);
  });

  it('RF2-4: Roaming Regression Guard — demoted roaming TX must be informational', () => {
    const allRecs = collectAll(recs);
    const roamingTxRecs = allRecs.filter(
      r => r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost',
    );

    for (const rec of roamingTxRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      const marginalBenefit = metrics?.marginalBenefit as number | undefined;

      if (marginalBenefit === 1) {
        // Demoted to informational — must NOT be actionable
        const cat = RECOMMENDATION_CATEGORIES[rec.type];
        expect(
          cat,
          `Roaming rec ${rec.id} with marginalBenefit=1 must be informational, got ${cat}`,
        ).toBe('informational');
      }

      // No roaming rec should have severity 'critical' (would indicate regression)
      expect(
        rec.severity,
        `Roaming rec ${rec.id} should not be critical severity`,
      ).not.toBe('critical');
    }

    // sticky_client_risk should be informational
    const stickyRecs = allRecs.filter(r => r.type === 'sticky_client_risk');
    for (const rec of stickyRecs) {
      const cat = RECOMMENDATION_CATEGORIES[rec.type];
      expect(
        cat,
        `sticky_client_risk ${rec.id} must be informational`,
      ).toBe('informational');
    }
  });

  it('RF2-5: Evidence Minimums — every rec has required evidence keys', () => {
    const allRecs = collectAll(recs);
    for (const rec of allRecs) {
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (!required) continue;
      const metrics = rec.evidence?.metrics ?? {};
      const keys = Object.keys(metrics);
      const hasAtLeastOne = required.some(k => keys.includes(k));
      expect(
        hasAtLeastOne,
        `${rec.type} (${rec.id}) must have at least one of [${required.join(', ')}] in evidence.metrics, ` +
        `got [${keys.join(', ')}]`,
      ).toBe(true);
    }
  });
});
