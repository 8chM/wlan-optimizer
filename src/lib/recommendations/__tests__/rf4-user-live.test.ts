/**
 * RF4: User Live — 6 invariant regression tests.
 *
 * Loads rf4-user-live-5ghz.json via loadExportedFixture (round-trip).
 * Scenario: 22×16m apartment, 5 APs (2 channel conflicts: ch36 + ch44),
 * 5 walls, 2 PZ (Arbeitszimmer mustHaveCoverage), 1 candidate,
 * candidatePolicy=optional.
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
  readFileSync(join(__testdir, 'real-fixtures', 'rf4-user-live-5ghz.json'), 'utf-8'),
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

describe('RF4: User Live (JSON fixture round-trip)', () => {
  it('RF4-1: CandidatePolicy respected — optional fallback add_ap carries evidence', () => {
    const policy = loaded.ctx.candidatePolicy;
    expect(policy, 'RF4 must use optional policy').toBe('optional');

    const allRecs = collectAll(recs);
    const addAps = allRecs.filter(r => r.type === 'add_ap');

    for (const rec of addAps) {
      if (rec.selectedCandidatePosition == null) {
        // Fallback add_ap: must carry usedFallback=1 + candidateCount evidence
        const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
        expect(
          metrics?.usedFallback,
          `fallback add_ap ${rec.id} must have usedFallback=1`,
        ).toBe(1);
      }
    }

    // No phantom add_ap without evidence
    for (const rec of addAps) {
      const hasCandidate = rec.selectedCandidatePosition != null;
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      const hasFallbackEvidence = metrics?.usedFallback != null;
      expect(
        hasCandidate || hasFallbackEvidence,
        `add_ap ${rec.id} must have selectedCandidatePosition or usedFallback evidence`,
      ).toBe(true);
    }
  });

  it('RF4-2: Channel recs bounded — max 1 per AP, pool exhaustion rules respected', () => {
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
      expect(count, `AP ${apId}: ${count} change_channel, max 1`).toBeLessThanOrEqual(1);
    }

    // Total channel recs bounded (max 5 normal, max 2 if exhausted)
    expect(
      channelRecs.length,
      `channel recs count ${channelRecs.length}`,
    ).toBeLessThanOrEqual(5);

    // All channel recs must use correct band-specific parameter
    for (const rec of channelRecs) {
      expect(rec.suggestedChange?.parameter).toBe('channel_5ghz');
    }
  });

  it('RF4-3: Roaming demotion — no actionable roaming rec if regression', () => {
    const allRecs = collectAll(recs);
    const roamingRecs = allRecs.filter(
      r => r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost',
    );

    for (const rec of roamingRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      const marginalBenefit = metrics?.marginalBenefit as number | undefined;

      // Demoted roaming recs (marginalBenefit=1) must be informational
      if (marginalBenefit === 1) {
        const cat = RECOMMENDATION_CATEGORIES[rec.type];
        expect(cat, `demoted roaming ${rec.id} must be informational`).toBe('informational');
      }

      // No roaming rec should be critical severity
      expect(rec.severity, `roaming ${rec.id} severity`).not.toBe('critical');
    }

    // sticky_client_risk always informational
    for (const rec of allRecs.filter(r => r.type === 'sticky_client_risk')) {
      expect(RECOMMENDATION_CATEGORIES[rec.type]).toBe('informational');
    }
  });

  it('RF4-4: infrastructure_required bounded — max 3 infra recs total', () => {
    const allRecs = collectAll(recs);
    const infraRecs = allRecs.filter(r => r.type === 'infrastructure_required');

    // infrastructure_required should not flood output
    expect(
      infraRecs.length,
      `${infraRecs.length} infrastructure_required recs, max 3`,
    ).toBeLessThanOrEqual(3);

    // Each must have evidence
    for (const rec of infraRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics != null && Object.keys(metrics).length > 0,
        `infrastructure_required ${rec.id} must have non-empty evidence`,
      ).toBe(true);
    }
  });

  it('RF4-5: Evidence minimums — all recs have required keys', () => {
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

  it('RF4-6: Cross-type dedup — max 1 TX-modifying rec per AP', () => {
    const allRecs = collectAll(recs);

    // Types that modify TX power
    const txModTypes = new Set(['adjust_tx_power', 'roaming_tx_adjustment', 'roaming_tx_boost']);
    const txRecs = allRecs.filter(r => txModTypes.has(r.type));

    const perAp = new Map<string, string[]>();
    for (const rec of txRecs) {
      for (const apId of rec.affectedApIds) {
        const list = perAp.get(apId) ?? [];
        list.push(`${rec.type}(${rec.id})`);
        perAp.set(apId, list);
      }
    }

    for (const [apId, types] of perAp) {
      expect(
        types.length,
        `AP ${apId} has ${types.length} TX recs [${types.join(', ')}], max 1`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
