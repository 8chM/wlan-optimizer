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
