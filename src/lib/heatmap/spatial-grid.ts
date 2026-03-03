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

// ─── Types ─────────────────────────────────────────────────────────

/** A wall segment with its attenuation value, stored in the spatial grid */
export interface SpatialGridEntry {
  seg: LineSegment;
  attenuation: number;
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
      allSegments.push({ seg, attenuation: wall.attenuationDb });
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
  let totalLoss = 0;

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

        const { seg, attenuation } = entry;
        if (segmentsIntersect(
          ax, ay, bx, by,
          seg.x1, seg.y1, seg.x2, seg.y2,
        )) {
          totalLoss += attenuation;
        }
      }
    }
  }

  return totalLoss;
}
