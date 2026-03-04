/**
 * Type definitions for heatmap Web Worker communication.
 *
 * These types are shared between the main thread (HeatmapRenderer)
 * and the Web Worker (heatmap-worker).
 */

import type { FrequencyBand, ColorScheme } from './color-schemes';
import type { PlacementHint } from './placement-hints';

// ─── Geometry Types ────────────────────────────────────────────────

/** Line segment with start and end point (meters) */
export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Bounding rectangle (meters) with optional origin offset */
export interface FloorBounds {
  width: number;
  height: number;
  /** X-offset of the grid origin in meters (default: 0) */
  originX?: number;
  /** Y-offset of the grid origin in meters (default: 0) */
  originY?: number;
}

// ─── Worker Input Types ────────────────────────────────────────────

/** Access point data needed for RF calculation */
export interface APConfig {
  id: string;
  /** X position in meters */
  x: number;
  /** Y position in meters */
  y: number;
  /** Height above floor in meters (default: 0 = same height as receiver) */
  heightM?: number;
  /** Transmit power in dBm */
  txPowerDbm: number;
  /** Antenna gain in dBi */
  antennaGainDbi: number;
  /** Whether this AP is active */
  enabled: boolean;
  /** Mounting type: 'ceiling' or 'wall' */
  mounting?: string;
  /** Orientation angle in degrees (0 = right, 90 = down) for wall-mounted APs */
  orientationDeg?: number;
}

/** Wall data needed for RF calculation */
export interface WallData {
  segments: LineSegment[];
  /** Attenuation for the selected band in dB */
  attenuationDb: number;
  /** Material default thickness in cm */
  baseThicknessCm: number;
  /** Actual wall thickness in cm (per-wall override or material default) */
  actualThicknessCm: number;
  /** Human-readable material label for debug output (e.g. "Brick", "Door", "Window") */
  materialLabel?: string;
}

/** Request message sent to the heatmap worker */
export interface HeatmapWorkerRequest {
  type: 'calculate';
  id: number;
  aps: APConfig[];
  walls: WallData[];
  bounds: FloorBounds;
  /** Grid step size in meters (e.g. 1.0 for coarse, 0.25 for fine) */
  gridStep: number;
  /** Output image width in pixels */
  outputWidth: number;
  /** Output image height in pixels */
  outputHeight: number;
  /** Frequency band to calculate */
  band: FrequencyBand;
  /** Color scheme for the output image */
  colorScheme: ColorScheme;
  /** Calibrated path loss exponent (overrides default if set) */
  calibratedN?: number;
  /** Receiver gain in dBi (default: -3 for smartphone) */
  receiverGainDbi?: number;
  /** Wall-mount back sector penalty in dB (default: -15) */
  backSectorPenalty?: number;
  /** Wall-mount side sector penalty in dB (default: -5) */
  sideSectorPenalty?: number;
  /** Optional: only calculate for this single AP (debug single-AP view) */
  apFilter?: string;
}

// ─── Worker Output Types ───────────────────────────────────────────

/** Successful calculation result */
export interface HeatmapWorkerResult {
  type: 'result';
  id: number;
  /** RGBA ImageData buffer (Transferable) */
  buffer: ArrayBuffer;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Time spent on calculation in milliseconds */
  calculationTimeMs: number;
  /** Statistics about the computed signal field */
  stats: {
    minRSSI: number;
    maxRSSI: number;
    avgRSSI: number;
    /** Coverage bins: count of cells per signal quality bracket */
    coverageBins?: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
      none: number;
    };
    /** Total number of grid cells computed */
    totalCells?: number;
    /** AP placement hints for weak coverage zones */
    placementHints?: PlacementHint[];
  };
  /** Best-AP index per grid cell (Uint8Array, gridWidth * gridHeight) */
  apIndexBuffer?: ArrayBuffer;
  /** Delta between best and second-best RSSI per grid cell (Float32Array) */
  deltaBuffer?: ArrayBuffer;
  /** AP IDs in order matching apIndexBuffer indices */
  apIds?: string[];
  /** RF grid width (cells, not output pixels) */
  gridWidth?: number;
  /** RF grid height (cells, not output pixels) */
  gridHeight?: number;
  /** Raw RSSI grid (Float32Array, gridWidth * gridHeight) for analysis */
  rssiBuffer?: ArrayBuffer;
  /** Second-best AP index per cell (Uint8Array) */
  secondBestApIndexBuffer?: ArrayBuffer;
  /** Number of APs above fair threshold per cell (Uint8Array) */
  overlapCountBuffer?: ArrayBuffer;
  /** 1 if uplink-limited at best AP, 0 otherwise (Uint8Array) */
  uplinkLimitedBuffer?: ArrayBuffer;
}

/** Progress update during calculation */
export interface HeatmapWorkerProgress {
  type: 'progress';
  id: number;
  progress: number;
  phase: 'coarse' | 'fine';
}

/** Error during calculation */
export interface HeatmapWorkerError {
  type: 'error';
  id: number;
  message: string;
}

/** Union of all possible worker responses */
export type HeatmapWorkerResponse =
  | HeatmapWorkerResult
  | HeatmapWorkerProgress
  | HeatmapWorkerError;
