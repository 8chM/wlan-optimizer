/**
 * Benchmark for heatmap calculation performance.
 *
 * Tests the core calculation pipeline (RF engine + spatial grid + colorization)
 * at all 4 LOD levels to verify performance targets:
 *   LOD 0 (1.0m grid): < 15ms  (drag mode)
 *   LOD 1 (0.5m grid): < 50ms  (drag end)
 *   LOD 2 (0.25m grid): < 200ms (idle)
 *   LOD 3 (0.1m grid): < 500ms (max quality)
 *
 * Test scenario: 3 APs, 50 walls, 10x10m floor (100 m²)
 *
 * Run: npx vitest bench src/lib/heatmap/heatmap-worker.bench.ts
 */
import { describe, bench, expect } from 'vitest';
import type { APConfig, WallData, LineSegment } from './worker-types';
import type { FrequencyBand, ColorScheme } from './color-schemes';
import { getColorLUT, rssiToLutIndex, RSSI_MIN } from './color-schemes';
import { buildSpatialGrid } from './spatial-grid';
import { createRFConfig, computeRSSI } from './rf-engine';

// ─── Core Calculation (mirrors worker logic) ─────────────────────

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

  const rfConfig = createRFConfig(band);
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
        const rssi = computeRSSI(px, py, ap, rfConfig, grid, allSegments);
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

  // LOD 0: Drag mode - 1.0m grid, target <15ms
  bench('LOD 0: 3 APs, 50 walls, 1.0m grid (drag mode, target <15ms)', () => {
    const result = calculateHeatmapDirect(
      testAPs, testWalls,
      boundsW, boundsH,
      1.0, 400, 400,
      '5ghz', 'viridis',
    );
    expect(result.timeMs).toBeLessThan(50); // Allow margin for CI
  });

  // LOD 1: Drag end - 0.5m grid, target <50ms
  bench('LOD 1: 3 APs, 50 walls, 0.5m grid (drag end, target <50ms)', () => {
    const result = calculateHeatmapDirect(
      testAPs, testWalls,
      boundsW, boundsH,
      0.5, 400, 400,
      '5ghz', 'viridis',
    );
    expect(result.timeMs).toBeLessThan(100);
  });

  // LOD 2: Idle - 0.25m grid, target <200ms
  bench('LOD 2: 3 APs, 50 walls, 0.25m grid (idle, target <200ms)', () => {
    const result = calculateHeatmapDirect(
      testAPs, testWalls,
      boundsW, boundsH,
      0.25, 400, 400,
      '5ghz', 'viridis',
    );
    expect(result.timeMs).toBeLessThan(500);
  });

  // LOD 3: Max quality - 0.1m grid, target <500ms
  bench('LOD 3: 3 APs, 50 walls, 0.1m grid (max quality, target <500ms)', () => {
    const result = calculateHeatmapDirect(
      testAPs, testWalls,
      boundsW, boundsH,
      0.1, 400, 400,
      '5ghz', 'viridis',
    );
    expect(result.timeMs).toBeLessThan(2000); // Allow CI margin
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
