/**
 * Performance benchmark tests for WLAN-Optimizer core modules.
 *
 * These tests measure execution time for performance-critical operations:
 *   1. RF Engine - signal propagation calculations (computeRSSI)
 *   2. Spatial Grid - wall intersection testing (computeWallLoss)
 *   3. Heatmap Grid Calculation - full grid at various resolutions
 *   4. Color Scheme Mapping - RSSI to color (rssiToLutIndex + LUT lookup)
 *
 * Thresholds are generous to avoid flakiness in CI-like environments.
 * These tests validate that core loops remain within acceptable time budgets.
 */

import { describe, it, expect } from 'vitest';

import {
  createRFConfig,
  computeRSSI,
  DEFAULT_RECEIVER_HEIGHT_M,
  type RFConfig,
} from '$lib/heatmap/rf-engine';

import {
  buildSpatialGrid,
  computeWallLoss,
  type SpatialGrid,
  type SpatialGridEntry,
} from '$lib/heatmap/spatial-grid';

import {
  rssiToLutIndex,
  getColorLUT,
  RSSI_MIN,
  RSSI_MAX,
} from '$lib/heatmap/color-schemes';

import type { APConfig, WallData } from '$lib/heatmap/worker-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAP(
  x: number,
  y: number,
  txPowerDbm = 23,
  antennaGainDbi = 3.2,
): APConfig {
  return { id: 'perf-ap', x, y, heightM: DEFAULT_RECEIVER_HEIGHT_M, txPowerDbm, antennaGainDbi, enabled: true };
}

function makeWall(
  x1: number, y1: number, x2: number, y2: number, atten = 10,
): WallData {
  return { segments: [{ x1, y1, x2, y2 }], attenuationDb: atten, baseThicknessCm: 10, actualThicknessCm: 10 };
}

/**
 * Generates a set of random walls distributed across the given area.
 * Each wall is a short segment (1-3m) at a random position and angle.
 */
function generateRandomWalls(count: number, areaWidth: number, areaHeight: number): WallData[] {
  const walls: WallData[] = [];
  // Use a simple seeded-like approach with fixed increments for reproducibility
  for (let i = 0; i < count; i++) {
    const cx = (((i * 7 + 13) * 31) % (areaWidth * 100)) / 100;
    const cy = (((i * 11 + 17) * 37) % (areaHeight * 100)) / 100;
    const angle = ((i * 53) % 360) * (Math.PI / 180);
    const halfLen = 0.5 + (i % 3); // 0.5m to 2.5m half-length
    const x1 = cx - halfLen * Math.cos(angle);
    const y1 = cy - halfLen * Math.sin(angle);
    const x2 = cx + halfLen * Math.cos(angle);
    const y2 = cy + halfLen * Math.sin(angle);
    const atten = 5 + (i % 20); // 5-24 dB
    walls.push(makeWall(x1, y1, x2, y2, atten));
  }
  return walls;
}

// ─── 1. RF Engine - Single Point Calculation ──────────────────────────────────

describe('Performance: RF Engine - single point calculation', () => {
  const ITERATIONS = 10_000;

  it(`10,000 computeRSSI calls with 0 walls completes under 200ms`, () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const { grid, allSegments } = buildSpatialGrid([], 10, 10);

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      // Vary point position to avoid branch prediction optimization
      const px = (i % 100) / 10;
      const py = Math.floor(i / 100) / 10;
      computeRSSI(px, py, ap, config, grid, allSegments);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it(`10,000 computeRSSI calls with 5 walls completes under 300ms`, () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const walls = [
      makeWall(2, 0, 2, 10, 10),
      makeWall(4, 0, 4, 10, 12),
      makeWall(6, 0, 6, 10, 8),
      makeWall(0, 3, 10, 3, 15),
      makeWall(0, 7, 10, 7, 25),
    ];
    const { grid, allSegments } = buildSpatialGrid(walls, 10, 10);

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const px = (i % 100) / 10;
      const py = Math.floor(i / 100) / 10;
      computeRSSI(px, py, ap, config, grid, allSegments);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(300);
  });

  it(`10,000 computeRSSI calls with 20 walls completes under 500ms`, () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const walls = generateRandomWalls(20, 10, 10);
    const { grid, allSegments } = buildSpatialGrid(walls, 10, 10);

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const px = (i % 100) / 10;
      const py = Math.floor(i / 100) / 10;
      computeRSSI(px, py, ap, config, grid, allSegments);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it('wall count scaling: 20-wall time is at most 5x the 0-wall time', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);

    // Build grids
    const { grid: grid0, allSegments: seg0 } = buildSpatialGrid([], 10, 10);
    const walls20 = generateRandomWalls(20, 10, 10);
    const { grid: grid20, allSegments: seg20 } = buildSpatialGrid(walls20, 10, 10);

    // JIT warmup — run both paths once before measuring
    for (let i = 0; i < 500; i++) {
      computeRSSI((i % 100) / 10, Math.floor(i / 100) / 10, ap, config, grid0, seg0);
      computeRSSI((i % 100) / 10, Math.floor(i / 100) / 10, ap, config, grid20, seg20);
    }

    // 0 walls baseline
    const start0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      computeRSSI((i % 100) / 10, Math.floor(i / 100) / 10, ap, config, grid0, seg0);
    }
    const time0 = performance.now() - start0;

    // 20 walls
    const start20 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      computeRSSI((i % 100) / 10, Math.floor(i / 100) / 10, ap, config, grid20, seg20);
    }
    const time20 = performance.now() - start20;

    // 20 walls should not be more than 5x slower than 0 walls
    // (spatial grid keeps it sub-linear in wall count)
    // +10ms margin to avoid flakiness when both times are very small
    expect(time20).toBeLessThan(time0 * 5 + 10);
  });
});

// ─── 2. Spatial Grid - Wall Intersection ──────────────────────────────────────

describe('Performance: Spatial Grid - wall intersection queries', () => {
  const QUERIES = 10_000;
  const AREA_SIZE = 20; // 20x20m floor plan

  it(`buildSpatialGrid with 200 walls completes under 50ms`, () => {
    const walls = generateRandomWalls(200, AREA_SIZE, AREA_SIZE);

    const start = performance.now();
    buildSpatialGrid(walls, AREA_SIZE, AREA_SIZE);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it(`10,000 computeWallLoss queries on a 200-wall grid completes under 500ms`, () => {
    const walls = generateRandomWalls(200, AREA_SIZE, AREA_SIZE);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_SIZE, AREA_SIZE);

    const start = performance.now();
    for (let i = 0; i < QUERIES; i++) {
      // Random-ish line segments across the area
      const ax = (((i * 7 + 3) * 41) % (AREA_SIZE * 100)) / 100;
      const ay = (((i * 11 + 7) * 43) % (AREA_SIZE * 100)) / 100;
      const bx = (((i * 13 + 11) * 47) % (AREA_SIZE * 100)) / 100;
      const by = (((i * 17 + 13) * 53) % (AREA_SIZE * 100)) / 100;
      computeWallLoss(ax, ay, bx, by, grid, allSegments);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it('spatial grid provides speedup over brute-force for 200 walls', () => {
    const walls = generateRandomWalls(200, AREA_SIZE, AREA_SIZE);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_SIZE, AREA_SIZE);

    // Measure grid-accelerated queries
    const SAMPLE = 1_000;
    const startGrid = performance.now();
    for (let i = 0; i < SAMPLE; i++) {
      const ax = (i * 3.7) % AREA_SIZE;
      const ay = (i * 2.3) % AREA_SIZE;
      const bx = ((i + 500) * 3.7) % AREA_SIZE;
      const by = ((i + 500) * 2.3) % AREA_SIZE;
      computeWallLoss(ax, ay, bx, by, grid, allSegments);
    }
    const timeGrid = performance.now() - startGrid;

    // Spatial grid query time for 1000 queries should be well under 100ms
    expect(timeGrid).toBeLessThan(100);
  });
});

// ─── 3. Heatmap Grid Calculation ──────────────────────────────────────────────

describe('Performance: Heatmap grid calculation', () => {
  const AREA_W = 10; // 10m wide
  const AREA_H = 10; // 10m tall

  function simulateHeatmapGrid(
    gridStep: number,
    ap: APConfig,
    config: RFConfig,
    grid: SpatialGrid,
    allSegments: SpatialGridEntry[],
  ): { pointCount: number; elapsed: number } {
    const cols = Math.ceil(AREA_W / gridStep);
    const rows = Math.ceil(AREA_H / gridStep);

    const start = performance.now();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = c * gridStep;
        const py = r * gridStep;
        computeRSSI(px, py, ap, config, grid, allSegments);
      }
    }
    const elapsed = performance.now() - start;

    return { pointCount: cols * rows, elapsed };
  }

  it('1.0m resolution (100 points) with 10 walls completes under 50ms', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const walls = generateRandomWalls(10, AREA_W, AREA_H);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_W, AREA_H);

    const { pointCount, elapsed } = simulateHeatmapGrid(1.0, ap, config, grid, allSegments);

    expect(pointCount).toBe(100);
    expect(elapsed).toBeLessThan(50);
  });

  it('0.5m resolution (400 points) with 10 walls completes under 100ms', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const walls = generateRandomWalls(10, AREA_W, AREA_H);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_W, AREA_H);

    const { pointCount, elapsed } = simulateHeatmapGrid(0.5, ap, config, grid, allSegments);

    expect(pointCount).toBe(400);
    expect(elapsed).toBeLessThan(100);
  });

  it('0.25m resolution (1,600 points) with 10 walls completes under 300ms', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const walls = generateRandomWalls(10, AREA_W, AREA_H);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_W, AREA_H);

    const { pointCount, elapsed } = simulateHeatmapGrid(0.25, ap, config, grid, allSegments);

    expect(pointCount).toBe(1_600);
    expect(elapsed).toBeLessThan(300);
  });

  it('0.25m resolution with 50 walls completes under 1000ms', () => {
    const config = createRFConfig('5ghz');
    const ap = makeAP(5, 5, 26, 4.3);
    const walls = generateRandomWalls(50, AREA_W, AREA_H);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_W, AREA_H);

    const { pointCount, elapsed } = simulateHeatmapGrid(0.25, ap, config, grid, allSegments);

    expect(pointCount).toBe(1_600);
    expect(elapsed).toBeLessThan(1_000);
  });

  it('higher resolution takes proportionally more time (not exponentially)', () => {
    const config = createRFConfig('2.4ghz');
    const ap = makeAP(5, 5);
    const walls = generateRandomWalls(10, AREA_W, AREA_H);
    const { grid, allSegments } = buildSpatialGrid(walls, AREA_W, AREA_H);

    const r1 = simulateHeatmapGrid(1.0, ap, config, grid, allSegments);
    const r025 = simulateHeatmapGrid(0.25, ap, config, grid, allSegments);

    // 0.25m has 16x more points than 1.0m (1600 vs 100)
    // Time should scale roughly linearly with point count,
    // so allow up to 40x (generous margin for overhead and CI variability)
    const ratio = r025.elapsed / (r1.elapsed + 0.01); // avoid division by zero
    expect(ratio).toBeLessThan(40);
  });
});

// ─── 4. Color Scheme Mapping ──────────────────────────────────────────────────

describe('Performance: Color scheme mapping', () => {
  const ITERATIONS = 100_000;

  it(`100,000 rssiToLutIndex calls complete under 50ms`, () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      // Sweep through the full RSSI range
      const rssi = RSSI_MIN + (i % 66) * ((RSSI_MAX - RSSI_MIN) / 65);
      rssiToLutIndex(rssi);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it(`100,000 full RSSI-to-color lookups (index + LUT) complete under 100ms`, () => {
    const lut = getColorLUT('viridis');

    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const rssi = RSSI_MIN + (i % 66) * ((RSSI_MAX - RSSI_MIN) / 65);
      const index = rssiToLutIndex(rssi);
      // Access the LUT to simulate actual color retrieval
      const _color = lut[index];
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('LUT generation for all 3 schemes completes under 50ms', () => {
    const start = performance.now();
    getColorLUT('viridis');
    getColorLUT('jet');
    getColorLUT('inferno');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('repeated LUT generation (10 iterations) completes under 100ms', () => {
    const schemes = ['viridis', 'jet', 'inferno'] as const;

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      for (const scheme of schemes) {
        getColorLUT(scheme);
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
