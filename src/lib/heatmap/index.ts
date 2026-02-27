// Heatmap module barrel export
export { default as HeatmapRenderer } from './HeatmapRenderer.svelte';
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
  computePathLoss,
  createRFConfig,
  REFERENCE_LOSS,
  DEFAULT_PATH_LOSS_EXPONENT,
  DEFAULT_RECEIVER_GAIN_DBI,
  MIN_DISTANCE,
  type RFConfig,
} from './rf-engine';

// Spatial Grid - accelerated wall intersection detection
export {
  buildSpatialGrid,
  segmentsIntersect,
  computeWallLoss,
  SPATIAL_GRID_CELL_SIZE,
  type SpatialGrid,
  type SpatialGridEntry,
  type SpatialGridResult,
} from './spatial-grid';

// Heatmap Manager - progressive rendering controller
export {
  HeatmapManager,
  type HeatmapManagerOptions,
  type HeatmapParams,
  type HeatmapStats,
  type LODLevel,
} from './heatmap-manager';
