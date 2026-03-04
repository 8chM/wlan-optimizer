/**
 * Heatmap calculation Web Worker.
 *
 * Delegates RF propagation to rf-engine.ts and spatial indexing to
 * spatial-grid.ts. This worker handles only:
 *   - Orchestrating the heatmap grid calculation (max-signal model)
 *   - Bilinear interpolation and colorization
 *   - Worker message handling (onmessage / postMessage)
 *
 * Uses the ITU-R P.1238 indoor path loss model via the RF engine.
 * Uses a spatial grid for efficient wall intersection tests (1m cell size).
 * Generates RGBA ImageData via color LUT and bilinear interpolation.
 */

import type { HeatmapWorkerError, HeatmapWorkerRequest, HeatmapWorkerResult } from './worker-types';

import { RSSI_MAX, RSSI_MIN, getColorLUT, rssiToLutIndex } from './color-schemes';

import { computeRSSI, computeUplinkRSSI, createRFConfig } from './rf-engine';
import { buildSpatialGrid } from './spatial-grid';
import { findPlacementHints } from './placement-hints';
import { BAND_THRESHOLDS } from './coverage-stats';

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

  const scaleX = outputWidth > 1 ? (gridWidth - 1) / (outputWidth - 1) : 0;
  const scaleY = outputHeight > 1 ? (gridHeight - 1) / (outputHeight - 1) : 0;

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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: monolithic worker calculation kept for performance
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
    backSectorPenalty,
    sideSectorPenalty,
    apFilter,
  } = request;

  // Build RF configuration from band + optional overrides
  const rfConfig = createRFConfig(band, {
    pathLossExponent: calibratedN,
    receiverGain: receiverGainDbi,
    backSectorPenalty,
    sideSectorPenalty,
  });

  // Filter enabled APs only, optionally restricted to a single AP
  let activeAPs = aps.filter((ap) => ap.enabled);
  if (apFilter) {
    activeAPs = activeAPs.filter((ap) => ap.id === apFilter);
  }

  // Grid origin offset (supports floor plans not at 0,0)
  const originX = bounds.originX ?? 0;
  const originY = bounds.originY ?? 0;

  // Build spatial grid for wall intersection acceleration
  // Pass origin so segments outside (0,0) are correctly indexed
  const { grid: spatialGrid, allSegments } = buildSpatialGrid(walls, bounds.width, bounds.height, originX, originY);

  // Build the color LUT for the chosen scheme
  const colorLUT = getColorLUT(colorScheme);

  // Calculate RSSI grid
  const gridWidth = Math.max(1, Math.ceil(bounds.width / gridStep) + 1);
  const gridHeight = Math.max(1, Math.ceil(bounds.height / gridStep) + 1);
  const totalGridCells = gridWidth * gridHeight;
  const rssiGrid = new Float32Array(totalGridCells);
  const bestApIndexGrid = new Uint8Array(totalGridCells);
  const deltaGrid = new Float32Array(totalGridCells);
  const secondBestApIndexGrid = new Uint8Array(totalGridCells);
  const overlapCountGrid = new Uint8Array(totalGridCells);
  const uplinkLimitedGrid = new Uint8Array(totalGridCells);

  let minRSSI = Number.POSITIVE_INFINITY;
  let maxRSSI = Number.NEGATIVE_INFINITY;
  let sumRSSI = 0;

  // Coverage bins (band-specific thresholds)
  const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];
  let binExcellent = 0;
  let binGood = 0;
  let binFair = 0;
  let binPoor = 0;
  let binNone = 0;

  for (let gy = 0; gy < gridHeight; gy++) {
    const pointY = originY + gy * gridStep;

    for (let gx = 0; gx < gridWidth; gx++) {
      const pointX = originX + gx * gridStep;
      const cellIdx = gy * gridWidth + gx;

      // Compute combined RSSI from all active APs (max effective signal model)
      // Track best and second-best for AP-zones and delta views
      // Also track overlap count (APs >= fair threshold) and uplink-limited flag
      let bestRSSI = Number.NEGATIVE_INFINITY;
      let bestApIdx = 0;
      let secondBestRSSI = Number.NEGATIVE_INFINITY;
      let secondBestApIdx = 0;
      let overlapCount = 0;
      let bestDownlink = Number.NEGATIVE_INFINITY;
      let bestUplink = Number.NEGATIVE_INFINITY;

      for (let apIdx = 0; apIdx < activeAPs.length; apIdx++) {
        const ap = activeAPs[apIdx]!;
        const downlink = computeRSSI(pointX, pointY, ap, rfConfig, spatialGrid, allSegments);
        const uplink = computeUplinkRSSI(pointX, pointY, ap, band, rfConfig, spatialGrid, allSegments);
        const effective = Math.min(downlink, uplink);
        if (effective >= thresholds.fair) overlapCount++;
        if (effective > bestRSSI) {
          secondBestRSSI = bestRSSI;
          secondBestApIdx = bestApIdx;
          bestRSSI = effective;
          bestApIdx = apIdx;
          bestDownlink = downlink;
          bestUplink = uplink;
        } else if (effective > secondBestRSSI) {
          secondBestRSSI = effective;
          secondBestApIdx = apIdx;
        }
      }

      // If no APs, set minimum signal
      if (bestRSSI === Number.NEGATIVE_INFINITY) {
        bestRSSI = RSSI_MIN;
      }

      rssiGrid[cellIdx] = bestRSSI;
      bestApIndexGrid[cellIdx] = bestApIdx;
      secondBestApIndexGrid[cellIdx] = secondBestApIdx;
      overlapCountGrid[cellIdx] = Math.min(overlapCount, 255);
      uplinkLimitedGrid[cellIdx] = bestUplink < bestDownlink ? 1 : 0;
      deltaGrid[cellIdx] = secondBestRSSI === Number.NEGATIVE_INFINITY
        ? 99 // Only 1 AP or no APs — no handoff risk
        : bestRSSI - secondBestRSSI;

      if (bestRSSI < minRSSI) minRSSI = bestRSSI;
      if (bestRSSI > maxRSSI) maxRSSI = bestRSSI;
      sumRSSI += bestRSSI;

      // Classify into coverage bins (band-specific thresholds)
      if (bestRSSI >= thresholds.excellent) binExcellent++;
      else if (bestRSSI >= thresholds.good) binGood++;
      else if (bestRSSI >= thresholds.fair) binFair++;
      else if (bestRSSI >= thresholds.poor) binPoor++;
      else binNone++;
    }
  }

  const avgRSSI = totalGridCells > 0 ? sumRSSI / totalGridCells : RSSI_MIN;

  // Find weak coverage zones for AP placement suggestions
  const placementHints = findPlacementHints(rssiGrid, gridWidth, gridHeight, gridStep, {}, originX, originY);

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
      minRSSI: minRSSI === Number.POSITIVE_INFINITY ? RSSI_MIN : minRSSI,
      maxRSSI: maxRSSI === Number.NEGATIVE_INFINITY ? RSSI_MAX : maxRSSI,
      avgRSSI,
      coverageBins: {
        excellent: binExcellent,
        good: binGood,
        fair: binFair,
        poor: binPoor,
        none: binNone,
      },
      totalCells: totalGridCells,
      placementHints,
    },
    apIndexBuffer: bestApIndexGrid.buffer,
    deltaBuffer: deltaGrid.buffer,
    apIds: activeAPs.map((ap) => ap.id),
    gridWidth,
    gridHeight,
    rssiBuffer: rssiGrid.buffer,
    secondBestApIndexBuffer: secondBestApIndexGrid.buffer,
    overlapCountBuffer: overlapCountGrid.buffer,
    uplinkLimitedBuffer: uplinkLimitedGrid.buffer,
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

    // Transfer ArrayBuffers to avoid copying
    const transferList: ArrayBuffer[] = [result.buffer];
    if (result.apIndexBuffer) transferList.push(result.apIndexBuffer);
    if (result.deltaBuffer) transferList.push(result.deltaBuffer);
    if (result.rssiBuffer) transferList.push(result.rssiBuffer);
    if (result.secondBestApIndexBuffer) transferList.push(result.secondBestApIndexBuffer);
    if (result.overlapCountBuffer) transferList.push(result.overlapCountBuffer);
    if (result.uplinkLimitedBuffer) transferList.push(result.uplinkLimitedBuffer);
    self.postMessage(result, { transfer: transferList });
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
