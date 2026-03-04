/**
 * Constraint validation and feasibility scoring for the recommendation engine.
 *
 * Handles hard constraints (forbidden, capability restrictions) and soft
 * constraints (discouraged zones, preference bonuses). Provides functions
 * to compute feasibility, effort, and risk scores for recommendations.
 */

import type {
  APCapabilities,
  ConstraintZone,
  RecommendationContext,
  Recommendation,
  RecommendationType,
  RejectionReason,
  RecommendationRejection,
  DerivedConstraint,
} from './types';
import { DEFAULT_AP_CAPABILITIES, EFFORT_LEVELS, EFFORT_SCORES } from './types';
import { getConstraintsAtPoint } from './candidates';

// ─── AP Capabilities ──────────────────────────────────────────────

/**
 * Get capabilities for an AP, falling back to defaults if not specified.
 */
export function getCapabilities(
  apId: string,
  ctx: RecommendationContext,
): APCapabilities {
  const custom = ctx.apCapabilities.get(apId);
  if (custom) return custom;
  return { apId, ...DEFAULT_AP_CAPABILITIES };
}

/**
 * Check if a specific action is allowed for an AP.
 */
export function isActionAllowed(
  apId: string,
  action: RecommendationType,
  band: '2.4ghz' | '5ghz' | '6ghz',
  ctx: RecommendationContext,
): boolean {
  const caps = getCapabilities(apId, ctx);

  switch (action) {
    case 'move_ap':
      return caps.canMove;
    case 'rotate_ap':
      return caps.canRotate;
    case 'change_mounting':
      return caps.canChangeMounting;
    case 'adjust_tx_power':
      return band === '2.4ghz' ? caps.canChangeTxPower24 : caps.canChangeTxPower5;
    case 'change_channel':
      return band === '2.4ghz' ? caps.canChangeChannel24 : caps.canChangeChannel5;
    default:
      return true;
  }
}

// ─── Constraint Zone Checks ───────────────────────────────────────

/**
 * Check if a position is in a no-move zone.
 */
export function isInNoMoveZone(
  x: number,
  y: number,
  zones: ConstraintZone[],
): boolean {
  return getConstraintsAtPoint(x, y, zones).some(z => z.type === 'no_move');
}

/**
 * Compute a constraint penalty for a position (0 = no penalty, higher = worse).
 */
export function computeConstraintPenalty(
  x: number,
  y: number,
  zones: ConstraintZone[],
): number {
  const constraints = getConstraintsAtPoint(x, y, zones);
  let penalty = 0;

  for (const z of constraints) {
    switch (z.type) {
      case 'forbidden':
        return 100; // Hard block
      case 'discouraged':
        penalty += 30 * z.weight;
        break;
      case 'preferred':
        penalty -= 15 * z.weight; // Negative penalty = bonus
        break;
      case 'low_priority':
        penalty += 10 * z.weight;
        break;
      case 'high_priority':
        penalty -= 10 * z.weight;
        break;
    }
  }

  return Math.max(0, penalty);
}

// ─── Feasibility Scoring ──────────────────────────────────────────

/**
 * Compute feasibility score for a recommendation (0-100, higher = more feasible).
 * Considers AP capabilities, constraint zones, and infrastructure availability.
 */
export function computeFeasibilityScore(
  rec: Recommendation,
  ctx: RecommendationContext,
): number {
  let score = 100;

  // Check AP capabilities
  for (const apId of rec.affectedApIds) {
    if (!isActionAllowed(apId, rec.type, rec.affectedBand as '2.4ghz' | '5ghz' | '6ghz', ctx)) {
      score -= 80; // Major penalty for capability violation
    }
  }

  // Check constraint zones for position-based recommendations
  if (rec.selectedCandidatePosition) {
    const penalty = computeConstraintPenalty(
      rec.selectedCandidatePosition.x,
      rec.selectedCandidatePosition.y,
      ctx.constraintZones,
    );
    score -= penalty;
  }

  // Infrastructure requirements reduce feasibility
  if (rec.infrastructureRequired) {
    score -= 25;
  }

  // Previous rejections of similar recommendations reduce feasibility
  const similarRejections = ctx.rejections.filter(r => {
    if (!r.derivedConstraints) return false;
    return r.derivedConstraints.some(c =>
      rec.affectedApIds.includes(c.apId ?? '') ||
      (rec.selectedCandidatePosition && c.position &&
        Math.abs(rec.selectedCandidatePosition.x - c.position.x) < 1 &&
        Math.abs(rec.selectedCandidatePosition.y - c.position.y) < 1),
    );
  });
  score -= similarRejections.length * 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute effort score for a recommendation (0-100, higher = more effort).
 */
export function computeEffortScore(rec: Recommendation): number {
  const baseEffort = EFFORT_SCORES[EFFORT_LEVELS[rec.type] ?? 'config'];
  let effort = baseEffort;

  if (rec.infrastructureRequired) {
    effort = Math.max(effort, 80);
  }

  // Distance-based effort for physical changes
  if (rec.distanceToIdeal !== undefined && rec.distanceToIdeal > 3) {
    effort += Math.min(20, rec.distanceToIdeal * 2);
  }

  return Math.max(0, Math.min(100, effort));
}

/**
 * Compute risk score for a recommendation (0-100, higher = riskier).
 * Based on how likely the change is to negatively impact other areas.
 */
export function computeRiskScore(rec: Recommendation): number {
  let risk = 0;

  // Moving an AP can affect large areas
  if (rec.type === 'move_ap') risk += 30;
  // Adding an AP is moderate risk (could create overlap)
  if (rec.type === 'add_ap') risk += 20;
  // TX power changes affect radius
  if (rec.type === 'adjust_tx_power') risk += 15;
  // Channel changes are low risk
  if (rec.type === 'change_channel') risk += 5;
  // Rotation is low risk
  if (rec.type === 'rotate_ap') risk += 10;
  // Mounting change is moderate
  if (rec.type === 'change_mounting') risk += 25;

  // If simulation shows regression in any bin, increase risk
  if (rec.simulatedDelta) {
    const before = rec.simulatedDelta.coverageBefore;
    const after = rec.simulatedDelta.coverageAfter;
    if (after.excellent < before.excellent - 5) risk += 15;
    if (after.good < before.good - 5) risk += 10;
    if (after.none > before.none + 5) risk += 20;
  }

  return Math.max(0, Math.min(100, risk));
}

/**
 * Compute infrastructure cost score (0-100).
 */
export function computeInfrastructureCostScore(rec: Recommendation): number {
  if (!rec.infrastructureRequired) return 0;

  let cost = 50; // Base cost for any infrastructure work

  if (rec.type === 'add_ap') cost += 30;
  if (rec.distanceToIdeal !== undefined && rec.distanceToIdeal > 5) cost += 10;

  return Math.max(0, Math.min(100, cost));
}

/**
 * Compute the combined recommendation score.
 * Balances benefit against effort, feasibility, risk, and infrastructure cost.
 */
export function computeRecommendationScore(rec: Recommendation): number {
  const benefit = rec.benefitScore ?? 50;
  const effort = rec.effortScore ?? 50;
  const feasibility = rec.feasibilityScore ?? 100;
  const risk = rec.riskScore ?? 0;
  const infraCost = rec.infrastructureCostScore ?? 0;

  // Weighted combination — no artificial offset
  let raw = benefit * 0.40 + feasibility * 0.25 - effort * 0.15 - risk * 0.10 - infraCost * 0.10;

  // Severity boost: critical +8, warning +4
  if (rec.severity === 'critical') raw += 8;
  else if (rec.severity === 'warning') raw += 4;

  // Priority boost: high +5, medium +2
  if (rec.priority === 'high') raw += 5;
  else if (rec.priority === 'medium') raw += 2;

  return Math.max(0, Math.min(100, raw));
}

// ─── Rejection Handling ───────────────────────────────────────────

/**
 * Derive constraints from a user rejection.
 * Returns constraint updates that should be applied before re-running analysis.
 */
export function deriveConstraintsFromRejection(
  rejection: RecommendationRejection,
  recommendation: Recommendation,
): DerivedConstraint[] {
  const constraints: DerivedConstraint[] = [];

  switch (rejection.reason) {
    case 'no_lan':
    case 'no_poe':
      if (recommendation.selectedCandidatePosition) {
        constraints.push({
          type: 'forbid_candidate',
          position: recommendation.selectedCandidatePosition,
        });
      }
      break;

    case 'mounting_not_possible':
      if (recommendation.affectedApIds.length > 0) {
        constraints.push({
          type: 'forbid_mounting',
          apId: recommendation.affectedApIds[0],
        });
      }
      break;

    case 'position_forbidden':
      if (recommendation.selectedCandidatePosition) {
        constraints.push({
          type: 'forbid_position',
          position: recommendation.selectedCandidatePosition,
        });
      }
      break;

    case 'ap_cannot_move':
      for (const apId of recommendation.affectedApIds) {
        constraints.push({ type: 'forbid_move', apId });
      }
      break;

    case 'ap_cannot_rotate':
      for (const apId of recommendation.affectedApIds) {
        constraints.push({ type: 'forbid_rotate', apId });
      }
      break;

    case 'not_desired':
      // Generic rejection: forbid the specific candidate/position
      if (recommendation.selectedCandidatePosition) {
        constraints.push({
          type: 'forbid_position',
          position: recommendation.selectedCandidatePosition,
        });
      }
      break;

    case 'other':
      // Generic rejection: forbid this specific recommendation type for this AP
      for (const apId of recommendation.affectedApIds) {
        constraints.push({ type: 'forbid_move', apId });
      }
      if (recommendation.selectedCandidatePosition) {
        constraints.push({
          type: 'forbid_position',
          position: recommendation.selectedCandidatePosition,
        });
      }
      break;
  }

  return constraints;
}

/**
 * Apply derived constraints to the recommendation context.
 * Returns a new context with updated constraints and capabilities.
 */
export function applyRejection(
  ctx: RecommendationContext,
  rejection: RecommendationRejection,
  recommendation: Recommendation,
): RecommendationContext {
  const derived = deriveConstraintsFromRejection(rejection, recommendation);
  const rejectionWithDerived: RecommendationRejection = {
    ...rejection,
    derivedConstraints: derived,
  };

  const newCapabilities = new Map(ctx.apCapabilities);
  const newZones = [...ctx.constraintZones];
  const newCandidates = [...ctx.candidates];

  for (const constraint of derived) {
    switch (constraint.type) {
      case 'forbid_move':
        if (constraint.apId) {
          const caps = newCapabilities.get(constraint.apId) ?? {
            apId: constraint.apId,
            ...DEFAULT_AP_CAPABILITIES,
          };
          newCapabilities.set(constraint.apId, { ...caps, canMove: false });
        }
        break;

      case 'forbid_rotate':
        if (constraint.apId) {
          const caps = newCapabilities.get(constraint.apId) ?? {
            apId: constraint.apId,
            ...DEFAULT_AP_CAPABILITIES,
          };
          newCapabilities.set(constraint.apId, { ...caps, canRotate: false });
        }
        break;

      case 'forbid_mounting':
        if (constraint.apId) {
          const caps = newCapabilities.get(constraint.apId) ?? {
            apId: constraint.apId,
            ...DEFAULT_AP_CAPABILITIES,
          };
          newCapabilities.set(constraint.apId, { ...caps, canChangeMounting: false });
        }
        break;

      case 'forbid_position':
        if (constraint.position) {
          newZones.push({
            id: `rejection-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'forbidden',
            x: constraint.position.x - 0.5,
            y: constraint.position.y - 0.5,
            width: 1.0,
            height: 1.0,
            weight: 1.0,
          });
        }
        break;

      case 'forbid_candidate':
        if (constraint.position) {
          // Mark the closest candidate as forbidden
          let bestDist = Infinity;
          let bestIdx = -1;
          for (let i = 0; i < newCandidates.length; i++) {
            const c = newCandidates[i]!;
            const dist = Math.sqrt(
              (c.x - constraint.position.x) ** 2 +
              (c.y - constraint.position.y) ** 2,
            );
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
          if (bestIdx >= 0 && bestDist < 2) {
            newCandidates[bestIdx] = { ...newCandidates[bestIdx]!, forbidden: true };
          }
        }
        break;
    }
  }

  return {
    candidates: newCandidates,
    constraintZones: newZones,
    apCapabilities: newCapabilities,
    priorityZones: ctx.priorityZones,
    rejections: [...ctx.rejections, rejectionWithDerived],
  };
}

/**
 * Check if a recommendation is blocked by any constraints.
 * Returns an array of blocking reason strings.
 */
export function getBlockingReasons(
  rec: Recommendation,
  ctx: RecommendationContext,
): string[] {
  const reasons: string[] = [];

  for (const apId of rec.affectedApIds) {
    const caps = getCapabilities(apId, ctx);

    if (rec.type === 'move_ap' && !caps.canMove) {
      reasons.push(`AP ${apId}: movement not allowed`);
    }
    if (rec.type === 'rotate_ap' && !caps.canRotate) {
      reasons.push(`AP ${apId}: rotation not allowed`);
    }
    if (rec.type === 'change_mounting' && !caps.canChangeMounting) {
      reasons.push(`AP ${apId}: mounting change not allowed`);
    }
    if (rec.type === 'adjust_tx_power') {
      const band = rec.affectedBand;
      if (band === '2.4ghz' && !caps.canChangeTxPower24) {
        reasons.push(`AP ${apId}: TX power change (2.4 GHz) not allowed`);
      }
      if ((band === '5ghz' || band === '6ghz') && !caps.canChangeTxPower5) {
        reasons.push(`AP ${apId}: TX power change (5 GHz) not allowed`);
      }
    }
    if (rec.type === 'change_channel') {
      const band = rec.affectedBand;
      if (band === '2.4ghz' && !caps.canChangeChannel24) {
        reasons.push(`AP ${apId}: channel change (2.4 GHz) not allowed`);
      }
      if ((band === '5ghz' || band === '6ghz') && !caps.canChangeChannel5) {
        reasons.push(`AP ${apId}: channel change (5 GHz) not allowed`);
      }
    }
  }

  // Check position constraints
  if (rec.selectedCandidatePosition) {
    const zoneBlocks = getConstraintsAtPoint(
      rec.selectedCandidatePosition.x,
      rec.selectedCandidatePosition.y,
      ctx.constraintZones,
    );
    for (const zone of zoneBlocks) {
      if (zone.type === 'forbidden') {
        reasons.push(`Position in forbidden zone: ${zone.notes ?? zone.id}`);
      }
    }
  }

  return reasons;
}
