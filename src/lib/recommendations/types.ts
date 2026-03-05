/**
 * Type definitions for the recommendation engine.
 *
 * Provides types for analysis results, recommendations, scoring,
 * simulation-based before/after comparisons, constraint models,
 * candidate locations, and feasibility scoring.
 */

import type { FrequencyBand } from '$lib/heatmap/color-schemes';

// ─── Recommendation Categories ────────────────────────────────────

/** Recommendation type categories */
export type RecommendationType =
  | 'move_ap'
  | 'rotate_ap'
  | 'change_mounting'
  | 'adjust_tx_power'
  | 'change_channel'
  | 'add_ap'
  | 'disable_ap'
  | 'roaming_hint'
  | 'band_limit_warning'
  | 'low_ap_value'
  | 'coverage_warning'
  | 'overlap_warning'
  | 'constraint_conflict'
  | 'infrastructure_required'
  | 'preferred_candidate_location'
  | 'blocked_recommendation'
  | 'roaming_tx_adjustment'
  | 'sticky_client_risk'
  | 'handoff_gap_warning';

export type RecommendationSeverity = 'critical' | 'warning' | 'info';
export type RecommendationPriority = 'high' | 'medium' | 'low';

// ─── Candidate Location Model ─────────────────────────────────────

/** A possible AP installation location with infrastructure info */
export interface CandidateLocation {
  id: string;
  x: number;
  y: number;
  label: string;
  /** Available mounting options at this location */
  mountingOptions: ('wall' | 'ceiling')[];
  /** LAN port available */
  hasLan: boolean;
  /** PoE port available */
  hasPoe: boolean;
  /** Power outlet available */
  hasPower: boolean;
  /** User-preferred location */
  preferred: boolean;
  /** Location is forbidden for AP placement */
  forbidden: boolean;
  /** Free-form notes */
  notes?: string;
  /** Max cable distance to switch/router in meters */
  maxCableDistanceMeters?: number;
  /** Associated zone ID */
  zoneId?: string;
}

// ─── Constraint Zone Model ────────────────────────────────────────

/** Types of constraint zones on the floor plan */
export type ConstraintZoneType =
  | 'forbidden'
  | 'discouraged'
  | 'preferred'
  | 'no_new_ap'
  | 'no_ceiling_mount'
  | 'no_wall_mount'
  | 'no_move'
  | 'high_priority'
  | 'low_priority';

/** A constraint zone on the floor plan (axis-aligned rectangle) */
export interface ConstraintZone {
  id: string;
  type: ConstraintZoneType;
  /** Zone rectangle in meters */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Relative importance weight (default 1.0) */
  weight: number;
  /** Free-form notes */
  notes?: string;
}

// ─── AP Capabilities / Permissions ────────────────────────────────

/** Per-AP permission flags — what changes are allowed */
export interface APCapabilities {
  apId: string;
  canMove: boolean;
  canRotate: boolean;
  canChangeMounting: boolean;
  canChangeTxPower24: boolean;
  canChangeTxPower5: boolean;
  canChangeChannel24: boolean;
  canChangeChannel5: boolean;
}

/** Default capabilities: everything allowed */
export const DEFAULT_AP_CAPABILITIES: Omit<APCapabilities, 'apId'> = {
  canMove: true,
  canRotate: true,
  canChangeMounting: true,
  canChangeTxPower24: true,
  canChangeTxPower5: true,
  canChangeChannel24: true,
  canChangeChannel5: true,
};

// ─── Priority Zone Model ──────────────────────────────────────────

/** A room/area with user-defined importance */
export interface PriorityZone {
  zoneId: string;
  label: string;
  /** Zone rectangle in meters */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Importance weight (1.0 = normal, 2.0 = double importance, 0.5 = less important) */
  weight: number;
  /** Preferred band for this zone */
  targetBand: FrequencyBand | 'either';
  /** Minimum RSSI target in dBm */
  targetMinRssi?: number;
  /** Zone must have at least fair coverage */
  mustHaveCoverage: boolean;
}

// ─── Rejection Reasons ────────────────────────────────────────────

/** Reasons a user can reject a recommendation */
export type RejectionReason =
  | 'no_lan'
  | 'no_poe'
  | 'mounting_not_possible'
  | 'position_forbidden'
  | 'ap_cannot_move'
  | 'ap_cannot_rotate'
  | 'not_desired'
  | 'other';

/** A recorded rejection of a recommendation */
export interface RecommendationRejection {
  /** ID of the rejected recommendation */
  recommendationId: string;
  /** Reason for rejection */
  reason: RejectionReason;
  /** Optional free-text explanation */
  notes?: string;
  /** Constraints derived from this rejection */
  derivedConstraints?: DerivedConstraint[];
}

/** A constraint automatically derived from a user rejection */
export interface DerivedConstraint {
  /** What to restrict */
  type: 'forbid_position' | 'forbid_mounting' | 'forbid_move' | 'forbid_rotate' | 'forbid_candidate';
  /** Affected AP ID (if applicable) */
  apId?: string;
  /** Affected candidate ID (if applicable) */
  candidateId?: string;
  /** Position to forbid (if applicable) */
  position?: { x: number; y: number };
}

// ─── Evidence & Simulation ────────────────────────────────────────

/** Evidence data backing a recommendation */
export interface RecommendationEvidence {
  /** Metrics that demonstrate the problem */
  metrics: Record<string, number>;
  /** Affected grid cell indices for map highlighting */
  affectedCells?: number[];
  /** Grid dimensions for cell→coordinate mapping */
  gridWidth?: number;
  gridHeight?: number;
  gridStep?: number;
}

/** Simulated before/after comparison */
export interface SimulatedDelta {
  /** Score before the change */
  scoreBefore: number;
  /** Score after the change */
  scoreAfter: number;
  /** Change in percent */
  changePercent: number;
  /** Coverage bins before */
  coverageBefore: CoverageBinPercents;
  /** Coverage bins after */
  coverageAfter: CoverageBinPercents;
}

/** Coverage bin percentages */
export interface CoverageBinPercents {
  excellent: number;
  good: number;
  fair: number;
  poor: number;
  none: number;
}

// ─── Suggested Change ─────────────────────────────────────────────

/** A concrete parameter change suggestion */
export interface SuggestedChange {
  /** Affected AP ID (optional for add_ap) */
  apId?: string;
  /** Parameter being changed */
  parameter: string;
  /** Current value */
  currentValue: string | number;
  /** Suggested value */
  suggestedValue: string | number;
}

// ─── Recommendation ───────────────────────────────────────────────

/** A single recommendation */
export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  severity: RecommendationSeverity;
  /** Short title (i18n key) */
  titleKey: string;
  /** Parameters for i18n interpolation */
  titleParams: Record<string, string | number>;
  /** Technical reasoning (i18n key) */
  reasonKey: string;
  reasonParams: Record<string, string | number>;
  /** Affected AP IDs */
  affectedApIds: string[];
  /** Affected band (or 'both') */
  affectedBand: FrequencyBand | 'both';
  /** Suggested change */
  suggestedChange?: SuggestedChange;
  /** Evidence (metrics + affected cells) */
  evidence: RecommendationEvidence;
  /** Simulated before/after comparison */
  simulatedDelta?: SimulatedDelta;
  /** Confidence 0.0 - 1.0 */
  confidence: number;

  // ── Feasibility & Effort Scoring ──
  /** Technical benefit score (0-100) */
  benefitScore?: number;
  /** Implementation effort score (0-100, higher = more effort) */
  effortScore?: number;
  /** Practical feasibility under constraints (0-100) */
  feasibilityScore?: number;
  /** Risk that other areas degrade (0-100) */
  riskScore?: number;
  /** Infrastructure cost score (0-100, 0=no infra needed) */
  infrastructureCostScore?: number;
  /** Combined recommendation score factoring in feasibility */
  recommendationScore?: number;
  /** Whether new infrastructure (cabling, outlet) is required */
  infrastructureRequired?: boolean;
  /** Constraint IDs or descriptions that block this recommendation */
  blockedByConstraints?: string[];
  /** Alternative recommendations for the same problem */
  alternativeRecommendations?: Recommendation[];
  /** Ideal RF target position (where would be best ignoring constraints) */
  idealTargetPosition?: { x: number; y: number };
  /** Selected real candidate position (respecting constraints) */
  selectedCandidatePosition?: { x: number; y: number };
  /** Why this candidate was selected */
  selectedBecause?: string;
  /** Distance from ideal to selected candidate in meters */
  distanceToIdeal?: number;
  /** Whether this recommendation requires a user decision before proceeding */
  requiresUserDecision?: boolean;
}

// ─── Scoring ──────────────────────────────────────────────────────

/** Scoring weights (configurable per expert profile) */
export interface ScoringWeights {
  coverage: number;
  overlap: number;
  conflict: number;
  roaming: number;
  band: number;
}

/** Expert profile presets */
export type ExpertProfile = 'conservative' | 'balanced' | 'aggressive';

export const EXPERT_PROFILES: Record<ExpertProfile, ScoringWeights> = {
  conservative: { coverage: 1.0, overlap: 0.3, conflict: 0.5, roaming: 0.2, band: 0.1 },
  balanced:     { coverage: 1.0, overlap: 0.5, conflict: 0.5, roaming: 0.4, band: 0.3 },
  aggressive:   { coverage: 0.8, overlap: 0.8, conflict: 0.7, roaming: 0.6, band: 0.5 },
};

/** Effort level classification for recommendations */
export type EffortLevel = 'config' | 'minor_physical' | 'major_physical' | 'infrastructure';

/** Maps recommendation types to their default effort level */
export const EFFORT_LEVELS: Record<RecommendationType, EffortLevel> = {
  change_channel: 'config',
  adjust_tx_power: 'config',
  disable_ap: 'config',
  rotate_ap: 'minor_physical',
  move_ap: 'major_physical',
  change_mounting: 'major_physical',
  add_ap: 'infrastructure',
  roaming_hint: 'config',
  band_limit_warning: 'config',
  low_ap_value: 'config',
  coverage_warning: 'config',
  overlap_warning: 'config',
  constraint_conflict: 'config',
  infrastructure_required: 'infrastructure',
  preferred_candidate_location: 'infrastructure',
  blocked_recommendation: 'config',
  roaming_tx_adjustment: 'config',
  sticky_client_risk: 'config',
  handoff_gap_warning: 'config',
};

/** Effort score values for each level */
export const EFFORT_SCORES: Record<EffortLevel, number> = {
  config: 10,
  minor_physical: 30,
  major_physical: 60,
  infrastructure: 90,
};

/** Central recommendation category classification */
export type RecommendationCategory =
  | 'actionable_config'   // Config change: Apply writes to AP directly
  | 'actionable_create'   // Creates a new AP on the floor plan
  | 'instructional'       // Manual instruction: user must act physically
  | 'informational';      // Info only: acknowledge

/** Maps every recommendation type to its UI category */
export const RECOMMENDATION_CATEGORIES: Record<RecommendationType, RecommendationCategory> = {
  // Config change: Preview + Apply writes a real parameter change
  change_channel: 'actionable_config',
  adjust_tx_power: 'actionable_config',
  disable_ap: 'actionable_config',
  roaming_tx_adjustment: 'actionable_config',

  // Creates a new AP: Apply adds an AP to the floor plan
  add_ap: 'actionable_create',
  preferred_candidate_location: 'actionable_create',

  // Manual instruction: user must move/rotate/mount physically
  move_ap: 'instructional',
  rotate_ap: 'instructional',
  change_mounting: 'instructional',
  infrastructure_required: 'instructional',

  // Information only: no Preview, just acknowledgement
  coverage_warning: 'informational',
  overlap_warning: 'informational',
  roaming_hint: 'informational',
  band_limit_warning: 'informational',
  low_ap_value: 'informational',
  constraint_conflict: 'informational',
  blocked_recommendation: 'informational',
  sticky_client_risk: 'informational',
  handoff_gap_warning: 'informational',
};

// ─── Per-AP Metrics ───────────────────────────────────────────────

/** Per-AP analysis metrics */
export interface APMetrics {
  apId: string;
  /** Cells where this AP is the primary (best) */
  primaryCoverageCells: number;
  /** Ratio of primary coverage to total area (0-1) */
  primaryCoverageRatio: number;
  /** Cells where AP is second-best and delta < 5dB */
  overlapCells: number;
  /** Average delta in primary cells */
  avgDeltaInPrimary: number;
  /** Peak RSSI this AP delivers anywhere */
  peakRssi: number;
  /** Cells where this AP is second-best */
  secondBestCoverageCells: number;
  /** Channel conflict score (0-1, from channel-analysis) */
  channelConflictScore: number;
}

// ─── Analysis Result ──────────────────────────────────────────────

/** Score breakdown */
export interface ScoreBreakdown {
  overallScore: number;
  coverageScore: number;
  overlapPenalty: number;
  conflictPenalty: number;
  roamingScore: number;
  bandSuitabilityScore: number;
}

/** Complete analysis result */
export interface AnalysisResult {
  /** Overall score (0-100) */
  overallScore: number;
  /** Sub-scores */
  coverageScore: number;
  overlapPenalty: number;
  conflictPenalty: number;
  roamingScore: number;
  bandSuitabilityScore: number;
  /** Per-AP metrics */
  apMetrics: Map<string, APMetrics>;
  /** Sorted recommendations */
  recommendations: Recommendation[];
  /** Profile used */
  profile: ExpertProfile;
  /** Band analyzed */
  band: FrequencyBand;
}

/** Context passed to the generator with all constraint/candidate data */
export interface RecommendationContext {
  candidates: CandidateLocation[];
  constraintZones: ConstraintZone[];
  apCapabilities: Map<string, APCapabilities>;
  priorityZones: PriorityZone[];
  rejections: RecommendationRejection[];
}

/** Empty context for backwards compatibility */
export const EMPTY_CONTEXT: RecommendationContext = {
  candidates: [],
  constraintZones: [],
  apCapabilities: new Map(),
  priorityZones: [],
  rejections: [],
};

// ─── Weak/Overlap Zones ───────────────────────────────────────────

/** A contiguous zone with weak coverage */
export interface WeakZone {
  /** Centroid X in meters */
  centroidX: number;
  /** Centroid Y in meters */
  centroidY: number;
  /** Number of grid cells in this zone */
  cellCount: number;
  /** Average RSSI in the zone */
  avgRssi: number;
  /** Cell indices */
  cellIndices: number[];
}

/** A contiguous zone with excessive AP overlap */
export interface OverlapZone {
  /** Centroid X in meters */
  centroidX: number;
  /** Centroid Y in meters */
  centroidY: number;
  /** Number of grid cells in this zone */
  cellCount: number;
  /** Average overlap count */
  avgOverlapCount: number;
  /** Average delta between best and second-best */
  avgDelta: number;
  /** Cell indices */
  cellIndices: number[];
}

// ─── AP Modification (for simulator) ──────────────────────────────

/** Describes a modification to test via simulation */
export interface APModification {
  apId: string;
  /** New position (optional) */
  position?: { x: number; y: number };
  /** New orientation in degrees (optional) */
  orientationDeg?: number;
  /** New mounting type (optional) */
  mounting?: string;
  /** New TX power in dBm (optional) */
  txPowerDbm?: number;
}
