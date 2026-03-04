/**
 * Spatial Grid - Accelerated wall intersection detection.
 *
 * Implements a uniform grid spatial index for efficient ray-vs-wall
 * intersection tests. Instead of testing every wall segment for each
 * AP-to-point ray, only segments in the cells traversed by the ray
 * are checked.
 *
 * Cell size is 1.0 meter, matching the expected wall density in
 * residential floor plans.
 *
 * All functions are pure and stateless, suitable for testing and
 * importing from both the worker thread and main thread.
 */

import type { WallData, LineSegment } from './worker-types';

// ─── Constants ─────────────────────────────────────────────────────

/** Cell size for the spatial grid (meters) */
export const SPATIAL_GRID_CELL_SIZE = 1.0;

// ─── Material Classification ─────────────────────────────────────

/**
 * Classifies whether a material represents an opening (door, window)
 * vs a solid barrier (brick, concrete, drywall, etc.).
 *
 * Openings physically replace wall sections — when a door/window segment
 * overlaps with its parent wall, only the opening's lower attenuation
 * should count for RF propagation.
 */
export function isOpeningMaterial(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes('door') || l.includes('tür') || l.includes('tuer')
    || l.includes('window') || l.includes('fenster')
    || l.includes('glass') || l.includes('glas');
}

// ─── Types ─────────────────────────────────────────────────────────

/** A wall segment with its attenuation value, stored in the spatial grid */
export interface SpatialGridEntry {
  seg: LineSegment;
  attenuation: number;
  /** Material default thickness in cm */
  baseThicknessCm: number;
  /** Actual wall thickness in cm */
  actualThicknessCm: number;
  /** Human-readable material label for debug output */
  materialLabel?: string;
}

/** Uniform spatial grid index for wall segment lookup */
export interface SpatialGrid {
  /** Map from cell key (row * gridCols + col) to segment indices */
  cells: Map<number, number[]>;
  /** Number of columns in the grid */
  gridCols: number;
  /** Number of rows in the grid */
  gridRows: number;
  /** Cell size in meters */
  cellSize: number;
  /** X-offset of the grid origin in meters */
  originX: number;
  /** Y-offset of the grid origin in meters */
  originY: number;
}

/** Result of building a spatial grid: the grid itself plus all flattened segments */
export interface SpatialGridResult {
  grid: SpatialGrid;
  allSegments: SpatialGridEntry[];
}

// ─── Spatial Grid Construction ─────────────────────────────────────

/**
 * Builds a spatial grid index for wall segments.
 *
 * Each cell contains indices into the allSegments array for wall segments
 * whose bounding box overlaps the cell. This allows O(k) intersection tests
 * where k is the number of segments near the ray, instead of O(n) for all.
 *
 * @param walls - Array of walls with their line segments and attenuation
 * @param boundsWidth - Floor plan width in meters
 * @param boundsHeight - Floor plan height in meters
 * @param originX - X-offset of the grid origin in meters (default: 0)
 * @param originY - Y-offset of the grid origin in meters (default: 0)
 * @returns The spatial grid and flattened segment array
 */
export function buildSpatialGrid(
  walls: WallData[],
  boundsWidth: number,
  boundsHeight: number,
  originX = 0,
  originY = 0,
): SpatialGridResult {
  const cellSize = SPATIAL_GRID_CELL_SIZE;
  const gridCols = Math.ceil(boundsWidth / cellSize) + 1;
  const gridRows = Math.ceil(boundsHeight / cellSize) + 1;
  const cells = new Map<number, number[]>();

  // Flatten all wall segments with their attenuation values
  const allSegments: SpatialGridEntry[] = [];
  for (const wall of walls) {
    for (const seg of wall.segments) {
      allSegments.push({
        seg,
        attenuation: wall.attenuationDb,
        baseThicknessCm: wall.baseThicknessCm,
        actualThicknessCm: wall.actualThicknessCm,
        materialLabel: wall.materialLabel,
      });
    }
  }

  // Register each segment in all cells it passes through
  for (let idx = 0; idx < allSegments.length; idx++) {
    const entry = allSegments[idx];
    if (!entry) continue;

    const { seg } = entry;
    // Convert absolute coordinates to grid-local coordinates
    const minX = Math.max(0, Math.floor((Math.min(seg.x1, seg.x2) - originX) / cellSize));
    const maxX = Math.min(gridCols - 1, Math.floor((Math.max(seg.x1, seg.x2) - originX) / cellSize));
    const minY = Math.max(0, Math.floor((Math.min(seg.y1, seg.y2) - originY) / cellSize));
    const maxY = Math.min(gridRows - 1, Math.floor((Math.max(seg.y1, seg.y2) - originY) / cellSize));

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const key = cy * gridCols + cx;
        const existing = cells.get(key);
        if (existing) {
          existing.push(idx);
        } else {
          cells.set(key, [idx]);
        }
      }
    }
  }

  return {
    grid: { cells, gridCols, gridRows, cellSize, originX, originY },
    allSegments,
  };
}

// ─── Line-Segment Intersection ─────────────────────────────────────

/**
 * Tests if two line segments intersect using the cross-product method.
 *
 * Segments are defined by endpoints: (p1x,p1y)->(p2x,p2y) and (p3x,p3y)->(p4x,p4y).
 * Returns true if the segments share a point (including endpoints).
 *
 * @returns true if the segments intersect
 */
export function segmentsIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): boolean {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = p4x - p3x;
  const d2y = p4y - p3y;

  const denom = d1x * d2y - d1y * d2x;

  // Parallel or collinear segments
  if (Math.abs(denom) < 1e-10) return false;

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;

  // Intersection occurs if both parameters are in [0, 1]
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Returns the t-parameter of the intersection point along the first segment,
 * or -1 if no intersection. Used for deduplication of hits at shared wall corners.
 *
 * @returns t-parameter in [0,1] along segment 1, or -1 if no intersection
 */
export function segmentIntersectionT(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): number {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = p4x - p3x;
  const d2y = p4y - p3y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return -1;

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return -1;
}

// ─── Wall Hit Detail Types ────────────────────────────────────────

/** Detailed info about a single wall segment hit by a ray */
export interface WallHitDetail {
  /** t-parameter along the ray [0,1] */
  t: number;
  /** Scaled attenuation applied (attenuationDb * thicknessScale) */
  attenuationDb: number;
  /** Raw base attenuation before thickness scaling */
  baseAttenuationDb: number;
  /** Thickness scale factor applied */
  thicknessScale: number;
  /** Material label (e.g. "Brick", "Door", "Window") */
  materialLabel: string;
  /** Intersection point X in meters */
  hitX: number;
  /** Intersection point Y in meters */
  hitY: number;
  /** Wall segment coordinates */
  segX1: number;
  segY1: number;
  segX2: number;
  segY2: number;
}

/** Dedup action classification for a hit group */
export type HitGroupAction = 'kept' | 'same_barrier_merged' | 'opening_replaced_wall';

/** A group of ray-wall hits at approximately the same physical position */
export interface HitGroup {
  /** Group index (0-based) */
  index: number;
  /** All raw hits in this group before dedup */
  rawHits: WallHitDetail[];
  /** The representative hit selected for this group */
  representative: WallHitDetail;
  /** Final attenuation counted for this group (dB) */
  appliedLossDb: number;
  /** Classification of the dedup action */
  action: HitGroupAction;
  /** Human-readable explanation */
  reason: string;
}

/** Result of detailed wall loss computation */
export interface WallLossDetailedResult {
  /** Total wall loss in dB (same as computeWallLoss returns) */
  totalLoss: number;
  /** Per-group representative hit details, sorted by t-parameter along the ray */
  hits: WallHitDetail[];
  /** Hit groups with full dedup debug info */
  groups: HitGroup[];
  /** Total raw hits before grouping/dedup */
  rawHitCount: number;
}

// ─── Wall Loss Calculation ─────────────────────────────────────────

/**
 * Computes total wall attenuation along a ray from point A to point B.
 *
 * Uses the spatial grid for acceleration: only wall segments in cells
 * traversed by the ray are tested for intersection.
 *
 * @param ax - Ray start X (meters)
 * @param ay - Ray start Y (meters)
 * @param bx - Ray end X (meters)
 * @param by - Ray end Y (meters)
 * @param spatialGrid - Pre-built spatial grid index
 * @param allSegments - All wall segments with attenuation values
 * @returns Total attenuation in dB from all intersected walls
 */
export function computeWallLoss(
  ax: number, ay: number,
  bx: number, by: number,
  spatialGrid: SpatialGrid,
  allSegments: SpatialGridEntry[],
): number {
  const { cells, gridCols, cellSize, originX, originY } = spatialGrid;

  // Determine which cells the ray passes through (convert to grid-local coords)
  const rayMinX = Math.max(0, Math.floor((Math.min(ax, bx) - originX) / cellSize));
  const rayMaxX = Math.min(spatialGrid.gridCols - 1, Math.floor((Math.max(ax, bx) - originX) / cellSize));
  const rayMinY = Math.max(0, Math.floor((Math.min(ay, by) - originY) / cellSize));
  const rayMaxY = Math.min(spatialGrid.gridRows - 1, Math.floor((Math.max(ay, by) - originY) / cellSize));

  // Collect unique segment indices from traversed cells
  const testedSegments = new Set<number>();

  // Raycast length for deduplication epsilon calculation
  const rayDx = bx - ax;
  const rayDy = by - ay;
  const rayLen = Math.sqrt(rayDx * rayDx + rayDy * rayDy);

  // Collect all hits with their t-parameter along the ray
  const hits: Array<{ t: number; attenuation: number; scale: number; opening: boolean }> = [];

  for (let cy = rayMinY; cy <= rayMaxY; cy++) {
    for (let cx = rayMinX; cx <= rayMaxX; cx++) {
      const key = cy * gridCols + cx;
      const segIndices = cells.get(key);
      if (!segIndices) continue;

      for (const idx of segIndices) {
        if (testedSegments.has(idx)) continue;
        testedSegments.add(idx);

        const entry = allSegments[idx];
        if (!entry) continue;

        const { seg, attenuation, baseThicknessCm, actualThicknessCm } = entry;
        const t = segmentIntersectionT(
          ax, ay, bx, by,
          seg.x1, seg.y1, seg.x2, seg.y2,
        );
        if (t >= 0) {
          const scale = Math.max(0.5, Math.min(2.0, actualThicknessCm / baseThicknessCm));
          hits.push({ t, attenuation, scale, opening: isOpeningMaterial(entry.materialLabel ?? '') });
        }
      }
    }
  }

  // Group hits within 0.05m physical distance along the ray.
  // This handles two cases:
  //   A) Junction artifacts: wall segments sharing an endpoint get hit at
  //      nearly the same position → same physical barrier, count once.
  //   B) Overlapping objects: door/window segment overlapping its parent
  //      wall → opening replaces wall, use lower attenuation.
  if (hits.length === 0) return 0;
  if (hits.length === 1) return hits[0]!.attenuation * hits[0]!.scale;

  hits.sort((a, b) => a.t - b.t);
  const epsilon = rayLen > 0 ? 0.05 / rayLen : 0.005;
  let totalLoss = 0;
  let groupStart = 0;

  while (groupStart < hits.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < hits.length && hits[groupEnd]!.t - hits[groupStart]!.t < epsilon) {
      groupEnd++;
    }

    if (groupEnd - groupStart === 1) {
      // Single hit — no grouping needed
      totalLoss += hits[groupStart]!.attenuation * hits[groupStart]!.scale;
    } else {
      // Check if group contains an opening (door/window)
      let hasOpening = false;
      for (let j = groupStart; j < groupEnd; j++) {
        if (hits[j]!.opening) { hasOpening = true; break; }
      }

      if (hasOpening) {
        // Case B: Opening replaces wall → use MINIMUM attenuation
        let minLoss = Infinity;
        for (let j = groupStart; j < groupEnd; j++) {
          const loss = hits[j]!.attenuation * hits[j]!.scale;
          if (loss < minLoss) minLoss = loss;
        }
        totalLoss += minLoss;
      } else {
        // Case A: Solid barrier junction → count STRONGEST once
        let maxLoss = 0;
        for (let j = groupStart; j < groupEnd; j++) {
          const loss = hits[j]!.attenuation * hits[j]!.scale;
          if (loss > maxLoss) maxLoss = loss;
        }
        totalLoss += maxLoss;
      }
    }

    groupStart = groupEnd;
  }

  return totalLoss;
}

// ─── Detailed Wall Loss (for Point Inspector) ────────────────────

/**
 * Computes total wall attenuation with per-segment hit details.
 *
 * Same logic as computeWallLoss but returns detailed information about
 * each segment intersection for debug/inspection purposes.
 * Slower than computeWallLoss due to object allocations — use only for
 * single-point inspection, never for full heatmap grids.
 */
export function computeWallLossDetailed(
  ax: number, ay: number,
  bx: number, by: number,
  spatialGrid: SpatialGrid,
  allSegments: SpatialGridEntry[],
): WallLossDetailedResult {
  const { cells, gridCols, cellSize, originX, originY } = spatialGrid;

  const rayMinX = Math.max(0, Math.floor((Math.min(ax, bx) - originX) / cellSize));
  const rayMaxX = Math.min(spatialGrid.gridCols - 1, Math.floor((Math.max(ax, bx) - originX) / cellSize));
  const rayMinY = Math.max(0, Math.floor((Math.min(ay, by) - originY) / cellSize));
  const rayMaxY = Math.min(spatialGrid.gridRows - 1, Math.floor((Math.max(ay, by) - originY) / cellSize));

  const testedSegments = new Set<number>();
  const rayDx = bx - ax;
  const rayDy = by - ay;
  const rayLen = Math.sqrt(rayDx * rayDx + rayDy * rayDy);

  // Collect raw hits
  const rawHits: Array<{
    t: number;
    attenuation: number;
    scale: number;
    materialLabel: string;
    seg: LineSegment;
  }> = [];

  for (let cy = rayMinY; cy <= rayMaxY; cy++) {
    for (let cx = rayMinX; cx <= rayMaxX; cx++) {
      const key = cy * gridCols + cx;
      const segIndices = cells.get(key);
      if (!segIndices) continue;

      for (const idx of segIndices) {
        if (testedSegments.has(idx)) continue;
        testedSegments.add(idx);

        const entry = allSegments[idx];
        if (!entry) continue;

        const { seg, attenuation, baseThicknessCm, actualThicknessCm, materialLabel } = entry;
        const t = segmentIntersectionT(
          ax, ay, bx, by,
          seg.x1, seg.y1, seg.x2, seg.y2,
        );
        if (t >= 0) {
          const scale = Math.max(0.5, Math.min(2.0, actualThicknessCm / baseThicknessCm));
          rawHits.push({
            t,
            attenuation,
            scale,
            materialLabel: materialLabel ?? 'Unknown',
            seg,
          });
        }
      }
    }
  }

  if (rawHits.length === 0) {
    return { totalLoss: 0, hits: [], groups: [], rawHitCount: 0 };
  }

  rawHits.sort((a, b) => a.t - b.t);

  // Group hits within 0.05m physical distance along the ray.
  // Same logic as computeWallLoss but with full debug output.
  const epsilon = rayLen > 0 ? 0.05 / rayLen : 0.005;

  // Helper to build a WallHitDetail from a raw hit
  const makeHitDetail = (hit: (typeof rawHits)[0]): WallHitDetail => ({
    t: hit.t,
    attenuationDb: Math.round(hit.attenuation * hit.scale * 10) / 10,
    baseAttenuationDb: hit.attenuation,
    thicknessScale: Math.round(hit.scale * 100) / 100,
    materialLabel: hit.materialLabel,
    hitX: Math.round((ax + rayDx * hit.t) * 100) / 100,
    hitY: Math.round((ay + rayDy * hit.t) * 100) / 100,
    segX1: hit.seg.x1,
    segY1: hit.seg.y1,
    segX2: hit.seg.x2,
    segY2: hit.seg.y2,
  });

  const groups: HitGroup[] = [];
  const finalHits: WallHitDetail[] = [];
  let totalLoss = 0;
  let groupStart = 0;
  let groupIdx = 0;

  while (groupStart < rawHits.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < rawHits.length && rawHits[groupEnd]!.t - rawHits[groupStart]!.t < epsilon) {
      groupEnd++;
    }

    const groupSize = groupEnd - groupStart;
    const groupRawDetails: WallHitDetail[] = [];
    for (let j = groupStart; j < groupEnd; j++) {
      groupRawDetails.push(makeHitDetail(rawHits[j]!));
    }

    let selectedOffset: number;
    let appliedLoss: number;
    let action: HitGroupAction;
    let reason: string;

    if (groupSize === 1) {
      selectedOffset = 0;
      appliedLoss = rawHits[groupStart]!.attenuation * rawHits[groupStart]!.scale;
      action = 'kept';
      reason = 'single hit';
    } else {
      // Check if any hit in this group is an opening (door/window)
      let hasOpening = false;
      for (let j = groupStart; j < groupEnd; j++) {
        if (isOpeningMaterial(rawHits[j]!.materialLabel)) {
          hasOpening = true;
          break;
        }
      }

      if (hasOpening) {
        // Opening replaces wall: keep MINIMUM attenuation
        let minLoss = Infinity;
        selectedOffset = 0;
        for (let j = 0; j < groupSize; j++) {
          const loss = rawHits[groupStart + j]!.attenuation * rawHits[groupStart + j]!.scale;
          if (loss < minLoss) {
            minLoss = loss;
            selectedOffset = j;
          }
        }
        appliedLoss = minLoss;
        action = 'opening_replaced_wall';
        const mat = rawHits[groupStart + selectedOffset]!.materialLabel.toLowerCase();
        if (mat.includes('door') || mat.includes('tür') || mat.includes('tuer')) {
          reason = 'door replaced wall';
        } else if (mat.includes('window') || mat.includes('fenster')) {
          reason = 'window replaced wall';
        } else {
          reason = 'opening replaced wall';
        }
      } else {
        // Solid barrier junction: count STRONGEST once
        let maxLoss = 0;
        selectedOffset = 0;
        for (let j = 0; j < groupSize; j++) {
          const loss = rawHits[groupStart + j]!.attenuation * rawHits[groupStart + j]!.scale;
          if (loss > maxLoss) {
            maxLoss = loss;
            selectedOffset = j;
          }
        }
        appliedLoss = maxLoss;
        action = 'same_barrier_merged';
        reason = `same physical barrier merged (${groupSize} segments)`;
      }
    }

    const representative = groupRawDetails[selectedOffset]!;
    totalLoss += appliedLoss;
    finalHits.push(representative);

    groups.push({
      index: groupIdx,
      rawHits: groupRawDetails,
      representative,
      appliedLossDb: Math.round(appliedLoss * 10) / 10,
      action,
      reason,
    });

    groupIdx++;
    groupStart = groupEnd;
  }

  return { totalLoss, hits: finalHits, groups, rawHitCount: rawHits.length };
}
