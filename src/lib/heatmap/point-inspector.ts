/**
 * Point Inspector - Debug tool for inspecting RF calculations at a specific point.
 *
 * Runs the same RF model as the heatmap worker but for a single point,
 * returning detailed per-AP breakdown including per-segment wall hits,
 * mounting details, 2D/3D distances, and best/second-best AP analysis.
 * Executes on the main thread (not in the worker).
 */

import type { APConfig, WallData, FloorBounds } from './worker-types';
import type { FrequencyBand } from './color-schemes';
import type { SpatialGridEntry, WallHitDetail, HitGroup } from './spatial-grid';
import {
  computeRSSI,
  computeUplinkRSSI,
  computeMountingFactorDetailed,
  computePathLoss,
  createRFConfig,
  DEFAULT_RECEIVER_HEIGHT_M,
  MIN_DISTANCE,
  type MountingSector,
} from './rf-engine';
import { buildSpatialGrid, computeWallLoss, computeWallLossDetailed } from './spatial-grid';

// ─── Types ──────────────────────────────────────────────────────

/** Per-segment hit detail exposed in debug output */
export interface SegmentHitDebug {
  /** Material label (e.g. "Brick", "Door", "Window") */
  materialLabel: string;
  /** Scaled attenuation applied in dB */
  attenuationDb: number;
  /** Base attenuation before thickness scaling */
  baseAttenuationDb: number;
  /** Thickness scale factor */
  thicknessScale: number;
  /** Intersection point */
  hitX: number;
  hitY: number;
  /** Segment coordinates */
  segX1: number;
  segY1: number;
  segX2: number;
  segY2: number;
  /** Distance along ray (0=AP, 1=point) */
  t: number;
}

/** Counts of wall hits by material category */
export interface HitCountsByCategory {
  [key: string]: number;
}

/** Per-AP debug breakdown for a single point */
export interface PerApDebug {
  apId: string;
  apLabel: string;
  /** 2D horizontal distance in meters */
  distance2D: number;
  /** 3D distance including height difference */
  distance3D: number;
  pathLossDb: number;
  wallLossDb: number;
  wallsHit: number;
  /** Mounting sector: ceiling, front, side, back */
  mountingSector: MountingSector;
  /** Mounting type: ceiling or wall */
  mountingType: string;
  /** Angular difference for wall mounts */
  mountingAngleDiff: number;
  mountingFactorDb: number;
  downlinkRssi: number;
  uplinkRssi: number;
  effectiveRssi: number;
  /** Detailed per-segment hit list */
  segmentHits: SegmentHitDebug[];
  /** Hit counts grouped by material label */
  hitCountsByCategory: HitCountsByCategory;
  /** Hit groups with dedup debug info */
  hitGroups: HitGroup[];
  /** Total raw hits before grouping/dedup */
  rawHitCount: number;
  /** Whether this is the best AP for this point */
  isBest: boolean;
}

/** Full debug result for inspecting a single point */
export interface PointDebugResult {
  pointX: number;
  pointY: number;
  effectiveRssi: number;
  bestApId: string;
  /** Second-best AP ID */
  secondBestApId: string | null;
  /** Difference between best and second-best (dB) */
  secondBestDelta: number | null;
  band: FrequencyBand;
  perAp: PerApDebug[];
}

// ─── Inspector Function ─────────────────────────────────────────

/**
 * Inspects RF conditions at a specific point on the floor plan.
 *
 * @param pointX - X position in meters
 * @param pointY - Y position in meters
 * @param aps - All access points (enabled filter applied internally)
 * @param walls - All wall data for the floor
 * @param bounds - Floor plan bounds
 * @param band - Frequency band to evaluate
 * @param calibratedN - Optional calibrated path loss exponent
 * @param receiverGainDbi - Optional receiver gain override
 * @returns Detailed debug result for the point
 */
export function inspectPoint(
  pointX: number,
  pointY: number,
  aps: APConfig[],
  walls: WallData[],
  bounds: FloorBounds,
  band: FrequencyBand,
  calibratedN?: number,
  receiverGainDbi?: number,
): PointDebugResult {
  const originX = bounds.originX ?? 0;
  const originY = bounds.originY ?? 0;
  const rfConfig = createRFConfig(band, {
    pathLossExponent: calibratedN,
    receiverGain: receiverGainDbi,
  });

  const { grid: spatialGrid, allSegments } = buildSpatialGrid(
    walls, bounds.width, bounds.height, originX, originY,
  );

  const activeAPs = aps.filter((ap) => ap.enabled);
  const perAp: PerApDebug[] = [];

  for (const ap of activeAPs) {
    const dx = pointX - ap.x;
    const dy = pointY - ap.y;
    const dz = (ap.heightM ?? 0) - DEFAULT_RECEIVER_HEIGHT_M;
    const distance2D = Math.sqrt(dx * dx + dy * dy);
    const distance3D = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy + dz * dz));

    const pathLossDb = computePathLoss(distance3D, rfConfig);

    // Detailed wall loss with per-segment hits
    const wallDetail = computeWallLossDetailed(
      ap.x, ap.y, pointX, pointY, spatialGrid, allSegments,
    );

    // Mounting factor with sector detail (uses configurable sector penalties)
    const mountingDetail = computeMountingFactorDetailed(pointX, pointY, ap, rfConfig);

    const downlinkRssi = computeRSSI(pointX, pointY, ap, rfConfig, spatialGrid, allSegments);
    const uplinkRssi = computeUplinkRSSI(pointX, pointY, ap, band, rfConfig, spatialGrid, allSegments);
    const effectiveRssi = Math.min(downlinkRssi, uplinkRssi);

    // Build segment hit debug list
    const segmentHits: SegmentHitDebug[] = wallDetail.hits.map((h) => ({
      materialLabel: h.materialLabel,
      attenuationDb: h.attenuationDb,
      baseAttenuationDb: h.baseAttenuationDb,
      thicknessScale: h.thicknessScale,
      hitX: h.hitX,
      hitY: h.hitY,
      segX1: h.segX1,
      segY1: h.segY1,
      segX2: h.segX2,
      segY2: h.segY2,
      t: Math.round(h.t * 1000) / 1000,
    }));

    // Count hits by material label
    const hitCountsByCategory: HitCountsByCategory = {};
    for (const hit of segmentHits) {
      hitCountsByCategory[hit.materialLabel] = (hitCountsByCategory[hit.materialLabel] ?? 0) + 1;
    }

    perAp.push({
      apId: ap.id,
      apLabel: ap.id,
      distance2D: Math.round(distance2D * 100) / 100,
      distance3D: Math.round(distance3D * 100) / 100,
      pathLossDb: Math.round(pathLossDb * 10) / 10,
      wallLossDb: Math.round(wallDetail.totalLoss * 10) / 10,
      wallsHit: wallDetail.groups.length,
      mountingSector: mountingDetail.sector,
      mountingType: ap.mounting ?? 'ceiling',
      mountingAngleDiff: Math.round(mountingDetail.angleDiff * 10) / 10,
      mountingFactorDb: mountingDetail.factorDb,
      downlinkRssi: Math.round(downlinkRssi * 10) / 10,
      uplinkRssi: Math.round(uplinkRssi * 10) / 10,
      effectiveRssi: Math.round(effectiveRssi * 10) / 10,
      segmentHits,
      hitCountsByCategory,
      hitGroups: wallDetail.groups,
      rawHitCount: wallDetail.rawHitCount,
      isBest: false, // set after sorting
    });
  }

  // Sort by effective RSSI descending (best AP first)
  perAp.sort((a, b) => b.effectiveRssi - a.effectiveRssi);

  // Mark best AP
  const bestApId = perAp.length > 0 ? perAp[0]!.apId : '';
  if (perAp.length > 0) {
    perAp[0]!.isBest = true;
  }

  // Second-best AP delta
  const secondBestApId = perAp.length > 1 ? perAp[1]!.apId : null;
  const secondBestDelta = perAp.length > 1
    ? Math.round((perAp[0]!.effectiveRssi - perAp[1]!.effectiveRssi) * 10) / 10
    : null;

  const bestEffective = perAp.length > 0 ? perAp[0]!.effectiveRssi : -120;

  return {
    pointX: Math.round(pointX * 100) / 100,
    pointY: Math.round(pointY * 100) / 100,
    effectiveRssi: bestEffective,
    bestApId,
    secondBestApId,
    secondBestDelta,
    band,
    perAp,
  };
}
