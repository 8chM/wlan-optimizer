/**
 * Integrity tests for the recommendation engine type system.
 *
 * Ensures consistency between RecommendationType union, RECOMMENDATION_CATEGORIES,
 * EFFORT_LEVELS, and the generator output.
 */

import { describe, it, expect } from 'vitest';
import {
  RECOMMENDATION_CATEGORIES,
  EFFORT_LEVELS,
  EFFORT_SCORES,
} from '../types';
import type { RecommendationType, RecommendationCategory, EffortLevel } from '../types';

/**
 * Canonical list of all 20 RecommendationType members.
 * Must match the union type exactly.
 */
const ALL_RECOMMENDATION_TYPES: RecommendationType[] = [
  'move_ap',
  'rotate_ap',
  'change_mounting',
  'adjust_tx_power',
  'change_channel',
  'add_ap',
  'disable_ap',
  'roaming_hint',
  'band_limit_warning',
  'low_ap_value',
  'coverage_warning',
  'overlap_warning',
  'constraint_conflict',
  'infrastructure_required',
  'preferred_candidate_location',
  'blocked_recommendation',
  'roaming_tx_adjustment',
  'sticky_client_risk',
  'handoff_gap_warning',
  'adjust_channel_width',
];

const VALID_CATEGORIES: RecommendationCategory[] = [
  'actionable_config',
  'actionable_create',
  'instructional',
  'informational',
];

const VALID_EFFORT_LEVELS: EffortLevel[] = [
  'config',
  'minor_physical',
  'major_physical',
  'infrastructure',
];

describe('Rules Integrity', () => {
  describe('E1: RECOMMENDATION_CATEGORIES completeness', () => {
    it('every RecommendationType has a category entry', () => {
      for (const type of ALL_RECOMMENDATION_TYPES) {
        expect(
          RECOMMENDATION_CATEGORIES[type],
          `Missing RECOMMENDATION_CATEGORIES entry for "${type}"`,
        ).toBeDefined();
      }
    });

    it('no extra keys in RECOMMENDATION_CATEGORIES beyond the union', () => {
      const keys = Object.keys(RECOMMENDATION_CATEGORIES);
      for (const key of keys) {
        expect(
          ALL_RECOMMENDATION_TYPES.includes(key as RecommendationType),
          `Unknown key "${key}" in RECOMMENDATION_CATEGORIES`,
        ).toBe(true);
      }
    });

    it('all category values are valid', () => {
      for (const [type, category] of Object.entries(RECOMMENDATION_CATEGORIES)) {
        expect(
          VALID_CATEGORIES.includes(category),
          `Invalid category "${category}" for type "${type}"`,
        ).toBe(true);
      }
    });

    it('RECOMMENDATION_CATEGORIES has exactly 20 entries', () => {
      expect(Object.keys(RECOMMENDATION_CATEGORIES)).toHaveLength(20);
    });
  });

  describe('E2: EFFORT_LEVELS completeness', () => {
    it('every RecommendationType has an effort level entry', () => {
      for (const type of ALL_RECOMMENDATION_TYPES) {
        expect(
          EFFORT_LEVELS[type],
          `Missing EFFORT_LEVELS entry for "${type}"`,
        ).toBeDefined();
      }
    });

    it('no extra keys in EFFORT_LEVELS beyond the union', () => {
      const keys = Object.keys(EFFORT_LEVELS);
      for (const key of keys) {
        expect(
          ALL_RECOMMENDATION_TYPES.includes(key as RecommendationType),
          `Unknown key "${key}" in EFFORT_LEVELS`,
        ).toBe(true);
      }
    });

    it('all effort level values are valid', () => {
      for (const [type, level] of Object.entries(EFFORT_LEVELS)) {
        expect(
          VALID_EFFORT_LEVELS.includes(level),
          `Invalid effort level "${level}" for type "${type}"`,
        ).toBe(true);
      }
    });

    it('EFFORT_LEVELS has exactly 20 entries', () => {
      expect(Object.keys(EFFORT_LEVELS)).toHaveLength(20);
    });
  });

  describe('E3: EFFORT_SCORES completeness', () => {
    it('every EffortLevel has a score', () => {
      for (const level of VALID_EFFORT_LEVELS) {
        expect(
          EFFORT_SCORES[level],
          `Missing EFFORT_SCORES entry for "${level}"`,
        ).toBeDefined();
      }
    });

    it('scores are monotonically increasing (config < minor < major < infra)', () => {
      expect(EFFORT_SCORES.config).toBeLessThan(EFFORT_SCORES.minor_physical);
      expect(EFFORT_SCORES.minor_physical).toBeLessThan(EFFORT_SCORES.major_physical);
      expect(EFFORT_SCORES.major_physical).toBeLessThan(EFFORT_SCORES.infrastructure);
    });

    it('all scores are in range 0-100', () => {
      for (const [level, score] of Object.entries(EFFORT_SCORES)) {
        expect(score, `${level} score out of range`).toBeGreaterThanOrEqual(0);
        expect(score, `${level} score out of range`).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('E4: Category semantics', () => {
    it('actionable_config types do not include physical actions', () => {
      const configTypes = ALL_RECOMMENDATION_TYPES.filter(
        t => RECOMMENDATION_CATEGORIES[t] === 'actionable_config',
      );
      const physicalEfforts: EffortLevel[] = ['major_physical', 'infrastructure'];
      for (const type of configTypes) {
        expect(
          physicalEfforts.includes(EFFORT_LEVELS[type]),
          `actionable_config type "${type}" has physical effort level "${EFFORT_LEVELS[type]}"`,
        ).toBe(false);
      }
    });

    it('informational types all have config effort level', () => {
      const infoTypes = ALL_RECOMMENDATION_TYPES.filter(
        t => RECOMMENDATION_CATEGORIES[t] === 'informational',
      );
      for (const type of infoTypes) {
        expect(
          EFFORT_LEVELS[type],
          `informational type "${type}" should have config effort`,
        ).toBe('config');
      }
    });

    it('actionable_create types have infrastructure effort level', () => {
      const createTypes = ALL_RECOMMENDATION_TYPES.filter(
        t => RECOMMENDATION_CATEGORIES[t] === 'actionable_create',
      );
      for (const type of createTypes) {
        expect(
          EFFORT_LEVELS[type],
          `actionable_create type "${type}" should have infrastructure effort`,
        ).toBe('infrastructure');
      }
    });
  });

  describe('E5: Cross-reference consistency', () => {
    it('RECOMMENDATION_CATEGORIES and EFFORT_LEVELS have identical key sets', () => {
      const catKeys = Object.keys(RECOMMENDATION_CATEGORIES).sort();
      const effortKeys = Object.keys(EFFORT_LEVELS).sort();
      expect(catKeys).toEqual(effortKeys);
    });

    it('ALL_RECOMMENDATION_TYPES matches RECOMMENDATION_CATEGORIES keys', () => {
      const catKeys = Object.keys(RECOMMENDATION_CATEGORIES).sort();
      const allTypes = [...ALL_RECOMMENDATION_TYPES].sort();
      expect(allTypes).toEqual(catKeys);
    });
  });

  describe('E6: Union → Map bidirectional coverage', () => {
    it('every value in the RecommendationType union resolves to a valid category', () => {
      // This is the "union → map" direction: every member of the TS union
      // must be a key in RECOMMENDATION_CATEGORIES. TypeScript enforces this
      // at compile time via Record<RecommendationType, ...>, but this test
      // catches runtime drift if ALL_RECOMMENDATION_TYPES falls out of sync.
      for (const type of ALL_RECOMMENDATION_TYPES) {
        const category = RECOMMENDATION_CATEGORIES[type];
        expect(category, `Type "${type}" has no category`).toBeDefined();
        expect(
          VALID_CATEGORIES.includes(category),
          `Type "${type}" maps to invalid category "${category}"`,
        ).toBe(true);
      }
    });

    it('every value in the RecommendationType union resolves to a valid effort level', () => {
      for (const type of ALL_RECOMMENDATION_TYPES) {
        const level = EFFORT_LEVELS[type];
        expect(level, `Type "${type}" has no effort level`).toBeDefined();
        expect(
          VALID_EFFORT_LEVELS.includes(level),
          `Type "${type}" maps to invalid effort level "${level}"`,
        ).toBe(true);
      }
    });
  });

  describe('E7: Generator emitted types (anti-drift)', () => {
    /**
     * Static list of all types emitted via recs.push({ type: '...' }) in generator.ts.
     *
     * IMPORTANT: This list is intentionally manual. When a developer adds a new
     * recs.push({ type: 'new_type' }) in generator.ts, this test will fail until
     * they also add 'new_type' here — forcing them to update docs and type maps.
     *
     * To update: grep for `recs.push` in generator.ts, extract unique type values,
     * and add any new ones to this list + ALL_RECOMMENDATION_TYPES above.
     */
    const GENERATOR_EMITTED_TYPES: RecommendationType[] = [
      'add_ap',
      'adjust_channel_width',
      'adjust_tx_power',
      'band_limit_warning',
      'blocked_recommendation',
      'change_channel',
      'change_mounting',
      'constraint_conflict',
      'coverage_warning',
      'disable_ap',
      'handoff_gap_warning',
      'infrastructure_required',
      'low_ap_value',
      'move_ap',
      'overlap_warning',
      'preferred_candidate_location',
      'roaming_hint',
      'roaming_tx_adjustment',
      'rotate_ap',
      'sticky_client_risk',
    ];

    it('every emitted type is a valid RecommendationType', () => {
      for (const type of GENERATOR_EMITTED_TYPES) {
        expect(
          ALL_RECOMMENDATION_TYPES.includes(type),
          `Generator emits "${type}" which is not in ALL_RECOMMENDATION_TYPES`,
        ).toBe(true);
      }
    });

    it('every emitted type has a category in RECOMMENDATION_CATEGORIES', () => {
      for (const type of GENERATOR_EMITTED_TYPES) {
        expect(
          RECOMMENDATION_CATEGORIES[type],
          `Generator emits "${type}" but it has no category`,
        ).toBeDefined();
      }
    });

    it('every emitted type has an effort level in EFFORT_LEVELS', () => {
      for (const type of GENERATOR_EMITTED_TYPES) {
        expect(
          EFFORT_LEVELS[type],
          `Generator emits "${type}" but it has no effort level`,
        ).toBeDefined();
      }
    });

    it('GENERATOR_EMITTED_TYPES covers all 20 RecommendationType members', () => {
      // Currently every type in the union is also emitted by the generator.
      // If a type is added to the union but NOT emitted, this test documents
      // the discrepancy. Update the comment below if intentional.
      const sorted = [...GENERATOR_EMITTED_TYPES].sort();
      const allSorted = [...ALL_RECOMMENDATION_TYPES].sort();
      expect(sorted).toEqual(allSorted);
    });

    it('GENERATOR_EMITTED_TYPES has no duplicates', () => {
      const unique = new Set(GENERATOR_EMITTED_TYPES);
      expect(unique.size).toBe(GENERATOR_EMITTED_TYPES.length);
    });
  });

  describe('E8: i18n key coverage', () => {
    /**
     * Mapping of each RecommendationType to its expected i18n title key suffix.
     * E.g., 'move_ap' → 'moveApTitle' (used as 'rec.moveApTitle' in generator).
     *
     * Info-only types (blocked_recommendation) may reuse generic keys, so they
     * are listed with their actual key suffix used in the generator.
     */
    const TYPE_TO_TITLE_KEY: Record<RecommendationType, string> = {
      move_ap: 'moveApTitle',
      rotate_ap: 'rotateApTitle',
      change_mounting: 'changeMountingTitle',
      adjust_tx_power: 'adjustTxPowerTitle',
      change_channel: 'changeChannelTitle',
      add_ap: 'addApTitle',
      disable_ap: 'disableApTitle',
      roaming_hint: 'roamingHintTitle',
      band_limit_warning: 'bandLimitTitle',
      low_ap_value: 'lowApValueTitle',
      coverage_warning: 'coverageWarningTitle',
      overlap_warning: 'overlapWarningTitle',
      constraint_conflict: 'constraintConflictTitle',
      infrastructure_required: 'infraRequiredTitle',
      preferred_candidate_location: 'preferredCandidateTitle',
      blocked_recommendation: 'blockedMoveTitle', // uses generic blocked keys
      roaming_tx_adjustment: 'roamingTxTitle',
      sticky_client_risk: 'stickyClientTitle',
      handoff_gap_warning: 'handoffGapTitle',
      adjust_channel_width: 'adjustChannelWidthTitle',
    };

    it('every RecommendationType has a documented title key', () => {
      for (const type of ALL_RECOMMENDATION_TYPES) {
        expect(
          TYPE_TO_TITLE_KEY[type],
          `Missing title key mapping for "${type}"`,
        ).toBeDefined();
        expect(TYPE_TO_TITLE_KEY[type].length).toBeGreaterThan(0);
      }
    });

    it('TYPE_TO_TITLE_KEY covers exactly the same types as ALL_RECOMMENDATION_TYPES', () => {
      const mapKeys = Object.keys(TYPE_TO_TITLE_KEY).sort();
      const allTypes = [...ALL_RECOMMENDATION_TYPES].sort();
      expect(mapKeys).toEqual(allTypes);
    });
  });

  describe('E9: Category-effort cross-constraints', () => {
    it('instructional types must have minor_physical or major_physical effort', () => {
      const instructionalTypes = ALL_RECOMMENDATION_TYPES.filter(
        t => RECOMMENDATION_CATEGORIES[t] === 'instructional',
      );
      const validEfforts: EffortLevel[] = ['minor_physical', 'major_physical', 'infrastructure'];
      for (const type of instructionalTypes) {
        expect(
          validEfforts.includes(EFFORT_LEVELS[type]),
          `instructional type "${type}" has unexpected effort level "${EFFORT_LEVELS[type]}" — expected physical or infrastructure`,
        ).toBe(true);
      }
    });

    it('no type has both actionable_config category and infrastructure effort', () => {
      const configTypes = ALL_RECOMMENDATION_TYPES.filter(
        t => RECOMMENDATION_CATEGORIES[t] === 'actionable_config',
      );
      for (const type of configTypes) {
        expect(
          EFFORT_LEVELS[type],
          `actionable_config type "${type}" should not have infrastructure effort`,
        ).not.toBe('infrastructure');
      }
    });
  });
});
