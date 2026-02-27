/**
 * Unit tests for placement-hints.ts (Phase 14a)
 */

import { describe, it, expect } from 'vitest';
import { findPlacementHints, type PlacementHintOptions } from '../placement-hints';

// Helper: create a 2D RSSI grid
function makeGrid(rows: number, cols: number, defaultRssi: number = -50): number[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(defaultRssi));
}

// Helper: set a rectangular region to a specific RSSI value
function fillRegion(
  grid: number[][],
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  rssi: number,
): void {
  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      if (grid[r]) grid[r]![c] = rssi;
    }
  }
}

describe('findPlacementHints', () => {
  it('returns no hints for good coverage everywhere', () => {
    const grid = makeGrid(20, 20, -50); // All excellent
    const hints = findPlacementHints(grid, 20, 20, 1.0);

    expect(hints).toHaveLength(0);
  });

  it('returns no hints for small weak areas below minArea', () => {
    const grid = makeGrid(20, 20, -50);
    // Create a tiny weak spot (only 4 cells)
    fillRegion(grid, 5, 5, 7, 7, -90);

    const hints = findPlacementHints(grid, 20, 20, 1.0, { minAreaCells: 10 });
    expect(hints).toHaveLength(0);
  });

  it('detects a single large weak zone', () => {
    const grid = makeGrid(20, 20, -50);
    // Create a 5x5 weak zone (25 cells)
    fillRegion(grid, 8, 8, 13, 13, -85);

    const hints = findPlacementHints(grid, 20, 20, 1.0);

    expect(hints).toHaveLength(1);
    expect(hints[0]!.areaCells).toBe(25);
    // Centroid should be roughly at (10, 10) in grid coords = (10m, 10m) with 1.0 resolution
    expect(hints[0]!.xM).toBeCloseTo(10, 0);
    expect(hints[0]!.yM).toBeCloseTo(10, 0);
    expect(hints[0]!.avgRssi).toBe(-85);
  });

  it('detects multiple weak zones', () => {
    const grid = makeGrid(30, 30, -50);
    // Zone 1: top-left (4x4 = 16 cells)
    fillRegion(grid, 0, 0, 4, 4, -90);
    // Zone 2: bottom-right (5x5 = 25 cells)
    fillRegion(grid, 25, 25, 30, 30, -85);

    const hints = findPlacementHints(grid, 30, 30, 1.0);

    expect(hints).toHaveLength(2);
    // Largest zone first
    expect(hints[0]!.areaCells).toBe(25);
    expect(hints[1]!.areaCells).toBe(16);
  });

  it('respects maxHints option', () => {
    const grid = makeGrid(30, 30, -90); // Everything is weak
    // Create 3 disconnected zones
    const good = -50;
    fillRegion(grid, 0, 10, 30, 12, good); // Vertical barrier splitting zones

    const hints = findPlacementHints(grid, 30, 30, 1.0, { maxHints: 1 });
    expect(hints.length).toBeLessThanOrEqual(1);
  });

  it('respects custom weakThreshold', () => {
    const grid = makeGrid(20, 20, -75);
    // With default threshold (-80), this is not weak
    const hintsDefault = findPlacementHints(grid, 20, 20, 1.0);
    expect(hintsDefault).toHaveLength(0);

    // With higher threshold (-70), this IS weak
    const hintsCustom = findPlacementHints(grid, 20, 20, 1.0, { weakThreshold: -70 });
    expect(hintsCustom.length).toBeGreaterThan(0);
  });

  it('scales coordinates by gridResolutionM', () => {
    const grid = makeGrid(10, 10, -85); // All weak
    const hints = findPlacementHints(grid, 10, 10, 2.0); // 2m per cell

    expect(hints).toHaveLength(1);
    // Centroid at grid (4.5, 4.5) * 2.0m = (9.0, 9.0)
    expect(hints[0]!.xM).toBeCloseTo(9, 0);
    expect(hints[0]!.yM).toBeCloseTo(9, 0);
  });

  it('works with Float32Array input', () => {
    const width = 10;
    const height = 10;
    const flat = new Float32Array(width * height);
    flat.fill(-50);
    // Create a weak zone
    for (let r = 3; r < 7; r++) {
      for (let c = 3; c < 7; c++) {
        flat[r * width + c] = -90;
      }
    }

    const hints = findPlacementHints(flat, width, height, 1.0);

    expect(hints).toHaveLength(1);
    expect(hints[0]!.areaCells).toBe(16);
  });

  it('includes a descriptive reason string', () => {
    const grid = makeGrid(20, 20, -50);
    fillRegion(grid, 5, 5, 10, 10, -85);

    const hints = findPlacementHints(grid, 20, 20, 1.0);

    expect(hints[0]!.reason).toContain('-85');
    expect(hints[0]!.reason).toContain('25');
  });

  it('handles empty grid', () => {
    const grid: number[][] = [];
    const hints = findPlacementHints(grid, 0, 0, 1.0);
    expect(hints).toHaveLength(0);
  });

  it('handles single-cell grid that is weak', () => {
    const grid = [[-90]];
    const hints = findPlacementHints(grid, 1, 1, 1.0, { minAreaCells: 1 });
    expect(hints).toHaveLength(1);
    expect(hints[0]!.areaCells).toBe(1);
  });
});
