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

/** Band-specific path loss exponents for residential environments */
export const PATH_LOSS_EXPONENTS: Record<FrequencyBand, number> = {
  '2.4ghz': 3.0,
  '5ghz': 3.2,
  '6ghz': 3.3,
};

/** Default receiver gain for a smartphone antenna (dBi) */
export const DEFAULT_RECEIVER_GAIN_DBI = -3;

/** Minimum distance in meters to avoid log(0) singularity */
export const MIN_DISTANCE = 1.0;

/** Default receiver height in meters (smartphone held at waist/desk height) */
export const DEFAULT_RECEIVER_HEIGHT_M = 1.0;

/** Typical client device transmit power per band (dBm) */
export const CLIENT_TX_POWER: Record<FrequencyBand, number> = {
  '2.4ghz': 15,
  '5ghz': 12,
  '6ghz': 12,
};

/** Client antenna gain (dBi, negative = loss) */
export const CLIENT_ANTENNA_GAIN_DBI = -3;

// ─── Types ─────────────────────────────────────────────────────────

/** Configuration for RF path loss calculation */
export interface RFConfig {
  /** Free-space path loss at 1m reference distance (dB) */
  referenceLoss: number;
  /** Path loss exponent (dimensionless, typically 2.0-4.0) */
  pathLossExponent: number;
  /** Receiver antenna gain (dBi, negative for losses) */
  receiverGain: number;
  /** Wall-mount back sector penalty in dB (default: -15) */
  backSectorPenalty?: number;
  /** Wall-mount side sector penalty in dB (default: -5) */
  sideSectorPenalty?: number;
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
    pathLossExponent: overrides?.pathLossExponent ?? PATH_LOSS_EXPONENTS[band] ?? DEFAULT_PATH_LOSS_EXPONENT,
    receiverGain: overrides?.receiverGain ?? DEFAULT_RECEIVER_GAIN_DBI,
    backSectorPenalty: overrides?.backSectorPenalty,
    sideSectorPenalty: overrides?.sideSectorPenalty,
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

/** Mounting sector classification */
export type MountingSector = 'ceiling' | 'front' | 'side' | 'back';

/**
 * Computes the mounting factor (directional penalty) for an AP based on its
 * mounting type and the angle to the receiver point.
 *
 * - Ceiling mount: omnidirectional with slight ceiling reflection penalty (-2 dB)
 * - Wall mount: directional pattern (front: 0, side: configurable, back: configurable)
 *
 * @param config - Optional RF config for custom sector penalties
 * @returns Mounting adjustment in dB (typically negative or zero)
 */
export function computeMountingFactor(
  pointX: number,
  pointY: number,
  ap: APConfig,
  config?: RFConfig,
): number {
  return computeMountingFactorDetailed(pointX, pointY, ap, config).factorDb;
}

/**
 * Computes mounting factor with sector classification for debug output.
 *
 * @param config - Optional RF config for custom sector penalties
 */
export function computeMountingFactorDetailed(
  pointX: number,
  pointY: number,
  ap: APConfig,
  config?: RFConfig,
): { factorDb: number; sector: MountingSector; angleDiff: number } {
  if (ap.mounting === 'ceiling') {
    return { factorDb: -2, sector: 'ceiling', angleDiff: 0 };
  }

  // Wall-mounted: directional pattern with configurable penalties
  const sidePenalty = config?.sideSectorPenalty ?? -5;
  const backPenalty = config?.backSectorPenalty ?? -15;

  const angle = Math.atan2(pointY - ap.y, pointX - ap.x) * (180 / Math.PI);
  const diff = Math.abs(((angle - (ap.orientationDeg ?? 0)) % 360 + 540) % 360 - 180);

  if (diff <= 60) return { factorDb: 0, sector: 'front', angleDiff: diff };
  if (diff <= 120) return { factorDb: sidePenalty, sector: 'side', angleDiff: diff };
  return { factorDb: backPenalty, sector: 'back', angleDiff: diff };
}

/**
 * Computes downlink RSSI at a given point from a single AP using ITU-R P.1238.
 *
 * Full model including wall attenuation and mounting factor:
 *   PL(d) = PL(1m) + 10 * n * log10(d) + Sum(wall_losses)
 *   RSSI  = TX_Power + Antenna_Gain + Receiver_Gain + Mounting - PL(d)
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

  // Mounting factor (directional penalty, uses configurable sector penalties)
  const mountingFactor = computeMountingFactor(pointX, pointY, ap, config);

  // RSSI = TX_Power + Antenna_Gain + Receiver_Gain + Mounting - Path_Loss
  return ap.txPowerDbm + ap.antennaGainDbi + config.receiverGain + mountingFactor - totalPathLoss;
}

/**
 * Computes uplink RSSI at the AP from a client device at a given point.
 *
 * Uses the same path/wall loss as downlink but with client TX power
 * and AP antenna as receiver.
 *
 * @param pointX - Client X position in meters
 * @param pointY - Client Y position in meters
 * @param ap - Access point configuration
 * @param band - Frequency band for client TX power lookup
 * @param config - RF configuration parameters
 * @param spatialGrid - Spatial grid for wall intersection acceleration
 * @param allSegments - All wall segments with attenuation values
 * @returns Uplink RSSI in dBm
 */
export function computeUplinkRSSI(
  pointX: number,
  pointY: number,
  ap: APConfig,
  band: FrequencyBand,
  config: RFConfig,
  spatialGrid: SpatialGrid,
  allSegments: SpatialGridEntry[],
): number {
  const dx = pointX - ap.x;
  const dy = pointY - ap.y;
  const dz = (ap.heightM ?? 0) - DEFAULT_RECEIVER_HEIGHT_M;
  const distance = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy + dz * dz));

  const distanceLoss = 10 * config.pathLossExponent * Math.log10(distance);
  const wallLoss = computeWallLoss(ap.x, ap.y, pointX, pointY, spatialGrid, allSegments);
  const totalPathLoss = config.referenceLoss + distanceLoss + wallLoss;

  // Uplink: TX = client power, RX gain = AP antenna gain
  return CLIENT_TX_POWER[band] + CLIENT_ANTENNA_GAIN_DBI + ap.antennaGainDbi - totalPathLoss;
}
