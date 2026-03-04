/**
 * Candidate Location logic for the recommendation engine.
 *
 * Matches ideal RF target positions to feasible real-world installation
 * locations, respecting infrastructure (LAN, PoE, power), mounting
 * constraints, and user preferences.
 */

import type {
  CandidateLocation,
  ConstraintZone,
} from './types';
import type { WallData } from '$lib/heatmap/worker-types';

/** Result of matching an ideal target to the best candidate */
export interface CandidateMatch {
  /** Selected candidate (null if no valid candidate found) */
  candidate: CandidateLocation | null;
  /** Distance from ideal target to selected candidate in meters */
  distanceToIdeal: number;
  /** Why this candidate was selected */
  selectedBecause: string;
  /** Score of the selected candidate (0-100, higher = better) */
  candidateScore: number;
  /** All candidates ranked (for alternative display) */
  rankedCandidates: ScoredCandidate[];
  /** Whether infrastructure (new LAN/PoE) would be needed */
  requiresInfrastructure: boolean;
}

/** A candidate with its computed suitability score */
export interface ScoredCandidate {
  candidate: CandidateLocation;
  score: number;
  distance: number;
  reasons: string[];
}

/**
 * Find the best candidate location for an ideal RF target position.
 *
 * Scoring factors:
 * - Distance to ideal target (closer = better)
 * - Infrastructure availability (LAN + PoE preferred)
 * - User preference (preferred locations get bonus)
 * - Mounting options (more options = more flexible)
 * - Constraint zone compliance (forbidden = excluded, discouraged = penalty)
 */
export function findBestCandidate(
  idealX: number,
  idealY: number,
  candidates: CandidateLocation[],
  constraintZones: ConstraintZone[],
  requiredMounting?: 'wall' | 'ceiling',
): CandidateMatch {
  if (candidates.length === 0) {
    return {
      candidate: null,
      distanceToIdeal: Infinity,
      selectedBecause: 'no_candidates_available',
      candidateScore: 0,
      rankedCandidates: [],
      requiresInfrastructure: true,
    };
  }

  const scored: ScoredCandidate[] = [];

  for (const c of candidates) {
    // Hard filter: forbidden candidates
    if (c.forbidden) continue;

    // Hard filter: mounting compatibility
    if (requiredMounting && !c.mountingOptions.includes(requiredMounting)) continue;

    // Check constraint zones at this location
    const zoneConstraints = getConstraintsAtPoint(c.x, c.y, constraintZones);
    if (zoneConstraints.some(z => z.type === 'forbidden' || z.type === 'no_new_ap')) continue;

    const distance = Math.sqrt((c.x - idealX) ** 2 + (c.y - idealY) ** 2);
    const reasons: string[] = [];
    let score = 100;

    // Distance penalty: -2 points per meter from ideal
    const distancePenalty = Math.min(60, distance * 2);
    score -= distancePenalty;
    if (distance < 2) reasons.push('close_to_ideal');
    else if (distance > 5) reasons.push('far_from_ideal');

    // Infrastructure bonus/penalty
    if (c.hasLan && c.hasPoe) {
      score += 15;
      reasons.push('full_infrastructure');
    } else if (c.hasLan) {
      score += 5;
      reasons.push('has_lan');
    } else {
      score -= 20;
      reasons.push('no_lan');
    }

    if (!c.hasPower) {
      score -= 10;
      reasons.push('no_power');
    }

    // Preference bonus
    if (c.preferred) {
      score += 10;
      reasons.push('user_preferred');
    }

    // Mounting flexibility bonus
    if (c.mountingOptions.length >= 2) {
      score += 5;
      reasons.push('flexible_mounting');
    }

    // Soft constraint penalties
    for (const zone of zoneConstraints) {
      if (zone.type === 'discouraged') {
        score -= 15 * zone.weight;
        reasons.push('in_discouraged_zone');
      }
      if (zone.type === 'preferred') {
        score += 10 * zone.weight;
        reasons.push('in_preferred_zone');
      }
      if (zone.type === 'no_ceiling_mount' && requiredMounting === 'ceiling') {
        continue; // Already filtered by hard filter above if required
      }
    }

    // Cable distance penalty
    if (c.maxCableDistanceMeters !== undefined && c.maxCableDistanceMeters > 50) {
      score -= 5;
      reasons.push('long_cable_run');
    }

    scored.push({ candidate: c, score, distance, reasons });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      candidate: null,
      distanceToIdeal: Infinity,
      selectedBecause: 'all_candidates_filtered',
      candidateScore: 0,
      rankedCandidates: [],
      requiresInfrastructure: true,
    };
  }

  const best = scored[0]!;
  const requiresInfra = !best.candidate.hasLan || !best.candidate.hasPoe;

  return {
    candidate: best.candidate,
    distanceToIdeal: best.distance,
    selectedBecause: best.reasons.join(', '),
    candidateScore: best.score,
    rankedCandidates: scored.slice(0, 5),
    requiresInfrastructure: requiresInfra,
  };
}

/**
 * Get all constraint zones that contain a given point.
 */
export function getConstraintsAtPoint(
  x: number,
  y: number,
  zones: ConstraintZone[],
): ConstraintZone[] {
  return zones.filter(z =>
    x >= z.x && x <= z.x + z.width &&
    y >= z.y && y <= z.y + z.height,
  );
}

/**
 * Check if a position is forbidden by constraint zones.
 */
export function isPositionForbidden(
  x: number,
  y: number,
  zones: ConstraintZone[],
): boolean {
  return getConstraintsAtPoint(x, y, zones).some(z => z.type === 'forbidden');
}

/**
 * Check if new APs are allowed at a position.
 */
export function isNewApAllowed(
  x: number,
  y: number,
  zones: ConstraintZone[],
): boolean {
  const constraints = getConstraintsAtPoint(x, y, zones);
  return !constraints.some(z => z.type === 'forbidden' || z.type === 'no_new_ap');
}

/**
 * Get allowed mounting options at a position considering constraint zones.
 */
export function getMountingOptionsAtPoint(
  x: number,
  y: number,
  zones: ConstraintZone[],
  baseMountingOptions: ('wall' | 'ceiling')[] = ['wall', 'ceiling'],
): ('wall' | 'ceiling')[] {
  const constraints = getConstraintsAtPoint(x, y, zones);
  let options = [...baseMountingOptions];

  for (const z of constraints) {
    if (z.type === 'no_ceiling_mount') {
      options = options.filter(o => o !== 'ceiling');
    }
    if (z.type === 'no_wall_mount') {
      options = options.filter(o => o !== 'wall');
    }
  }

  return options;
}

/**
 * Check if movement is allowed for an AP at a given position.
 */
export function isMovementAllowed(
  x: number,
  y: number,
  zones: ConstraintZone[],
): boolean {
  return !getConstraintsAtPoint(x, y, zones).some(z => z.type === 'no_move');
}

// ─── Physical Validation ─────────────────────────────────────────

/** Point-to-segment distance in meters. */
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Check if a position is physically valid (not inside a wall).
 * Returns true if the nearest wall segment is at least minDistance meters away.
 */
export function isPhysicallyValidApPosition(
  x: number,
  y: number,
  walls: WallData[],
  minDistance = 0.3,
): boolean {
  for (const wall of walls) {
    for (const seg of wall.segments) {
      const dist = pointToSegmentDistance(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
      if (dist < minDistance) return false;
    }
  }
  return true;
}
