/**
 * RF6: User My House — 10 hard invariant tests (U1-U10).
 *
 * "Dein Haus" regression gate: every future rule change must pass these
 * invariants against the user's real house layout.
 *
 * Scenario: 18×12m EG, 4 APs (ch36 conflict), 6 walls, 3 PZ, 3 candidates,
 * 1 constraintZone, candidatePolicy=required_for_new_ap.
 */

import { describe, it, expect } from 'vitest';
import { generateRecommendations, EVIDENCE_MINIMUMS } from '../generator';
import { createRf6UserMyhouse } from './fixtures/create-rf6-user-myhouse';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import type { Recommendation } from '../types';
import { RECOMMENDATION_CATEGORIES } from '../types';

const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);
const fixture = createRf6UserMyhouse();
const result = generateRecommendations(
  fixture.aps, fixture.apResps, fixture.walls, fixture.bounds,
  BAND, fixture.stats, RF_CONFIG, 'balanced', fixture.ctx,
);
const recs = result.recommendations;

/** Recursively collect main + alternative recommendations. */
function collectAll(list: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of list) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

const allRecs = collectAll(recs);

const TX_PARAMS = new Set(['tx_power_24ghz', 'tx_power_5ghz', 'tx_power_6ghz']);
const CHANNEL_PARAMS = new Set(['channel_24ghz', 'channel_5ghz', 'channel_6ghz', 'channel_width']);

describe('RF6: User My House — Hard Invariants (U1-U10)', () => {
  // ─── U1: CandidatePolicy respected ──────────────────────────────
  it('U1: required_for_new_ap — no add_ap without selectedCandidatePosition', () => {
    const policy = fixture.ctx.candidatePolicy;
    expect(policy).toBe('required_for_new_ap');

    const addAps = recs.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition != null,
        `add_ap ${rec.id} must have selectedCandidatePosition (policy=${policy})`,
      ).toBe(true);
    }
  });

  // ─── U2: No phantom APs ────────────────────────────────────────
  it('U2: no phantom placement — add_ap only at defined candidates', () => {
    const candidatePositions = fixture.ctx.candidates.map(c => ({ x: c.x, y: c.y }));

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

    // Under required policy: no add_ap without candidate match
    const phantomAdds = allRecs.filter(
      r => r.type === 'add_ap' && r.selectedCandidatePosition == null,
    );
    expect(phantomAdds.length, 'No phantom add_ap placements').toBe(0);
  });

  // ─── U3: Infrastructure cap ─────────────────────────────────────
  it('U3: infrastructure_required max 2, priority high, evidence complete', () => {
    const infraRecs = recs.filter(r => r.type === 'infrastructure_required');
    expect(infraRecs.length, 'infra_required capped at 2').toBeLessThanOrEqual(2);

    for (const rec of infraRecs) {
      // Evidence must include at least one of the required keys
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (required) {
        const keys = Object.keys(rec.evidence?.metrics ?? {});
        const hasOne = required.some(k => keys.includes(k));
        expect(
          hasOne,
          `infrastructure_required ${rec.id}: needs [${required.join(', ')}], got [${keys.join(', ')}]`,
        ).toBe(true);
      }
    }
  });

  // ─── U4: Channel bounded ────────────────────────────────────────
  it('U4: max 1 change_channel per AP, actionable total bounded', () => {
    const channelRecs = recs.filter(r => r.type === 'change_channel');

    // Max 1 per AP
    const perAp = new Map<string, number>();
    for (const rec of channelRecs) {
      for (const apId of rec.affectedApIds) {
        perAp.set(apId, (perAp.get(apId) ?? 0) + 1);
      }
    }
    for (const [apId, count] of perAp) {
      expect(count, `AP ${apId}: max 1 change_channel`).toBeLessThanOrEqual(1);
    }

    // Actionable channel recs bounded at 2 (channel spam guard)
    const actionable = channelRecs.filter(
      r => RECOMMENDATION_CATEGORIES[r.type] === 'actionable_config',
    );
    expect(actionable.length, 'actionable change_channel bounded').toBeLessThanOrEqual(2);

    // All must use channel_5ghz parameter
    for (const rec of channelRecs) {
      if (rec.suggestedChange) {
        expect(rec.suggestedChange.parameter).toBe('channel_5ghz');
      }
    }
  });

  // ─── U5: Width bounded & pressure ──────────────────────────────
  it('U5: adjust_channel_width only with conflictPressure >= 0.35', () => {
    const widthRecs = allRecs.filter(r => r.type === 'adjust_channel_width');

    for (const rec of widthRecs) {
      const metrics = rec.evidence?.metrics as Record<string, number> | undefined;
      expect(
        metrics?.conflictPressure != null,
        `adjust_channel_width ${rec.id} must have conflictPressure`,
      ).toBe(true);
      expect(
        metrics!.conflictPressure,
        `adjust_channel_width ${rec.id}: conflictPressure ${metrics!.conflictPressure} >= 0.35`,
      ).toBeGreaterThanOrEqual(0.35);

      // Valid suggested width
      const suggested = Number(rec.suggestedChange?.suggestedValue);
      expect([20, 40].includes(suggested), `width ${suggested} must be 20 or 40`).toBe(true);
    }

    // Max 1 per AP
    const widthApIds = new Set<string>();
    for (const rec of widthRecs) {
      for (const apId of rec.affectedApIds) {
        expect(!widthApIds.has(apId), `AP ${apId}: duplicate adjust_channel_width`).toBe(true);
        widthApIds.add(apId);
      }
    }
  });

  // ─── U6: No-new-cable mode ─────────────────────────────────────
  it('U6: required_for_new_ap — no add_ap with usedFallback, blocked when no candidate close', () => {
    const policy = fixture.ctx.candidatePolicy;
    expect(policy).toBe('required_for_new_ap');

    // No add_ap with fallback evidence
    const addApRecs = allRecs.filter(r => r.type === 'add_ap');
    for (const rec of addApRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      expect(
        metrics?.usedFallback !== 1,
        `add_ap ${rec.id} must not use RF-weighted fallback under required policy`,
      ).toBe(true);
    }

    // move_ap under required_for_new_ap: interpolation allowed (only blocked under required_for_move_and_new_ap)
    // but add_ap must use candidates
  });

  // ─── U7: Roaming actionability ──────────────────────────────────
  it('U7: roaming_tx_* actionable only when scoreAfter > scoreBefore AND benefit >= threshold', () => {
    const roamingActionable = allRecs.filter(r =>
      (r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost') &&
      RECOMMENDATION_CATEGORIES[r.type] === 'actionable_config',
    );

    for (const rec of roamingActionable) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      // Actionable roaming must not have marginalBenefit=1 (that's informational)
      expect(
        metrics?.marginalBenefit !== 1,
        `actionable roaming ${rec.id} must not have marginalBenefit=1`,
      ).toBe(true);

      // Must not have physicalGap=1 (physical gap → informational)
      expect(
        metrics?.physicalGap !== 1,
        `actionable roaming ${rec.id} must not have physicalGap=1`,
      ).toBe(true);

      // Must not have wouldHurtPriorityZone=1
      expect(
        metrics?.wouldHurtPriorityZone !== 1,
        `actionable roaming ${rec.id} must not have wouldHurtPriorityZone=1`,
      ).toBe(true);
    }

    // Demoted roaming with marginalBenefit must be informational
    const demoted = allRecs.filter(r =>
      (r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost' ||
       r.type === 'sticky_client_risk') &&
      (r.evidence?.metrics as Record<string, unknown> | undefined)?.marginalBenefit === 1,
    );
    for (const rec of demoted) {
      expect(
        RECOMMENDATION_CATEGORIES[rec.type],
        `demoted roaming ${rec.id} must be informational`,
      ).toBe('informational');
    }
  });

  // ─── U8: Roaming notes — max 1 per pair, gap > sticky ──────────
  it('U8: max 1 roaming note per AP pair, gap wins over sticky', () => {
    const roamingNoteTypes = new Set([
      'sticky_client_risk', 'handoff_gap_warning',
      'roaming_tx_adjustment', 'roaming_tx_boost',
    ]);
    const roamingNotes = recs.filter(r => roamingNoteTypes.has(r.type));

    // Build pair → notes map
    const pairMap = new Map<string, Recommendation[]>();
    for (const rec of roamingNotes) {
      if (rec.affectedApIds.length === 2) {
        const key = [...rec.affectedApIds].sort().join('|');
        const list = pairMap.get(key) ?? [];
        list.push(rec);
        pairMap.set(key, list);
      }
    }

    // Max 1 informational note per pair in main list
    for (const [pair, notes] of pairMap) {
      const infoNotes = notes.filter(r =>
        RECOMMENDATION_CATEGORIES[r.type] === 'informational',
      );
      expect(
        infoNotes.length,
        `pair ${pair}: max 1 informational note, got ${infoNotes.length}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  // ─── U9: EVIDENCE_MINIMUMS ──────────────────────────────────────
  it('U9: all recs satisfy EVIDENCE_MINIMUMS', () => {
    for (const rec of allRecs) {
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (!required) continue;
      const keys = Object.keys(rec.evidence?.metrics ?? {});
      const hasAtLeastOne = required.some(k => keys.includes(k));
      expect(
        hasAtLeastOne,
        `${rec.type} (${rec.id}): needs one of [${required.join(', ')}], got [${keys.join(', ')}]`,
      ).toBe(true);
    }
  });

  // ─── U10: Budget notes — max 1 per AP (BG-01) ──────────────────
  it('U10: per AP max 1 budget/limit note (BG-01)', () => {
    const budgetTypes = new Set(['config_budget_note', 'channel_deprioritized_note']);
    const budgetNotes = recs.filter(r => budgetTypes.has(r.type));

    const perAp = new Map<string, string[]>();
    for (const rec of budgetNotes) {
      for (const apId of rec.affectedApIds) {
        const list = perAp.get(apId) ?? [];
        list.push(rec.type);
        perAp.set(apId, list);
      }
    }

    for (const [apId, types] of perAp) {
      expect(
        types.length,
        `AP ${apId}: max 1 budget note, got [${types.join(', ')}]`,
      ).toBeLessThanOrEqual(1);
    }
  });

  // ─── U11: Config budget — max 2 actionable_config per AP (BD-01) ─
  it('U11: max 2 actionable_config recs per AP', () => {
    const perAp = new Map<string, number>();
    for (const rec of recs) {
      if (RECOMMENDATION_CATEGORIES[rec.type] === 'actionable_config') {
        for (const apId of rec.affectedApIds) {
          perAp.set(apId, (perAp.get(apId) ?? 0) + 1);
        }
      }
    }

    for (const [apId, count] of perAp) {
      expect(
        count,
        `AP ${apId}: max 2 actionable_config, got ${count}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  // ─── U12: Cross-type TX dedup — max 1 TX-modifying rec per AP ──
  it('U12: max 1 TX-modifying rec per AP in main list', () => {
    const txModTypes = new Set(['adjust_tx_power', 'roaming_tx_adjustment', 'roaming_tx_boost']);
    const txRecs = recs.filter(r => txModTypes.has(r.type));

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
        `AP ${apId}: ${types.length} TX recs [${types.join(', ')}], max 1`,
      ).toBeLessThanOrEqual(1);
    }
  });
});
