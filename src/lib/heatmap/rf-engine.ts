/**
 * RF Engine - Pure RF propagation calculations based on ITU-R P.1238.
 *
 * Implements the indoor path loss model:
 *   PL(d) = PL(1m) + 10 * n * log10(d) + Sum(wall_losses)
 *   RSSI  = TX_Power + Antenna_Gain + Receiver_Gain - PL(d)
 *
 * Reference values (from rf-modell.md):
 *   PL(1m) @ 2.4 GHz = 40.05 dB
 *   PL(1m) @ 5 GHz   = 46.42 dB
 *   PL(1m) @ 6 GHz   = 47.96 dB
 *   n (residential)   = 3.5 (default, conservative)
 *   Smartphone receiver gain = -3 dBi
 *
 * All functions are pure and stateless, suitable for testing and
 * importing from both the worker thread and main thread.
 */

import type { APConfig } from './worker-types';
import type { FrequencyBand } from './color-schemes';
import type { SpatialGrid, SpatialGridEntry } from './spatial-grid';
import { computeWallLoss } from './spatial-grid';

// ─── RF Model Constants ────────────────────────────────────────────

/** Free-space path loss at 1 meter reference distance (dB) per band */
export const REFERENCE_LOSS: Record<FrequencyBand, number> = {
  '2.4ghz': 40.05,
  '5ghz': 46.42,
  '6ghz': 47.96,
};

/** Default path loss exponent for residential environments */
export const DEFAULT_PATH_LOSS_EXPONENT = 3.5;

/** Default receiver gain for a smartphone antenna (dBi) */
export const DEFAULT_RECEIVER_GAIN_DBI = -3;

/** Minimum distance in meters to avoid log(0) singularity */
export const MIN_DISTANCE = 0.1;

/** Default receiver height in meters (smartphone held at chest height) */
export const DEFAULT_RECEIVER_HEIGHT_M = 1.2;

// ─── Types ─────────────────────────────────────────────────────────

/** Configuration for RF path loss calculation */
export interface RFConfig {
  /** Free-space path loss at 1m reference distance (dB) */
  referenceLoss: number;
  /** Path loss exponent (dimensionless, typically 2.0-4.0) */
  pathLossExponent: number;
  /** Receiver antenna gain (dBi, negative for losses) */
  receiverGain: number;
}

// ─── Config Helpers ────────────────────────────────────────────────

/**
 * Creates an RFConfig from a frequency band with optional overrides.
 *
 * @param band - Frequency band ('2.4ghz', '5ghz', '6ghz')
 * @param overrides - Optional partial overrides for calibration
 * @returns Complete RFConfig ready for calculations
 */
export function createRFConfig(
  band: FrequencyBand,
  overrides?: Partial<RFConfig>,
): RFConfig {
  return {
    referenceLoss: overrides?.referenceLoss ?? REFERENCE_LOSS[band] ?? REFERENCE_LOSS['5ghz'],
    pathLossExponent: overrides?.pathLossExponent ?? DEFAULT_PATH_LOSS_EXPONENT,
    receiverGain: overrides?.receiverGain ?? DEFAULT_RECEIVER_GAIN_DBI,
  };
}

// ─── Pure RF Calculations ──────────────────────────────────────────

/**
 * Computes the free-space path loss at a given distance (without wall losses).
 *
 * This is the "pure" RF calculation useful for testing and calibration:
 *   PL(d) = PL(1m) + 10 * n * log10(d)
 *
 * @param distance - Distance from AP in meters (clamped to MIN_DISTANCE)
 * @param config - RF configuration parameters
 * @returns Path loss in dB (always positive)
 */
export function computePathLoss(
  distance: number,
  config: RFConfig,
): number {
  const clampedDistance = Math.max(MIN_DISTANCE, distance);
  return config.referenceLoss + 10 * config.pathLossExponent * Math.log10(clampedDistance);
}

/**
 * Computes RSSI at a given point from a single AP using ITU-R P.1238.
 *
 * Full model including wall attenuation:
 *   PL(d) = PL(1m) + 10 * n * log10(d) + Sum(wall_losses)
 *   RSSI  = TX_Power + Antenna_Gain + Receiver_Gain - PL(d)
 *
 * @param pointX - Receiver X position in meters
 * @param pointY - Receiver Y position in meters
 * @param ap - Access point configuration
 * @param config - RF configuration parameters
 * @param spatialGrid - Spatial grid for wall intersection acceleration
 * @param allSegments - All wall segments with attenuation values
 * @returns RSSI in dBm
 */
export function computeRSSI(
  pointX: number,
  pointY: number,
  ap: APConfig,
  config: RFConfig,
  spatialGrid: SpatialGrid,
  allSegments: SpatialGridEntry[],
): number {
  const dx = pointX - ap.x;
  const dy = pointY - ap.y;
  const dz = (ap.heightM ?? 0) - DEFAULT_RECEIVER_HEIGHT_M;
  const distance = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy + dz * dz));

  // Path loss: PL(d) = PL(1m) + 10 * n * log10(d) + wall_losses
  const distanceLoss = 10 * config.pathLossExponent * Math.log10(distance);
  const wallLoss = computeWallLoss(ap.x, ap.y, pointX, pointY, spatialGrid, allSegments);
  const totalPathLoss = config.referenceLoss + distanceLoss + wallLoss;

  // RSSI = TX_Power + Antenna_Gain + Receiver_Gain - Path_Loss
  return ap.txPowerDbm + ap.antennaGainDbi + config.receiverGain - totalPathLoss;
}
