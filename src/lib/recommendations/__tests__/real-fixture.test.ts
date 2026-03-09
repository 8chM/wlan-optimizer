/**
 * Real-fixture regression tests — realistic topology scenarios.
 *
 * RF1: Home-Office (3 APs, 2 walls, PriorityZone, CandidatePolicy)
 */

import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '../generator';
import { EVIDENCE_MINIMUMS } from '../generator';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import { createRf1HomeOffice } from './fixtures/create-rf1';

const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);

describe('RF1: Home-Office', () => {
  const fixture = createRf1HomeOffice();
  const result = generateRecommendations(
    fixture.aps,
    fixture.apResps,
    fixture.walls,
    fixture.bounds,
    BAND,
    fixture.stats,
    RF_CONFIG,
    'balanced',
    fixture.ctx,
  );
  const recs = result.recommendations;

  it('must not emit phantom add_ap when candidatePolicy required', () => {
    const addAps = recs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      // add_ap must reference a defined candidate location
      const candidateIds = new Set(fixture.ctx.candidates.map(c => c.id));
      const hasCandidate = rec.selectedCandidatePosition != null ||
        (rec.evidence?.metrics as Record<string, unknown>)?.candidateId != null;
      const isBlocked = rec.type === 'infrastructure_required' || rec.type === 'blocked_recommendation';
      expect(
        hasCandidate || isBlocked,
        `add_ap rec ${rec.id} must reference a candidate or be blocked (candidatePolicy=required_for_new_ap). ` +
        `Candidate IDs: ${[...candidateIds].join(', ')}`,
      ).toBe(true);
    }
  });

  it('PZ-office must not lose coverage from any recommendation', () => {
    const pz = fixture.ctx.priorityZones.find(z => z.zoneId === 'pz-buero');
    expect(pz, 'PZ buero must exist').toBeDefined();

    // Check that no recommendation emits a constraint_conflict targeting the PZ
    const conflicts = recs.filter(
      r => r.type === 'constraint_conflict' &&
        r.evidence?.metrics &&
        (r.evidence.metrics as Record<string, unknown>).zoneId === 'pz-buero',
    );
    expect(
      conflicts.length,
      'No constraint_conflict should target the Buero PZ',
    ).toBe(0);

    // No disable_ap should remove coverage from the PZ AP
    const disables = recs.filter(r => r.type === 'disable_ap');
    for (const dis of disables) {
      // ap-buero covers the PZ — disabling it would remove coverage
      expect(
        dis.affectedApIds.includes('ap-buero'),
        `disable_ap should not target ap-buero (covers PZ-buero)`,
      ).toBe(false);
    }
  });

  it('all recs pass evidence minimum check', () => {
    function collectAll(list: typeof recs): typeof recs {
      const out: typeof recs = [];
      for (const r of list) {
        out.push(r);
        if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
      }
      return out;
    }

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
