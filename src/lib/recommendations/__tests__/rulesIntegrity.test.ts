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
});
