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
): number | null {
  if (!stats.uplinkLimitedGrid) return null; // No data — exclude from formula

  const total = stats.totalCells ?? 0;
  if (total === 0) return null;

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
  priorityZones: PriorityZone[] = [],
): ScoreBreakdown {
  const bins = stats.coverageBins;
  const total = stats.totalCells ?? 0;

  // Coverage score: weighted bin quality normalized to 0-100
  let coverageScore = 0;
  if (bins && total > 0) {
    const weighted = bins.excellent * 4 + bins.good * 3 + bins.fair * 2 + bins.poor * 1;
    coverageScore = (weighted / (total * 4)) * 100;
  }

  // PriorityZone penalty: reduce coverage score if priority zones have weak coverage
  if (priorityZones.length > 0 && stats.rssiGrid) {
    const gridWidth = stats.gridWidth ?? 0;
    const gridHeight = stats.gridHeight ?? 0;
    const gridStep = stats.gridStep ?? 0.25;
    const originX = (stats as unknown as Record<string, number>).originX ?? 0;
    const originY = (stats as unknown as Record<string, number>).originY ?? 0;
    let priorityPenalty = 0;

    for (const pz of priorityZones) {
      const threshold = pz.targetMinRssi ?? BAND_THRESHOLDS[band].fair;
      let belowCount = 0;
      let totalInZone = 0;
      for (let r = 0; r < gridHeight; r++) {
        for (let c = 0; c < gridWidth; c++) {
          const wx = originX + c * gridStep;
          const wy = originY + r * gridStep;
          if (wx >= pz.x && wx <= pz.x + pz.width && wy >= pz.y && wy <= pz.y + pz.height) {
            totalInZone++;
            if ((stats.rssiGrid[r * gridWidth + c] ?? -100) < threshold) belowCount++;
          }
        }
      }
      if (totalInZone > 0) {
        const violationRatio = belowCount / totalInZone;
        priorityPenalty += violationRatio * pz.weight * (pz.mustHaveCoverage ? 2.0 : 1.0);
      }
    }
    // Reduce coverage score proportionally (max 30% penalty from priority zones)
    const penaltyFactor = Math.min(0.3, priorityPenalty / priorityZones.length * 0.15);
    coverageScore *= (1 - penaltyFactor);
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

  // Roaming score: improved with sticky-client and handoff-gap penalties
  const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];
  let roamingScore = 0;
  if (stats.deltaGrid && total > 0) {
    let deltaSum = 0;
    let count = 0;
    let stickyCount = 0;
    let gapCount = 0;

    for (let i = 0; i < total; i++) {
      const d = stats.deltaGrid[i] ?? 99;
      if (d < 99) {
        deltaSum += d;
        count++;
        if (d > 15) stickyCount++;
        const rssi = stats.rssiGrid?.[i] ?? -100;
        if (d < 8 && rssi < thresholds.fair) gapCount++;
      }
    }

    if (count > 0) {
      const avgDelta = deltaSum / count;
      const deltaComponent = Math.min(100, (avgDelta / 15) * 100);
      const stickyPenalty = (stickyCount / count) * 30;
      const gapPenalty = (gapCount / count) * 40;
      roamingScore = Math.max(0, deltaComponent - stickyPenalty - gapPenalty);
    }
  }

  // Band suitability: derived from uplink-limited ratio (null = no data available)
  const bandSuitabilityRaw = computeBandSuitabilityScore(stats, band);
  const hasBandData = bandSuitabilityRaw !== null;
  const bandSuitabilityScore = bandSuitabilityRaw ?? 0;

  // Overall score — exclude band component when no uplink data available
  const rawScore =
    coverageScore * weights.coverage
    - overlapPenalty * weights.overlap
    - conflictPenalty * weights.conflict
    + roamingScore * weights.roaming
    + (hasBandData ? bandSuitabilityScore * weights.band : 0);

  // Normalize to 0-100 — denominator excludes band when no data
  const maxPossible = 100 * weights.coverage + 100 * weights.roaming + (hasBandData ? 100 * weights.band : 0);
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

// ─── Roaming Pair Analysis ────────────────────────────────────────

/** Metrics for an AP pair's roaming characteristics */
export interface RoamingPairMetrics {
  ap1Id: string;
  ap2Id: string;
  /** Cells in the handoff zone (delta < handoffThreshold) */
  handoffZoneCells: number;
  /** Ratio of handoff zone to total multi-AP cells */
  handoffZoneRatio: number;
  /** Average delta in the handoff zone */
  avgDeltaInZone: number;
  /** Cells with weak signal in handoff zone (gap) */
  gapCells: number;
  /** Average RSSI in the handoff zone */
  avgRssiInZone: number;
  /** Ratio of cells with delta > stickyThreshold (no realistic handoff) */
  stickyRatio: number;
}

const HANDOFF_THRESHOLD = 8;  // dB — close enough for client roaming
const STICKY_THRESHOLD = 15;  // dB — too far apart, clients won't roam

/**
 * Analyze roaming characteristics for all AP pairs.
 *
 * Uses deltaGrid, apIndexGrid, secondBestApIndexGrid, and rssiGrid
 * to compute per-pair handoff zones, gaps, and sticky-client risk.
 */
export function analyzeRoamingPairs(
  stats: HeatmapStats,
  apIds: string[],
  band: FrequencyBand,
): RoamingPairMetrics[] {
  const { deltaGrid, apIndexGrid, secondBestApIndexGrid, rssiGrid } = stats;
  const total = stats.totalCells ?? 0;

  if (!deltaGrid || !apIndexGrid || !secondBestApIndexGrid || total === 0 || apIds.length < 2) {
    return [];
  }

  const thresholds = BAND_THRESHOLDS[band] ?? BAND_THRESHOLDS['5ghz'];

  // Accumulator map: "ap1Id|ap2Id" (sorted) → accumulators
  const pairMap = new Map<string, {
    ap1Id: string;
    ap2Id: string;
    handoffCells: number;
    handoffDeltaSum: number;
    handoffRssiSum: number;
    gapCells: number;
    stickyCells: number;
    totalPairCells: number;
  }>();

  for (let i = 0; i < total; i++) {
    const delta = deltaGrid[i] ?? 99;
    if (delta >= 99) continue; // Single-AP cell, skip

    const bestIdx = apIndexGrid[i]!;
    const secondIdx = secondBestApIndexGrid[i];
    if (secondIdx === undefined || secondIdx === 255) continue;

    const ap1Id = apIds[bestIdx];
    const ap2Id = apIds[secondIdx];
    if (!ap1Id || !ap2Id || ap1Id === ap2Id) continue;

    // Sorted key for consistent pairing
    const key = ap1Id < ap2Id ? `${ap1Id}|${ap2Id}` : `${ap2Id}|${ap1Id}`;
    let acc = pairMap.get(key);
    if (!acc) {
      const [sortedA, sortedB] = ap1Id < ap2Id ? [ap1Id, ap2Id] : [ap2Id, ap1Id];
      acc = {
        ap1Id: sortedA!, ap2Id: sortedB!,
        handoffCells: 0, handoffDeltaSum: 0, handoffRssiSum: 0,
        gapCells: 0, stickyCells: 0, totalPairCells: 0,
      };
      pairMap.set(key, acc);
    }

    acc.totalPairCells++;

    if (delta < HANDOFF_THRESHOLD) {
      acc.handoffCells++;
      acc.handoffDeltaSum += delta;
      const rssi = rssiGrid?.[i] ?? -100;
      acc.handoffRssiSum += rssi;
      if (rssi < thresholds.fair) {
        acc.gapCells++;
      }
    }

    if (delta > STICKY_THRESHOLD) {
      acc.stickyCells++;
    }
  }

  const results: RoamingPairMetrics[] = [];
  for (const acc of pairMap.values()) {
    if (acc.totalPairCells === 0) continue;
    results.push({
      ap1Id: acc.ap1Id,
      ap2Id: acc.ap2Id,
      handoffZoneCells: acc.handoffCells,
      handoffZoneRatio: acc.handoffCells / acc.totalPairCells,
      avgDeltaInZone: acc.handoffCells > 0 ? acc.handoffDeltaSum / acc.handoffCells : 0,
      gapCells: acc.gapCells,
      avgRssiInZone: acc.handoffCells > 0 ? acc.handoffRssiSum / acc.handoffCells : -100,
      stickyRatio: acc.stickyCells / acc.totalPairCells,
    });
  }

  return results;
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
