/**
 * Benchmark for heatmap Web Worker calculation performance.
 *
 * Test scenario:
 *   - 3 APs placed across a ~100 m^2 floor plan (10m x 10m)
 *   - 50 walls with various attenuation values
 *   - 0.25m grid resolution (fine quality)
 *   - Target: calculation < 500ms
 *
 * Uses vitest bench mode.
 * Run: npx vitest bench src/lib/heatmap/heatmap-worker.bench.ts
 */
import { describe, bench, expect } from 'vitest';
import type {
  APConfig,
  WallData,
  LineSegment,
} from './worker-types';
import type { FrequencyBand, ColorScheme } from './color-schemes';
import { getColorLUT, rssiToLutIndex, RSSI_MIN } from './color-schemes';

// ─── Re-implement core calculation logic for benchmarking ────────
// (Worker code cannot be directly imported without a Worker context,
//  so we inline the calculation logic here for benchmarking.)

const REFERENCE_LOSS: Record<FrequencyBand, number> = {
  '2.4ghz': 40.05,
  '5ghz': 46.42,
  '6ghz': 47.96,
};

const DEFAULT_N = 3.5;
const DEFAULT_RECEIVER_GAIN = -3;
const MIN_DISTANCE = 0.1;
const SPATIAL_GRID_CELL = 1.0;

interface SpatialGridEntry {
  seg: LineSegment;
  attenuation: number;
}

interface SpatialGrid {
  cells: Map<number, number[]>;
  gridCols: number;
}

function buildSpatialGrid(
  walls: WallData[],
  boundsW: number,
  boundsH: number,
): { grid: SpatialGrid; allSegments: SpatialGridEntry[] } {
  const gridCols = Math.ceil(boundsW / SPATIAL_GRID_CELL) + 1;
  const gridRows = Math.ceil(boundsH / SPATIAL_GRID_CELL) + 1;
  const cells = new Map<number, number[]>();
  const allSegments: SpatialGridEntry[] = [];

  for (const wall of walls) {
    for (const seg of wall.segments) {
      allSegments.push({ seg, attenuation: wall.attenuationDb });
    }
  }

  for (let idx = 0; idx < allSegments.length; idx++) {
    const entry = allSegments[idx];
    if (!entry) continue;
    const { seg } = entry;
    const minX = Math.max(0, Math.floor(Math.min(seg.x1, seg.x2) / SPATIAL_GRID_CELL));
    const maxX = Math.min(gridCols - 1, Math.floor(Math.max(seg.x1, seg.x2) / SPATIAL_GRID_CELL));
    const minY = Math.max(0, Math.floor(Math.min(seg.y1, seg.y2) / SPATIAL_GRID_CELL));
    const maxY = Math.min(gridRows - 1, Math.floor(Math.max(seg.y1, seg.y2) / SPATIAL_GRID_CELL));

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

  return { grid: { cells, gridCols }, allSegments };
}

function segmentsIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): boolean {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = p4x - p3x;
  const d2y = p4y - p3y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom;
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function wallLoss(
  ax: number, ay: number, bx: number, by: number,
  grid: SpatialGrid, segments: SpatialGridEntry[],
): number {
  const { cells, gridCols } = grid;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) / SPATIAL_GRID_CELL));
  const maxX = Math.floor(Math.max(ax, bx) / SPATIAL_GRID_CELL);
  const minY = Math.max(0, Math.floor(Math.min(ay, by) / SPATIAL_GRID_CELL));
  const maxY = Math.floor(Math.max(ay, by) / SPATIAL_GRID_CELL);

  const tested = new Set<number>();
  let loss = 0;

  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const segIndices = cells.get(cy * gridCols + cx);
      if (!segIndices) continue;
      for (const idx of segIndices) {
        if (tested.has(idx)) continue;
        tested.add(idx);
        const e = segments[idx];
        if (!e) continue;
        if (segmentsIntersect(ax, ay, bx, by, e.seg.x1, e.seg.y1, e.seg.x2, e.seg.y2)) {
          loss += e.attenuation;
        }
      }
    }
  }
  return loss;
}

function calculateHeatmapDirect(
  aps: APConfig[],
  walls: WallData[],
  boundsW: number,
  boundsH: number,
  gridStep: number,
  outputW: number,
  outputH: number,
  band: FrequencyBand,
  colorScheme: ColorScheme,
): { buffer: ArrayBuffer; timeMs: number } {
  const start = performance.now();
  const refLoss = REFERENCE_LOSS[band] ?? REFERENCE_LOSS['5ghz'];
  const active = aps.filter((a) => a.enabled);
  const { grid, allSegments } = buildSpatialGrid(walls, boundsW, boundsH);
  const lut = getColorLUT(colorScheme);
  const gw = Math.max(1, Math.ceil(boundsW / gridStep) + 1);
  const gh = Math.max(1, Math.ceil(boundsH / gridStep) + 1);
  const rssiGrid = new Float32Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    const py = gy * gridStep;
    for (let gx = 0; gx < gw; gx++) {
      const px = gx * gridStep;
      let best = -Infinity;
      for (const ap of active) {
        const dx = px - ap.x;
        const dy = py - ap.y;
        const d = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy));
        const pl = refLoss + 10 * DEFAULT_N * Math.log10(d) + wallLoss(ap.x, ap.y, px, py, grid, allSegments);
        const rssi = ap.txPowerDbm + ap.antennaGainDbi + DEFAULT_RECEIVER_GAIN - pl;
        if (rssi > best) best = rssi;
      }
      rssiGrid[gy * gw + gx] = best === -Infinity ? RSSI_MIN : best;
    }
  }

  // Bilinear interpolation + colorize
  const buf = new ArrayBuffer(outputW * outputH * 4);
  const out = new Uint32Array(buf);
  const sx = (gw - 1) / outputW;
  const sy = (gh - 1) / outputH;
  for (let py = 0; py < outputH; py++) {
    const gy = py * sy;
    const gy0 = Math.floor(gy);
    const gy1 = Math.min(gy0 + 1, gh - 1);
    const ty = gy - gy0;
    for (let px = 0; px < outputW; px++) {
      const gx = px * sx;
      const gx0 = Math.floor(gx);
      const gx1 = Math.min(gx0 + 1, gw - 1);
      const tx = gx - gx0;
      const v00 = rssiGrid[gy0 * gw + gx0] ?? RSSI_MIN;
      const v10 = rssiGrid[gy0 * gw + gx1] ?? RSSI_MIN;
      const v01 = rssiGrid[gy1 * gw + gx0] ?? RSSI_MIN;
      const v11 = rssiGrid[gy1 * gw + gx1] ?? RSSI_MIN;
      const rssi = v00 + (v10 - v00) * tx + ((v01 + (v11 - v01) * tx) - (v00 + (v10 - v00) * tx)) * ty;
      out[py * outputW + px] = lut[rssiToLutIndex(rssi)] ?? 0;
    }
  }

  return { buffer: buf, timeMs: performance.now() - start };
}

// ─── Test Data Generation ────────────────────────────────────────

/** Generates 3 APs distributed across a 10x10m floor */
function createTestAPs(): APConfig[] {
  return [
    { id: 'ap1', x: 2, y: 3, txPowerDbm: 23, antennaGainDbi: 3.2, enabled: true },
    { id: 'ap2', x: 7, y: 2, txPowerDbm: 26, antennaGainDbi: 4.3, enabled: true },
    { id: 'ap3', x: 5, y: 8, txPowerDbm: 23, antennaGainDbi: 3.2, enabled: true },
  ];
}

/** Generates 50 walls in a realistic room layout */
function createTestWalls(): WallData[] {
  const walls: WallData[] = [];
  const rng = createSeededRandom(42);

  for (let i = 0; i < 50; i++) {
    const x1 = rng() * 10;
    const y1 = rng() * 10;
    const angle = rng() * Math.PI;
    const length = 0.5 + rng() * 3;
    const x2 = x1 + Math.cos(angle) * length;
    const y2 = y1 + Math.sin(angle) * length;

    // Alternate between light (5 dB), medium (12 dB), and heavy (25 dB) walls
    const attenuations = [5, 12, 25];
    const attenuation = attenuations[i % 3] ?? 12;

    walls.push({
      segments: [{ x1, y1, x2, y2 }],
      attenuationDb: attenuation,
    });
  }

  return walls;
}

/** Simple seeded PRNG for reproducible benchmarks */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// ─── Benchmarks ──────────────────────────────────────────────────

describe('Heatmap Calculation Performance', () => {
  const testAPs = createTestAPs();
  const testWalls = createTestWalls();
  const boundsW = 10;
  const boundsH = 10;

  bench('3 APs, 50 walls, 0.25m grid, 10x10m floor (fine quality)', () => {
    const result = calculateHeatmapDirect(
      testAPs, testWalls,
      boundsW, boundsH,
      0.25,     // gridStep: 0.25m (fine)
      400, 400, // output: 400x400 px
      '5ghz', 'viridis',
    );
    // Assert: must complete in under 500ms
    expect(result.timeMs).toBeLessThan(500);
  });

  bench('3 APs, 50 walls, 1.0m grid, 10x10m floor (coarse, interactive)', () => {
    const result = calculateHeatmapDirect(
      testAPs, testWalls,
      boundsW, boundsH,
      1.0,      // gridStep: 1.0m (coarse)
      400, 400,
      '5ghz', 'viridis',
    );
    // Coarse should be very fast for interactive use
    expect(result.timeMs).toBeLessThan(50);
  });

  bench('Color LUT generation (viridis)', () => {
    getColorLUT('viridis');
  });

  bench('Color LUT generation (jet)', () => {
    getColorLUT('jet');
  });

  bench('Color LUT generation (inferno)', () => {
    getColorLUT('inferno');
  });

  bench('Spatial grid build (50 walls, 10x10m)', () => {
    buildSpatialGrid(testWalls, boundsW, boundsH);
  });
});
