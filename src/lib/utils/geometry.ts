/**
 * Geometry utility functions for coordinate conversion and snapping.
 */

import type { Position } from '$lib/models/types';

/**
 * Snaps a point to the nearest existing point within a threshold distance.
 *
 * @param point - The point to snap
 * @param existingPoints - Array of candidate snap targets
 * @param threshold - Maximum snap distance in pixels (screen coordinates)
 * @returns The snapped point, or the original point if no snap target is close enough
 */
export function snapToPoint(
  point: Position,
  existingPoints: Position[],
  threshold: number,
): { snapped: Position; didSnap: boolean; snapTargetIndex: number } {
  let closestDist = Infinity;
  let closestIndex = -1;

  for (let i = 0; i < existingPoints.length; i++) {
    const ep = existingPoints[i]!;
    const dx = point.x - ep.x;
    const dy = point.y - ep.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < closestDist && dist <= threshold) {
      closestDist = dist;
      closestIndex = i;
    }
  }

  if (closestIndex >= 0) {
    const target = existingPoints[closestIndex]!;
    return {
      snapped: { x: target.x, y: target.y },
      didSnap: true,
      snapTargetIndex: closestIndex,
    };
  }

  return {
    snapped: { x: point.x, y: point.y },
    didSnap: false,
    snapTargetIndex: -1,
  };
}

/**
 * Converts screen coordinates to meters using scale and offset.
 *
 * @param screenPoint - Point in screen/stage coordinates (pixels)
 * @param scalePxPerMeter - The floor plan scale (px per meter)
 * @param stageScale - The current stage zoom scale
 * @param stageOffset - The current stage pan offset
 * @returns Position in meters relative to floor origin
 */
export function screenToMeters(
  screenPoint: Position,
  scalePxPerMeter: number,
  stageScale: number = 1,
  stageOffset: Position = { x: 0, y: 0 },
): Position {
  if (scalePxPerMeter <= 0) return { x: 0, y: 0 };

  // Convert screen coords to canvas coords (undo zoom/pan)
  const canvasX = (screenPoint.x - stageOffset.x) / stageScale;
  const canvasY = (screenPoint.y - stageOffset.y) / stageScale;

  // Convert canvas pixels to meters
  return {
    x: canvasX / scalePxPerMeter,
    y: canvasY / scalePxPerMeter,
  };
}

/**
 * Converts meter coordinates to screen coordinates.
 *
 * @param metersPoint - Position in meters
 * @param scalePxPerMeter - The floor plan scale (px per meter)
 * @param stageScale - Current stage zoom scale
 * @param stageOffset - Current stage pan offset
 * @returns Position in screen coordinates
 */
export function metersToScreen(
  metersPoint: Position,
  scalePxPerMeter: number,
  stageScale: number = 1,
  stageOffset: Position = { x: 0, y: 0 },
): Position {
  // Convert meters to canvas pixels
  const canvasX = metersPoint.x * scalePxPerMeter;
  const canvasY = metersPoint.y * scalePxPerMeter;

  // Apply zoom/pan to get screen coords
  return {
    x: canvasX * stageScale + stageOffset.x,
    y: canvasY * stageScale + stageOffset.y,
  };
}

/**
 * Converts screen coordinates to canvas (stage) coordinates.
 * This undoes the stage zoom/pan transform.
 */
export function screenToCanvas(
  screenPoint: Position,
  stageScale: number,
  stageOffset: Position,
): Position {
  return {
    x: (screenPoint.x - stageOffset.x) / stageScale,
    y: (screenPoint.y - stageOffset.y) / stageScale,
  };
}

/**
 * Calculates the distance between two points in pixels.
 */
export function distancePx(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the midpoint between two positions.
 */
export function midpoint(a: Position, b: Position): Position {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/**
 * Checks if a point is within a given distance of a line segment.
 * Used for hit-testing on wall segments.
 */
export function pointToSegmentDistance(
  point: Position,
  segStart: Position,
  segEnd: Position,
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return distancePx(point, segStart);
  }

  // Project point onto segment, clamping to [0, 1]
  let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projection: Position = {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  };

  return distancePx(point, projection);
}

/**
 * Extracts all unique endpoints from wall segment data.
 * Useful for snap targets.
 */
export function extractWallEndpoints(
  walls: Array<{ segments: Array<{ x1: number; y1: number; x2: number; y2: number }> }>,
  scalePxPerMeter: number,
): Position[] {
  const pointMap = new Map<string, Position>();

  for (const wall of walls) {
    for (const seg of wall.segments) {
      const p1Key = `${seg.x1},${seg.y1}`;
      const p2Key = `${seg.x2},${seg.y2}`;

      if (!pointMap.has(p1Key)) {
        pointMap.set(p1Key, { x: seg.x1 * scalePxPerMeter, y: seg.y1 * scalePxPerMeter });
      }
      if (!pointMap.has(p2Key)) {
        pointMap.set(p2Key, { x: seg.x2 * scalePxPerMeter, y: seg.y2 * scalePxPerMeter });
      }
    }
  }

  return Array.from(pointMap.values());
}
