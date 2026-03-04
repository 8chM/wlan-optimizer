/**
 * Analysis functions for the recommendation engine.
 *
 * Pure functions that derive metrics from HeatmapStats grids.
 * All functions are stateless and can be called from the main thread.
 */

import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { ChannelAnalysisResult } from '$lib/heatmap/channel-analysis';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import { BAND_THRESHOLDS } from '$lib/heatmap/coverage-stats';
import type {
  APMetrics,
  PriorityZone,
  ScoreBreakdown,
  ScoringWeights,
  WeakZone,
  OverlapZone,
} from './types';

// ─── Per-AP Metrics ───────────────────────────────────────────────

/**
 * Compute per-AP metrics from heatmap grids.
 *
 * Iterates over apIndexGrid, deltaGrid, overlapCountGrid to derive
 * primary coverage, overlap cells, and peak RSSI per AP.
 */
export function computeAPMetrics(
  stats: HeatmapStats,
  apIds: string[],
  channelAnalysis: ChannelAnalysisResult | null,
): Map<string, APMetrics> {
  const result = new Map<string, APMetrics>();

  // Initialize metrics for all APs
  for (const apId of apIds) {
    result.set(apId, {
      apId,
      primaryCoverageCells: 0,
      primaryCoverageRatio: 0,
      overlapCells: 0,
      avgDeltaInPrimary: 0,
      peakRssi: -Infinity,
      secondBestCoverageCells: 0,
      channelConflictScore: 0,
    });
  }

  const { apIndexGrid, deltaGrid, rssiGrid, overlapCountGrid, totalCells } = stats;
  const gridWidth = stats.gridWidth ?? 0;
  const gridHeight = stats.gridHeight ?? 0;
  const total = totalCells ?? (gridWidth * gridHeight);

  if (!apIndexGrid || !deltaGrid || total === 0) return result;

  // Accumulators for per-AP delta sum
  const deltaSums = new Map<string, number>();
  for (const apId of apIds) deltaSums.set(apId, 0);

  for (let i = 0; i < total; i++) {
    const bestApIdx = apIndexGrid[i]!;
    const apId = apIds[bestApIdx];
    if (!apId) continue;

    const metrics = result.get(apId)!;
    metrics.primaryCoverageCells++;

    const delta = deltaGrid[i] ?? 99;
    deltaSums.set(apId, (deltaSums.get(apId) ?? 0) + delta);

    // Track overlap: cells where second-best is close (delta < 5dB)
    if (delta < 5 && (overlapCountGrid?.[i] ?? 0) >= 2) {
      metrics.overlapCells++;
    }

    // Track peak RSSI
    if (rssiGrid) {
      const rssi = rssiGrid[i] ?? -100;
      if (rssi > metrics.peakRssi) metrics.peakRssi = rssi;
    }
  }

  // Count second-best coverage from secondBestApIndexGrid
  if (stats.secondBestApIndexGrid) {
    for (let i = 0; i < total; i++) {
      const secondIdx = stats.secondBestApIndexGrid[i];
      if (secondIdx === undefined || secondIdx === 255) continue;
      const apId = apIds[secondIdx];
      if (!apId) continue;
      const metrics = result.get(apId);
      if (metrics) metrics.secondBestCoverageCells++;
    }
  }

  // Finalize ratios and averages
  for (const [apId, metrics] of result) {
    metrics.primaryCoverageRatio = total > 0 ? metrics.primaryCoverageCells / total : 0;
    metrics.avgDeltaInPrimary = metrics.primaryCoverageCells > 0
      ? (deltaSums.get(apId) ?? 0) / metrics.primaryCoverageCells
      : 0;

    // Channel conflict score from analysis
    if (channelAnalysis) {
      const summary = channelAnalysis.apSummaries.find(s => s.apId === apId);
      metrics.channelConflictScore = summary?.worstScore ?? 0;
    }

    if (metrics.peakRssi === -Infinity) metrics.peakRssi = -100;
  }

  return result;
}

// ─── Band Suitability ─────────────────────────────────────────────

/**
 * Compute band suitability score from uplink-limited grid.
 * High uplink-limited ratio = band less suitable (clients transmit too weakly).
 * 2.4 GHz is more tolerant (clients transmit stronger), 5/6 GHz more sensitive.
 */
function computeBandSuitabilityScore(
  stats: HeatmapStats,
  band: FrequencyBand,
): number {
  if (!stats.uplinkLimitedGrid) return 50; // Fallback when data missing

  const total = stats.totalCells ?? 0;
  if (total === 0) return 50;

  let uplinkLimitedCount = 0;
  for (let i = 0; i < total; i++) {
    if (stats.uplinkLimitedGrid[i]) uplinkLimitedCount++;
  }
  const uplinkLimitedRatio = uplinkLimitedCount / total;

  // 2.4 GHz is more tolerant (clients send stronger), 5/6 GHz more sensitive
  const bandPenalty = band === '2.4ghz' ? 0.5 : 1.0;
  return Math.max(0, Math.min(100, 100 - uplinkLimitedRatio * 100 * bandPenalty));
}

// ─── Overall Score ────────────────────────────────────────────────

/**
 * Compute an overall quality score (0-100) from heatmap stats and metrics.
 *
 * Score formula:
 *   coverageScore = weighted bin quality / max possible
 *   overlapPenalty = overlapCells / totalCells
 *   conflictPenalty = sum(conflict scores) / max possible
 *   roamingScore = normalized average delta
 *   overall = coverage*w - overlap*w - conflict*w + roaming*w (clamped 0-100)
 */
export function computeOverallScore(
  stats: HeatmapStats,
  apMetrics: Map<string, APMetrics>,
  channelAnalysis: ChannelAnalysisResult | null,
  weights: ScoringWeights,
  band: FrequencyBand = '5ghz',
): ScoreBreakdown {
  const bins = stats.coverageBins;
  const total = stats.totalCells ?? 0;

  // Coverage score: weighted bin quality normalized to 0-100
  let coverageScore = 0;
  if (bins && total > 0) {
    const weighted = bins.excellent * 4 + bins.good * 3 + bins.fair * 2 + bins.poor * 1;
    coverageScore = (weighted / (total * 4)) * 100;
  }

  // Overlap penalty: ratio of overlap cells (0-100)
  let totalOverlapCells = 0;
  for (const m of apMetrics.values()) {
    totalOverlapCells += m.overlapCells;
  }
  const overlapPenalty = total > 0 ? (totalOverlapCells / total) * 100 : 0;

  // Conflict penalty from channel analysis (0-100)
  let conflictPenalty = 0;
  if (channelAnalysis && channelAnalysis.conflicts.length > 0) {
    const totalScore = channelAnalysis.conflicts.reduce((sum, c) => sum + c.score, 0);
    const maxPossible = channelAnalysis.conflicts.length; // max score per conflict = 1.0
    conflictPenalty = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
  }

  // Roaming score: average delta normalized (higher delta = better roaming distinction)
  let roamingScore = 0;
  if (stats.deltaGrid && total > 0) {
    let deltaSum = 0;
    let count = 0;
    for (let i = 0; i < total; i++) {
      const d = stats.deltaGrid[i] ?? 99;
      if (d < 99) { // exclude single-AP cells
        deltaSum += d;
        count++;
      }
    }
    if (count > 0) {
      const avgDelta = deltaSum / count;
      // Normalize: 0dB delta = 0 score, 15dB+ delta = 100 score
      roamingScore = Math.min(100, (avgDelta / 15) * 100);
    }
  }

  // Band suitability: derived from uplink-limited ratio
  const bandSuitabilityScore = computeBandSuitabilityScore(stats, band);

  // Overall score
  const rawScore =
    coverageScore * weights.coverage
    - overlapPenalty * weights.overlap
    - conflictPenalty * weights.conflict
    + roamingScore * weights.roaming
    + bandSuitabilityScore * weights.band;

  // Normalize to 0-100
  const maxPossible = 100 * weights.coverage + 100 * weights.roaming + 100 * weights.band;
  const overallScore = Math.max(0, Math.min(100, (rawScore / maxPossible) * 100));

  return {
    overallScore,
    coverageScore,
    overlapPenalty,
    conflictPenalty,
    roamingScore,
    bandSuitabilityScore,
  };
}

// ─── Weak Zone Detection ──────────────────────────────────────────

/**
 * Find contiguous weak coverage zones from the RSSI grid.
 * Uses flood-fill on cells below the "poor" threshold for the band.
 */
export function findWeakZones(
  stats: HeatmapStats,
  band: FrequencyBand,
  originX = 0,
  originY = 0,
  priorityZones: PriorityZone[] = [],
): WeakZone[] {
  const { rssiGrid, gridWidth: gw, gridHeight: gh } = stats;
  const gridWidth = gw ?? 0;
  const gridHeight = gh ?? 0;
  const gridStep = stats.gridStep ?? 0.25;

  if (!rssiGrid || gridWidth === 0 || gridHeight === 0) return [];

  const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];
  const weakThreshold = thresholds.poor;
  const totalCells = gridWidth * gridHeight;

  const isWeak = new Uint8Array(totalCells);
  const visited = new Uint8Array(totalCells);

  for (let i = 0; i < totalCells; i++) {
    if ((rssiGrid[i] ?? -100) < weakThreshold) isWeak[i] = 1;
  }

  const zones: WeakZone[] = [];
  const minArea = 5; // minimum cells to be a zone

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      if (!isWeak[idx] || visited[idx]) continue;

      // BFS flood fill
      const cells: number[] = [];
      let rssiSum = 0;
      let sumCol = 0;
      let sumRow = 0;
      const queue = [idx];
      visited[idx] = 1;

      while (queue.length > 0) {
        const ci = queue.shift()!;
        cells.push(ci);
        const r = Math.floor(ci / gridWidth);
        const c = ci % gridWidth;
        rssiSum += rssiGrid[ci] ?? -100;
        sumCol += c;
        sumRow += r;

        // 4-neighbors
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr!;
          const nc = c + dc!;
          if (nr >= 0 && nr < gridHeight && nc >= 0 && nc < gridWidth) {
            const ni = nr * gridWidth + nc;
            if (isWeak[ni] && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }

      if (cells.length >= minArea) {
        zones.push({
          centroidX: originX + (sumCol / cells.length) * gridStep,
          centroidY: originY + (sumRow / cells.length) * gridStep,
          cellCount: cells.length,
          avgRssi: rssiSum / cells.length,
          cellIndices: cells,
        });
      }
    }
  }

  // Boost/reduce weak zone importance based on priority zones
  if (priorityZones.length > 0) {
    for (const wz of zones) {
      let weightMultiplier = 1.0;
      for (const pz of priorityZones) {
        if (wz.centroidX >= pz.x && wz.centroidX <= pz.x + pz.width &&
            wz.centroidY >= pz.y && wz.centroidY <= pz.y + pz.height) {
          weightMultiplier = Math.max(weightMultiplier, pz.weight);
          if (pz.targetMinRssi && wz.avgRssi < pz.targetMinRssi) {
            weightMultiplier *= 1.5; // Especially urgent
          }
        }
      }
      // Virtually larger zone through weighting
      wz.cellCount = Math.round(wz.cellCount * weightMultiplier);
    }
  }

  // Sort by (weighted) size, largest first
  zones.sort((a, b) => b.cellCount - a.cellCount);
  return zones.slice(0, 10);
}

// ─── Overlap Zone Detection ───────────────────────────────────────

/**
 * Find zones with excessive AP overlap (overlapCount >= 3 AND delta < 5dB).
 */
export function findOverlapZones(stats: HeatmapStats, originX = 0, originY = 0): OverlapZone[] {
  const { overlapCountGrid, deltaGrid, gridWidth: gw, gridHeight: gh } = stats;
  const gridWidth = gw ?? 0;
  const gridHeight = gh ?? 0;
  const gridStep = stats.gridStep ?? 0.25;

  if (!overlapCountGrid || !deltaGrid || gridWidth === 0 || gridHeight === 0) return [];

  const totalCells = gridWidth * gridHeight;
  const isOverlap = new Uint8Array(totalCells);
  const visited = new Uint8Array(totalCells);

  for (let i = 0; i < totalCells; i++) {
    if ((overlapCountGrid[i] ?? 0) >= 3 && (deltaGrid[i] ?? 99) < 5) {
      isOverlap[i] = 1;
    }
  }

  const zones: OverlapZone[] = [];
  const minArea = 5;

  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;
      if (!isOverlap[idx] || visited[idx]) continue;

      const cells: number[] = [];
      let overlapSum = 0;
      let deltaSum = 0;
      let sumCol = 0;
      let sumRow = 0;
      const queue = [idx];
      visited[idx] = 1;

      while (queue.length > 0) {
        const ci = queue.shift()!;
        cells.push(ci);
        const r = Math.floor(ci / gridWidth);
        const c = ci % gridWidth;
        overlapSum += overlapCountGrid[ci] ?? 0;
        deltaSum += deltaGrid[ci] ?? 0;
        sumCol += c;
        sumRow += r;

        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr!;
          const nc = c + dc!;
          if (nr >= 0 && nr < gridHeight && nc >= 0 && nc < gridWidth) {
            const ni = nr * gridWidth + nc;
            if (isOverlap[ni] && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
      }

      if (cells.length >= minArea) {
        zones.push({
          centroidX: originX + (sumCol / cells.length) * gridStep,
          centroidY: originY + (sumRow / cells.length) * gridStep,
          cellCount: cells.length,
          avgOverlapCount: overlapSum / cells.length,
          avgDelta: deltaSum / cells.length,
          cellIndices: cells,
        });
      }
    }
  }

  zones.sort((a, b) => b.cellCount - a.cellCount);
  return zones.slice(0, 10);
}

// ─── Low-Value AP Detection ───────────────────────────────────────

/**
 * Find APs with less than 5% primary coverage — they contribute little.
 */
export function findLowValueAPs(
  apMetrics: Map<string, APMetrics>,
  threshold = 0.05,
): string[] {
  const lowValue: string[] = [];
  for (const [apId, metrics] of apMetrics) {
    if (metrics.primaryCoverageRatio < threshold) {
      lowValue.push(apId);
    }
  }
  return lowValue;
}
