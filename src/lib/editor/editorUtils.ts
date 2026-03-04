/**
 * Shared editor utility functions.
 *
 * Extracted from StepCalibration, StepWalls, StepAccessPoints, and the Editor page
 * to eliminate code duplication.
 */

/** Compute bounding box dimensions of a rotated rectangle. */
export function getRotatedBoundingBox(
  w: number,
  h: number,
  angleDeg: number,
): { w: number; h: number } {
  const rad = (((angleDeg % 360) + 360) % 360) * (Math.PI / 180);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { w: w * cos + h * sin, h: w * sin + h * cos };
}

/** Project a point (px, py) onto a line segment (x1,y1)-(x2,y2). */
export function projectPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { t: number; dist: number; projX: number; projY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return {
      t: 0,
      dist: Math.sqrt((px - x1) ** 2 + (py - y1) ** 2),
      projX: x1,
      projY: y1,
    };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  return { t, dist, projX, projY };
}

/** Wall segment shape from the data model. */
interface WallSegment {
  segment_order: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Minimal wall shape for findNearestWallSegment. */
interface WallLike {
  id: string;
  material_id: string;
  segments: WallSegment[];
}

/** Find the nearest wall segment to a point (in meters). Returns null if none within maxDistM. */
export function findNearestWallSegment<W extends WallLike>(
  walls: W[],
  clickXM: number,
  clickYM: number,
  maxDistM: number,
): {
  wall: W;
  segIdx: number;
  t: number;
  projX: number;
  projY: number;
} | null {
  const doorWindowMats = [
    'mat-wood-door',
    'mat-metal-door',
    'mat-glass-door',
    'mat-window',
  ];

  let bestWall: W | null = null;
  let bestSegIdx = -1;
  let bestT = 0;
  let bestProjX = 0;
  let bestProjY = 0;
  let bestDist = Infinity;

  for (const wall of walls) {
    if (doorWindowMats.includes(wall.material_id)) continue;
    const sorted = wall.segments
      .slice()
      .sort((a, b) => a.segment_order - b.segment_order);
    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i]!;
      const proj = projectPointOnSegment(
        clickXM,
        clickYM,
        seg.x1,
        seg.y1,
        seg.x2,
        seg.y2,
      );
      if (proj.dist < bestDist && proj.dist < maxDistM) {
        bestDist = proj.dist;
        bestWall = wall;
        bestSegIdx = i;
        bestT = proj.t;
        bestProjX = proj.projX;
        bestProjY = proj.projY;
      }
    }
  }

  if (!bestWall) return null;
  return {
    wall: bestWall,
    segIdx: bestSegIdx,
    t: bestT,
    projX: bestProjX,
    projY: bestProjY,
  };
}
