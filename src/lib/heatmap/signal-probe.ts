/**
 * Signal Probe — O(1) grid lookup for point signal inspection.
 *
 * Uses the pre-computed rssiGrid + apIndexGrid from HeatmapStats
 * to return the RSSI value and best AP at any map coordinate.
 */

import type { HeatmapStats } from './heatmap-manager';

export interface ProbeResult {
  rssiDbm: number;
  bestApId: string | null;
}

export function probeSignalFromGrid(
  meterX: number,
  meterY: number,
  stats: HeatmapStats,
): ProbeResult | null {
  const { rssiGrid, apIndexGrid, apIds, gridWidth, gridHeight, gridStep } = stats;
  if (!rssiGrid || !gridWidth || !gridHeight || !gridStep) return null;

  const gx = Math.round(meterX / gridStep);
  const gy = Math.round(meterY / gridStep);
  if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return null;

  const idx = gy * gridWidth + gx;
  const raw = rssiGrid[idx];
  if (raw === undefined) return null;
  const rssiDbm = Math.round(raw * 10) / 10;
  const bestApIdx = apIndexGrid?.[idx];
  const bestApId = bestApIdx !== undefined && apIds ? (apIds[bestApIdx] ?? null) : null;
  return { rssiDbm, bestApId };
}
