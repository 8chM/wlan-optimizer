// Recommendations module barrel export
export { generateRecommendations } from './generator';
export { simulateChange, simulateAddAP, clearSimulatorCache } from './simulator';
export {
  computeAPMetrics,
  computeOverallScore,
  findWeakZones,
  findOverlapZones,
  findLowValueAPs,
} from './analysis';
export {
  findBestCandidate,
  getConstraintsAtPoint,
  isPositionForbidden,
  isNewApAllowed,
  getMountingOptionsAtPoint,
  isMovementAllowed,
  isPhysicallyValidApPosition,
} from './candidates';
export {
  getCapabilities,
  isActionAllowed,
  computeFeasibilityScore,
  computeEffortScore,
  computeRiskScore,
  computeRecommendationScore,
  deriveConstraintsFromRejection,
  applyRejection,
  getBlockingReasons,
} from './constraints';
export type {
  Recommendation,
  RecommendationType,
  RecommendationSeverity,
  RecommendationPriority,
  RecommendationEvidence,
  SimulatedDelta,
  SuggestedChange,
  CoverageBinPercents,
  ScoringWeights,
  ExpertProfile,
  AnalysisResult,
  APMetrics,
  ScoreBreakdown,
  WeakZone,
  OverlapZone,
  APModification,
  CandidateLocation,
  ConstraintZone,
  ConstraintZoneType,
  APCapabilities,
  PriorityZone,
  RejectionReason,
  RecommendationRejection,
  DerivedConstraint,
  RecommendationContext,
  EffortLevel,
} from './types';
export {
  EXPERT_PROFILES,
  DEFAULT_AP_CAPABILITIES,
  EFFORT_LEVELS,
  EFFORT_SCORES,
  EMPTY_CONTEXT,
} from './types';
export type { CandidateMatch, ScoredCandidate } from './candidates';
