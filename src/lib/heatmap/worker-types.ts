/**
 * Type definitions for heatmap Web Worker communication.
 *
 * These types are shared between the main thread (HeatmapRenderer)
 * and the Web Worker (heatmap-worker).
 */

import type { FrequencyBand, ColorScheme } from './color-schemes';

// ─── Geometry Types ────────────────────────────────────────────────

/** Line segment with start and end point (meters) */
export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Bounding rectangle (meters) */
export interface FloorBounds {
  width: number;
  height: number;
}

// ─── Worker Input Types ────────────────────────────────────────────

/** Access point data needed for RF calculation */
export interface APConfig {
  id: string;
  /** X position in meters */
  x: number;
  /** Y position in meters */
  y: number;
  /** Transmit power in dBm */
  txPowerDbm: number;
  /** Antenna gain in dBi */
  antennaGainDbi: number;
  /** Whether this AP is active */
  enabled: boolean;
}

/** Wall data needed for RF calculation */
export interface WallData {
  segments: LineSegment[];
  /** Attenuation for the selected band in dB */
  attenuationDb: number;
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
  };
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
