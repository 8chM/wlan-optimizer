/**
 * BU: Apply Sequence Regression — Multi-step correctness.
 *
 * Simulates applying top-N actionable_config recommendations in sequence,
 * then re-running generateRecommendations with the updated APs.
 *
 * Invariants checked after each apply:
 * - BU-1: No ping-pong — no recommendation reverses a parameter just applied
 * - BU-2: Budget caps hold — max 2 actionable_config per AP, max 2 budget notes
 * - BU-3: Candidate invariants stable — no phantom add_ap under required policy
 */

import { describe, it, expect } from 'vitest';
import { generateRecommendations, EVIDENCE_MINIMUMS } from '../generator';
import { mapSuggestedChangeToApUpdate } from '../apFieldMap';
import { RECOMMENDATION_CATEGORIES } from '../types';
import type { Recommendation } from '../types';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { APConfig } from '$lib/heatmap/worker-types';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import { createRf2UserHouse } from './fixtures/create-rf2';
import { createRf3MyHouse } from './fixtures/create-rf3';
import { createRf5UserLiveV2 } from './fixtures/create-rf5';
import { createRf6UserMyhouse } from './fixtures/create-rf6-user-myhouse';

const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);
const MAX_APPLY_STEPS = 3;

interface ApplyStep {
  /** The recommendation that was applied */
  rec: Recommendation;
  /** Parameter that was changed */
  parameter: string;
  /** Value before apply */
  previousValue: string | number;
  /** Value after apply */
  appliedValue: string | number;
  /** Target AP ID */
  apId: string;
}

/**
 * Apply a suggestedChange to cloned AP arrays, returning updated copies.
 * Mutates nothing — returns fresh arrays.
 */
function applyChange(
  aps: APConfig[],
  apResps: AccessPointResponse[],
  rec: Recommendation,
): { aps: APConfig[]; apResps: AccessPointResponse[]; step: ApplyStep | null } {
  const sc = rec.suggestedChange;
  if (!sc || !sc.apId) return { aps: [...aps], apResps: [...apResps], step: null };

  const updates = mapSuggestedChangeToApUpdate(sc.parameter, sc.suggestedValue);
  if (Object.keys(updates).length === 0) return { aps: [...aps], apResps: [...apResps], step: null };

  // Clone and apply to AccessPointResponse
  const newApResps = apResps.map(a => {
    if (a.id !== sc.apId) return { ...a };
    return { ...a, ...updates };
  });

  // Mirror relevant fields to APConfig
  const newAps = aps.map(a => {
    if (a.id !== sc.apId) return { ...a };
    const clone = { ...a };
    // TX power fields
    if ('tx_power_5ghz_dbm' in updates) clone.txPowerDbm = updates.tx_power_5ghz_dbm as number;
    if ('tx_power_24ghz_dbm' in updates) clone.txPowerDbm = updates.tx_power_24ghz_dbm as number;
    if ('tx_power_6ghz_dbm' in updates) clone.txPowerDbm = updates.tx_power_6ghz_dbm as number;
    // Position
    if ('x' in updates) clone.x = updates.x as number;
    if ('y' in updates) clone.y = updates.y as number;
    // Orientation
    if ('orientation_deg' in updates) clone.orientationDeg = updates.orientation_deg as number;
    // Mounting
    if ('mounting' in updates) clone.mounting = updates.mounting as string;
    // Enabled
    if ('enabled' in updates) clone.enabled = updates.enabled as boolean;
    return clone;
  });

  const step: ApplyStep = {
    rec,
    parameter: sc.parameter,
    previousValue: sc.currentValue,
    appliedValue: sc.suggestedValue,
    apId: sc.apId,
  };

  return { aps: newAps, apResps: newApResps, step };
}

/**
 * Run apply sequence: take top-N actionable_config recs, apply them one by one,
 * re-run generateRecommendations after each step.
 */
function runApplySequence(
  fixture: ReturnType<typeof createRf2UserHouse>,
  maxSteps = MAX_APPLY_STEPS,
): { steps: ApplyStep[]; finalRecs: Recommendation[] } {
  let { aps, apResps } = fixture;
  const { walls, bounds, stats, ctx } = fixture;
  const steps: ApplyStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const result = generateRecommendations(
      aps, apResps, walls, bounds, BAND, stats, RF_CONFIG, 'balanced', ctx,
    );

    // Pick first actionable_config with a suggestedChange
    const actionable = result.recommendations.find(
      r => RECOMMENDATION_CATEGORIES[r.type] === 'actionable_config' && r.suggestedChange?.apId,
    );
    if (!actionable) break; // No more actionable recs

    const { aps: newAps, apResps: newApResps, step } = applyChange(aps, apResps, actionable);
    if (!step) break;

    steps.push(step);
    aps = newAps;
    apResps = newApResps;
  }

  // Final run after all applies
  const finalResult = generateRecommendations(
    aps, apResps, walls, bounds, BAND, stats, RF_CONFIG, 'balanced', ctx,
  );

  return { steps, finalRecs: finalResult.recommendations };
}

const FIXTURES = [
  { name: 'RF2', fn: createRf2UserHouse },
  { name: 'RF3', fn: createRf3MyHouse },
  { name: 'RF5', fn: createRf5UserLiveV2 },
  { name: 'RF6', fn: createRf6UserMyhouse },
] as const;

describe('BU: Apply Sequence Regression', () => {
  // ─── BU-1: No ping-pong ──────────────────────────────────────────
  it('BU-1: no recommendation reverses a parameter just applied (ping-pong)', () => {
    for (const { name, fn } of FIXTURES) {
      const fixture = fn();
      const { steps, finalRecs } = runApplySequence(fixture);

      if (steps.length === 0) continue; // No actionable recs in this fixture

      // Build map: apId+parameter → appliedValue
      const applied = new Map<string, string | number>();
      for (const step of steps) {
        applied.set(`${step.apId}|${step.parameter}`, step.appliedValue);
      }

      // Check final recs: no rec should suggest reverting to the previousValue
      const actionableConfig = finalRecs.filter(
        r => RECOMMENDATION_CATEGORIES[r.type] === 'actionable_config' && r.suggestedChange?.apId,
      );

      for (const rec of actionableConfig) {
        const sc = rec.suggestedChange!;
        const key = `${sc.apId}|${sc.parameter}`;
        const appliedVal = applied.get(key);

        if (appliedVal !== undefined) {
          // The parameter was changed in a previous step.
          // The new recommendation must not suggest reverting to the old value.
          const previousStep = steps.find(s => s.apId === sc.apId && s.parameter === sc.parameter);
          if (previousStep) {
            expect(
              String(sc.suggestedValue) !== String(previousStep.previousValue),
              `${name}: ping-pong detected — AP ${sc.apId} param ${sc.parameter}: ` +
              `applied ${appliedVal}, now suggests reverting to ${sc.suggestedValue} ` +
              `(was ${previousStep.previousValue})`,
            ).toBe(true);
          }
        }
      }
    }
  });

  // ─── BU-2: Budget caps hold after apply ───────────────────────────
  it('BU-2: budget caps hold — max 2 actionable_config per AP, max 2 budget notes', () => {
    const BUDGET_NOTES = new Set(['channel_deprioritized_note', 'config_budget_note']);

    for (const { name, fn } of FIXTURES) {
      const fixture = fn();
      const { steps, finalRecs } = runApplySequence(fixture);

      if (steps.length === 0) continue;

      // Check max 2 actionable_config per AP
      const perAp = new Map<string, number>();
      for (const rec of finalRecs) {
        if (RECOMMENDATION_CATEGORIES[rec.type] === 'actionable_config') {
          for (const apId of rec.affectedApIds) {
            perAp.set(apId, (perAp.get(apId) ?? 0) + 1);
          }
        }
      }

      for (const [apId, count] of perAp) {
        expect(
          count,
          `${name} (after ${steps.length} applies): AP ${apId} has ${count} actionable_config, max 2`,
        ).toBeLessThanOrEqual(2);
      }

      // Check max 2 budget notes
      const budgetNotes = finalRecs.filter(r => BUDGET_NOTES.has(r.type));
      expect(
        budgetNotes.length,
        `${name} (after ${steps.length} applies): ${budgetNotes.length} budget notes, max 2`,
      ).toBeLessThanOrEqual(2);
    }
  });

  // ─── BU-3: Candidate invariants stable ────────────────────────────
  it('BU-3: no phantom add_ap under required candidate policy after apply', () => {
    for (const { name, fn } of FIXTURES) {
      const fixture = fn();
      const policy = fixture.ctx?.candidatePolicy;
      if (policy !== 'required_for_new_ap' && policy !== 'required_for_move_and_new_ap') continue;

      const { steps, finalRecs } = runApplySequence(fixture);
      if (steps.length === 0) continue;

      const candidates = fixture.ctx?.candidates ?? [];
      const candidatePositions = candidates.map(c => ({ x: c.x, y: c.y }));

      const addAps = finalRecs.filter(r => r.type === 'add_ap');
      for (const rec of addAps) {
        // Under required policy: must have selectedCandidatePosition
        expect(
          rec.selectedCandidatePosition != null,
          `${name} (after ${steps.length} applies): add_ap ${rec.id} must have selectedCandidatePosition`,
        ).toBe(true);

        if (rec.selectedCandidatePosition) {
          const pos = rec.selectedCandidatePosition;
          const matchesCandidate = candidatePositions.some(
            cp => Math.abs(cp.x - pos.x) < 0.5 && Math.abs(cp.y - pos.y) < 0.5,
          );
          expect(
            matchesCandidate,
            `${name} (after ${steps.length} applies): add_ap ${rec.id} at (${pos.x},${pos.y}) must match a candidate`,
          ).toBe(true);
        }
      }
    }
  });

  // ─── BU-4: EVIDENCE_MINIMUMS hold after apply ────────────────────
  it('BU-4: all recs after apply satisfy EVIDENCE_MINIMUMS', () => {
    for (const { name, fn } of FIXTURES) {
      const fixture = fn();
      const { steps, finalRecs } = runApplySequence(fixture);

      if (steps.length === 0) continue;

      // Check all final recs (including alternatives)
      const allRecs: Recommendation[] = [];
      for (const rec of finalRecs) {
        allRecs.push(rec);
        if (rec.alternativeRecommendations) {
          allRecs.push(...rec.alternativeRecommendations);
        }
      }

      for (const rec of allRecs) {
        const required = EVIDENCE_MINIMUMS[rec.type];
        if (!required) continue;
        const keys = Object.keys(rec.evidence?.metrics ?? {});
        const hasAtLeastOne = required.some(k => keys.includes(k));
        expect(
          hasAtLeastOne,
          `${name} (after ${steps.length} applies): ${rec.type} (${rec.id}) needs one of [${required.join(', ')}], got [${keys.join(', ')}]`,
        ).toBe(true);
      }
    }
  });
});
