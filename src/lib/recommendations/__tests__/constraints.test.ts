/**
 * Unit tests for the constraint validation module.
 */

import { describe, it, expect } from 'vitest';
import {
  getCapabilities,
  isActionAllowed,
  computeFeasibilityScore,
  computeEffortScore,
  computeRiskScore,
  computeRecommendationScore,
  deriveConstraintsFromRejection,
  applyRejection,
  getBlockingReasons,
} from '../constraints';
import type {
  RecommendationContext,
  APCapabilities,
  Recommendation,
  RecommendationRejection,
} from '../types';
import { DEFAULT_AP_CAPABILITIES, EMPTY_CONTEXT } from '../types';

function makeCtx(overrides?: Partial<RecommendationContext>): RecommendationContext {
  return { ...EMPTY_CONTEXT, ...overrides };
}

function makeRec(type: Recommendation['type'], overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: 'test-1',
    type,
    priority: 'medium',
    severity: 'warning',
    titleKey: 'test',
    titleParams: {},
    reasonKey: 'test',
    reasonParams: {},
    affectedApIds: ['ap-1'],
    affectedBand: '5ghz',
    evidence: { metrics: {} },
    confidence: 0.8,
    ...overrides,
  };
}

describe('getCapabilities', () => {
  it('should return defaults when no custom capabilities', () => {
    const ctx = makeCtx();
    const caps = getCapabilities('ap-1', ctx);
    expect(caps.canMove).toBe(true);
    expect(caps.canRotate).toBe(true);
  });

  it('should return custom capabilities when set', () => {
    const custom: APCapabilities = {
      apId: 'ap-1',
      ...DEFAULT_AP_CAPABILITIES,
      canMove: false,
      canRotate: false,
    };
    const ctx = makeCtx({ apCapabilities: new Map([['ap-1', custom]]) });
    const caps = getCapabilities('ap-1', ctx);
    expect(caps.canMove).toBe(false);
    expect(caps.canRotate).toBe(false);
  });
});

describe('isActionAllowed', () => {
  it('should block move_ap when canMove is false', () => {
    const custom: APCapabilities = {
      apId: 'ap-1',
      ...DEFAULT_AP_CAPABILITIES,
      canMove: false,
    };
    const ctx = makeCtx({ apCapabilities: new Map([['ap-1', custom]]) });
    expect(isActionAllowed('ap-1', 'move_ap', '5ghz', ctx)).toBe(false);
  });

  it('should allow change_channel by default', () => {
    const ctx = makeCtx();
    expect(isActionAllowed('ap-1', 'change_channel', '5ghz', ctx)).toBe(true);
  });

  it('should block change_channel when capability restricted', () => {
    const custom: APCapabilities = {
      apId: 'ap-1',
      ...DEFAULT_AP_CAPABILITIES,
      canChangeChannel5: false,
    };
    const ctx = makeCtx({ apCapabilities: new Map([['ap-1', custom]]) });
    expect(isActionAllowed('ap-1', 'change_channel', '5ghz', ctx)).toBe(false);
  });
});

describe('computeEffortScore', () => {
  it('should rate config changes as low effort', () => {
    const rec = makeRec('change_channel');
    const score = computeEffortScore(rec);
    expect(score).toBeLessThanOrEqual(20);
  });

  it('should rate add_ap as high effort', () => {
    const rec = makeRec('add_ap', { infrastructureRequired: true });
    const score = computeEffortScore(rec);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('should rate move_ap as moderate effort', () => {
    const rec = makeRec('move_ap');
    const score = computeEffortScore(rec);
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(80);
  });
});

describe('computeRiskScore', () => {
  it('should rate channel change as low risk', () => {
    const rec = makeRec('change_channel');
    const score = computeRiskScore(rec);
    expect(score).toBeLessThanOrEqual(15);
  });

  it('should rate move_ap as higher risk', () => {
    const rec = makeRec('move_ap');
    const score = computeRiskScore(rec);
    expect(score).toBeGreaterThan(15);
  });
});

describe('computeRecommendationScore', () => {
  it('should produce a score in valid range', () => {
    const rec = makeRec('change_channel', {
      benefitScore: 70,
      effortScore: 10,
      feasibilityScore: 90,
      riskScore: 5,
      infrastructureCostScore: 0,
    });
    const score = computeRecommendationScore(rec);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should rank feasible+low-effort higher than infeasible+high-effort', () => {
    const easy = makeRec('change_channel', {
      benefitScore: 50,
      effortScore: 10,
      feasibilityScore: 95,
      riskScore: 5,
      infrastructureCostScore: 0,
    });
    const hard = makeRec('add_ap', {
      benefitScore: 60,
      effortScore: 90,
      feasibilityScore: 30,
      riskScore: 40,
      infrastructureCostScore: 80,
    });
    expect(computeRecommendationScore(easy)).toBeGreaterThan(computeRecommendationScore(hard));
  });
});

describe('deriveConstraintsFromRejection', () => {
  it('should derive forbid_move from ap_cannot_move rejection', () => {
    const rec = makeRec('move_ap');
    const rejection: RecommendationRejection = {
      recommendationId: rec.id,
      reason: 'ap_cannot_move',
    };
    const derived = deriveConstraintsFromRejection(rejection, rec);
    expect(derived.length).toBe(1);
    expect(derived[0]!.type).toBe('forbid_move');
    expect(derived[0]!.apId).toBe('ap-1');
  });

  it('should derive forbid_position from position_forbidden rejection', () => {
    const rec = makeRec('add_ap', {
      selectedCandidatePosition: { x: 5, y: 5 },
    });
    const rejection: RecommendationRejection = {
      recommendationId: rec.id,
      reason: 'position_forbidden',
    };
    const derived = deriveConstraintsFromRejection(rejection, rec);
    expect(derived.length).toBe(1);
    expect(derived[0]!.type).toBe('forbid_position');
  });
});

describe('applyRejection', () => {
  it('should update AP capabilities after ap_cannot_move rejection', () => {
    const ctx = makeCtx();
    const rec = makeRec('move_ap');
    const rejection: RecommendationRejection = {
      recommendationId: rec.id,
      reason: 'ap_cannot_move',
    };

    const newCtx = applyRejection(ctx, rejection, rec);
    const caps = newCtx.apCapabilities.get('ap-1');
    expect(caps?.canMove).toBe(false);
  });

  it('should add forbidden zone after position_forbidden rejection', () => {
    const ctx = makeCtx();
    const rec = makeRec('add_ap', {
      selectedCandidatePosition: { x: 5, y: 5 },
    });
    const rejection: RecommendationRejection = {
      recommendationId: rec.id,
      reason: 'position_forbidden',
    };

    const newCtx = applyRejection(ctx, rejection, rec);
    expect(newCtx.constraintZones.length).toBe(1);
    expect(newCtx.constraintZones[0]!.type).toBe('forbidden');
  });

  it('should accumulate rejections', () => {
    const ctx = makeCtx();
    const rec = makeRec('move_ap');
    const rejection: RecommendationRejection = {
      recommendationId: rec.id,
      reason: 'ap_cannot_move',
    };

    const newCtx = applyRejection(ctx, rejection, rec);
    expect(newCtx.rejections.length).toBe(1);
  });
});

describe('getBlockingReasons', () => {
  it('should detect movement blocked by capabilities', () => {
    const custom: APCapabilities = {
      apId: 'ap-1',
      ...DEFAULT_AP_CAPABILITIES,
      canMove: false,
    };
    const ctx = makeCtx({ apCapabilities: new Map([['ap-1', custom]]) });
    const rec = makeRec('move_ap');

    const reasons = getBlockingReasons(rec, ctx);
    expect(reasons.length).toBe(1);
    expect(reasons[0]).toContain('movement not allowed');
  });

  it('should return empty for allowed actions', () => {
    const ctx = makeCtx();
    const rec = makeRec('change_channel');
    const reasons = getBlockingReasons(rec, ctx);
    expect(reasons.length).toBe(0);
  });
});
