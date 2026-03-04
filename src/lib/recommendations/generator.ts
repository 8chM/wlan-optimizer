/**
 * Recommendation Generator — Core logic with constraint awareness.
 *
 * Analyzes current heatmap state, generates recommendation candidates
 * respecting constraints and AP capabilities, simulates impact,
 * scores for feasibility, and returns a ranked list with alternatives.
 *
 * Config-first ordering: channel → tx_power → rotate → move → mounting → add_ap
 *
 * Pure function, no side effects.
 */

import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { RFConfig } from '$lib/heatmap/rf-engine';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { AnalysisBand } from '$lib/heatmap/channel-analysis';
import { analyzeChannelConflicts, getRecommendedChannels } from '$lib/heatmap/channel-analysis';
import {
  computeAPMetrics,
  computeOverallScore,
  findWeakZones,
  findOverlapZones,
  findLowValueAPs,
} from './analysis';
import { simulateChange, simulateAddAP, clearSimulatorCache, simulateGrid, scoreFromBins } from './simulator';
import { findBestCandidate, isMovementAllowed, isNewApAllowed, isPhysicallyValidApPosition, getConstraintsAtPoint } from './candidates';
import {
  isActionAllowed,
  getBlockingReasons,
  computeFeasibilityScore,
  computeEffortScore,
  computeRiskScore,
  computeInfrastructureCostScore,
  computeRecommendationScore,
  isInNoMoveZone,
} from './constraints';
import type {
  AnalysisResult,
  APMetrics,
  Recommendation,
  ExpertProfile,
  ScoringWeights,
  WeakZone,
  APModification,
  RecommendationContext,
  CoverageBinPercents,
} from './types';
import { EXPERT_PROFILES, EMPTY_CONTEXT, EFFORT_LEVELS, EFFORT_SCORES } from './types';

let nextRecId = 0;
function genId(): string {
  nextRecId++;
  return `rec-${nextRecId}`;
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Generate all recommendations for the current state.
 *
 * @param ctx - Optional constraint/candidate context. If omitted, no constraints are applied.
 */
export function generateRecommendations(
  aps: APConfig[],
  accessPoints: AccessPointResponse[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  stats: HeatmapStats,
  rfConfig: RFConfig,
  profile: ExpertProfile,
  ctx: RecommendationContext = EMPTY_CONTEXT,
): AnalysisResult {
  const weights = EXPERT_PROFILES[profile];
  const apIds = stats.apIds ?? aps.map(a => a.id);
  const totalCells = stats.totalCells ?? 0;
  const gridStep = stats.gridStep ?? 0.25;
  const originX = bounds.originX ?? 0;
  const originY = bounds.originY ?? 0;

  // Clear simulator cache at start of each analysis run
  clearSimulatorCache();

  // Channel analysis
  const analysisBand: AnalysisBand = band === '6ghz' ? '5ghz' : band as AnalysisBand;
  const channelAnalysis = analyzeChannelConflicts(accessPoints, analysisBand);

  // Per-AP metrics
  const apMetrics = computeAPMetrics(stats, apIds, channelAnalysis);

  // Overall score (with priority zone weighting)
  const score = computeOverallScore(stats, apMetrics, channelAnalysis, weights, band, ctx.priorityZones);

  // Find problem zones (with priority zone weighting)
  const weakZones = findWeakZones(stats, band, originX, originY, ctx.priorityZones);
  const overlapZones = findOverlapZones(stats, originX, originY);
  const lowValueApIds = findLowValueAPs(apMetrics);

  // Build AP label lookup (show user-assigned names instead of UUIDs)
  const apLabelMap = new Map<string, string>();
  for (const ap of accessPoints) {
    apLabelMap.set(ap.id, ap.label || ap.id.slice(0, 8));
  }
  const apLabel = (id: string): string => apLabelMap.get(id) ?? id.slice(0, 8);

  // Generate recommendations — CONFIG-FIRST ordering
  const recommendations: Recommendation[] = [];

  // 1. Channel changes (lowest effort, pure config)
  generateChannelRecommendations(
    recommendations, channelAnalysis, accessPoints, band, ctx, apLabel,
  );

  // 2. TX power adjustments (config, no physical change)
  generateTxPowerSuggestions(
    recommendations, apMetrics, aps, walls, bounds, band, rfConfig, weights, totalCells, gridStep, ctx, apLabel,
  );

  // 3. Coverage warnings (informational)
  generateCoverageWarnings(recommendations, stats, weakZones, totalCells, band, gridStep);

  // 4. Rotate AP suggestions (minor physical)
  generateRotateApSuggestions(
    recommendations, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx, apLabel,
  );

  // 5. Move AP suggestions (major physical)
  generateMoveApSuggestions(
    recommendations, apMetrics, weakZones, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx, apLabel, stats,
  );

  // 6. Change mounting suggestions (major physical)
  generateMountingSuggestions(
    recommendations, apMetrics, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx, apLabel,
  );

  // 7. Add AP suggestions (infrastructure)
  generateAddApSuggestions(
    recommendations, weakZones, aps, walls, bounds, band, rfConfig, weights, totalCells, gridStep, ctx, stats, apMetrics,
  );

  // 8. Roaming hints (informational)
  generateRoamingHints(recommendations, stats, totalCells, band, gridStep);

  // 9. Low-value AP warnings
  generateLowValueWarnings(recommendations, lowValueApIds, apMetrics, band, apLabel);

  // 10. Overlap warnings
  generateOverlapWarnings(recommendations, overlapZones, totalCells, band, gridStep);

  // 11. Disable AP suggestions
  generateDisableApSuggestions(recommendations, apMetrics, aps, walls, bounds, band, rfConfig, weights, totalCells, apLabel);

  // 12. Band limit warnings
  generateBandLimitWarnings(recommendations, stats, band, totalCells);

  // 13. Constraint conflict warnings
  generateConstraintConflictWarnings(recommendations, aps, band, ctx, apLabel);

  // 14. Preferred candidate location suggestions
  generatePreferredCandidateSuggestions(recommendations, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx);

  // Deduplicate: max 1 physical recommendation per AP, rest as alternatives
  const deduped = deduplicateRecommendations(recommendations);
  recommendations.length = 0;
  recommendations.push(...deduped);

  // Compute feasibility scores for all recommendations
  for (const rec of recommendations) {
    enrichWithFeasibilityScores(rec, ctx);
  }

  // Check for blocked recommendations and annotate
  annotateBlockedRecommendations(recommendations, ctx);

  // Sort by recommendationScore (factoring in feasibility), then priority, then severity
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  recommendations.sort((a, b) => {
    // Blocked recommendations go last
    const aBlocked = (a.blockedByConstraints?.length ?? 0) > 0;
    const bBlocked = (b.blockedByConstraints?.length ?? 0) > 0;
    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;

    // Sort by recommendation score (higher = better)
    const aScore = a.recommendationScore ?? 50;
    const bScore = b.recommendationScore ?? 50;
    if (Math.abs(aScore - bScore) > 5) return bScore - aScore;

    // Fallback: priority then severity
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return {
    ...score,
    apMetrics,
    recommendations,
    profile,
    band,
  };
}

// ─── Feasibility Enrichment ──────────────────────────────────────

/** Informational types: not actionable, should not compete with actionable recommendations */
const INFORMATIONAL_TYPES = new Set([
  'coverage_warning', 'band_limit_warning', 'roaming_hint',
  'overlap_warning', 'low_ap_value',
]);

function enrichWithFeasibilityScores(rec: Recommendation, ctx: RecommendationContext): void {
  // Informational types get zero benefit/effort — sorted by severity/priority instead
  if (INFORMATIONAL_TYPES.has(rec.type)) {
    rec.benefitScore = 0;
    rec.effortScore = 0;
    rec.feasibilityScore = 100;
    rec.riskScore = 0;
    rec.infrastructureCostScore = 0;
    rec.recommendationScore = 0;
    return;
  }

  // Benefit score from simulation delta
  if (rec.simulatedDelta) {
    rec.benefitScore = Math.max(0, Math.min(100, rec.simulatedDelta.changePercent * 5 + 50));
  } else {
    rec.benefitScore = rec.confidence * 60;
  }

  rec.effortScore = computeEffortScore(rec);
  rec.feasibilityScore = computeFeasibilityScore(rec, ctx);
  rec.riskScore = computeRiskScore(rec);
  rec.infrastructureCostScore = computeInfrastructureCostScore(rec);
  rec.recommendationScore = computeRecommendationScore(rec);
}

function annotateBlockedRecommendations(recs: Recommendation[], ctx: RecommendationContext): void {
  for (const rec of recs) {
    const reasons = getBlockingReasons(rec, ctx);
    if (reasons.length > 0) {
      rec.blockedByConstraints = reasons;
      rec.feasibilityScore = 0;
      rec.recommendationScore = computeRecommendationScore(rec);
    }
  }
}

// ─── Recommendation Generators ────────────────────────────────────

function generateCoverageWarnings(
  recs: Recommendation[],
  stats: HeatmapStats,
  weakZones: WeakZone[],
  totalCells: number,
  band: FrequencyBand,
  gridStep: number,
): void {
  if (weakZones.length === 0 || totalCells === 0) return;

  const totalWeakCells = weakZones.reduce((sum, z) => sum + z.cellCount, 0);
  const weakPercent = (totalWeakCells / totalCells) * 100;

  if (weakPercent > 10) {
    recs.push({
      id: genId(),
      type: 'coverage_warning',
      priority: weakPercent > 30 ? 'high' : 'medium',
      severity: weakPercent > 30 ? 'critical' : 'warning',
      titleKey: 'rec.coverageWarningTitle',
      titleParams: { percent: Math.round(weakPercent) },
      reasonKey: 'rec.coverageWarningReason',
      reasonParams: { zones: weakZones.length, percent: Math.round(weakPercent) },
      affectedApIds: [],
      affectedBand: band,
      evidence: {
        metrics: { weakPercent, weakZoneCount: weakZones.length, totalWeakCells },
        affectedCells: weakZones.flatMap(z => z.cellIndices).slice(0, 5000),
        gridWidth: stats.gridWidth,
        gridHeight: stats.gridHeight,
        gridStep,
      },
      confidence: 0.9,
    });
  }
}

function generateAddApSuggestions(
  recs: Recommendation[],
  weakZones: WeakZone[],
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  totalCells: number,
  gridStep: number,
  ctx: RecommendationContext,
  stats: HeatmapStats,
  apMetrics?: Map<string, APMetrics>,
): void {
  const largeZones = weakZones.filter(z => z.cellCount >= 20);
  if (largeZones.length === 0) return;

  // Select best AP as template (by primary coverage), fallback to defaults
  const templateAp = selectTemplateAp(aps, apMetrics);
  const templateConfig = {
    txPowerDbm: templateAp?.txPowerDbm ?? 20,
    antennaGainDbi: templateAp?.antennaGainDbi ?? 4.0,
    mounting: 'ceiling' as const,
    heightM: 2.5,
  };

  const originX = bounds.originX ?? 0;
  const originY = bounds.originY ?? 0;

  // Multi-zone: process top 3 zones instead of only the largest
  const topZones = largeZones.slice(0, 3);

  for (const zone of topZones) {
    // RF-weighted target instead of geometric centroid
    const target = computeWeightedTarget(zone, stats, originX, originY, gridStep);
    const idealX = target.x;
    const idealY = target.y;

    // Skip if zone is in a PriorityZone that prefers a different band
    const matchingPZ = ctx.priorityZones.find(pz =>
      idealX >= pz.x && idealX <= pz.x + pz.width &&
      idealY >= pz.y && idealY <= pz.y + pz.height,
    );
    if (matchingPZ && matchingPZ.targetBand !== 'either' && matchingPZ.targetBand !== band) {
      continue;
    }

    // Try to find a candidate location if candidates are available
    if (ctx.candidates.length > 0) {
      const match = findBestCandidate(idealX, idealY, ctx.candidates, ctx.constraintZones);

      if (match.candidate) {
        const delta = simulateAddAP(
          aps, walls, bounds, band, rfConfig,
          { x: match.candidate.x, y: match.candidate.y },
          {
            ...templateConfig,
            mounting: match.candidate.mountingOptions[0] ?? 'ceiling',
          },
          weights,
        );

        if (delta.changePercent > 2) {
          recs.push({
            id: genId(),
            type: match.requiresInfrastructure ? 'infrastructure_required' : 'add_ap',
            priority: 'medium',
            severity: match.requiresInfrastructure ? 'warning' : 'info',
            titleKey: match.requiresInfrastructure ? 'rec.infraRequiredTitle' : 'rec.addApTitle',
            titleParams: {
              x: Math.round(match.candidate.x * 10) / 10,
              y: Math.round(match.candidate.y * 10) / 10,
            },
            reasonKey: 'rec.addApCandidateReason',
            reasonParams: {
              cells: zone.cellCount,
              avgRssi: Math.round(zone.avgRssi),
              candidate: match.candidate.label,
              distance: Math.round(match.distanceToIdeal * 10) / 10,
            },
            affectedApIds: [],
            affectedBand: band,
            suggestedChange: {
              parameter: 'position',
              currentValue: 'none',
              suggestedValue: `(${match.candidate.x.toFixed(1)}, ${match.candidate.y.toFixed(1)})`,
            },
            evidence: {
              metrics: { weakCells: zone.cellCount, avgRssi: zone.avgRssi },
              affectedCells: zone.cellIndices.slice(0, 2000),
              gridStep,
            },
            simulatedDelta: delta,
            confidence: 0.7,
            idealTargetPosition: { x: idealX, y: idealY },
            selectedCandidatePosition: { x: match.candidate.x, y: match.candidate.y },
            selectedBecause: match.selectedBecause,
            distanceToIdeal: match.distanceToIdeal,
            infrastructureRequired: match.requiresInfrastructure,
          });
          continue; // Next zone
        }
      } else {
        // No valid candidate — infrastructure_required recommendation
        recs.push({
          id: genId(),
          type: 'infrastructure_required',
          priority: 'medium',
          severity: 'warning',
          titleKey: 'rec.infraRequiredTitle',
          titleParams: {
            x: Math.round(idealX * 10) / 10,
            y: Math.round(idealY * 10) / 10,
          },
          reasonKey: 'rec.infraRequiredReason',
          reasonParams: {
            cells: zone.cellCount,
            reason: match.selectedBecause,
          },
          affectedApIds: [],
          affectedBand: band,
          evidence: {
            metrics: { weakCells: zone.cellCount, avgRssi: zone.avgRssi },
            affectedCells: zone.cellIndices.slice(0, 2000),
            gridStep,
          },
          confidence: 0.5,
          idealTargetPosition: { x: idealX, y: idealY },
          infrastructureRequired: true,
          requiresUserDecision: true,
        });
        continue; // Next zone
      }
    }

    // Fallback: no candidate locations defined — use weighted target directly
    if (!isNewApAllowed(idealX, idealY, ctx.constraintZones)) continue;
    // Physical validation: ensure position is not inside a wall
    if (!isPhysicallyValidApPosition(idealX, idealY, walls)) continue;

    const delta = simulateAddAP(
      aps, walls, bounds, band, rfConfig,
      { x: idealX, y: idealY },
      templateConfig,
      weights,
    );

    if (delta.changePercent > 2) {
      recs.push({
        id: genId(),
        type: 'add_ap',
        priority: 'medium',
        severity: 'warning',
        titleKey: 'rec.addApTitle',
        titleParams: {
          x: Math.round(idealX * 10) / 10,
          y: Math.round(idealY * 10) / 10,
        },
        reasonKey: 'rec.addApReason',
        reasonParams: {
          cells: zone.cellCount,
          avgRssi: Math.round(zone.avgRssi),
        },
        affectedApIds: [],
        affectedBand: band,
        suggestedChange: {
          parameter: 'position',
          currentValue: 'none',
          suggestedValue: `(${idealX.toFixed(1)}, ${idealY.toFixed(1)})`,
        },
        evidence: {
          metrics: { weakCells: zone.cellCount, avgRssi: zone.avgRssi },
          affectedCells: zone.cellIndices.slice(0, 2000),
          gridStep,
        },
        simulatedDelta: delta,
        confidence: 0.7,
        idealTargetPosition: { x: idealX, y: idealY },
        requiresUserDecision: true,
      });
    }
  }
}

function generateMoveApSuggestions(
  recs: Recommendation[],
  apMetrics: Map<string, APMetrics>,
  weakZones: WeakZone[],
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  gridStep: number,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
  stats: HeatmapStats = {} as HeatmapStats,
): void {
  if (weakZones.length === 0) return;

  for (const ap of aps) {
    const metrics = apMetrics.get(ap.id);
    if (!metrics || metrics.primaryCoverageRatio > 0.4) continue;

    // Check AP capabilities
    const canMove = isActionAllowed(ap.id, 'move_ap', band, ctx);
    const inNoMoveZone = isInNoMoveZone(ap.x, ap.y, ctx.constraintZones);

    if (!canMove || inNoMoveZone) {
      // Generate blocked recommendation hint
      recs.push({
        id: genId(),
        type: 'blocked_recommendation',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.blockedMoveTitle',
        titleParams: { ap: apLabel(ap.id) },
        reasonKey: 'rec.blockedMoveReason',
        reasonParams: {
          ap: apLabel(ap.id),
          reason: !canMove ? 'capability_restricted' : 'no_move_zone',
        },
        affectedApIds: [ap.id],
        affectedBand: band,
        evidence: {
          metrics: { currentCoverage: metrics.primaryCoverageRatio },
          gridStep,
        },
        confidence: 0.5,
        blockedByConstraints: [
          !canMove ? `AP ${apLabel(ap.id)}: movement not allowed` : `AP ${apLabel(ap.id)}: in no-move zone`,
        ],
      });
      continue;
    }

    // Find nearest weak zone (skip zones in PriorityZones preferring a different band)
    let nearestZone: WeakZone | null = null;
    let nearestDist = Infinity;
    for (const zone of weakZones) {
      const zonePZ = ctx.priorityZones.find(pz =>
        zone.centroidX >= pz.x && zone.centroidX <= pz.x + pz.width &&
        zone.centroidY >= pz.y && zone.centroidY <= pz.y + pz.height,
      );
      if (zonePZ && zonePZ.targetBand !== 'either' && zonePZ.targetBand !== band) continue;

      const dx = zone.centroidX - ap.x;
      const dy = zone.centroidY - ap.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestZone = zone;
      }
    }

    if (!nearestZone || nearestDist < 1) continue;

    let bestDelta = null;
    let bestPos = { x: ap.x, y: ap.y };
    let selectedCandidateLabel: string | undefined;

    // Strategy 1: Use candidate locations if available (preferred)
    if (ctx.candidates.length > 0) {
      const match = findBestCandidate(
        nearestZone.centroidX, nearestZone.centroidY,
        ctx.candidates, ctx.constraintZones,
      );

      if (match.candidate) {
        // Simulate moving to each ranked candidate
        for (const ranked of match.rankedCandidates) {
          const c = ranked.candidate;
          // Skip candidates that are too close to current position (no real move)
          const distFromCurrent = Math.sqrt((c.x - ap.x) ** 2 + (c.y - ap.y) ** 2);
          if (distFromCurrent < 0.5) continue;

          const mod: APModification = {
            apId: ap.id,
            position: { x: c.x, y: c.y },
          };
          const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

          if (!bestDelta || delta.scoreAfter > bestDelta.scoreAfter) {
            bestDelta = delta;
            bestPos = { x: c.x, y: c.y };
            selectedCandidateLabel = c.label;
          }
        }
      }
    }

    // Strategy 2: Fallback — interpolate towards RF-weighted target (only if no candidates or no improvement)
    if (!bestDelta || bestDelta.changePercent <= 3) {
      const originX = bounds.originX ?? 0;
      const originY = bounds.originY ?? 0;
      const target = computeWeightedTarget(nearestZone, stats, originX, originY, gridStep);
      const dx = target.x - ap.x;
      const dy = target.y - ap.y;
      const fractions = [0.25, 0.5, 0.75];

      for (const frac of fractions) {
        const candidateX = ap.x + dx * frac;
        const candidateY = ap.y + dy * frac;

        // Bounds check
        const ox = bounds.originX ?? 0;
        const oy = bounds.originY ?? 0;
        if (candidateX < ox || candidateX > ox + bounds.width ||
            candidateY < oy || candidateY > oy + bounds.height) continue;

        // Constraint check: is target position allowed?
        if (!isMovementAllowed(candidateX, candidateY, ctx.constraintZones)) continue;
        // Physical validation: not inside a wall
        if (!isPhysicallyValidApPosition(candidateX, candidateY, walls)) continue;

        const mod: APModification = {
          apId: ap.id,
          position: { x: candidateX, y: candidateY },
        };
        const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

        if (!bestDelta || delta.scoreAfter > bestDelta.scoreAfter) {
          bestDelta = delta;
          bestPos = { x: candidateX, y: candidateY };
          selectedCandidateLabel = undefined;
        }
      }
    }

    if (bestDelta && bestDelta.changePercent > 3) {
      const titleParams: Record<string, string | number> = {
        ap: apLabel(ap.id),
        x: Math.round(bestPos.x * 10) / 10,
        y: Math.round(bestPos.y * 10) / 10,
      };
      if (selectedCandidateLabel) {
        titleParams.candidate = selectedCandidateLabel;
      }

      recs.push({
        id: genId(),
        type: 'move_ap',
        priority: bestDelta.changePercent > 10 ? 'high' : 'medium',
        severity: bestDelta.changePercent > 10 ? 'critical' : 'warning',
        titleKey: selectedCandidateLabel ? 'rec.moveApToCandidateTitle' : 'rec.moveApTitle',
        titleParams,
        reasonKey: 'rec.moveApReason',
        reasonParams: {
          coverage: Math.round(metrics.primaryCoverageRatio * 100),
          improvement: Math.round(bestDelta.changePercent),
        },
        affectedApIds: [ap.id],
        affectedBand: band,
        suggestedChange: {
          apId: ap.id,
          parameter: 'position',
          currentValue: `(${ap.x.toFixed(1)}, ${ap.y.toFixed(1)})`,
          suggestedValue: `(${bestPos.x.toFixed(1)}, ${bestPos.y.toFixed(1)})`,
        },
        evidence: {
          metrics: {
            currentCoverage: metrics.primaryCoverageRatio,
            improvement: bestDelta.changePercent,
          },
          gridStep,
        },
        simulatedDelta: bestDelta,
        confidence: 0.75,
        selectedCandidatePosition: bestPos,
        idealTargetPosition: nearestZone ? { x: nearestZone.centroidX, y: nearestZone.centroidY } : undefined,
        distanceToIdeal: nearestZone
          ? Math.sqrt((bestPos.x - nearestZone.centroidX) ** 2 + (bestPos.y - nearestZone.centroidY) ** 2)
          : undefined,
      });
    }
  }
}

/**
 * Check if a wall-mounted AP at a given orientation would face a wall
 * within a short distance (front sector blocked).
 *
 * Tests whether a ray cast in the front direction intersects any wall
 * segment within `maxDist` meters.
 */
function hasWallInFrontSector(
  apX: number,
  apY: number,
  orientationDeg: number,
  walls: WallData[],
  maxDist: number = 1.5,
): boolean {
  const rad = orientationDeg * (Math.PI / 180);
  // Check 3 rays in front sector: center, +30°, -30°
  const offsets = [0, Math.PI / 6, -Math.PI / 6];

  for (const offset of offsets) {
    const dirX = Math.cos(rad + offset);
    const dirY = Math.sin(rad + offset);
    const endX = apX + dirX * maxDist;
    const endY = apY + dirY * maxDist;

    for (const wall of walls) {
      for (const seg of wall.segments) {
        if (segmentsIntersect(apX, apY, endX, endY, seg.x1, seg.y1, seg.x2, seg.y2)) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Simple 2D line segment intersection test. */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function generateRotateApSuggestions(
  recs: Recommendation[],
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  gridStep: number,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
): void {
  for (const ap of aps) {
    if (ap.mounting !== 'wall') continue;

    // Check capabilities
    if (!isActionAllowed(ap.id, 'rotate_ap', band, ctx)) {
      continue; // Skip silently — blocked hint is generated if move is also blocked
    }

    const currentDeg = ap.orientationDeg ?? 0;
    const candidates = [0, 90, 180, 270].filter(deg => Math.abs(deg - currentDeg) > 10);

    let bestDelta = null;
    let bestDeg = currentDeg;

    for (const deg of candidates) {
      // Skip rotations where the front sector faces a wall within 1.5m
      if (hasWallInFrontSector(ap.x, ap.y, deg, walls, 1.5)) continue;

      const mod: APModification = { apId: ap.id, orientationDeg: deg };
      const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

      if (!bestDelta || delta.scoreAfter > bestDelta.scoreAfter) {
        bestDelta = delta;
        bestDeg = deg;
      }
    }

    if (bestDelta && bestDelta.changePercent > 3) {
      recs.push({
        id: genId(),
        type: 'rotate_ap',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.rotateApTitle',
        titleParams: { ap: apLabel(ap.id), deg: bestDeg },
        reasonKey: 'rec.rotateApReason',
        reasonParams: { currentDeg, suggestedDeg: bestDeg, improvement: Math.round(bestDelta.changePercent) },
        affectedApIds: [ap.id],
        affectedBand: band,
        suggestedChange: {
          apId: ap.id,
          parameter: 'orientationDeg',
          currentValue: currentDeg,
          suggestedValue: bestDeg,
        },
        evidence: { metrics: { improvement: bestDelta.changePercent }, gridStep },
        simulatedDelta: bestDelta,
        confidence: 0.65,
      });
    }
  }
}

function generateMountingSuggestions(
  recs: Recommendation[],
  _apMetrics: Map<string, APMetrics>,
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  gridStep: number,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
): void {
  for (const ap of aps) {
    // Check capabilities
    if (!isActionAllowed(ap.id, 'change_mounting', band, ctx)) continue;

    // Check constraint zones for mounting restrictions
    const constraints = ctx.constraintZones.length > 0
      ? ctx.constraintZones.filter(z =>
          ap.x >= z.x && ap.x <= z.x + z.width &&
          ap.y >= z.y && ap.y <= z.y + z.height)
      : [];

    const otherMounting = ap.mounting === 'ceiling' ? 'wall' : 'ceiling';

    // Check if target mounting is blocked by zone constraints
    const mountingBlocked = constraints.some(z =>
      (otherMounting === 'ceiling' && z.type === 'no_ceiling_mount') ||
      (otherMounting === 'wall' && z.type === 'no_wall_mount'),
    );

    if (mountingBlocked) continue;

    // For ceiling→wall switch: find the best orientation (test all 4 directions,
    // exclude those facing a nearby wall)
    let bestMountDelta = null;
    let bestOrientation: number | undefined;

    if (otherMounting === 'wall') {
      for (const deg of [0, 90, 180, 270]) {
        if (hasWallInFrontSector(ap.x, ap.y, deg, walls, 1.5)) continue;
        const mod: APModification = { apId: ap.id, mounting: 'wall', orientationDeg: deg };
        const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);
        if (!bestMountDelta || delta.scoreAfter > bestMountDelta.scoreAfter) {
          bestMountDelta = delta;
          bestOrientation = deg;
        }
      }
    } else {
      // wall→ceiling: orientation doesn't matter for ceiling mount
      const mod: APModification = { apId: ap.id, mounting: 'ceiling' };
      bestMountDelta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);
    }

    if (bestMountDelta && bestMountDelta.changePercent > 5) {
      recs.push({
        id: genId(),
        type: 'change_mounting',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.changeMountingTitle',
        titleParams: { ap: apLabel(ap.id), mounting: otherMounting },
        reasonKey: 'rec.changeMountingReason',
        reasonParams: { currentMounting: ap.mounting ?? 'ceiling', improvement: Math.round(bestMountDelta.changePercent) },
        affectedApIds: [ap.id],
        affectedBand: band,
        suggestedChange: {
          apId: ap.id,
          parameter: 'mounting',
          currentValue: ap.mounting ?? 'ceiling',
          suggestedValue: otherMounting,
        },
        evidence: {
          metrics: { improvement: bestMountDelta.changePercent },
          gridStep,
          // Include suggested orientation for ceiling→wall
          ...(bestOrientation !== undefined ? { suggestedOrientation: bestOrientation } : {}),
        },
        simulatedDelta: bestMountDelta,
        confidence: 0.6,
      });
    }
  }
}

function generateTxPowerSuggestions(
  recs: Recommendation[],
  apMetrics: Map<string, APMetrics>,
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  totalCells: number,
  gridStep: number,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
): void {
  for (const ap of aps) {
    // Check capabilities
    if (!isActionAllowed(ap.id, 'adjust_tx_power', band, ctx)) continue;

    const metrics = apMetrics.get(ap.id);
    if (!metrics) continue;

    // Band-specific parameter name for TX power
    const txParamName = band === '2.4ghz' ? 'tx_power_24ghz' : band === '6ghz' ? 'tx_power_6ghz' : 'tx_power_5ghz';

    // If this AP has lots of overlap, try reducing TX power
    const overlapRatio = totalCells > 0 ? metrics.overlapCells / totalCells : 0;
    if (overlapRatio > 0.15) {
      const lowerPower = ap.txPowerDbm - 3;
      if (lowerPower >= 10) {
        const mod: APModification = { apId: ap.id, txPowerDbm: lowerPower };
        const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

        if (delta.changePercent > -5) {
          recs.push({
            id: genId(),
            type: 'adjust_tx_power',
            priority: 'low',
            severity: 'info',
            titleKey: 'rec.adjustTxPowerTitle',
            titleParams: { ap: apLabel(ap.id), power: lowerPower },
            reasonKey: 'rec.adjustTxPowerReason',
            reasonParams: {
              currentPower: ap.txPowerDbm,
              suggestedPower: lowerPower,
              overlapPercent: Math.round(overlapRatio * 100),
            },
            affectedApIds: [ap.id],
            affectedBand: band,
            suggestedChange: {
              apId: ap.id,
              parameter: txParamName,
              currentValue: ap.txPowerDbm,
              suggestedValue: lowerPower,
            },
            evidence: { metrics: { overlapRatio, improvement: delta.changePercent }, gridStep },
            simulatedDelta: delta,
            confidence: 0.6,
          });
          continue; // Don't also suggest increasing power for the same AP
        }
      }
    }

    // If AP has low coverage (and we didn't already suggest reducing), try increasing TX power
    if (metrics.primaryCoverageRatio < 0.15) {
      const higherPower = ap.txPowerDbm + 3;
      if (higherPower <= 30) {
        const mod: APModification = { apId: ap.id, txPowerDbm: higherPower };
        const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

        if (delta.changePercent > 2) {
          recs.push({
            id: genId(),
            type: 'adjust_tx_power',
            priority: 'low',
            severity: 'info',
            titleKey: 'rec.adjustTxPowerTitle',
            titleParams: { ap: apLabel(ap.id), power: higherPower },
            reasonKey: 'rec.adjustTxPowerUpReason',
            reasonParams: {
              currentPower: ap.txPowerDbm,
              suggestedPower: higherPower,
              coverage: Math.round(metrics.primaryCoverageRatio * 100),
            },
            affectedApIds: [ap.id],
            affectedBand: band,
            suggestedChange: {
              apId: ap.id,
              parameter: txParamName,
              currentValue: ap.txPowerDbm,
              suggestedValue: higherPower,
            },
            evidence: { metrics: { coverageRatio: metrics.primaryCoverageRatio }, gridStep },
            simulatedDelta: delta,
            confidence: 0.6,
          });
        }
      }
    }
  }
}

function generateChannelRecommendations(
  recs: Recommendation[],
  channelAnalysis: ReturnType<typeof analyzeChannelConflicts>,
  accessPoints: AccessPointResponse[],
  band: FrequencyBand,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
): void {
  const analysisBand: AnalysisBand = band === '6ghz' ? '5ghz' : band as AnalysisBand;

  for (const conflict of channelAnalysis.conflicts) {
    if (conflict.score < 0.3) continue;

    // Suggest channel change for AP with fewer conflicts
    const summary1 = channelAnalysis.apSummaries.find(s => s.apId === conflict.ap1Id);
    const summary2 = channelAnalysis.apSummaries.find(s => s.apId === conflict.ap2Id);
    const targetApId = (summary1?.totalConflicts ?? 0) <= (summary2?.totalConflicts ?? 0)
      ? conflict.ap1Id : conflict.ap2Id;

    // Check capabilities
    if (!isActionAllowed(targetApId, 'change_channel', band, ctx)) continue;

    const recommended = getRecommendedChannels(targetApId, accessPoints, analysisBand);
    if (recommended.length === 0) continue;

    const currentChannel = targetApId === conflict.ap1Id ? conflict.channel1 : conflict.channel2;
    const suggestedChannel = recommended[0]!;

    if (suggestedChannel === currentChannel) continue;

    const channelParamName = band === '2.4ghz' ? 'channel_24ghz' : 'channel_5ghz';

    recs.push({
      id: genId(),
      type: 'change_channel',
      priority: conflict.severity === 'high' ? 'high' : 'medium',
      severity: conflict.severity === 'high' ? 'critical' : 'warning',
      titleKey: 'rec.changeChannelTitle',
      titleParams: { ap: apLabel(targetApId), channel: suggestedChannel },
      reasonKey: 'rec.changeChannelReason',
      reasonParams: {
        type: conflict.type,
        otherAp: apLabel(targetApId === conflict.ap1Id ? conflict.ap2Id : conflict.ap1Id),
        distance: Math.round(conflict.distanceM * 10) / 10,
      },
      affectedApIds: [conflict.ap1Id, conflict.ap2Id],
      affectedBand: band,
      suggestedChange: {
        apId: targetApId,
        parameter: channelParamName,
        currentValue: currentChannel,
        suggestedValue: suggestedChannel,
      },
      evidence: {
        metrics: { conflictScore: conflict.score, distance: conflict.distanceM },
      },
      confidence: 0.85,
    });
  }
}

function generateRoamingHints(
  recs: Recommendation[],
  stats: HeatmapStats,
  totalCells: number,
  band: FrequencyBand,
  gridStep: number,
): void {
  if (!stats.deltaGrid || totalCells === 0) return;

  let lowDeltaCells = 0;
  const lowDeltaIndices: number[] = [];

  for (let i = 0; i < totalCells; i++) {
    const d = stats.deltaGrid[i] ?? 99;
    if (d < 5 && d < 99) {
      lowDeltaCells++;
      if (lowDeltaIndices.length < 2000) lowDeltaIndices.push(i);
    }
  }

  const lowDeltaPercent = (lowDeltaCells / totalCells) * 100;
  if (lowDeltaPercent > 15) {
    recs.push({
      id: genId(),
      type: 'roaming_hint',
      priority: 'low',
      severity: 'info',
      titleKey: 'rec.roamingHintTitle',
      titleParams: { percent: Math.round(lowDeltaPercent) },
      reasonKey: 'rec.roamingHintReason',
      reasonParams: { percent: Math.round(lowDeltaPercent) },
      affectedApIds: [],
      affectedBand: band,
      evidence: {
        metrics: { lowDeltaPercent, lowDeltaCells },
        affectedCells: lowDeltaIndices,
        gridWidth: stats.gridWidth,
        gridHeight: stats.gridHeight,
        gridStep,
      },
      confidence: 0.7,
    });
  }
}

function generateLowValueWarnings(
  recs: Recommendation[],
  lowValueApIds: string[],
  apMetrics: Map<string, APMetrics>,
  band: FrequencyBand,
  apLabel: (id: string) => string,
): void {
  for (const apId of lowValueApIds) {
    const metrics = apMetrics.get(apId);
    const coveragePct = Math.round((metrics?.primaryCoverageRatio ?? 0) * 100);

    recs.push({
      id: genId(),
      type: 'low_ap_value',
      priority: 'low',
      severity: 'info',
      titleKey: 'rec.lowApValueTitle',
      titleParams: { ap: apLabel(apId) },
      reasonKey: 'rec.lowApValueReason',
      reasonParams: { coverage: coveragePct, ap: apLabel(apId) },
      affectedApIds: [apId],
      affectedBand: band,
      evidence: {
        metrics: { primaryCoverageRatio: metrics?.primaryCoverageRatio ?? 0 },
      },
      confidence: 0.8,
    });
  }
}

function generateOverlapWarnings(
  recs: Recommendation[],
  overlapZones: ReturnType<typeof findOverlapZones>,
  totalCells: number,
  band: FrequencyBand,
  gridStep: number,
): void {
  if (overlapZones.length === 0 || totalCells === 0) return;

  const totalOverlapCells = overlapZones.reduce((sum, z) => sum + z.cellCount, 0);
  const overlapPercent = (totalOverlapCells / totalCells) * 100;

  if (overlapPercent > 20) {
    recs.push({
      id: genId(),
      type: 'overlap_warning',
      priority: 'medium',
      severity: 'warning',
      titleKey: 'rec.overlapWarningTitle',
      titleParams: { percent: Math.round(overlapPercent) },
      reasonKey: 'rec.overlapWarningReason',
      reasonParams: { percent: Math.round(overlapPercent), zones: overlapZones.length },
      affectedApIds: [],
      affectedBand: band,
      evidence: {
        metrics: { overlapPercent, overlapZoneCount: overlapZones.length },
        affectedCells: overlapZones.flatMap(z => z.cellIndices).slice(0, 5000),
        gridStep,
      },
      confidence: 0.75,
    });
  }
}

// ─── Helper: Template AP Selection ───────────────────────────────

/**
 * Select the AP with best coverage as a template for new APs.
 * Falls back to the first AP if no metrics available.
 */
function selectTemplateAp(
  aps: APConfig[],
  apMetrics?: Map<string, APMetrics>,
): APConfig | undefined {
  if (aps.length === 0) return undefined;
  if (!apMetrics || apMetrics.size === 0) return aps[0];
  let best = aps[0]!;
  let bestCoverage = 0;
  for (const ap of aps) {
    const m = apMetrics.get(ap.id);
    if (m && m.primaryCoverageRatio > bestCoverage) {
      best = ap;
      bestCoverage = m.primaryCoverageRatio;
    }
  }
  return best;
}

// ─── Helper: RF-Weighted Target ──────────────────────────────────

/**
 * Compute RF-weighted centroid: cells with deeper RSSI get more weight.
 * Falls back to geometric centroid if no rssiGrid available.
 */
function computeWeightedTarget(
  zone: WeakZone,
  stats: HeatmapStats,
  originX: number,
  originY: number,
  gridStep: number,
): { x: number; y: number } {
  if (!stats.rssiGrid || zone.cellIndices.length === 0) {
    return { x: zone.centroidX, y: zone.centroidY };
  }
  const gridWidth = stats.gridWidth ?? 1;
  let sumX = 0, sumY = 0, sumWeight = 0;
  for (const idx of zone.cellIndices) {
    const row = Math.floor(idx / gridWidth);
    const col = idx % gridWidth;
    const rssi = stats.rssiGrid[idx] ?? -100;
    // Deeper RSSI = higher urgency = more weight
    const weight = Math.max(0, -rssi - 50); // e.g. -90 dBm → weight 40
    sumX += (originX + col * gridStep) * weight;
    sumY += (originY + row * gridStep) * weight;
    sumWeight += weight;
  }
  if (sumWeight === 0) return { x: zone.centroidX, y: zone.centroidY };
  return { x: sumX / sumWeight, y: sumY / sumWeight };
}

// ─── New Generators ──────────────────────────────────────────────

function generateDisableApSuggestions(
  recs: Recommendation[],
  apMetrics: Map<string, APMetrics>,
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  totalCells: number,
  apLabel: (id: string) => string,
): void {
  for (const [apId, metrics] of apMetrics) {
    if (metrics.primaryCoverageRatio >= 0.02) continue;
    const overlapRatio = totalCells > 0 ? metrics.overlapCells / totalCells : 0;
    if (overlapRatio < 0.10) continue;

    // Simulate disabling by removing this AP
    const apsWithout = aps.filter(a => a.id !== apId);
    const coverageBefore = simulateGrid(aps, walls, bounds, band, rfConfig);
    const coverageAfter = simulateGrid(apsWithout, walls, bounds, band, rfConfig);
    const scoreBefore = scoreFromBins(coverageBefore, weights);
    const scoreAfter = scoreFromBins(coverageAfter, weights);
    const changePercent = scoreBefore > 0
      ? ((scoreAfter - scoreBefore) / scoreBefore) * 100
      : 0;

    // Only suggest if coverage doesn't drop significantly
    if (changePercent >= -2) {
      recs.push({
        id: genId(),
        type: 'disable_ap',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.disableApTitle',
        titleParams: { ap: apLabel(apId) },
        reasonKey: 'rec.disableApReason',
        reasonParams: {
          ap: apLabel(apId),
          coverage: Math.round(metrics.primaryCoverageRatio * 100),
          overlap: Math.round(overlapRatio * 100),
        },
        affectedApIds: [apId],
        affectedBand: band,
        evidence: {
          metrics: { primaryCoverageRatio: metrics.primaryCoverageRatio, overlapRatio },
        },
        simulatedDelta: {
          scoreBefore,
          scoreAfter,
          changePercent,
          coverageBefore,
          coverageAfter,
        },
        confidence: 0.65,
      });
    }
  }
}

function generateBandLimitWarnings(
  recs: Recommendation[],
  stats: HeatmapStats,
  band: FrequencyBand,
  totalCells: number,
): void {
  if (!stats.uplinkLimitedGrid || totalCells === 0) return;

  let limitedCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (stats.uplinkLimitedGrid[i]) limitedCount++;
  }
  const limitedPct = (limitedCount / totalCells) * 100;

  if (limitedPct > 30) {
    recs.push({
      id: genId(),
      type: 'band_limit_warning',
      priority: limitedPct > 50 ? 'high' : 'medium',
      severity: limitedPct > 50 ? 'critical' : 'warning',
      titleKey: 'rec.bandLimitTitle',
      titleParams: { percent: Math.round(limitedPct) },
      reasonKey: 'rec.bandLimitReason',
      reasonParams: { percent: Math.round(limitedPct), band },
      affectedApIds: [],
      affectedBand: band,
      evidence: {
        metrics: { uplinkLimitedPercent: limitedPct, limitedCells: limitedCount },
      },
      confidence: 0.8,
    });
  }
}

function generateConstraintConflictWarnings(
  recs: Recommendation[],
  aps: APConfig[],
  band: FrequencyBand,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
): void {
  // Check APs in forbidden/discouraged zones
  for (const ap of aps) {
    const zones = getConstraintsAtPoint(ap.x, ap.y, ctx.constraintZones);
    for (const zone of zones) {
      if (zone.type === 'forbidden' || zone.type === 'discouraged') {
        recs.push({
          id: genId(),
          type: 'constraint_conflict',
          priority: zone.type === 'forbidden' ? 'high' : 'medium',
          severity: zone.type === 'forbidden' ? 'critical' : 'warning',
          titleKey: 'rec.constraintConflictTitle',
          titleParams: { ap: apLabel(ap.id), zoneType: zone.type },
          reasonKey: 'rec.constraintConflictReason',
          reasonParams: { ap: apLabel(ap.id), zoneType: zone.type },
          affectedApIds: [ap.id],
          affectedBand: band,
          evidence: {
            metrics: { zoneWeight: zone.weight },
          },
          confidence: 0.95,
        });
      }
    }
  }

  // Check PriorityZones with mustHaveCoverage that have no AP in range
  for (const pz of ctx.priorityZones) {
    if (!pz.mustHaveCoverage) continue;
    const zoneCenterX = pz.x + pz.width / 2;
    const zoneCenterY = pz.y + pz.height / 2;
    const zoneRadius = Math.max(pz.width, pz.height);
    const hasNearbyAP = aps.some(a =>
      Math.sqrt((a.x - zoneCenterX) ** 2 + (a.y - zoneCenterY) ** 2) < zoneRadius,
    );
    if (!hasNearbyAP) {
      recs.push({
        id: genId(),
        type: 'constraint_conflict',
        severity: 'critical',
        priority: 'high',
        titleKey: 'rec.mustHaveCoverageTitle',
        titleParams: { zone: pz.label },
        reasonKey: 'rec.mustHaveCoverageReason',
        reasonParams: { zone: pz.label },
        affectedApIds: [],
        affectedBand: band,
        evidence: { metrics: { zoneWeight: pz.weight } },
        confidence: 0.9,
      });
    }
  }
}

function generatePreferredCandidateSuggestions(
  recs: Recommendation[],
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  gridStep: number,
  ctx: RecommendationContext,
): void {
  const preferredCandidates = ctx.candidates.filter(c => c.preferred && !c.forbidden);
  if (preferredCandidates.length === 0) return;

  for (const cand of preferredCandidates) {
    // Physical validation: skip candidates inside walls
    if (!isPhysicallyValidApPosition(cand.x, cand.y, walls)) continue;

    const nearestApDist = aps.length > 0
      ? Math.min(...aps.map(a => Math.sqrt((a.x - cand.x) ** 2 + (a.y - cand.y) ** 2)))
      : Infinity;
    if (nearestApDist < 3) continue; // Already an AP nearby

    const delta = simulateAddAP(
      aps, walls, bounds, band, rfConfig,
      { x: cand.x, y: cand.y },
      {
        txPowerDbm: aps[0]?.txPowerDbm ?? 20,
        antennaGainDbi: aps[0]?.antennaGainDbi ?? 4.0,
        mounting: cand.mountingOptions[0] ?? 'ceiling',
        heightM: 2.5,
      },
      weights,
    );

    if (delta.changePercent > 1) {
      recs.push({
        id: genId(),
        type: 'preferred_candidate_location',
        priority: 'medium',
        severity: 'info',
        titleKey: 'rec.preferredCandidateTitle',
        titleParams: { candidate: cand.label },
        reasonKey: 'rec.preferredCandidateReason',
        reasonParams: {
          candidate: cand.label,
          improvement: Math.round(delta.changePercent),
        },
        affectedApIds: [],
        affectedBand: band,
        suggestedChange: {
          parameter: 'position',
          currentValue: 'none',
          suggestedValue: `(${cand.x.toFixed(1)}, ${cand.y.toFixed(1)})`,
        },
        evidence: {
          metrics: { improvement: delta.changePercent },
          gridStep,
        },
        simulatedDelta: delta,
        confidence: 0.7,
        selectedCandidatePosition: { x: cand.x, y: cand.y },
        infrastructureRequired: !cand.hasLan || !cand.hasPoe,
      });
    }
  }
}

// ─── Deduplication ───────────────────────────────────────────────

function deduplicateRecommendations(recs: Recommendation[]): Recommendation[] {
  // Group by AP-ID
  const byAp = new Map<string, Recommendation[]>();
  const noAp: Recommendation[] = [];

  for (const rec of recs) {
    if (rec.affectedApIds.length === 0) {
      noAp.push(rec);
      continue;
    }
    const key = [...rec.affectedApIds].sort().join(',');
    const group = byAp.get(key) ?? [];
    group.push(rec);
    byAp.set(key, group);
  }

  const result: Recommendation[] = [...noAp];

  for (const [, group] of byAp) {
    if (group.length <= 1) {
      result.push(...group);
      continue;
    }

    // Sort by effort level (config first) UNLESS higher effort yields 3x better improvement
    group.sort((a, b) => {
      const effortA = EFFORT_SCORES[EFFORT_LEVELS[a.type] ?? 'config'];
      const effortB = EFFORT_SCORES[EFFORT_LEVELS[b.type] ?? 'config'];
      const deltaA = a.simulatedDelta?.changePercent ?? 0;
      const deltaB = b.simulatedDelta?.changePercent ?? 0;

      // If higher-effort option has 3x better improvement AND >10% absolute, prefer it
      if (effortA < effortB && deltaB > deltaA * 3 && deltaB > 10) return 1;
      if (effortB < effortA && deltaA > deltaB * 3 && deltaA > 10) return -1;

      // Otherwise: config-first (lower effort preferred)
      if (effortA !== effortB) return effortA - effortB;
      return deltaB - deltaA;
    });

    // Keep the best recommendation, store rest as alternatives
    const best = group[0]!;
    best.alternativeRecommendations = group.slice(1);
    result.push(best);
  }

  return result;
}
