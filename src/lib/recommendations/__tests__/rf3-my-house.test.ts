/**
 * RF3: My House — 6 invariant regression tests.
 *
 * Loads rf3-my-house-5ghz.json via loadExportedFixture (round-trip).
 * Scenario: 18×12m EG, 3 APs (ch36 conflict), 6 walls, 3 PZ,
 * candidatePolicy=required_for_move_and_new_ap (strictest), 2 candidates.
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
  readFileSync(join(__testdir, 'real-fixtures', 'rf3-my-house-5ghz.json'), 'utf-8'),
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

describe('RF3: My House (real-project fixture)', () => {
  it('RF3-1: CandidatePolicy respected — no add_ap without selectedCandidatePosition', () => {
    const policy = loaded.ctx.candidatePolicy;
    expect(
      policy === 'required_for_new_ap' || policy === 'required_for_move_and_new_ap',
      `candidatePolicy must be a required variant, got ${policy}`,
    ).toBe(true);

    const addAps = recs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition != null,
        `add_ap ${rec.id} must have selectedCandidatePosition (policy=${policy})`,
      ).toBe(true);
    }
  });

  it('RF3-2: No phantom placement — add_ap only at defined candidates', () => {
    const allRecs = collectAll(recs);
    const candidatePositions = loaded.ctx.candidates.map(c => ({ x: c.x, y: c.y }));

    const addAps = allRecs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      if (rec.selectedCandidatePosition) {
        const pos = rec.selectedCandidatePosition;
        const matchesCandidate = candidatePositions.some(
          cp => Math.abs(cp.x - pos.x) < 0.5 && Math.abs(cp.y - pos.y) < 0.5,
        );
        expect(
          matchesCandidate,
          `add_ap ${rec.id} position (${pos.x},${pos.y}) must match a defined candidate`,
        ).toBe(true);
      }
    }

    // No phantom add_ap (position without candidate)
    const phantomAdds = allRecs.filter(
      r => r.type === 'add_ap' && r.selectedCandidatePosition == null,
    );
    expect(phantomAdds.length, 'No phantom add_ap placements').toBe(0);
  });

  it('RF3-3: Channel spam bounded — max 1 per AP, max 2 actionable total', () => {
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
      expect(count, `AP ${apId}: ${count} change_channel recs, max 1`).toBeLessThanOrEqual(1);
    }

    // Max 2 actionable total
    const actionable = channelRecs.filter(
      r => RECOMMENDATION_CATEGORIES[r.type] === 'actionable_config',
    );
    expect(actionable.length, `${actionable.length} actionable change_channel, max 2`).toBeLessThanOrEqual(2);
  });

  it('RF3-4: Roaming regression protection — demoted recs are informational', () => {
    const allRecs = collectAll(recs);

    // Roaming TX recs with marginalBenefit=1 must be informational
    const roamingRecs = allRecs.filter(
      r => r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost',
    );
    for (const rec of roamingRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      if (metrics?.marginalBenefit === 1) {
        const cat = RECOMMENDATION_CATEGORIES[rec.type];
        expect(cat, `Demoted roaming ${rec.id} must be informational`).toBe('informational');
      }
      expect(rec.severity, `Roaming ${rec.id} must not be critical`).not.toBe('critical');
    }

    // sticky_client_risk always informational
    for (const rec of allRecs.filter(r => r.type === 'sticky_client_risk')) {
      expect(
        RECOMMENDATION_CATEGORIES[rec.type],
        `sticky_client_risk ${rec.id} must be informational`,
      ).toBe('informational');
    }
  });

  it('RF3-5: Evidence minimums — all recs have required keys', () => {
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

  it('RF3-6: No-new-cable realism — move_ap blocked when policy strict + no suitable candidate', () => {
    const policy = loaded.ctx.candidatePolicy;

    if (policy === 'required_for_move_and_new_ap') {
      const allRecs = collectAll(recs);
      const moveAps = allRecs.filter(r => r.type === 'move_ap');

      for (const rec of moveAps) {
        // move_ap must either have selectedCandidatePosition or be a blocked_recommendation
        // (interpolation fallback is blocked under required_for_move_and_new_ap)
        const hasCandidate = rec.selectedCandidatePosition != null;
        expect(
          hasCandidate,
          `move_ap ${rec.id} must have selectedCandidatePosition under required_for_move_and_new_ap`,
        ).toBe(true);
      }

      // Any blocked_recommendation about move should reference the policy
      const blockedRecs = allRecs.filter(r => r.type === 'blocked_recommendation');
      for (const rec of blockedRecs) {
        const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
        // Blocked recs should have some evidence
        expect(
          metrics != null && Object.keys(metrics).length > 0,
          `blocked_recommendation ${rec.id} must have non-empty evidence`,
        ).toBe(true);
      }
    }
  });

  // ─── RF3-7..RF3-12: Channel/Width/TX/Roaming Interaction Tests ───

  it('RF3-7: Channel recs bounded — max 2 when pool exhausted, max 5 otherwise', () => {
    const allRecs = collectAll(recs);
    const channelRecs = allRecs.filter(r => r.type === 'change_channel');

    // RF3 has 3 APs on 2 channels (ch36 × 2 + ch44 × 1) — pool has ~8 5GHz channels
    // Not exhausted → max 5, but 3 APs → at most 3 change_channel possible anyway
    expect(channelRecs.length, `channel recs count ${channelRecs.length}`).toBeLessThanOrEqual(5);

    // Each change_channel must have the correct band-specific parameter
    for (const rec of channelRecs) {
      expect(
        rec.suggestedChange?.parameter,
        `change_channel ${rec.id} must use channel_5ghz parameter`,
      ).toBe('channel_5ghz');
    }
  });

  it('RF3-8: Channel width recs — valid suggested values and evidence keys', () => {
    const allRecs = collectAll(recs);
    const widthRecs = allRecs.filter(r => r.type === 'adjust_channel_width');

    for (const rec of widthRecs) {
      // Must suggest a valid width (20 or 40, never higher than current)
      const suggested = Number(rec.suggestedChange?.suggestedValue);
      expect(
        [20, 40].includes(suggested),
        `adjust_channel_width ${rec.id} suggestedValue=${suggested} must be 20 or 40`,
      ).toBe(true);

      // Must have nearbyApCount in evidence
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics?.nearbyApCount != null,
        `adjust_channel_width ${rec.id} must have nearbyApCount in evidence`,
      ).toBe(true);

      // Parameter must be channel_width
      expect(rec.suggestedChange?.parameter).toBe('channel_width');
    }
  });

  it('RF3-9: Channel width recs do not exceed channel recs — bounded count', () => {
    const allRecs = collectAll(recs);
    const widthRecs = allRecs.filter(r => r.type === 'adjust_channel_width');
    const channelRecs = allRecs.filter(r => r.type === 'change_channel');

    // channel_width recs should not flood the output — max 1 per AP
    const widthApIds = new Set<string>();
    for (const rec of widthRecs) {
      for (const apId of rec.affectedApIds) {
        expect(
          !widthApIds.has(apId),
          `AP ${apId} has duplicate adjust_channel_width recs`,
        ).toBe(true);
        widthApIds.add(apId);
      }
    }

    // Total config recs (channel + width) should be bounded
    const totalConfigRecs = channelRecs.length + widthRecs.length;
    expect(
      totalConfigRecs,
      `total channel + width recs (${totalConfigRecs}) should be bounded`,
    ).toBeLessThanOrEqual(10);
  });

  it('RF3-10: Roaming recs respect MIN_HANDOFF_CELLS/MIN_HANDOFF_RATIO guards', () => {
    const allRecs = collectAll(recs);
    const roamingRecs = allRecs.filter(
      r => r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost',
    );

    for (const rec of roamingRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      // Roaming recs that made it through must have handoff evidence
      // (either handoffCells or gapCells — depending on subtype)
      const hasRoamingEvidence =
        metrics?.handoffCells != null || metrics?.gapCells != null ||
        metrics?.stickyRatio != null || metrics?.gapRatio != null;
      expect(
        hasRoamingEvidence,
        `roaming rec ${rec.id} must have handoff/gap/sticky evidence`,
      ).toBe(true);

      // Severity must not be critical (Roaming regression guard RF3-4)
      expect(rec.severity, `roaming ${rec.id} severity`).not.toBe('critical');
    }
  });

  it('RF3-11: Cross-type dedup — max 1 TX-modifying rec per AP', () => {
    const allRecs = collectAll(recs);

    // Types that modify TX power: adjust_tx_power, roaming_tx_adjustment, roaming_tx_boost
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
      // Cross-type dedup: roaming_tx_adjustment is skipped if adjust_tx_power already exists
      // So max 1 TX-modifying rec per AP in the primary recs
      expect(
        types.length,
        `AP ${apId} has ${types.length} TX recs [${types.join(', ')}], max 1`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('RF3-12: Informational recs are not actionable_config', () => {
    const allRecs = collectAll(recs);

    // sticky_client_risk and handoff_gap_warning must always be informational category
    const infoTypes = ['sticky_client_risk', 'handoff_gap_warning'];
    for (const rec of allRecs.filter(r => infoTypes.includes(r.type))) {
      expect(
        RECOMMENDATION_CATEGORIES[rec.type],
        `${rec.type} ${rec.id} must be informational`,
      ).toBe('informational');

      // Priority must be low for informational recs
      expect(
        rec.priority,
        `${rec.type} ${rec.id} priority`,
      ).toBe('low');
    }
  });
});
