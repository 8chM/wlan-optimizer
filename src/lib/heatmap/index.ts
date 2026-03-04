// Heatmap module barrel export
export { default as HeatmapRenderer } from './HeatmapRenderer.svelte';
export { convertApsToConfig, convertWallsToData } from './convert';
export {
  calculateCoverageFromBins,
  estimateCoverageFromStats,
  classifyRSSI,
  COVERAGE_THRESHOLDS,
  BAND_THRESHOLDS,
  type CoverageBins,
  type CoverageStats,
  type CoverageThresholds,
} from './coverage-stats';
export {
  computeHeatmapDifference,
  snapshotCanvas,
  type DifferenceResult,
} from './difference';
export {
  analyzeChannelConflicts,
  getRecommendedChannels,
  type ChannelConflict,
  type ChannelAnalysisResult,
  type APConflictSummary,
  type AnalysisBand,
  type ConflictType,
  type ConflictSeverity,
} from './channel-analysis';
export {
  findPlacementHints,
  type PlacementHint,
  type PlacementHintOptions,
} from './placement-hints';
export {
  generateViridisLUT,
  generateJetLUT,
  generateInfernoLUT,
  getColorLUT,
  rssiToLutIndex,
  RSSI_MIN,
  RSSI_MAX,
  type FrequencyBand,
  type ColorScheme,
} from './color-schemes';
export type {
  HeatmapWorkerRequest,
  HeatmapWorkerResult,
  HeatmapWorkerProgress,
  HeatmapWorkerError,
  HeatmapWorkerResponse,
  APConfig,
  WallData,
  LineSegment,
  FloorBounds,
} from './worker-types';

// RF Engine - pure RF propagation calculations
export {
  computeRSSI,
  computeUplinkRSSI,
  computeMountingFactor,
  computeMountingFactorDetailed,
  computePathLoss,
  createRFConfig,
  REFERENCE_LOSS,
  DEFAULT_PATH_LOSS_EXPONENT,
  PATH_LOSS_EXPONENTS,
  DEFAULT_RECEIVER_GAIN_DBI,
  CLIENT_TX_POWER,
  CLIENT_ANTENNA_GAIN_DBI,
  MIN_DISTANCE,
  type RFConfig,
  type MountingSector,
} from './rf-engine';

// Spatial Grid - accelerated wall intersection detection
export {
  buildSpatialGrid,
  segmentsIntersect,
  segmentIntersectionT,
  computeWallLoss,
  computeWallLossDetailed,
  SPATIAL_GRID_CELL_SIZE,
  isOpeningMaterial,
  type SpatialGrid,
  type SpatialGridEntry,
  type SpatialGridResult,
  type WallHitDetail,
  type WallLossDetailedResult,
  type HitGroup,
  type HitGroupAction,
} from './spatial-grid';

// Point Inspector - debug tool for single-point RF analysis
export {
  inspectPoint,
  type PointDebugResult,
  type PerApDebug,
  type SegmentHitDebug,
  type HitCountsByCategory,
} from './point-inspector';

// Heatmap Manager - progressive rendering controller
export {
  HeatmapManager,
  type HeatmapManagerOptions,
  type HeatmapParams,
  type HeatmapStats,
  type LODLevel,
} from './heatmap-manager';
