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
import { computeRSSI, type RFConfig } from '$lib/heatmap/rf-engine';
import { buildSpatialGrid } from '$lib/heatmap/spatial-grid';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { AnalysisBand } from '$lib/heatmap/channel-analysis';
import { analyzeChannelConflicts, getRecommendedChannels, ALLOWED_CHANNELS } from '$lib/heatmap/channel-analysis';
import {
  computeAPMetrics,
  computeOverallScore,
  findWeakZones,
  findOverlapZones,
  findLowValueAPs,
  analyzeRoamingPairs,
  computeZoneRelevance,
  classifyApRole,
  type RoamingPairMetrics,
} from './analysis';
import { simulateChange, simulateAddAP, clearSimulatorCache, simulateGrid, scoreFromBins } from './simulator';
import { BAND_THRESHOLDS } from '$lib/heatmap/coverage-stats';
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
  RecommendationType,
  RecommendationCategory,
  ExpertProfile,
  ScoringWeights,
  WeakZone,
  APModification,
  RecommendationContext,
  CoverageBinPercents,
  SimulatedDelta,
  ApRole,
  CandidateLocation,
  ConstraintZone,
  PriorityZone,
} from './types';
import { EXPERT_PROFILES, EMPTY_CONTEXT, EFFORT_LEVELS, EFFORT_SCORES, RECOMMENDATION_CATEGORIES } from './types';

// ─── Roaming Pair Relevance Guards ───────────────────────────────
const MIN_PAIR_CELLS = 80;          // Q1: Min totalPairCells to avoid noise
const MIN_PAIR_RATIO = 0.02;        // Q1: Min pair-to-total-cells ratio

// ─── Roaming TX Constants ────────────────────────────────────────
const MIN_HANDOFF_CELLS = 50;       // A2: Minimum handoff zone cells
const MIN_HANDOFF_RATIO = 0.01;     // A2: Minimum handoff zone ratio
const STICKY_TRIGGER = 0.30;        // A4: Min stickyRatio for trigger
const GAP_TRIGGER = 0.20;           // A4: Min gapRatio for trigger
const GAP_RATIO_CRITICAL = 0.40;    // A3: Critical gap rate
const UPLINK_BLOCK_ROAMING = 0.70;  // C2: Uplink block threshold
const UPLINK_SUPPRESS_ADD_MOVE = 0.60; // C1: Suppress add_ap/move_ap unless large benefit
const UPLINK_ADD_MOVE_MIN_BENEFIT = 10; // C1: Min changePercent for add/move under uplink suppression
const ROAMING_TX_STEPS = [-3, -6, -9] as const;
const ROAMING_TX_MIN_DBM = 10;
const ROAMING_TX_BOOST_STEPS = [3, 6] as const;
const ROAMING_TX_MAX_DBM = 30;
const GAP_BOOST_TRIGGER = 0.25;     // Gap ratio threshold for TX boost
const GAP_MAX_FOR_ADJUSTMENT = 0.20; // Max gap ratio for dominant-down adjustment
const ROAMING_MIN_OVERALL_BENEFIT = 0.5; // Min changePercent for actionable roaming rec

// ─── Candidate Distance Guards ──────────────────────────────────
/** Max distance (m) from ideal target to candidate for add_ap recommendations */
const MAX_IDEAL_DISTANCE_ADD_AP_M = 8;
/** Max distance (m) from ideal target to candidate for preferred_candidate recommendations */
const MAX_IDEAL_DISTANCE_PREFERRED_CAND_M = 6;
/** Max distance (m) from ideal target to candidate for move_ap recommendations */
const MAX_IDEAL_DISTANCE_MOVE_AP_M = 8;

// ─── PZ Zone Safety Guards ──────────────────────────────────────
/** Max RSSI drop in a mustHaveCoverage PZ before a TX change is blocked */
const PZ_MAX_RSSI_DROP_DBM = 3;
/** Gap ratio above which the problem is likely physical (not TX-solvable) */
const PHYSICAL_GAP_RATIO = 0.30;
/** RSSI offset below "fair" threshold indicating physical gap */
const PHYSICAL_GAP_RSSI_OFFSET = 7;

let nextRecId = 0;
function genId(): string {
  nextRecId++;
  return `rec-${nextRecId}`;
}

/**
 * Check if a TX power modification would hurt any mustHaveCoverage PriorityZone.
 *
 * Samples 5 points per PZ (center + 4 inner quadrant centers).
 * Compares best RSSI before and after modification.
 * Returns true if any PZ's average RSSI drops by more than PZ_MAX_RSSI_DROP_DBM.
 */
function wouldHurtPriorityZone(
  aps: APConfig[],
  modifiedAps: APConfig[],
  walls: WallData[],
  band: FrequencyBand,
  rfConfig: RFConfig,
  pzs: PriorityZone[],
): { hurts: boolean; worstZoneLabel: string; worstDropDb: number } {
  const mustHavePZs = pzs.filter(pz => pz.mustHaveCoverage);
  if (mustHavePZs.length === 0) return { hurts: false, worstZoneLabel: '', worstDropDb: 0 };

  const { grid: spatialGrid, allSegments } = buildSpatialGrid(
    walls, 9999, 9999, 0, 0, // bounds only needed for grid size, not used in RF calc
  );

  let worstDrop = 0;
  let worstLabel = '';

  for (const pz of mustHavePZs) {
    // 5 sample points: center + 4 inner quadrant centers
    const cx = pz.x + pz.width / 2;
    const cy = pz.y + pz.height / 2;
    const dx = pz.width / 4;
    const dy = pz.height / 4;
    const samplePoints = [
      { x: cx, y: cy },
      { x: cx - dx, y: cy - dy },
      { x: cx + dx, y: cy - dy },
      { x: cx - dx, y: cy + dy },
      { x: cx + dx, y: cy + dy },
    ];

    let sumBefore = 0;
    let sumAfter = 0;

    for (const pt of samplePoints) {
      let bestBefore = -Infinity;
      let bestAfter = -Infinity;

      for (const ap of aps.filter(a => a.enabled)) {
        const rssi = computeRSSI(pt.x, pt.y, ap, rfConfig, spatialGrid, allSegments);
        if (rssi > bestBefore) bestBefore = rssi;
      }
      for (const ap of modifiedAps.filter(a => a.enabled)) {
        const rssi = computeRSSI(pt.x, pt.y, ap, rfConfig, spatialGrid, allSegments);
        if (rssi > bestAfter) bestAfter = rssi;
      }

      sumBefore += bestBefore === -Infinity ? -100 : bestBefore;
      sumAfter += bestAfter === -Infinity ? -100 : bestAfter;
    }

    const avgBefore = sumBefore / samplePoints.length;
    const avgAfter = sumAfter / samplePoints.length;
    const drop = avgBefore - avgAfter;

    if (drop > worstDrop) {
      worstDrop = drop;
      worstLabel = pz.label || pz.zoneId;
    }
  }

  return {
    hurts: worstDrop > PZ_MAX_RSSI_DROP_DBM,
    worstZoneLabel: worstLabel,
    worstDropDb: Math.round(worstDrop * 10) / 10,
  };
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

  // C1: Compute global uplink-limited ratio once (used by add_ap/move_ap gating)
  let uplinkLimitedRatio = 0;
  if (stats.uplinkLimitedGrid && totalCells > 0) {
    let uplinkCount = 0;
    for (let i = 0; i < totalCells; i++) {
      if (stats.uplinkLimitedGrid[i]) uplinkCount++;
    }
    uplinkLimitedRatio = uplinkCount / totalCells;
  }

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

  // Enrich weak zones with relevance scores
  for (const wz of weakZones) {
    wz.zoneRelevance = computeZoneRelevance(wz, bounds, ctx.priorityZones, stats);
  }

  // Roaming pair analysis — computed EARLY so AP roles and TX guards can use it
  const roamingPairs = analyzeRoamingPairs(stats, apIds, band, ctx.priorityZones, bounds);

  // Classify AP roles (needs roamingPairs)
  const apRoles = new Map<string, ApRole>();
  for (const apId of apIds) {
    apRoles.set(apId, classifyApRole(apId, apMetrics, roamingPairs));
  }

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

  // 2. TX power adjustments (config, no physical change) — with AP role guards
  generateTxPowerSuggestions(
    recommendations, apMetrics, aps, walls, bounds, band, rfConfig, weights, totalCells, gridStep, ctx, apLabel, apRoles,
  );

  // 3. Coverage warnings (informational)
  generateCoverageWarnings(recommendations, stats, weakZones, totalCells, band, gridStep);

  // 4. Rotate AP suggestions (minor physical)
  generateRotateApSuggestions(
    recommendations, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx, apLabel,
  );

  // 5. Move AP suggestions (major physical) — with zone relevance
  generateMoveApSuggestions(
    recommendations, apMetrics, weakZones, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx, apLabel, stats, uplinkLimitedRatio,
  );

  // 6. Change mounting suggestions (major physical)
  generateMountingSuggestions(
    recommendations, apMetrics, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx, apLabel,
  );

  // 7. Add AP suggestions (infrastructure) — with exhaustion check and stacking penalty
  generateAddApSuggestions(
    recommendations, weakZones, aps, walls, bounds, band, rfConfig, weights, totalCells, gridStep, ctx, stats, apMetrics, uplinkLimitedRatio,
  );

  // 8a. Roaming TX power adjustments — dominant down (only when gap is small)
  generateRoamingTxAdjustments(
    recommendations, roamingPairs, apMetrics, aps, walls, bounds, band, rfConfig, weights, ctx, apLabel, stats,
  );

  // 8a2. Roaming TX boost — weaker AP up (when gap is high)
  generateRoamingTxBoosts(
    recommendations, roamingPairs, apMetrics, aps, walls, bounds, band, rfConfig, weights, ctx, apLabel, stats,
  );

  // 8b. Sticky-client risk warnings (informational)
  generateStickyClientWarnings(recommendations, roamingPairs, totalCells, band, apLabel);

  // 8c. Handoff gap warnings (informational)
  generateHandoffGapWarnings(recommendations, roamingPairs, totalCells, band, apLabel);

  // 8d. Roaming hints — only if no specific roaming warnings were generated
  const hasSpecificRoamingWarnings = recommendations.some(
    r => r.type === 'sticky_client_risk' || r.type === 'handoff_gap_warning' || r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost',
  );
  if (!hasSpecificRoamingWarnings) {
    generateRoamingHints(recommendations, stats, totalCells, band, gridStep);
  }

  // 9. Disable AP suggestions (before low_ap_value to avoid duplicate warnings)
  generateDisableApSuggestions(recommendations, apMetrics, aps, walls, bounds, band, rfConfig, weights, totalCells, apLabel);

  // 10. Low-value AP warnings (suppress for APs that already got disable_ap)
  const disabledApIds = new Set(
    recommendations.filter(r => r.type === 'disable_ap').flatMap(r => r.affectedApIds),
  );
  const filteredLowValue = lowValueApIds.filter(id => !disabledApIds.has(id));
  generateLowValueWarnings(recommendations, filteredLowValue, apMetrics, band, apLabel);

  // 11. Overlap warnings
  generateOverlapWarnings(recommendations, overlapZones, totalCells, band, gridStep);

  // 12. Band limit warnings
  generateBandLimitWarnings(recommendations, stats, band, totalCells);

  // 13. Constraint conflict warnings
  generateConstraintConflictWarnings(recommendations, aps, band, ctx, apLabel, stats);

  // 14. Preferred candidate location suggestions
  generatePreferredCandidateSuggestions(recommendations, aps, walls, bounds, band, rfConfig, weights, gridStep, ctx);

  // 15. Channel width recommendations (reduce width in multi-AP scenarios)
  generateChannelWidthRecommendations(recommendations, aps, accessPoints, band, apLabel);

  // 16. Cross-type prioritization: demote informational roaming hints when infrastructure_required exists
  // Rationale: when the engine says "you need cable/infrastructure", roaming fine-tuning is noise
  const hasInfraRequired = recommendations.some(r => r.type === 'infrastructure_required');
  if (hasInfraRequired) {
    for (const rec of recommendations) {
      if (rec.type === 'sticky_client_risk' || rec.type === 'handoff_gap_warning') {
        rec.priority = 'low';
        rec.severity = 'info';
      }
    }
  }

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

  // Sort: blocked last → category tier → recommendationScore → priority → severity
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const categoryTier: Record<string, number> = {
    actionable_config: 0, actionable_create: 0, instructional: 1, informational: 2,
  };
  recommendations.sort((a, b) => {
    // Blocked recommendations go last
    const aBlocked = (a.blockedByConstraints?.length ?? 0) > 0;
    const bBlocked = (b.blockedByConstraints?.length ?? 0) > 0;
    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;

    // Category tier: actionable before instructional before informational
    const aTier = categoryTier[RECOMMENDATION_CATEGORIES[a.type]] ?? 2;
    const bTier = categoryTier[RECOMMENDATION_CATEGORIES[b.type]] ?? 2;
    if (aTier !== bTier) return aTier - bTier;

    // Sort by recommendation score within tier (higher = better)
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
const INFORMATIONAL_TYPES = new Set(
  (Object.entries(RECOMMENDATION_CATEGORIES) as [RecommendationType, RecommendationCategory][])
    .filter(([, cat]) => cat === 'informational')
    .map(([type]) => type),
);

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

// ─── Candidate Rejection Analysis ─────────────────────────────────

/**
 * Analyze why candidates were rejected for a given ideal target position.
 * Checks each candidate against hard filters (forbidden, zone, wall, distance)
 * and returns top-3 rejection reasons sorted by frequency.
 */
function collectCandidateRejectionReasons(
  candidates: CandidateLocation[],
  idealX: number,
  idealY: number,
  walls: WallData[],
  constraintZones: ConstraintZone[],
  maxDistance: number,
): string[] {
  const counts = new Map<string, number>();

  for (const c of candidates) {
    if (c.forbidden) {
      counts.set('forbidden', (counts.get('forbidden') ?? 0) + 1);
      continue;
    }

    const zones = getConstraintsAtPoint(c.x, c.y, constraintZones);
    if (zones.some(z => z.type === 'forbidden' || z.type === 'no_new_ap')) {
      counts.set('forbidden', (counts.get('forbidden') ?? 0) + 1);
      continue;
    }

    if (!isPhysicallyValidApPosition(c.x, c.y, walls)) {
      counts.set('wall_invalid', (counts.get('wall_invalid') ?? 0) + 1);
      continue;
    }

    const dist = Math.sqrt((c.x - idealX) ** 2 + (c.y - idealY) ** 2);
    if (dist > maxDistance) {
      counts.set('too_far', (counts.get('too_far') ?? 0) + 1);
      continue;
    }

    // Candidate passed all hard filters — should have been usable
    // (only reaches here if sim benefit was too low, handled separately)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => reason);
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

/**
 * Check if a weak zone could be addressed by adjusting existing APs
 * (TX increase, move) rather than adding a new AP.
 */
function isWeakZoneAddressableByExistingAPs(
  zone: WeakZone,
  existingRecs: Recommendation[],
  aps: APConfig[],
  apMetrics?: Map<string, APMetrics>,
): { addressable: boolean; reason: string } {
  // Find APs within 8m of zone centroid
  for (const ap of aps) {
    const dx = zone.centroidX - ap.x;
    const dy = zone.centroidY - ap.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= 8) continue;

    // Check if this nearby AP already has a config recommendation that could help
    const hasHelpfulRec = existingRecs.some(r =>
      r.affectedApIds.includes(ap.id) &&
      (r.type === 'adjust_tx_power' || r.type === 'move_ap' || r.type === 'roaming_tx_adjustment' || r.type === 'roaming_tx_boost') &&
      r.simulatedDelta && r.simulatedDelta.changePercent > 2,
    );

    if (hasHelpfulRec) {
      return { addressable: true, reason: `existing AP ${ap.id} has pending adjustments` };
    }
  }

  return { addressable: false, reason: '' };
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
  uplinkLimitedRatio = 0,
): void {
  // Sort large zones by cellCount * zoneRelevance (relevance-weighted)
  const largeZones = weakZones
    .filter(z => z.cellCount >= 20)
    .sort((a, b) => (b.cellCount * (b.zoneRelevance ?? 0.5)) - (a.cellCount * (a.zoneRelevance ?? 0.5)));
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
  let addApCount = 0;
  let infraRequiredCount = 0;
  const MAX_INFRA_REQUIRED = 2;

  for (const zone of topZones) {
    // Exhaust existing infrastructure: check if a nearby AP with existing config rec could address this
    const exhaustion = isWeakZoneAddressableByExistingAPs(zone, recs, aps, apMetrics);
    if (exhaustion.addressable) continue;

    // Check if zone is uplink-limited (>50% cells) — add_ap won't help
    if (stats.uplinkLimitedGrid && zone.cellIndices.length > 0) {
      let uplinkCount = 0;
      for (const idx of zone.cellIndices) {
        if (stats.uplinkLimitedGrid[idx]) uplinkCount++;
      }
      if (uplinkCount / zone.cellIndices.length > 0.50) continue;
    }

    // Coverage Impact First: skip marginally weak zones that are small.
    // Only add AP for zones that are critically weak (avgRssi <= -80)
    // OR contribute significantly (>= 5% of total cells).
    if (zone.avgRssi > -80 && totalCells > 0 && (zone.cellCount / totalCells) < 0.05) continue;

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

    // C1: When global uplink is heavily limited, require higher benefit for add_ap
    // Exception: mustHaveCoverage PZ zones keep the normal 2% threshold
    const hasMustHaveCoverage = matchingPZ?.mustHaveCoverage === true;
    const uplinkMinBenefit = (!hasMustHaveCoverage && uplinkLimitedRatio > UPLINK_SUPPRESS_ADD_MOVE)
      ? UPLINK_ADD_MOVE_MIN_BENEFIT : 2;

    const policy = ctx.candidatePolicy ?? 'required_for_new_ap';
    const requireCandidates = policy !== 'optional';

    // Try to find a candidate location if candidates are available
    if (ctx.candidates.length > 0) {
      const match = findBestCandidate(idealX, idealY, ctx.candidates, ctx.constraintZones, undefined, MAX_IDEAL_DISTANCE_ADD_AP_M);

      if (match.candidate && isPhysicallyValidApPosition(match.candidate.x, match.candidate.y, walls)) {
        const delta = simulateAddAP(
          aps, walls, bounds, band, rfConfig,
          { x: match.candidate.x, y: match.candidate.y },
          {
            ...templateConfig,
            mounting: match.candidate.mountingOptions[0] ?? 'ceiling',
          },
          weights,
        );

        if (delta.changePercent > uplinkMinBenefit) {
          // Stacking penalty: 2nd add_ap gets severity -1, 3rd gets priority -1 too
          let stackPriority: 'high' | 'medium' | 'low' = 'medium';
          let stackSeverity: 'critical' | 'warning' | 'info' = match.requiresInfrastructure ? 'warning' : 'info';
          if (addApCount >= 2) stackPriority = 'low';
          if (addApCount >= 1 && stackSeverity !== 'info') stackSeverity = 'info';
          // Always show candidate label when candidate is selected (coordinates as detail only)
          const candidateLabel = match.candidate.label || `Candidate ${match.candidate.id}`;
          const addTitleKey = 'rec.addApAtCandidateTitle';
          const infraTitleKey = 'rec.infraRequiredAtCandidateTitle';
          recs.push({
            id: genId(),
            type: match.requiresInfrastructure ? 'infrastructure_required' : 'add_ap',
            priority: stackPriority,
            severity: stackSeverity,
            titleKey: match.requiresInfrastructure ? infraTitleKey : addTitleKey,
            titleParams: {
              x: Math.round(match.candidate.x * 10) / 10,
              y: Math.round(match.candidate.y * 10) / 10,
              candidate: candidateLabel,
            },
            reasonKey: addApCount > 0 ? 'rec.addApCandidateStackingReason' : 'rec.addApCandidateReason',
            reasonParams: {
              cells: zone.cellCount,
              avgRssi: Math.round(zone.avgRssi),
              candidate: candidateLabel,
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
          if (match.requiresInfrastructure) infraRequiredCount++;
          addApCount++;
          continue; // Next zone
        }
        // Candidate exists but benefit too small — don't fall through to fallback
        // with arbitrary coordinates when user has defined candidate positions
        continue;
      } else {
        // No usable candidate — analyze rejection reasons across all candidates
        if (infraRequiredCount >= MAX_INFRA_REQUIRED) continue;
        const rejectionReasons = collectCandidateRejectionReasons(
          ctx.candidates, idealX, idealY, walls, ctx.constraintZones, MAX_IDEAL_DISTANCE_ADD_AP_M,
        );
        const infraLabel = match.candidate?.label;

        // Distinguish "all too far" from "other rejection reasons"
        const allTooFar = rejectionReasons.length > 0 && rejectionReasons.every(r => r === 'too_far');
        const nearestDist = ctx.candidates.length > 0
          ? Math.min(...ctx.candidates.filter(c => !c.forbidden).map(c => Math.sqrt((c.x - idealX) ** 2 + (c.y - idealY) ** 2)))
          : Infinity;

        recs.push({
          id: genId(),
          type: 'infrastructure_required',
          priority: 'high',
          severity: 'warning',
          titleKey: infraLabel ? 'rec.infraRequiredAtCandidateTitle' : 'rec.infraRequiredTitle',
          titleParams: {
            x: Math.round(idealX * 10) / 10,
            y: Math.round(idealY * 10) / 10,
            ...(infraLabel ? { candidate: infraLabel } : {}),
          },
          reasonKey: allTooFar ? 'rec.infraNoCandidateCloseEnoughReason' : 'rec.infraNoValidCandidateReason',
          reasonParams: {
            cells: zone.cellCount,
            candidateCount: ctx.candidates.length,
            reasons: rejectionReasons.join(', ') || 'all_candidates_filtered',
            no_candidate_valid: 1,
            maxDistance: MAX_IDEAL_DISTANCE_ADD_AP_M,
            nearestDistance: Math.round(nearestDist * 10) / 10,
            candidatePolicy: policy,
          },
          affectedApIds: [],
          affectedBand: band,
          evidence: {
            metrics: {
              weakCells: zone.cellCount, avgRssi: zone.avgRssi,
              candidateCount: ctx.candidates.length,
            },
            affectedCells: zone.cellIndices.slice(0, 2000),
            gridStep,
          },
          confidence: 0.5,
          idealTargetPosition: { x: idealX, y: idealY },
          infrastructureRequired: true,
          requiresUserDecision: true,
        });
        infraRequiredCount++;
        continue; // Next zone
      }
    }

    // No candidate locations defined
    if (requireCandidates) {
      // Cap: max MAX_INFRA_REQUIRED infrastructure_required per analysis (avoid spam)
      if (infraRequiredCount >= MAX_INFRA_REQUIRED) continue;
      // Policy requires candidates — emit infrastructure_required instead of placing freely
      // High priority: this is a blocker that explains why no add_ap is possible
      recs.push({
        id: genId(),
        type: 'infrastructure_required',
        priority: 'high',
        severity: 'warning',
        titleKey: 'rec.infraRequiredTitle',
        titleParams: {
          x: Math.round(idealX * 10) / 10,
          y: Math.round(idealY * 10) / 10,
        },
        reasonKey: 'rec.infraNoCandidatesDefinedReason',
        reasonParams: {
          cells: zone.cellCount,
          policy,
          candidateCount: 0,
          candidatePolicy: policy,
        },
        affectedApIds: [],
        affectedBand: band,
        evidence: {
          metrics: {
            weakCells: zone.cellCount, avgRssi: zone.avgRssi,
            candidateCount: 0,
          },
          affectedCells: zone.cellIndices.slice(0, 2000),
          gridStep,
        },
        confidence: 0.5,
        idealTargetPosition: { x: idealX, y: idealY },
        infrastructureRequired: true,
        requiresUserDecision: true,
      });
      infraRequiredCount++;
      continue;
    }

    // Policy is 'optional' and no candidates — fallback: place at RF-weighted ideal position
    if (!isMovementAllowed(idealX, idealY, ctx.constraintZones)) continue;
    if (!isPhysicallyValidApPosition(idealX, idealY, walls)) continue;

    const fallbackDelta = simulateAddAP(
      aps, walls, bounds, band, rfConfig,
      { x: idealX, y: idealY },
      templateConfig,
      weights,
    );

    if (fallbackDelta.changePercent > uplinkMinBenefit) {
      let stackPriority: 'high' | 'medium' | 'low' = 'medium';
      let stackSeverity: 'critical' | 'warning' | 'info' = 'warning';
      if (addApCount >= 2) stackPriority = 'low';
      if (addApCount >= 1) stackSeverity = 'info';
      recs.push({
        id: genId(),
        type: 'add_ap',
        priority: stackPriority,
        severity: stackSeverity,
        titleKey: 'rec.addApTitle',
        titleParams: {
          x: Math.round(idealX * 10) / 10,
          y: Math.round(idealY * 10) / 10,
        },
        reasonKey: 'rec.addApFallbackReason',
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
          metrics: { weakCells: zone.cellCount, avgRssi: zone.avgRssi, candidateCount: 0, usedFallback: 1 },
          affectedCells: zone.cellIndices.slice(0, 2000),
          gridStep,
        },
        simulatedDelta: fallbackDelta,
        confidence: 0.6,
        idealTargetPosition: { x: idealX, y: idealY },
      });
      addApCount++;
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
  uplinkLimitedRatio = 0,
): void {
  if (weakZones.length === 0) return;

  for (const ap of aps) {
    const metrics = apMetrics.get(ap.id);
    if (!metrics || metrics.primaryCoverageRatio > 0.25) continue;

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

    // Find top weak zones weighted by distance and priority zone importance (multi-zone)
    const scoredZones: { zone: WeakZone; score: number; pz?: typeof ctx.priorityZones[0] }[] = [];
    for (const zone of weakZones) {
      const zonePZ = ctx.priorityZones.find(pz =>
        zone.centroidX >= pz.x && zone.centroidX <= pz.x + pz.width &&
        zone.centroidY >= pz.y && zone.centroidY <= pz.y + pz.height,
      );
      if (zonePZ && zonePZ.targetBand !== 'either' && zonePZ.targetBand !== band) continue;

      const dx = zone.centroidX - ap.x;
      const dy = zone.centroidY - ap.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue; // Too close to current position

      // Score: closer zones score higher, priority zones get boost, larger zones preferred, relevance-weighted
      const distScore = Math.max(0, 100 - dist * 5);
      const priorityBoost = zonePZ ? zonePZ.weight * 20 : 0;
      const sizeBoost = Math.min(30, zone.cellCount / 5);
      const relevanceFactor = zone.zoneRelevance ?? 0.5;
      scoredZones.push({ zone, score: (distScore + priorityBoost + sizeBoost) * relevanceFactor, pz: zonePZ });
    }
    scoredZones.sort((a, b) => b.score - a.score);
    const topZones = scoredZones.slice(0, 3);
    if (topZones.length === 0) continue;

    let bestDelta: SimulatedDelta | null = null;
    let bestPos = { x: ap.x, y: ap.y };
    let selectedCandidateLabel: string | undefined;
    let bestTarget = { x: topZones[0]!.zone.centroidX, y: topZones[0]!.zone.centroidY };
    const alternativePositions: { pos: { x: number; y: number }; delta: SimulatedDelta; label?: string }[] = [];

    const ox = bounds.originX ?? 0;
    const oy = bounds.originY ?? 0;

    const movePolicy = ctx.candidatePolicy ?? 'required_for_new_ap';

    for (const { zone } of topZones) {
      // RF-weighted target instead of geometric centroid (Task 5)
      const target = computeWeightedTarget(zone, stats, ox, oy, gridStep);

      // Strategy 1: Use candidate locations if available (preferred)
      if (ctx.candidates.length > 0) {
        const match = findBestCandidate(
          target.x, target.y,
          ctx.candidates, ctx.constraintZones,
          undefined, MAX_IDEAL_DISTANCE_MOVE_AP_M,
        );

        if (match.candidate) {
          for (const ranked of match.rankedCandidates) {
            const c = ranked.candidate;
            const distFromCurrent = Math.sqrt((c.x - ap.x) ** 2 + (c.y - ap.y) ** 2);
            if (distFromCurrent < 0.5) continue;
            // Physical validation: skip candidates inside walls (Task 7)
            if (!isPhysicallyValidApPosition(c.x, c.y, walls)) continue;

            const mod: APModification = {
              apId: ap.id,
              position: { x: c.x, y: c.y },
            };
            const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

            if (delta.changePercent > 3) {
              alternativePositions.push({ pos: { x: c.x, y: c.y }, delta, label: c.label });
            }

            if (!bestDelta || delta.scoreAfter > bestDelta.scoreAfter) {
              bestDelta = delta;
              bestPos = { x: c.x, y: c.y };
              selectedCandidateLabel = c.label;
              bestTarget = target;
            }
          }
        }
      }

      // Strategy 2: Fallback — interpolate towards RF-weighted target
      // Only when no candidate locations are defined AND policy allows free placement for moves.
      const moveFallbackAllowed = ctx.candidates.length === 0 && movePolicy !== 'required_for_move_and_new_ap';
      if (moveFallbackAllowed && (!bestDelta || bestDelta.changePercent <= 3)) {
        const dx = target.x - ap.x;
        const dy = target.y - ap.y;
        const fractions = [0.25, 0.5, 0.75];

        for (const frac of fractions) {
          const candidateX = ap.x + dx * frac;
          const candidateY = ap.y + dy * frac;

          if (candidateX < ox || candidateX > ox + bounds.width ||
              candidateY < oy || candidateY > oy + bounds.height) continue;
          if (!isMovementAllowed(candidateX, candidateY, ctx.constraintZones)) continue;
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
            bestTarget = target;
          }
        }
      }
    }

    // C1: When uplink is heavily limited, require higher benefit for move_ap
    const moveMinBenefit = uplinkLimitedRatio > UPLINK_SUPPRESS_ADD_MOVE
      ? UPLINK_ADD_MOVE_MIN_BENEFIT : 3;

    // When policy requires candidate positions for moves, but no candidate produced a useful position → blocked
    const moveBlocked = movePolicy === 'required_for_move_and_new_ap'
      && (!bestDelta || bestDelta.changePercent <= moveMinBenefit);
    if (moveBlocked) {
      const blockReason = ctx.candidates.length === 0
        ? 'no_candidates_defined'
        : 'no_candidate_close_enough';
      const nearestMoveDist = ctx.candidates.length > 0
        ? Math.min(...ctx.candidates.filter(c => !c.forbidden).map(c =>
            Math.sqrt((c.x - bestTarget.x) ** 2 + (c.y - bestTarget.y) ** 2)))
        : Infinity;
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
          reason: blockReason,
          candidateCount: ctx.candidates.length,
          candidatePolicy: movePolicy,
          nearestDistance: nearestMoveDist === Infinity ? -1 : Math.round(nearestMoveDist * 10) / 10,
          maxDistance: MAX_IDEAL_DISTANCE_MOVE_AP_M,
        },
        affectedApIds: [ap.id],
        affectedBand: band,
        evidence: {
          metrics: {
            currentCoverage: metrics.primaryCoverageRatio,
            candidateCount: ctx.candidates.length,
            nearestDistance: nearestMoveDist === Infinity ? -1 : Math.round(nearestMoveDist * 10) / 10,
            maxDistance: MAX_IDEAL_DISTANCE_MOVE_AP_M,
          },
          gridStep,
        },
        confidence: 0.5,
        blockedByConstraints: [
          ctx.candidates.length === 0
            ? 'No candidate locations defined and policy requires them for moves'
            : `No candidate within ${MAX_IDEAL_DISTANCE_MOVE_AP_M}m of target zone`,
        ],
      });
      continue;
    }

    if (bestDelta && bestDelta.changePercent > moveMinBenefit) {
      const titleParams: Record<string, string | number> = {
        ap: apLabel(ap.id),
        x: Math.round(bestPos.x * 10) / 10,
        y: Math.round(bestPos.y * 10) / 10,
      };
      if (selectedCandidateLabel) {
        titleParams.candidate = selectedCandidateLabel;
      }

      // Build alternative recommendations from other viable positions (Task 8)
      const alternatives: Recommendation[] = [];
      for (const alt of alternativePositions) {
        if (alt.pos.x === bestPos.x && alt.pos.y === bestPos.y) continue;
        if (!alt.delta || alt.delta.changePercent <= 1) continue;
        alternatives.push({
          id: genId(),
          type: 'move_ap',
          priority: alt.delta.changePercent > 10 ? 'high' : 'medium',
          severity: alt.delta.changePercent > 10 ? 'critical' : 'warning',
          titleKey: alt.label ? 'rec.moveApToCandidateTitle' : 'rec.moveApTitle',
          titleParams: {
            ap: apLabel(ap.id),
            x: Math.round(alt.pos.x * 10) / 10,
            y: Math.round(alt.pos.y * 10) / 10,
            ...(alt.label ? { candidate: alt.label } : {}),
          },
          reasonKey: 'rec.moveApReason',
          reasonParams: {
            coverage: Math.round(metrics.primaryCoverageRatio * 100),
            improvement: Math.round(alt.delta.changePercent),
          },
          affectedApIds: [ap.id],
          affectedBand: band,
          suggestedChange: {
            apId: ap.id,
            parameter: 'position',
            currentValue: `(${ap.x.toFixed(1)}, ${ap.y.toFixed(1)})`,
            suggestedValue: `(${alt.pos.x.toFixed(1)}, ${alt.pos.y.toFixed(1)})`,
          },
          evidence: { metrics: { improvement: alt.delta.changePercent }, gridStep },
          simulatedDelta: alt.delta,
          confidence: 0.7,
          selectedCandidatePosition: alt.pos,
        });
      }

      recs.push({
        id: genId(),
        type: 'move_ap',
        priority: bestDelta.changePercent > 10 ? 'high' : 'medium',
        severity: bestDelta.changePercent > 10 ? 'critical' : 'warning',
        titleKey: selectedCandidateLabel ? 'rec.moveApToCandidateTitle' : 'rec.moveApTitle',
        titleParams,
        reasonKey: selectedCandidateLabel ? 'rec.moveApReason' : 'rec.moveApInterpolationReason',
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
        selectedCandidatePosition: selectedCandidateLabel ? bestPos : undefined,
        idealTargetPosition: bestTarget,
        distanceToIdeal: Math.sqrt((bestPos.x - bestTarget.x) ** 2 + (bestPos.y - bestTarget.y) ** 2),
        alternativeRecommendations: alternatives.length > 0 ? alternatives.slice(0, 3) : undefined,
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
  apRoles: Map<string, ApRole> = new Map(),
  uplinkLimitedRatio = 0,
): void {
  // Uplink-aware TX increase suppression: when >60% of cells are uplink-limited,
  // TX increase rarely helps (bottleneck is client→AP, not AP→client).
  const UPLINK_SUPPRESS_TX_INCREASE = 0.60;
  const UPLINK_TX_INCREASE_MIN_BENEFIT = 10;

  for (const ap of aps) {
    // Check capabilities
    if (!isActionAllowed(ap.id, 'adjust_tx_power', band, ctx)) continue;

    const metrics = apMetrics.get(ap.id);
    if (!metrics) continue;

    // Band-specific parameter name for TX power
    const txParamName = band === '2.4ghz' ? 'tx_power_24ghz' : band === '6ghz' ? 'tx_power_6ghz' : 'tx_power_5ghz';

    // AP role-based overlap threshold: central APs need higher overlap to justify reduction
    const role = apRoles.get(ap.id) ?? 'edge';
    const overlapThreshold = role === 'central' ? 0.25 : 0.15;

    // If this AP has lots of overlap, try reducing TX power
    const overlapRatio = totalCells > 0 ? metrics.overlapCells / totalCells : 0;
    if (overlapRatio > overlapThreshold) {
      const lowerPower = ap.txPowerDbm - 3;
      if (lowerPower >= 10) {
        const mod: APModification = { apId: ap.id, txPowerDbm: lowerPower };
        const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

        // Gap check: skip if TX reduction would increase "none" coverage by >10%
        if (delta.coverageAfter.none > delta.coverageBefore.none + 10) {
          // Would create a coverage hole — skip
        } else {
          const txPzCheck = wouldHurtPriorityZone(
            aps, aps.map(a => a.id === ap.id ? { ...a, txPowerDbm: lowerPower } : a),
            walls, band, rfConfig, ctx.priorityZones,
          );
          if (txPzCheck.hurts) {
            // Emit informational note explaining WHY TX reduction was not applied
            recs.push({
              id: genId(),
              type: 'sticky_client_risk',
              priority: 'low',
              severity: 'info',
              titleKey: 'rec.pzBlockedTxTitle',
              titleParams: { ap: apLabel(ap.id), pz: txPzCheck.worstZoneLabel },
              reasonKey: 'rec.pzBlockedTxReason',
              reasonParams: {
                ap: apLabel(ap.id),
                pz: txPzCheck.worstZoneLabel,
                dropDb: txPzCheck.worstDropDb,
                overlapPercent: Math.round(overlapRatio * 100),
              },
              affectedApIds: [ap.id],
              affectedBand: band,
              evidence: {
                metrics: {
                  overlapRatio,
                  wouldHurtPriorityZone: 1,
                  pzDropDb: txPzCheck.worstDropDb,
                },
              },
              confidence: 0.6,
            });
          } else if (delta.changePercent > -5) {
            const absImprove = Math.abs(delta.changePercent);
            recs.push({
              id: genId(),
              type: 'adjust_tx_power',
              priority: absImprove > 15 ? 'high' : absImprove > 8 ? 'medium' : 'low',
              severity: absImprove > 15 ? 'critical' : absImprove > 8 ? 'warning' : 'info',
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
    }

    // If AP has low coverage (and we didn't already suggest reducing), try increasing TX power
    if (metrics.primaryCoverageRatio < 0.15) {
      // Uplink-aware suppression: when >60% of cells are uplink-limited,
      // TX increase rarely helps (the bottleneck is client→AP, not AP→client).
      // Require much higher improvement (≥10%) to justify the recommendation.
      const txIncreaseMinBenefit = uplinkLimitedRatio > UPLINK_SUPPRESS_TX_INCREASE
        ? UPLINK_TX_INCREASE_MIN_BENEFIT : 2;

      const higherPower = ap.txPowerDbm + 3;
      if (higherPower <= 30) {
        const mod: APModification = { apId: ap.id, txPowerDbm: higherPower };
        const delta = simulateChange(aps, walls, bounds, band, rfConfig, mod, weights);

        // Quality gate: improvement above threshold AND at least 5 new "good" cells
        const newGoodCells = (delta.coverageAfter.excellent + delta.coverageAfter.good)
          - (delta.coverageBefore.excellent + delta.coverageBefore.good);
        if (delta.changePercent > txIncreaseMinBenefit && newGoodCells >= 5) {
          recs.push({
            id: genId(),
            type: 'adjust_tx_power',
            priority: delta.changePercent > 15 ? 'high' : delta.changePercent > 8 ? 'medium' : 'low',
            severity: delta.changePercent > 15 ? 'critical' : delta.changePercent > 8 ? 'warning' : 'info',
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

/**
 * Greedy channel assignment: assigns conflict-free channels across all APs.
 *
 * Instead of per-conflict recommendations, this builds a global channel plan:
 * 1. Identify APs involved in conflicts (score >= 0.3)
 * 2. Sort by total conflict severity (worst first)
 * 3. Greedily assign the channel with lowest conflict against already-assigned APs
 * 4. Emit one recommendation per AP whose assigned channel differs from current
 */
function generateChannelRecommendations(
  recs: Recommendation[],
  channelAnalysis: ReturnType<typeof analyzeChannelConflicts>,
  accessPoints: AccessPointResponse[],
  band: FrequencyBand,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
): void {
  const analysisBand: AnalysisBand = band === '6ghz' ? '5ghz' : band as AnalysisBand;
  const pool = ALLOWED_CHANNELS[analysisBand];
  const range = analysisBand === '2.4ghz' ? 35 : 20;

  // ── Step 1: Build conflict graph ───────────────────────────────
  // Nodes = APs with meaningful conflicts, Edges = conflict score ≥ 0.3
  const CONFLICT_EDGE_MIN = 0.3;
  const adjacency = new Map<string, Map<string, number>>(); // apId → Map<neighborId, score>

  for (const conflict of channelAnalysis.conflicts) {
    if (conflict.score < CONFLICT_EDGE_MIN) continue;
    if (!adjacency.has(conflict.ap1Id)) adjacency.set(conflict.ap1Id, new Map());
    if (!adjacency.has(conflict.ap2Id)) adjacency.set(conflict.ap2Id, new Map());
    const existing1 = adjacency.get(conflict.ap1Id)!.get(conflict.ap2Id) ?? 0;
    adjacency.get(conflict.ap1Id)!.set(conflict.ap2Id, Math.max(existing1, conflict.score));
    const existing2 = adjacency.get(conflict.ap2Id)!.get(conflict.ap1Id) ?? 0;
    adjacency.get(conflict.ap2Id)!.set(conflict.ap1Id, Math.max(existing2, conflict.score));
  }

  if (adjacency.size === 0) return;

  // ── Step 2: Find connected components (BFS) ───────────────────
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;
    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency.get(current)?.keys() ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  // ── Step 3: Graph-coloring per component ───────────────────────
  // Current channel assignments (baseline)
  const currentChannels = new Map<string, number>();
  for (const ap of accessPoints) {
    if (!ap.enabled) continue;
    const ch = analysisBand === '2.4ghz' ? ap.channel_24ghz : ap.channel_5ghz;
    if (ch != null) currentChannels.set(ap.id, ch);
  }

  // New assignments after coloring
  const coloredChannels = new Map<string, number>(currentChannels);
  const exhaustedComponents: string[][] = [];

  for (const component of components) {
    // Sort by degree (most neighbors first) → greedy coloring priority
    const sorted = component
      .map(id => ({ id, degree: adjacency.get(id)?.size ?? 0 }))
      .sort((a, b) => b.degree - a.degree);

    for (const { id: targetApId } of sorted) {
      if (!isActionAllowed(targetApId, 'change_channel', band, ctx)) continue;

      const targetAp = accessPoints.find(a => a.id === targetApId);
      if (!targetAp) continue;

      // Score each pool channel against NEIGHBORS' colored assignments
      const channelScores = pool.map(ch => {
        let conflictScore = 0;

        // Score against graph neighbors (in-component, nearby)
        for (const [neighborId, edgeScore] of adjacency.get(targetApId) ?? []) {
          const neighborCh = coloredChannels.get(neighborId);
          if (neighborCh == null) continue;

          if (analysisBand === '2.4ghz') {
            const channelDiff = Math.abs(ch - neighborCh);
            if (channelDiff === 0) {
              conflictScore += edgeScore;
            } else if (channelDiff <= 4) {
              conflictScore += edgeScore * 0.5 * (1 - channelDiff / 5);
            }
          } else {
            if (ch === neighborCh) conflictScore += edgeScore;
          }
        }

        // Also score against non-graph APs that are within range (passive conflicts)
        for (const other of accessPoints) {
          if (other.id === targetApId || !other.enabled) continue;
          if (adjacency.get(targetApId)?.has(other.id)) continue; // Already counted
          const otherCh = coloredChannels.get(other.id);
          if (otherCh == null) continue;

          const dx = targetAp.x - other.x;
          const dy = targetAp.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > range) continue;

          const distanceFactor = 1 - (distance / range);
          if (analysisBand === '2.4ghz') {
            const channelDiff = Math.abs(ch - otherCh);
            if (channelDiff === 0) conflictScore += 0.3 * distanceFactor;
            else if (channelDiff <= 4) conflictScore += 0.15 * (1 - channelDiff / 5) * distanceFactor;
          } else {
            if (ch === otherCh) conflictScore += 0.3 * distanceFactor;
          }
        }

        return { channel: ch, score: conflictScore };
      });

      channelScores.sort((a, b) => a.score - b.score);
      coloredChannels.set(targetApId, channelScores[0]!.channel);
    }

    // Check exhaustion: if component has more APs than pool size, some share channels
    if (component.length > pool.length) {
      // Check if any neighbors actually share the same channel after coloring
      let hasCollision = false;
      for (const apId of component) {
        for (const neighborId of adjacency.get(apId)?.keys() ?? []) {
          if (coloredChannels.get(apId) === coloredChannels.get(neighborId)) {
            hasCollision = true;
            break;
          }
        }
        if (hasCollision) break;
      }
      if (hasCollision) exhaustedComponents.push(component);
    }
  }

  // ── Step 4: Collect channel changes ────────────────────────────
  const channelChanges = new Map<string, { from: number; to: number; worstScore: number }>();

  for (const [apId, newCh] of coloredChannels) {
    const oldCh = currentChannels.get(apId);
    if (oldCh == null || oldCh === newCh) continue;
    if (!adjacency.has(apId)) continue; // Not in conflict graph

    const summary = channelAnalysis.apSummaries.find(s => s.apId === apId);
    channelChanges.set(apId, { from: oldCh, to: newCh, worstScore: summary?.worstScore ?? 0 });
  }

  // When pool is exhausted (component > pool), limit actionable channel recs to 2
  // to avoid "change everything to channel X" spam. Exhaustion warning covers the rest.
  const maxChannelRecs = exhaustedComponents.length > 0 ? 2 : 5;

  if (channelChanges.size > maxChannelRecs) {
    const sorted = [...channelChanges.entries()]
      .sort((a, b) => b[1].worstScore - a[1].worstScore)
      .slice(0, maxChannelRecs)
      .map(([id]) => id);
    const keepSet = new Set(sorted);
    for (const [apId] of [...channelChanges]) {
      if (!keepSet.has(apId)) channelChanges.delete(apId);
    }
  }

  // ── Step 5: Emit recommendations ───────────────────────────────
  const channelParamName = band === '2.4ghz' ? 'channel_24ghz' : band === '6ghz' ? 'channel_6ghz' : 'channel_5ghz';

  for (const [targetApId, change] of channelChanges) {
    const worstConflict = channelAnalysis.conflicts.find(
      c => (c.ap1Id === targetApId || c.ap2Id === targetApId) && c.score >= CONFLICT_EDGE_MIN,
    );

    // B2: Skip distant low-severity conflicts
    if (worstConflict && worstConflict.distanceM > 12 && change.worstScore < 0.5) continue;

    const otherApId = worstConflict
      ? (worstConflict.ap1Id === targetApId ? worstConflict.ap2Id : worstConflict.ap1Id)
      : undefined;

    let reasonKey = 'rec.changeChannelReason';
    if (otherApId && worstConflict) {
      const targetSummary = channelAnalysis.apSummaries.find(s => s.apId === targetApId);
      const otherSummary = channelAnalysis.apSummaries.find(s => s.apId === otherApId);
      if (targetSummary && otherSummary &&
          (targetSummary.worstScore ?? 0) > 0.2 && (otherSummary.worstScore ?? 0) > 0.2) {
        reasonKey = 'rec.changeChannelTxAlternativeReason';
      }
    }

    recs.push({
      id: genId(),
      type: 'change_channel',
      priority: change.worstScore >= 0.6 ? 'high' : 'medium',
      severity: change.worstScore >= 0.6 ? 'critical' : 'warning',
      titleKey: 'rec.changeChannelTitle',
      titleParams: { ap: apLabel(targetApId), channel: change.to },
      reasonKey,
      reasonParams: {
        type: 'co-channel' as const,
        otherAp: otherApId ? apLabel(otherApId) : '',
        distance: worstConflict ? Math.round(worstConflict.distanceM * 10) / 10 : 0,
      },
      affectedApIds: otherApId ? [targetApId, otherApId] : [targetApId],
      affectedBand: band,
      suggestedChange: {
        apId: targetApId,
        parameter: channelParamName,
        currentValue: change.from,
        suggestedValue: change.to,
      },
      evidence: {
        metrics: {
          conflictScore: worstConflict?.score ?? change.worstScore,
          distance: worstConflict?.distanceM ?? 0,
        },
      },
      confidence: 0.85,
    });
  }

  // ── Step 6: Channel exhaustion warning ─────────────────────────
  if (exhaustedComponents.length > 0) {
    const biggestComponent = exhaustedComponents.sort((a, b) => b.length - a.length)[0]!;
    recs.push({
      id: genId(),
      type: 'overlap_warning',
      priority: 'medium',
      severity: 'warning',
      titleKey: 'rec.channelExhaustionTitle',
      titleParams: { count: biggestComponent.length, poolSize: pool.length },
      reasonKey: 'rec.channelExhaustionReason',
      reasonParams: {
        count: biggestComponent.length,
        poolSize: pool.length,
        band: analysisBand,
      },
      affectedApIds: biggestComponent,
      affectedBand: band,
      evidence: {
        metrics: {
          componentSize: biggestComponent.length,
          poolSize: pool.length,
        },
      },
      confidence: 0.9,
    });
  }

  // B3: 6 GHz informational note
  if (band === '6ghz') {
    recs.push({
      id: genId(),
      type: 'band_limit_warning',
      priority: 'low',
      severity: 'info',
      titleKey: 'rec.sixGhzChannelNoteTitle',
      titleParams: {},
      reasonKey: 'rec.sixGhzChannelNoteReason',
      reasonParams: {},
      affectedApIds: [],
      affectedBand: band,
      evidence: { metrics: { sixGhzBand: 1 } },
      confidence: 0.9,
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

// ─── Roaming Generators ──────────────────────────────────────────

function generateRoamingTxAdjustments(
  recs: Recommendation[],
  pairs: RoamingPairMetrics[],
  apMetrics: Map<string, APMetrics>,
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
  stats: HeatmapStats,
): void {
  const txParamName = band === '2.4ghz' ? 'tx_power_24ghz' : band === '6ghz' ? 'tx_power_6ghz' : 'tx_power_5ghz';

  // Collect APs that already have an adjust_tx_power recommendation (avoid cross-type duplicates)
  const txPowerApIds = new Set(
    recs.filter(r => r.type === 'adjust_tx_power').flatMap(r => r.affectedApIds),
  );

  // C2: Compute uplink-limited ratio once
  const totalCells = stats.totalCells ?? 0;
  let uplinkLimitedCount = 0;
  if (stats.uplinkLimitedGrid && totalCells > 0) {
    for (let i = 0; i < totalCells; i++) {
      if (stats.uplinkLimitedGrid[i]) uplinkLimitedCount++;
    }
  }
  const uplinkLimitedRatio = totalCells > 0 ? uplinkLimitedCount / totalCells : 0;

  for (const pair of pairs) {
    // Q1: Pair relevance filter — skip noisy small pairs
    if (pair.totalPairCells < MIN_PAIR_CELLS
        && (totalCells === 0 || pair.totalPairCells / totalCells < MIN_PAIR_RATIO)) continue;

    // A2: Skip when handoff zone is too small (trivial pair)
    if (pair.handoffZoneCells < MIN_HANDOFF_CELLS && pair.handoffZoneRatio < MIN_HANDOFF_RATIO) continue;

    // A4: Require meaningful sticky or gap signal before proceeding
    const gapRatio = pair.gapCells / Math.max(pair.handoffZoneCells, 1);
    if (pair.stickyRatio < STICKY_TRIGGER && gapRatio < GAP_TRIGGER) continue;

    // A7: Only reduce dominant TX when gap is small — high gap uses boost instead
    if (gapRatio >= GAP_MAX_FOR_ADJUSTMENT) continue;

    // Identify dominant AP in this pair
    const m1 = apMetrics.get(pair.ap1Id);
    const m2 = apMetrics.get(pair.ap2Id);
    if (!m1 || !m2) continue;

    const dominantId = m1.primaryCoverageRatio >= m2.primaryCoverageRatio ? pair.ap1Id : pair.ap2Id;
    const otherId = dominantId === pair.ap1Id ? pair.ap2Id : pair.ap1Id;
    const dominantAp = aps.find(a => a.id === dominantId);
    if (!dominantAp) continue;

    // Skip if this AP already has an adjust_tx_power recommendation (cross-type dedup)
    if (txPowerApIds.has(dominantId)) continue;

    // A6: Capability check — emit blocked_recommendation if TX power change is not allowed
    if (!isActionAllowed(dominantId, 'adjust_tx_power', band, ctx)) {
      recs.push({
        id: genId(),
        type: 'blocked_recommendation',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.blockedRoamingTxTitle',
        titleParams: { ap: apLabel(dominantId) },
        reasonKey: 'rec.blockedRoamingTxReason',
        reasonParams: {
          ap: apLabel(dominantId),
          otherAp: apLabel(otherId),
          percent: Math.round(pair.stickyRatio * 100),
        },
        affectedApIds: [dominantId],
        affectedBand: band,
        evidence: { metrics: { stickyRatio: pair.stickyRatio } },
        confidence: 0.5,
        blockedByConstraints: [
          `TX power change not allowed for ${apLabel(dominantId)} on ${band}`,
        ],
      });
      continue;
    }

    // A3: Critical gap rate — only proceed if simulation doesn't worsen score
    if (gapRatio >= GAP_RATIO_CRITICAL) {
      const probeStep = ROAMING_TX_STEPS[0]!;
      const probePower = dominantAp.txPowerDbm + probeStep;
      if (probePower < ROAMING_TX_MIN_DBM) continue;
      const probeDelta = simulateChange(aps, walls, bounds, band, rfConfig, {
        apId: dominantId,
        txPowerDbm: probePower,
      }, weights);
      if (probeDelta.changePercent < 0) continue;
    }

    // A5: Iterate TX steps, pick best positive delta
    let bestDelta: SimulatedDelta | null = null;
    let bestStep = 0;
    let bestPower = dominantAp.txPowerDbm;

    for (const step of ROAMING_TX_STEPS) {
      const reducedPower = dominantAp.txPowerDbm + step;
      if (reducedPower < ROAMING_TX_MIN_DBM) break;

      const delta = simulateChange(aps, walls, bounds, band, rfConfig, {
        apId: dominantId,
        txPowerDbm: reducedPower,
      }, weights);

      if (delta.changePercent >= 0) {
        if (!bestDelta || delta.changePercent > bestDelta.changePercent) {
          bestDelta = delta;
          bestStep = Math.abs(step);
          bestPower = reducedPower;
        }
      }
    }

    // No positive step found → skip
    if (!bestDelta) continue;

    // C2: Block roaming TX when uplink is heavily limited and benefit is marginal
    if (uplinkLimitedRatio > UPLINK_BLOCK_ROAMING && bestDelta.changePercent < 2) continue;

    // PZ Guard: Skip if TX reduction would hurt a mustHaveCoverage PriorityZone
    const pzCheck = wouldHurtPriorityZone(
      aps, aps.map(a => a.id === dominantId ? { ...a, txPowerDbm: bestPower } : a),
      walls, band, rfConfig, ctx.priorityZones,
    );
    if (pzCheck.hurts) {
      recs.push({
        id: genId(),
        type: 'sticky_client_risk',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.pzBlockedTxTitle',
        titleParams: { ap: apLabel(dominantId), pz: pzCheck.worstZoneLabel },
        reasonKey: 'rec.pzBlockedTxReason',
        reasonParams: {
          ap: apLabel(dominantId),
          pz: pzCheck.worstZoneLabel,
          dropDb: pzCheck.worstDropDb,
          overlapPercent: Math.round(pair.stickyRatio * 100),
        },
        affectedApIds: [dominantId, otherId],
        affectedBand: band,
        evidence: {
          metrics: {
            stickyRatio: pair.stickyRatio,
            handoffZoneCells: pair.handoffZoneCells,
            gapRatio,
            wouldHurtPriorityZone: 1,
            pzDropDb: pzCheck.worstDropDb,
          },
        },
        confidence: 0.5,
      });
      continue;
    }

    // Physical gap guard: if gap is large AND zone RSSI is very weak,
    // the problem is physical (wall/distance), not TX-solvable — downgrade
    const fairThreshold = (BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz']).fair;
    const gapIsPhysical = gapRatio > PHYSICAL_GAP_RATIO
      && pair.avgRssiInZone < fairThreshold - PHYSICAL_GAP_RSSI_OFFSET;

    // A1: If overall score regresses OR benefit is marginal, downgrade to
    // informational hint. Roaming improvement alone doesn't justify a coverage
    // regression or near-zero change — the user should decide.
    const overallRegresses = bestDelta.scoreAfter <= bestDelta.scoreBefore;
    const overallMarginal = !overallRegresses && bestDelta.changePercent < ROAMING_MIN_OVERALL_BENEFIT;
    const shouldDowngrade = overallRegresses || overallMarginal || gapIsPhysical;

    // PZ-weighted severity/priority
    const pzFactor = pair.pzRelevanceScore ?? 0.5;
    const roamPriority = shouldDowngrade ? 'low' : (pzFactor >= 0.7 ? 'high' : 'medium');
    const roamSeverity = shouldDowngrade ? 'info' : (pzFactor >= 0.7 ? 'warning' : 'info');

    if (shouldDowngrade) {
      // Downgrade: emit informational note instead of actionable adjustment
      // Use specific keys depending on the root cause
      const isPhysicalRoot = gapIsPhysical && !overallRegresses;
      recs.push({
        id: genId(),
        type: 'sticky_client_risk',
        priority: 'low',
        severity: 'info',
        titleKey: isPhysicalRoot ? 'rec.physicalGapNotEffectiveTitle' : 'rec.stickyClientRiskTitle',
        titleParams: isPhysicalRoot
          ? { ap1: apLabel(dominantId), ap2: apLabel(otherId) }
          : { ap1: apLabel(dominantId), ap2: apLabel(otherId) },
        reasonKey: isPhysicalRoot ? 'rec.physicalGapNotEffectiveReason' : 'rec.stickyClientRiskReason',
        reasonParams: isPhysicalRoot
          ? {
              ap1: apLabel(dominantId),
              ap2: apLabel(otherId),
              gapPercent: Math.round(gapRatio * 100),
              avgRssi: Math.round(pair.avgRssiInZone),
            }
          : {
              ap1: apLabel(dominantId),
              ap2: apLabel(otherId),
              stickyPercent: Math.round(pair.stickyRatio * 100),
            },
        affectedApIds: [dominantId, otherId],
        affectedBand: band,
        evidence: {
          metrics: {
            stickyRatio: pair.stickyRatio,
            handoffZoneCells: pair.handoffZoneCells,
            gapCells: pair.gapCells,
            ...(overallRegresses ? { overallRegression: 1 } : gapIsPhysical ? { physicalGap: 1, gapRatio, avgRssiInZone: pair.avgRssiInZone, suggestMove: 1 } : { marginalBenefit: 1 }),
          },
        },
        confidence: 0.5,
      });
    } else {
      recs.push({
        id: genId(),
        type: 'roaming_tx_adjustment',
        priority: roamPriority as 'high' | 'medium' | 'low',
        severity: roamSeverity as 'critical' | 'warning' | 'info',
        titleKey: 'rec.roamingTxTitle',
        titleParams: { ap: apLabel(dominantId) },
        reasonKey: 'rec.roamingTxReason',
        reasonParams: {
          ap: apLabel(dominantId),
          otherAp: apLabel(otherId),
          percent: Math.round(pair.stickyRatio * 100),
          delta: bestStep,
        },
        affectedApIds: [dominantId],
        affectedBand: band,
        suggestedChange: {
          apId: dominantId,
          parameter: txParamName,
          currentValue: dominantAp.txPowerDbm,
          suggestedValue: bestPower,
        },
        evidence: {
          metrics: {
            stickyRatio: pair.stickyRatio,
            handoffZoneCells: pair.handoffZoneCells,
            gapCells: pair.gapCells,
          },
        },
        simulatedDelta: bestDelta,
        confidence: 0.7,
      });
    }
  }
}

function generateRoamingTxBoosts(
  recs: Recommendation[],
  pairs: RoamingPairMetrics[],
  apMetrics: Map<string, APMetrics>,
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  rfConfig: RFConfig,
  weights: ScoringWeights,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
  stats: HeatmapStats,
): void {
  const txParamName = band === '2.4ghz' ? 'tx_power_24ghz' : band === '6ghz' ? 'tx_power_6ghz' : 'tx_power_5ghz';

  // Collect APs that already have TX power recommendations (avoid cross-type duplicates)
  const txPowerApIds = new Set(
    recs.filter(r => r.type === 'adjust_tx_power' || r.type === 'roaming_tx_adjustment').flatMap(r => r.affectedApIds),
  );

  const totalCells = stats.totalCells ?? 0;

  for (const pair of pairs) {
    // Q1: Pair relevance filter — skip noisy small pairs
    if (pair.totalPairCells < MIN_PAIR_CELLS
        && (totalCells === 0 || pair.totalPairCells / totalCells < MIN_PAIR_RATIO)) continue;

    // Only trigger for high gap ratio with sufficient handoff zone
    const gapRatio = pair.gapCells / Math.max(pair.handoffZoneCells, 1);
    if (gapRatio < GAP_BOOST_TRIGGER) continue;
    if (pair.handoffZoneCells < MIN_HANDOFF_CELLS) continue;

    // Determine weaker AP (smaller primaryCoverageRatio)
    const m1 = apMetrics.get(pair.ap1Id);
    const m2 = apMetrics.get(pair.ap2Id);
    if (!m1 || !m2) continue;

    const weakerId = m1.primaryCoverageRatio <= m2.primaryCoverageRatio ? pair.ap1Id : pair.ap2Id;
    const strongerId = weakerId === pair.ap1Id ? pair.ap2Id : pair.ap1Id;
    const weakerAp = aps.find(a => a.id === weakerId);
    if (!weakerAp) continue;

    // Skip if this AP already has a TX power recommendation
    if (txPowerApIds.has(weakerId)) continue;

    // Capability check — emit blocked_recommendation if TX power change is not allowed
    if (!isActionAllowed(weakerId, 'adjust_tx_power', band, ctx)) {
      recs.push({
        id: genId(),
        type: 'blocked_recommendation',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.blockedRoamingTxBoostTitle',
        titleParams: { ap: apLabel(weakerId) },
        reasonKey: 'rec.blockedRoamingTxBoostReason',
        reasonParams: {
          ap: apLabel(weakerId),
          otherAp: apLabel(strongerId),
          gapPercent: Math.round(gapRatio * 100),
        },
        affectedApIds: [weakerId],
        affectedBand: band,
        evidence: { metrics: { gapRatio, gapCells: pair.gapCells } },
        confidence: 0.5,
        blockedByConstraints: [
          `TX power change not allowed for ${apLabel(weakerId)} on ${band}`,
        ],
      });
      continue;
    }

    // Iterate TX boost steps, pick best positive delta
    let bestDelta: SimulatedDelta | null = null;
    let bestStep = 0;
    let bestPower = weakerAp.txPowerDbm;

    for (const step of ROAMING_TX_BOOST_STEPS) {
      const boostedPower = weakerAp.txPowerDbm + step;
      if (boostedPower > ROAMING_TX_MAX_DBM) break;

      const delta = simulateChange(aps, walls, bounds, band, rfConfig, {
        apId: weakerId,
        txPowerDbm: boostedPower,
      }, weights);

      if (delta.changePercent >= 0 && delta.scoreAfter >= delta.scoreBefore) {
        if (!bestDelta || delta.changePercent > bestDelta.changePercent) {
          bestDelta = delta;
          bestStep = step;
          bestPower = boostedPower;
        }
      }
    }

    // No positive step found → skip
    if (!bestDelta) continue;

    // A1-Boost: No measurable improvement → skip (prevents "same value" actionable recs)
    if (bestDelta.scoreAfter <= bestDelta.scoreBefore || bestDelta.changePercent <= 0) continue;

    // Physical gap guard: if zone RSSI is very weak, TX boost alone won't solve it
    const boostFairThreshold = (BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz']).fair;
    if (gapRatio > PHYSICAL_GAP_RATIO && pair.avgRssiInZone < boostFairThreshold - PHYSICAL_GAP_RSSI_OFFSET) {
      recs.push({
        id: genId(),
        type: 'sticky_client_risk',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.physicalGapNotEffectiveTitle',
        titleParams: { ap1: apLabel(weakerId), ap2: apLabel(strongerId) },
        reasonKey: 'rec.physicalGapNotEffectiveReason',
        reasonParams: {
          ap1: apLabel(weakerId),
          ap2: apLabel(strongerId),
          gapPercent: Math.round(gapRatio * 100),
          avgRssi: Math.round(pair.avgRssiInZone),
        },
        affectedApIds: [weakerId, strongerId],
        affectedBand: band,
        evidence: {
          metrics: {
            gapRatio,
            avgRssiInZone: pair.avgRssiInZone,
            physicalGap: 1,
            suggestMove: 1,
          },
        },
        confidence: 0.4,
      });
      continue;
    }

    // PZ-weighted severity/priority
    const pzFactor = pair.pzRelevanceScore ?? 0.5;
    const boostPriority = pzFactor >= 0.7 ? 'high' : 'medium';
    const boostSeverity = pzFactor >= 0.7 ? 'warning' : 'info';

    recs.push({
      id: genId(),
      type: 'roaming_tx_boost',
      priority: boostPriority as 'high' | 'medium' | 'low',
      severity: boostSeverity as 'critical' | 'warning' | 'info',
      titleKey: 'rec.roamingTxBoostTitle',
      titleParams: { ap: apLabel(weakerId) },
      reasonKey: 'rec.roamingTxBoostReason',
      reasonParams: {
        ap: apLabel(weakerId),
        otherAp: apLabel(strongerId),
        gapPercent: Math.round(gapRatio * 100),
        delta: bestStep,
      },
      affectedApIds: [weakerId],
      affectedBand: band,
      suggestedChange: {
        apId: weakerId,
        parameter: txParamName,
        currentValue: weakerAp.txPowerDbm,
        suggestedValue: bestPower,
      },
      evidence: {
        metrics: {
          gapRatio,
          gapCells: pair.gapCells,
          handoffZoneCells: pair.handoffZoneCells,
          stickyRatio: pair.stickyRatio,
        },
      },
      simulatedDelta: bestDelta,
      confidence: 0.7,
    });

    txPowerApIds.add(weakerId);
  }
}

function generateStickyClientWarnings(
  recs: Recommendation[],
  pairs: RoamingPairMetrics[],
  totalCells: number,
  band: FrequencyBand,
  apLabel: (id: string) => string,
): void {
  // Collect pairs that already have a roaming note (gap/PZ-block/physical-gap/TX-adjustment)
  // Prevents duplicate informational notes for the same pair.
  // Priority: gap > PZ-block > physical-gap > sticky (only 1 note per pair)
  const notedPairKeys = new Set(
    recs.filter(r =>
      r.type === 'handoff_gap_warning'
      || r.type === 'sticky_client_risk'
      || r.type === 'roaming_tx_adjustment'
      || r.type === 'roaming_tx_boost',
    ).map(r => [...r.affectedApIds].sort().join('|')),
  );

  for (const pair of pairs) {
    // Q1: Pair relevance filter — skip noisy small pairs
    if (pair.totalPairCells < MIN_PAIR_CELLS
        && (totalCells === 0 || pair.totalPairCells / totalCells < MIN_PAIR_RATIO)) continue;

    if (pair.stickyRatio <= 0.50) continue;
    // Tiny handoff zone guard — too few cells to be meaningful
    if (pair.handoffZoneCells < MIN_HANDOFF_CELLS) continue;
    // Only warn if handoff zone is very small (<5% of pair cells)
    if (totalCells > 0 && pair.handoffZoneCells / totalCells >= 0.05) continue;

    // Suppress if this pair already has ANY roaming-related note
    const pairKey = [pair.ap1Id, pair.ap2Id].sort().join('|');
    if (notedPairKeys.has(pairKey)) continue;

    recs.push({
      id: genId(),
      type: 'sticky_client_risk',
      priority: 'low',
      severity: 'info',
      titleKey: 'rec.stickyClientTitle',
      titleParams: { ap1: apLabel(pair.ap1Id), ap2: apLabel(pair.ap2Id) },
      reasonKey: 'rec.stickyClientReason',
      reasonParams: {
        ap1: apLabel(pair.ap1Id),
        ap2: apLabel(pair.ap2Id),
        percent: Math.round(pair.stickyRatio * 100),
      },
      affectedApIds: [pair.ap1Id, pair.ap2Id],
      affectedBand: band,
      evidence: {
        metrics: {
          stickyRatio: pair.stickyRatio,
          handoffZoneCells: pair.handoffZoneCells,
          gapCells: pair.gapCells,
        },
      },
      confidence: 0.75,
    });
  }
}

function generateHandoffGapWarnings(
  recs: Recommendation[],
  pairs: RoamingPairMetrics[],
  totalCells: number,
  band: FrequencyBand,
  apLabel: (id: string) => string,
): void {
  const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];

  for (const pair of pairs) {
    // Q1: Pair relevance filter — skip noisy small pairs
    if (pair.totalPairCells < MIN_PAIR_CELLS
        && (totalCells === 0 || pair.totalPairCells / totalCells < MIN_PAIR_RATIO)) continue;

    // Suppress very small gap zones / tiny handoff zones
    if (pair.gapCells < 5) continue;
    if (pair.gapCells <= 10) continue;
    if (pair.handoffZoneCells === 0) continue;
    if (pair.handoffZoneCells < MIN_HANDOFF_CELLS) continue;
    if (pair.gapCells / pair.handoffZoneCells <= 0.20) continue;

    // PZ-weighted priority
    const pzFactor = pair.pzRelevanceScore ?? 0.5;
    const basePriority = pzFactor >= 0.7 ? 'high' : pzFactor >= 0.4 ? 'medium' : 'low';

    recs.push({
      id: genId(),
      type: 'handoff_gap_warning',
      priority: basePriority,
      severity: basePriority === 'high' ? 'warning' : 'info',
      titleKey: 'rec.handoffGapTitle',
      titleParams: { ap1: apLabel(pair.ap1Id), ap2: apLabel(pair.ap2Id) },
      reasonKey: 'rec.handoffGapReason',
      reasonParams: {
        ap1: apLabel(pair.ap1Id),
        ap2: apLabel(pair.ap2Id),
        cells: pair.gapCells,
        threshold: thresholds.fair,
      },
      affectedApIds: [pair.ap1Id, pair.ap2Id],
      affectedBand: band,
      evidence: {
        metrics: {
          gapCells: pair.gapCells,
          handoffZoneCells: pair.handoffZoneCells,
          avgRssiInZone: pair.avgRssiInZone,
        },
      },
      confidence: 0.8,
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
    if (metrics.primaryCoverageRatio >= 0.05) continue;
    // Use secondBestCoverageCells: how often this AP is "present but not best"
    // (overlapCells can never exceed primaryCells, making the old check unsatisfiable)
    const presenceRatio = totalCells > 0 ? metrics.secondBestCoverageCells / totalCells : 0;
    if (presenceRatio < 0.05) continue;

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
          overlap: Math.round(presenceRatio * 100),
        },
        affectedApIds: [apId],
        affectedBand: band,
        suggestedChange: {
          apId: apId,
          parameter: 'enabled',
          currentValue: 'true',
          suggestedValue: 'false',
        },
        evidence: {
          metrics: { primaryCoverageRatio: metrics.primaryCoverageRatio, presenceRatio },
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
  const limitedRatio = limitedCount / totalCells;

  // C1: Trigger at >30% (informational), escalate at >60% (high/warning), >80% (high/critical)
  if (limitedPct > 30) {
    const priority = limitedRatio > 0.60 ? 'high' : 'medium';
    const severity = limitedRatio > 0.80 ? 'critical' : limitedRatio > 0.60 ? 'warning' : 'info';

    recs.push({
      id: genId(),
      type: 'band_limit_warning',
      priority: priority as 'high' | 'medium' | 'low',
      severity: severity as 'critical' | 'warning' | 'info',
      titleKey: 'rec.bandLimitTitle',
      titleParams: { percent: Math.round(limitedPct) },
      reasonKey: 'rec.bandLimitReason',
      reasonParams: { percent: Math.round(limitedPct), band, uplinkNote: 'device_antenna_placement' },
      affectedApIds: [],
      affectedBand: band,
      evidence: {
        metrics: { uplinkLimitedPercent: limitedPct, limitedCells: limitedCount },
      },
      confidence: 0.8,
    });

    // Client-side advice: when limitation is significant (severity >= warning),
    // emit additional informational note with device-side mitigation advice
    if (limitedRatio > 0.60) {
      recs.push({
        id: genId(),
        type: 'band_limit_warning',
        priority: 'low',
        severity: 'info',
        titleKey: 'rec.bandLimitClientAdviceTitle',
        titleParams: { percent: Math.round(limitedPct) },
        reasonKey: 'rec.bandLimitClientAdviceReason',
        reasonParams: { percent: Math.round(limitedPct), band },
        affectedApIds: [],
        affectedBand: band,
        evidence: {
          metrics: { uplinkLimitedPercent: limitedPct, limitedCells: limitedCount },
        },
        confidence: 0.7,
      });
    }
  }
}

function generateConstraintConflictWarnings(
  recs: Recommendation[],
  aps: APConfig[],
  band: FrequencyBand,
  ctx: RecommendationContext,
  apLabel: (id: string) => string,
  stats: HeatmapStats = {} as HeatmapStats,
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
          suggestedChange: {
            apId: ap.id,
            parameter: 'position',
            currentValue: `(${ap.x.toFixed(1)}, ${ap.y.toFixed(1)})`,
            suggestedValue: 'move_out_of_zone',
          },
          evidence: {
            metrics: { zoneWeight: zone.weight },
          },
          confidence: 0.95,
          requiresUserDecision: true,
        });
      }
    }
  }

  // Check PriorityZones with mustHaveCoverage using actual RSSI grid data
  for (const pz of ctx.priorityZones) {
    if (!pz.mustHaveCoverage) continue;

    const gridWidth = stats.gridWidth ?? 0;
    const gridHeight = stats.gridHeight ?? 0;
    const gridStep = stats.gridStep ?? 0.25;
    const sOriginX = (stats as unknown as Record<string, number>).originX ?? 0;
    const sOriginY = (stats as unknown as Record<string, number>).originY ?? 0;
    const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];
    const threshold = pz.targetMinRssi ?? thresholds.fair;

    if (!stats.rssiGrid || gridWidth === 0 || gridHeight === 0) {
      // Fallback: AP proximity check when no RSSI data available
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
          confidence: 0.7,
        });
      }
      continue;
    }

    // Real RSSI coverage check within the priority zone
    let belowCount = 0;
    let totalInZone = 0;
    for (let r = 0; r < gridHeight; r++) {
      for (let c = 0; c < gridWidth; c++) {
        const wx = sOriginX + c * gridStep;
        const wy = sOriginY + r * gridStep;
        if (wx >= pz.x && wx <= pz.x + pz.width && wy >= pz.y && wy <= pz.y + pz.height) {
          totalInZone++;
          if ((stats.rssiGrid[r * gridWidth + c] ?? -100) < threshold) belowCount++;
        }
      }
    }

    if (totalInZone === 0) continue;
    const violationRatio = belowCount / totalInZone;

    // Warning if more than 30% of the zone is below threshold
    if (violationRatio > 0.3) {
      recs.push({
        id: genId(),
        type: 'constraint_conflict',
        severity: violationRatio > 0.6 ? 'critical' : 'warning',
        priority: violationRatio > 0.6 ? 'high' : 'medium',
        titleKey: 'rec.mustHaveCoverageTitle',
        titleParams: { zone: pz.label },
        reasonKey: 'rec.mustHaveCoverageViolationReason',
        reasonParams: {
          zone: pz.label,
          violationPercent: Math.round(violationRatio * 100),
          threshold,
        },
        affectedApIds: [],
        affectedBand: band,
        evidence: {
          metrics: {
            zoneWeight: pz.weight,
            violationRatio,
            belowThresholdCells: belowCount,
            totalZoneCells: totalInZone,
          },
        },
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

  const templateAp = selectTemplateAp(aps);
  let anyAccepted = false;

  for (const cand of preferredCandidates) {
    // Physical validation: skip candidates inside walls
    if (!isPhysicallyValidApPosition(cand.x, cand.y, walls)) continue;

    // Skip candidates too far from any existing AP's coverage gap
    const nearestApDist = aps.length > 0
      ? Math.min(...aps.map(a => Math.sqrt((a.x - cand.x) ** 2 + (a.y - cand.y) ** 2)))
      : Infinity;
    if (nearestApDist < 3) continue; // Already an AP nearby

    const delta = simulateAddAP(
      aps, walls, bounds, band, rfConfig,
      { x: cand.x, y: cand.y },
      {
        txPowerDbm: templateAp?.txPowerDbm ?? 20,
        antennaGainDbi: templateAp?.antennaGainDbi ?? 4.0,
        mounting: cand.mountingOptions[0] ?? 'ceiling',
        heightM: 2.5,
      },
      weights,
    );

    if (delta.changePercent > 1) {
      const requiresInfra = !cand.hasLan || !cand.hasPoe;
      recs.push({
        id: genId(),
        type: 'preferred_candidate_location',
        priority: 'medium',
        severity: requiresInfra ? 'warning' : 'info',
        titleKey: 'rec.preferredCandidateTitle',
        titleParams: { candidate: cand.label },
        reasonKey: 'rec.preferredCandidateReason',
        reasonParams: {
          candidate: cand.label,
          improvement: Math.round(delta.changePercent),
          mounting: cand.mountingOptions.join('/') || 'ceiling',
          hasLan: cand.hasLan ? 'yes' : 'no',
          hasPoe: cand.hasPoe ? 'yes' : 'no',
        },
        affectedApIds: [],
        affectedBand: band,
        suggestedChange: {
          parameter: 'position',
          currentValue: 'none',
          suggestedValue: `(${cand.x.toFixed(1)}, ${cand.y.toFixed(1)})`,
        },
        evidence: {
          metrics: {
            improvement: delta.changePercent,
            hasLan: cand.hasLan ? 1 : 0,
            hasPoe: cand.hasPoe ? 1 : 0,
          },
          gridStep,
        },
        simulatedDelta: delta,
        confidence: 0.7,
        selectedCandidatePosition: { x: cand.x, y: cand.y },
        selectedBecause: `user_preferred${cand.hasLan ? ', has_lan' : ''}${cand.hasPoe ? ', has_poe' : ''}`,
        infrastructureRequired: requiresInfra,
      });
      anyAccepted = true;
    }
  }

  // If no preferred candidate produced a recommendation, silently skip.
  // No phantom infrastructure_required at (0,0) — absence of preferred_candidate_location
  // is sufficient signal to the user.
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

// ─── Channel Width Recommendations ────────────────────────────────

/**
 * Recommend reducing channel width in multi-AP scenarios.
 *
 * Rules:
 * - If AP uses >= 80 MHz and has 2+ nearby APs within range → suggest 40 MHz
 * - If AP uses >= 40 MHz and has 3+ very close APs (< 10m) → suggest 20 MHz
 * - Only for 5 GHz band (2.4 GHz is always 20 MHz effectively)
 */
function generateChannelWidthRecommendations(
  recs: Recommendation[],
  aps: APConfig[],
  accessPoints: AccessPointResponse[],
  band: FrequencyBand,
  apLabel: (id: string) => string,
): void {
  // Channel width optimization only relevant for 5 GHz and 6 GHz
  if (band === '2.4ghz') return;

  const NEARBY_RANGE_M = 20; // 5 GHz effective range
  const VERY_CLOSE_M = 10;   // Dense deployment threshold

  for (const apResp of accessPoints) {
    if (!apResp.enabled) continue;

    const currentWidth = parseInt(apResp.channel_width ?? '80', 10);
    if (isNaN(currentWidth) || currentWidth <= 20) continue;

    // Count nearby APs
    let nearbyCount = 0;
    let veryCloseCount = 0;

    for (const other of accessPoints) {
      if (other.id === apResp.id || !other.enabled) continue;
      const dx = apResp.x - other.x;
      const dy = apResp.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= NEARBY_RANGE_M) nearbyCount++;
      if (dist <= VERY_CLOSE_M) veryCloseCount++;
    }

    let suggestedWidth: number | null = null;

    if (veryCloseCount >= 3 && currentWidth > 20) {
      suggestedWidth = 20;
    } else if (nearbyCount >= 2 && currentWidth >= 80) {
      suggestedWidth = 40;
    }

    if (suggestedWidth == null || suggestedWidth >= currentWidth) continue;

    recs.push({
      id: genId(),
      type: 'adjust_channel_width',
      priority: currentWidth >= 80 && nearbyCount >= 3 ? 'high' : 'medium',
      severity: currentWidth >= 80 && nearbyCount >= 3 ? 'warning' : 'info',
      titleKey: 'rec.adjustChannelWidthTitle',
      titleParams: { ap: apLabel(apResp.id), width: suggestedWidth },
      reasonKey: 'rec.adjustChannelWidthReason',
      reasonParams: {
        currentWidth,
        suggestedWidth,
        nearbyCount,
      },
      affectedApIds: [apResp.id],
      affectedBand: band,
      suggestedChange: {
        apId: apResp.id,
        parameter: 'channel_width',
        currentValue: String(currentWidth),
        suggestedValue: String(suggestedWidth),
      },
      evidence: {
        metrics: { nearbyApCount: nearbyCount, veryCloseApCount: veryCloseCount, currentWidth },
      },
      confidence: 0.75,
    });
  }
}

// ─── Evidence-Minimum Requirements ──────────────────────────────
//
// Maps each recommendation type to the minimum set of evidence.metrics
// keys it MUST contain (at least one key from the array). Exported for
// test-side validation so every emitted rec is auditable.

export const EVIDENCE_MINIMUMS: Partial<Record<RecommendationType, string[]>> = {
  change_channel: ['conflictScore', 'componentSize'],
  adjust_tx_power: ['overlapRatio', 'coverageRatio', 'improvement'],
  adjust_channel_width: ['nearbyApCount'],
  roaming_tx_adjustment: ['stickyRatio'],
  roaming_tx_boost: ['gapRatio', 'gapCells'],
  sticky_client_risk: ['stickyRatio'],
  handoff_gap_warning: ['gapCells'],
  add_ap: ['weakCells'],
  move_ap: ['improvement', 'currentCoverage'],
  rotate_ap: ['improvement'],
  change_mounting: ['improvement'],
  infrastructure_required: ['weakCells', 'candidateCount', 'allUnsuitable', 'nearestDistance'],
  disable_ap: ['primaryCoverageRatio'],
  band_limit_warning: ['uplinkLimitedPercent', 'sixGhzBand'],
  coverage_warning: ['weakPercent'],
  overlap_warning: ['overlapPercent', 'componentSize'],
  low_ap_value: ['primaryCoverageRatio'],
  constraint_conflict: ['zoneWeight'],
  preferred_candidate_location: ['improvement'],
  blocked_recommendation: ['stickyRatio', 'currentCoverage', 'gapRatio'],
  roaming_hint: ['lowDeltaPercent'],
};
