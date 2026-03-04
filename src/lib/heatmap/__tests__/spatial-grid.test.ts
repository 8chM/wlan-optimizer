/**
 * Unit tests for spatial-grid.ts (T-8c-10)
 *
 * Tests cover:
 * - segmentsIntersect: perpendicular, parallel, T-junction, collinear, various angles
 * - buildSpatialGrid: single wall, multi-cell wall, empty walls
 * - computeWallLoss: 0 walls, 1 wall, multiple walls, parallel ray, endpoint on wall
 * - Grid cell boundaries: wall on boundary, very small walls, diagonal walls
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '../worker-types';
import {
  segmentsIntersect,
  buildSpatialGrid,
  computeWallLoss,
  type SpatialGrid,
  type SpatialGridEntry,
} from '../spatial-grid';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeWall(x1: number, y1: number, x2: number, y2: number, atten = 10): WallData {
  return { segments: [{ x1, y1, x2, y2 }], attenuationDb: atten, baseThicknessCm: 10, actualThicknessCm: 10 };
}

function buildGrid(
  walls: WallData[],
  w = 20,
  h = 20,
): { grid: SpatialGrid; allSegments: SpatialGridEntry[] } {
  return buildSpatialGrid(walls, w, h);
}

// ─── segmentsIntersect ────────────────────────────────────────────────────────

describe('segmentsIntersect', () => {
  describe('crossing segments', () => {
    it('perpendicular crossing at origin returns true', () => {
      // Horizontal segment (-1,0)→(1,0) crossed by vertical (0,-1)→(0,1)
      expect(segmentsIntersect(-1, 0, 1, 0, 0, -1, 0, 1)).toBe(true);
    });

    it('diagonal crossing returns true', () => {
      // (0,0)→(4,4) crossed by (0,4)→(4,0) — they meet at (2,2)
      expect(segmentsIntersect(0, 0, 4, 4, 0, 4, 4, 0)).toBe(true);
    });

    it('T-junction: endpoint on interior of other segment returns true', () => {
      // Vertical segment (2,0)→(2,4) touches horizontal (0,2)→(4,2) at (2,2)
      expect(segmentsIntersect(2, 0, 2, 4, 0, 2, 4, 2)).toBe(true);
    });

    it('shared endpoint (corner) returns true', () => {
      // (0,0)→(1,0) and (1,0)→(1,1) share endpoint at (1,0)
      expect(segmentsIntersect(0, 0, 1, 0, 1, 0, 1, 1)).toBe(true);
    });
  });

  describe('non-crossing segments', () => {
    it('parallel horizontal segments (offset vertically) return false', () => {
      // Two horizontal parallel lines: y=0 and y=2
      expect(segmentsIntersect(0, 0, 4, 0, 0, 2, 4, 2)).toBe(false);
    });

    it('parallel vertical segments (offset horizontally) return false', () => {
      expect(segmentsIntersect(0, 0, 0, 4, 2, 0, 2, 4)).toBe(false);
    });

    it('collinear segments on same line return false', () => {
      // Both on y=0, non-overlapping
      expect(segmentsIntersect(0, 0, 1, 0, 2, 0, 3, 0)).toBe(false);
    });

    it('collinear overlapping segments return false (parallel denom=0 branch)', () => {
      // Both on y=0, overlapping range
      expect(segmentsIntersect(0, 0, 3, 0, 1, 0, 4, 0)).toBe(false);
    });

    it('near-miss perpendicular segments (extensions cross but segments do not) return false', () => {
      // Horizontal (0,0)→(1,0), vertical (2,−1)→(2,1): extensions intersect at (2,0)
      // but segment A ends at x=1
      expect(segmentsIntersect(0, 0, 1, 0, 2, -1, 2, 1)).toBe(false);
    });

    it('segments in different quadrants with no crossing return false', () => {
      expect(segmentsIntersect(0, 0, 1, 0, 5, 5, 6, 5)).toBe(false);
    });

    it('diagonal segments that cross only when extended return false', () => {
      // (0,0)→(1,1) and (2,0)→(3,1): parallel diagonals, no intersection
      expect(segmentsIntersect(0, 0, 1, 1, 2, 0, 3, 1)).toBe(false);
    });
  });

  describe('edge values', () => {
    it('very short segment (near-zero length) vs crossing segment returns true', () => {
      // Very short horizontal near origin
      expect(segmentsIntersect(0, 0, 0.001, 0, 0, -1, 0, 1)).toBe(true);
    });

    it('zero-length degenerate segment returns false (denom check)', () => {
      // Both endpoints at same point — denom will be 0 unless other segment is not parallel
      // (0,0)→(0,0) is a point; treated as zero-length degenerate → false
      expect(segmentsIntersect(0, 0, 0, 0, -1, 0, 1, 0)).toBe(false);
    });
  });
});

// ─── buildSpatialGrid ─────────────────────────────────────────────────────────

describe('buildSpatialGrid', () => {
  describe('empty input', () => {
    it('empty walls array produces empty grid with no cells', () => {
      const { grid, allSegments } = buildGrid([]);
      expect(allSegments).toHaveLength(0);
      expect(grid.cells.size).toBe(0);
    });

    it('grid dimensions are computed from bounds', () => {
      const { grid } = buildGrid([], 10, 8);
      // gridCols = ceil(10/1) + 1 = 11, gridRows = ceil(8/1) + 1 = 9
      expect(grid.gridCols).toBe(11);
      expect(grid.gridRows).toBe(9);
    });
  });

  describe('single wall', () => {
    it('horizontal wall in cell (0,0) is registered in that cell', () => {
      // Wall from (0.1,0.1) to (0.8,0.1) stays entirely in cell (col=0, row=0)
      const { grid, allSegments } = buildGrid([makeWall(0.1, 0.1, 0.8, 0.1)]);
      expect(allSegments).toHaveLength(1);

      const key = 0 * grid.gridCols + 0; // row=0, col=0
      const cellContents = grid.cells.get(key);
      expect(cellContents).toBeDefined();
      expect(cellContents).toContain(0);
    });

    it('wall with multiple segments creates one entry per segment', () => {
      const wall: WallData = {
        segments: [
          { x1: 0, y1: 0, x2: 1, y2: 0 },
          { x1: 1, y1: 0, x2: 1, y2: 1 },
        ],
        attenuationDb: 12,
        baseThicknessCm: 10,
        actualThicknessCm: 10,
      };
      const { allSegments } = buildGrid([wall]);
      expect(allSegments).toHaveLength(2);
    });

    it('attenuation is preserved in allSegments', () => {
      const { allSegments } = buildGrid([makeWall(0, 0, 1, 0, 25)]);
      expect(allSegments[0]?.attenuation).toBe(25);
    });
  });

  describe('wall spanning multiple cells', () => {
    it('horizontal wall across 3 cells is registered in all 3', () => {
      // Wall from (0.5,0.5) to (2.5,0.5) spans cells col=0,1,2 in row=0
      const { grid, allSegments } = buildGrid([makeWall(0.5, 0.5, 2.5, 0.5)]);
      expect(allSegments).toHaveLength(1);

      const inCell = (col: number, row: number) => {
        const key = row * grid.gridCols + col;
        return grid.cells.get(key)?.includes(0) ?? false;
      };

      expect(inCell(0, 0)).toBe(true);
      expect(inCell(1, 0)).toBe(true);
      expect(inCell(2, 0)).toBe(true);
    });

    it('diagonal wall spanning 4 cells is registered in all covered cells', () => {
      // Wall from (0.1,0.1) to (3.9,3.9) spans multiple rows and columns
      const { grid, allSegments } = buildGrid([makeWall(0.1, 0.1, 3.9, 3.9)]);
      expect(allSegments).toHaveLength(1);

      // At minimum, cells (0,0) and (3,3) must be registered
      const key00 = 0 * grid.gridCols + 0;
      const key33 = 3 * grid.gridCols + 3;
      expect(grid.cells.get(key00)).toContain(0);
      expect(grid.cells.get(key33)).toContain(0);
    });
  });

  describe('multiple walls', () => {
    it('two separate walls produce two entries in allSegments', () => {
      const walls = [
        makeWall(0, 0, 1, 0, 10),
        makeWall(5, 5, 6, 5, 15),
      ];
      const { allSegments } = buildGrid(walls);
      expect(allSegments).toHaveLength(2);
      expect(allSegments[0]?.attenuation).toBe(10);
      expect(allSegments[1]?.attenuation).toBe(15);
    });
  });
});

// ─── computeWallLoss ──────────────────────────────────────────────────────────

describe('computeWallLoss', () => {
  describe('no walls', () => {
    it('ray through empty grid returns 0 dB', () => {
      const { grid, allSegments } = buildGrid([]);
      const loss = computeWallLoss(0, 0, 10, 0, grid, allSegments);
      expect(loss).toBe(0);
    });
  });

  describe('single wall', () => {
    it('ray crossing one wall returns that wall attenuation', () => {
      // Vertical wall at x=5 from y=0 to y=4, attenuation=10 dB
      // Ray from (0,2) to (10,2) crosses the wall
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 4, 10)]);
      const loss = computeWallLoss(0, 2, 10, 2, grid, allSegments);
      expect(loss).toBe(10);
    });

    it('ray not crossing the wall returns 0 dB', () => {
      // Vertical wall at x=5 from y=0 to y=2
      // Ray from (0,5) to (10,5) is above the wall
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 2, 10)]);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(0);
    });

    it('ray parallel to wall returns 0 dB', () => {
      // Wall horizontal at y=2 from x=0 to x=10
      // Ray horizontal at y=2 from x=0 to x=5 (parallel, collinear treated as no intersection)
      const { grid, allSegments } = buildGrid([makeWall(0, 2, 10, 2, 10)]);
      const loss = computeWallLoss(0, 2, 5, 2, grid, allSegments);
      expect(loss).toBe(0);
    });

    it('ray parallel but offset from wall returns 0 dB', () => {
      // Wall horizontal at y=5, ray horizontal at y=3
      const { grid, allSegments } = buildGrid([makeWall(0, 5, 10, 5, 10)]);
      const loss = computeWallLoss(0, 3, 10, 3, grid, allSegments);
      expect(loss).toBe(0);
    });
  });

  describe('multiple walls', () => {
    it('ray crossing two walls returns cumulative attenuation', () => {
      // Two vertical walls: at x=3 (atten=10) and x=7 (atten=15)
      // Ray from (0,5) to (10,5)
      const walls = [
        makeWall(3, 0, 3, 10, 10),
        makeWall(7, 0, 7, 10, 15),
      ];
      const { grid, allSegments } = buildGrid(walls);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(25);
    });

    it('ray crossing three walls with different attenuations returns correct sum', () => {
      // Three horizontal walls at y=2 (5 dB), y=5 (12 dB), y=8 (25 dB)
      // Ray from (5,0) to (5,10) — vertical ray crosses all three
      const walls = [
        makeWall(0, 2, 10, 2, 5),
        makeWall(0, 5, 10, 5, 12),
        makeWall(0, 8, 10, 8, 25),
      ];
      const { grid, allSegments } = buildGrid(walls);
      const loss = computeWallLoss(5, 0, 5, 10, grid, allSegments);
      expect(loss).toBe(42);
    });

    it('ray crossing only one of two walls returns only that wall attenuation', () => {
      // Wall A: vertical at x=3, y=0..10 (atten=10) — ray crosses this
      // Wall B: vertical at x=7, y=6..10 (atten=15) — ray at y=2 does not cross B
      const walls = [
        makeWall(3, 0, 3, 10, 10),
        makeWall(7, 6, 7, 10, 15),
      ];
      const { grid, allSegments } = buildGrid(walls);
      const loss = computeWallLoss(0, 2, 10, 2, grid, allSegments);
      expect(loss).toBe(10);
    });
  });

  describe('diagonal rays', () => {
    it('diagonal ray crossing perpendicular wall correctly detects intersection', () => {
      // Diagonal ray from (0,0) to (10,10)
      // Vertical wall at x=5 from y=0 to y=10 (atten=8)
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 10, 8)]);
      const loss = computeWallLoss(0, 0, 10, 10, grid, allSegments);
      expect(loss).toBe(8);
    });
  });

  describe('edge cases', () => {
    it('ray endpoint exactly on wall boundary is handled without crash', () => {
      // Wall at x=5 from y=0 to y=10
      // Ray from (5,2) to (10,2) — starts exactly on wall
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 10, 10)]);
      // This should not throw
      expect(() => computeWallLoss(5, 2, 10, 2, grid, allSegments)).not.toThrow();
    });

    it('ray with start equal to end (zero-length ray) returns 0 or does not crash', () => {
      const { grid, allSegments } = buildGrid([makeWall(5, 0, 5, 10, 10)]);
      expect(() => computeWallLoss(3, 3, 3, 3, grid, allSegments)).not.toThrow();
    });

    it('wall segment much shorter than grid cell is still detected', () => {
      // Very small wall: 0.05m long, placed so a ray must cross it
      // Wall at (5.0, 4.975) to (5.0, 5.025) — tiny vertical wall at x=5
      // Ray from (0,5) to (10,5) must cross this tiny wall
      const { grid, allSegments } = buildGrid([makeWall(5.0, 4.975, 5.0, 5.025, 10)]);
      const loss = computeWallLoss(0, 5, 10, 5, grid, allSegments);
      expect(loss).toBe(10);
    });
  });
});

// ─── Grid Cell Boundaries ─────────────────────────────────────────────────────

describe('grid cell boundaries', () => {
  it('wall exactly on cell boundary (integer coordinates) is registered in correct cells', () => {
    // Wall from (3,0) to (3,4): sits on the boundary between col=2 and col=3
    // The grid uses floor(x / cellSize) so x=3.0 → col=3
    const { grid, allSegments } = buildGrid([makeWall(3, 0, 3, 4, 10)]);
    expect(allSegments).toHaveLength(1);

    // The wall must appear in at least col=3 in rows 0..4
    let foundInCol3 = false;
    for (let row = 0; row <= 4; row++) {
      const key = row * grid.gridCols + 3;
      if (grid.cells.get(key)?.includes(0)) {
        foundInCol3 = true;
        break;
      }
    }
    expect(foundInCol3).toBe(true);
  });

  it('wall registered in correct cells does not appear in far-away cells', () => {
    // Wall entirely in the first cell (0,0)→(0.8,0.8)
    const { grid, allSegments } = buildGrid([makeWall(0.1, 0.1, 0.8, 0.8, 10)]);
    expect(allSegments).toHaveLength(1);

    // Cell (col=5, row=5) should not contain this wall
    const key = 5 * grid.gridCols + 5;
    const contents = grid.cells.get(key);
    expect(contents).toBeUndefined();
  });

  it('multiple walls in adjacent cells are each registered independently', () => {
    const walls = [
      makeWall(0.5, 0.5, 0.5, 0.9, 5),  // in cell (0,0)
      makeWall(1.5, 0.5, 1.5, 0.9, 12), // in cell (1,0)
    ];
    const { grid, allSegments } = buildGrid(walls);
    expect(allSegments).toHaveLength(2);

    // Segment 0 should be in col=0 row=0
    const key00 = 0 * grid.gridCols + 0;
    expect(grid.cells.get(key00)).toContain(0);

    // Segment 1 should be in col=1 row=0
    const key01 = 0 * grid.gridCols + 1;
    expect(grid.cells.get(key01)).toContain(1);
  });
});
