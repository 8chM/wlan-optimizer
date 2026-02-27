/**
 * Heatmap calculation Web Worker.
 *
 * Implements the ITU-R P.1238 indoor path loss model:
 *   PL(d) = PL(1m) + 10 * n * log10(d) + Sum(wall_losses)
 *   RSSI  = TX_Power + Antenna_Gain + Receiver_Gain - PL(d)
 *
 * Reference values (from rf-modell.md):
 *   PL(1m) @ 2.4 GHz = 40.05 dB
 *   PL(1m) @ 5 GHz   = 46.42 dB
 *   n (residential)   = 3.5 (default, conservative)
 *   Smartphone receiver gain = -3 dBi
 *
 * Uses a spatial grid for efficient wall intersection tests (1m cell size).
 * Generates RGBA ImageData via color LUT and bilinear interpolation.
 */

import {
  type HeatmapWorkerRequest,
  type HeatmapWorkerResult,
  type HeatmapWorkerError,
  type APConfig,
  type WallData,
  type LineSegment,
} from './worker-types';

import {
  getColorLUT,
  rssiToLutIndex,
  RSSI_MIN,
  RSSI_MAX,
  type FrequencyBand,
  type ColorScheme,
} from './color-schemes';

// ─── RF Model Constants ────────────────────────────────────────────

/** Free-space path loss at 1 meter reference distance */
const REFERENCE_LOSS: Record<FrequencyBand, number> = {
  '2.4ghz': 40.05,
  '5ghz': 46.42,
  '6ghz': 47.96,
};

/** Default path loss exponent for residential environments */
const DEFAULT_PATH_LOSS_EXPONENT = 3.5;

/** Default receiver gain for a smartphone antenna */
const DEFAULT_RECEIVER_GAIN_DBI = -3;

/** Minimum distance in meters to avoid log(0) singularity */
const MIN_DISTANCE = 0.1;

/** Cell size for the spatial grid used in wall intersection tests (meters) */
const SPATIAL_GRID_CELL_SIZE = 1.0;

// ─── Spatial Grid ──────────────────────────────────────────────────

interface SpatialGrid {
  cells: Map<number, number[]>;
  gridCols: number;
  gridRows: number;
  cellSize: number;
}

/**
 * Builds a spatial grid index for wall segments.
 * Each cell contains indices of wall segments that overlap it.
 */
function buildSpatialGrid(
  walls: WallData[],
  boundsWidth: number,
  boundsHeight: number,
): { grid: SpatialGrid; allSegments: Array<{ seg: LineSegment; attenuation: number }> } {
  const cellSize = SPATIAL_GRID_CELL_SIZE;
  const gridCols = Math.ceil(boundsWidth / cellSize) + 1;
  const gridRows = Math.ceil(boundsHeight / cellSize) + 1;
  const cells = new Map<number, number[]>();

  // Flatten all wall segments with their attenuation values
  const allSegments: Array<{ seg: LineSegment; attenuation: number }> = [];
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
    const minX = Math.max(0, Math.floor(Math.min(seg.x1, seg.x2) / cellSize));
    const maxX = Math.min(gridCols - 1, Math.floor(Math.max(seg.x1, seg.x2) / cellSize));
    const minY = Math.max(0, Math.floor(Math.min(seg.y1, seg.y2) / cellSize));
    const maxY = Math.min(gridRows - 1, Math.floor(Math.max(seg.y1, seg.y2) / cellSize));

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
    grid: { cells, gridCols, gridRows, cellSize },
    allSegments,
  };
}

// ─── Line-Segment Intersection ─────────────────────────────────────

/**
 * Tests if two line segments intersect.
 * Uses the cross-product method for robust 2D intersection detection.
 * Returns true if segments (p1->p2) and (p3->p4) intersect.
 */
function segmentsIntersect(
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
 * Counts wall intersections along a ray from point A to point B,
 * using the spatial grid for acceleration. Returns total attenuation in dB.
 */
function computeWallLoss(
  ax: number, ay: number,
  bx: number, by: number,
  spatialGrid: SpatialGrid,
  allSegments: Array<{ seg: LineSegment; attenuation: number }>,
): number {
  const { cells, gridCols, cellSize } = spatialGrid;

  // Determine which cells the ray passes through
  const rayMinX = Math.max(0, Math.floor(Math.min(ax, bx) / cellSize));
  const rayMaxX = Math.min(spatialGrid.gridCols - 1, Math.floor(Math.max(ax, bx) / cellSize));
  const rayMinY = Math.max(0, Math.floor(Math.min(ay, by) / cellSize));
  const rayMaxY = Math.min(spatialGrid.gridRows - 1, Math.floor(Math.max(ay, by) / cellSize));

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

// ─── RSSI Calculation ──────────────────────────────────────────────

/**
 * Computes RSSI at a given point from a single AP using ITU-R P.1238.
 */
function computeRSSI(
  pointX: number,
  pointY: number,
  ap: APConfig,
  referenceLoss: number,
  pathLossExponent: number,
  receiverGain: number,
  spatialGrid: SpatialGrid,
  allSegments: Array<{ seg: LineSegment; attenuation: number }>,
): number {
  const dx = pointX - ap.x;
  const dy = pointY - ap.y;
  const distance = Math.max(MIN_DISTANCE, Math.sqrt(dx * dx + dy * dy));

  // Path loss: PL(d) = PL(1m) + 10 * n * log10(d) + wall_losses
  const distanceLoss = 10 * pathLossExponent * Math.log10(distance);
  const wallLoss = computeWallLoss(ap.x, ap.y, pointX, pointY, spatialGrid, allSegments);
  const totalPathLoss = referenceLoss + distanceLoss + wallLoss;

  // RSSI = TX_Power + Antenna_Gain + Receiver_Gain - Path_Loss
  return ap.txPowerDbm + ap.antennaGainDbi + receiverGain - totalPathLoss;
}

// ─── Bilinear Interpolation ────────────────────────────────────────

/**
 * Upscales a coarse RSSI grid to a fine output resolution using
 * bilinear interpolation, then maps each value to a color via LUT.
 */
function interpolateAndColorize(
  rssiGrid: Float32Array,
  gridWidth: number,
  gridHeight: number,
  outputWidth: number,
  outputHeight: number,
  colorLUT: Uint32Array,
): ArrayBuffer {
  const buffer = new ArrayBuffer(outputWidth * outputHeight * 4);
  const output = new Uint32Array(buffer);

  const scaleX = (gridWidth - 1) / outputWidth;
  const scaleY = (gridHeight - 1) / outputHeight;

  for (let py = 0; py < outputHeight; py++) {
    const gy = py * scaleY;
    const gy0 = Math.floor(gy);
    const gy1 = Math.min(gy0 + 1, gridHeight - 1);
    const ty = gy - gy0;

    for (let px = 0; px < outputWidth; px++) {
      const gx = px * scaleX;
      const gx0 = Math.floor(gx);
      const gx1 = Math.min(gx0 + 1, gridWidth - 1);
      const tx = gx - gx0;

      // Bilinear interpolation of RSSI values
      const v00 = rssiGrid[gy0 * gridWidth + gx0] ?? RSSI_MIN;
      const v10 = rssiGrid[gy0 * gridWidth + gx1] ?? RSSI_MIN;
      const v01 = rssiGrid[gy1 * gridWidth + gx0] ?? RSSI_MIN;
      const v11 = rssiGrid[gy1 * gridWidth + gx1] ?? RSSI_MIN;

      const top = v00 + (v10 - v00) * tx;
      const bottom = v01 + (v11 - v01) * tx;
      const rssi = top + (bottom - top) * ty;

      // Map RSSI to color via LUT
      const lutIndex = rssiToLutIndex(rssi);
      output[py * outputWidth + px] = colorLUT[lutIndex] ?? 0;
    }
  }

  return buffer;
}

// ─── Main Calculation ──────────────────────────────────────────────

/**
 * Performs the full heatmap calculation for the given request.
 */
function calculateHeatmap(request: HeatmapWorkerRequest): HeatmapWorkerResult {
  const startTime = performance.now();

  const {
    id,
    aps,
    walls,
    bounds,
    gridStep,
    outputWidth,
    outputHeight,
    band,
    colorScheme,
    calibratedN,
    receiverGainDbi,
  } = request;

  const referenceLoss = REFERENCE_LOSS[band] ?? REFERENCE_LOSS['5ghz'];
  const pathLossExponent = calibratedN ?? DEFAULT_PATH_LOSS_EXPONENT;
  const receiverGain = receiverGainDbi ?? DEFAULT_RECEIVER_GAIN_DBI;

  // Filter enabled APs only
  const activeAPs = aps.filter((ap) => ap.enabled);

  // Build spatial grid for wall intersection acceleration
  const { grid: spatialGrid, allSegments } = buildSpatialGrid(
    walls,
    bounds.width,
    bounds.height,
  );

  // Build the color LUT for the chosen scheme
  const colorLUT = getColorLUT(colorScheme);

  // Calculate RSSI grid
  const gridWidth = Math.max(1, Math.ceil(bounds.width / gridStep) + 1);
  const gridHeight = Math.max(1, Math.ceil(bounds.height / gridStep) + 1);
  const rssiGrid = new Float32Array(gridWidth * gridHeight);

  let minRSSI = Infinity;
  let maxRSSI = -Infinity;
  let sumRSSI = 0;

  for (let gy = 0; gy < gridHeight; gy++) {
    const pointY = gy * gridStep;

    for (let gx = 0; gx < gridWidth; gx++) {
      const pointX = gx * gridStep;

      // Compute combined RSSI from all active APs (max-signal model)
      let bestRSSI = -Infinity;

      for (const ap of activeAPs) {
        const rssi = computeRSSI(
          pointX, pointY, ap,
          referenceLoss, pathLossExponent, receiverGain,
          spatialGrid, allSegments,
        );
        if (rssi > bestRSSI) {
          bestRSSI = rssi;
        }
      }

      // If no APs, set minimum signal
      if (bestRSSI === -Infinity) {
        bestRSSI = RSSI_MIN;
      }

      rssiGrid[gy * gridWidth + gx] = bestRSSI;

      if (bestRSSI < minRSSI) minRSSI = bestRSSI;
      if (bestRSSI > maxRSSI) maxRSSI = bestRSSI;
      sumRSSI += bestRSSI;
    }
  }

  const totalPoints = gridWidth * gridHeight;
  const avgRSSI = totalPoints > 0 ? sumRSSI / totalPoints : RSSI_MIN;

  // Upscale to output resolution with bilinear interpolation and colorize
  const buffer = interpolateAndColorize(
    rssiGrid,
    gridWidth,
    gridHeight,
    outputWidth,
    outputHeight,
    colorLUT,
  );

  const calculationTimeMs = performance.now() - startTime;

  return {
    type: 'result',
    id,
    buffer,
    width: outputWidth,
    height: outputHeight,
    calculationTimeMs,
    stats: {
      minRSSI: minRSSI === Infinity ? RSSI_MIN : minRSSI,
      maxRSSI: maxRSSI === -Infinity ? RSSI_MAX : maxRSSI,
      avgRSSI,
    },
  };
}

// ─── Worker Message Handler ────────────────────────────────────────

self.onmessage = (event: MessageEvent<HeatmapWorkerRequest>) => {
  const request = event.data;

  if (request.type !== 'calculate') {
    const error: HeatmapWorkerError = {
      type: 'error',
      id: 0,
      message: `Unknown request type: ${String(request.type)}`,
    };
    self.postMessage(error);
    return;
  }

  try {
    const result = calculateHeatmap(request);

    // Transfer the ArrayBuffer to avoid copying
    self.postMessage(result, [result.buffer]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown calculation error';
    const error: HeatmapWorkerError = {
      type: 'error',
      id: request.id,
      message,
    };
    self.postMessage(error);
  }
};
