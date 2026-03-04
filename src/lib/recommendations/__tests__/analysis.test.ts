/**
 * Unit tests for recommendation analysis functions.
 */

import { describe, it, expect } from 'vitest';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { ChannelAnalysisResult } from '$lib/heatmap/channel-analysis';
import {
  computeAPMetrics,
  computeOverallScore,
  findWeakZones,
  findOverlapZones,
  findLowValueAPs,
} from '../analysis';
import { EXPERT_PROFILES } from '../types';
import type { PriorityZone } from '../types';

// ─── Helper: create minimal HeatmapStats ──────────────────────────

function makeStats(overrides: Partial<HeatmapStats> = {}): HeatmapStats {
  return {
    minRSSI: -80,
    maxRSSI: -30,
    avgRSSI: -55,
    calculationTimeMs: 10,
    gridStep: 1.0,
    lodLevel: 2,
    coverageBins: { excellent: 40, good: 30, fair: 20, poor: 8, none: 2 },
    totalCells: 100,
    gridWidth: 10,
    gridHeight: 10,
    ...overrides,
  };
}

function makeGrids(
  gridWidth: number,
  gridHeight: number,
  fill: { rssi?: number; apIdx?: number; delta?: number; overlap?: number; uplink?: number } = {},
) {
  const total = gridWidth * gridHeight;
  const rssiGrid = new Float32Array(total).fill(fill.rssi ?? -50);
  const apIndexGrid = new Uint8Array(total).fill(fill.apIdx ?? 0);
  const deltaGrid = new Float32Array(total).fill(fill.delta ?? 20);
  const overlapCountGrid = new Uint8Array(total).fill(fill.overlap ?? 1);
  const uplinkLimitedGrid = new Uint8Array(total).fill(fill.uplink ?? 0);
  const secondBestApIndexGrid = new Uint8Array(total).fill(1);
  return { rssiGrid, apIndexGrid, deltaGrid, overlapCountGrid, uplinkLimitedGrid, secondBestApIndexGrid };
}

const emptyChannelAnalysis: ChannelAnalysisResult = {
  conflicts: [],
  apSummaries: [],
  band: '5ghz',
};

// ─── computeAPMetrics ─────────────────────────────────────────────

describe('computeAPMetrics', () => {
  it('should count primary coverage per AP', () => {
    const grids = makeGrids(10, 10);
    // First 60 cells: AP 0, last 40 cells: AP 1
    for (let i = 60; i < 100; i++) grids.apIndexGrid[i] = 1;

    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const result = computeAPMetrics(stats, ['ap-0', 'ap-1'], emptyChannelAnalysis);

    expect(result.get('ap-0')!.primaryCoverageCells).toBe(60);
    expect(result.get('ap-1')!.primaryCoverageCells).toBe(40);
    expect(result.get('ap-0')!.primaryCoverageRatio).toBeCloseTo(0.6);
    expect(result.get('ap-1')!.primaryCoverageRatio).toBeCloseTo(0.4);
  });

  it('should track overlap cells (delta < 5 and overlapCount >= 2)', () => {
    const grids = makeGrids(10, 10, { delta: 3, overlap: 2 });
    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const result = computeAPMetrics(stats, ['ap-0'], emptyChannelAnalysis);
    // All cells have delta < 5 and overlap >= 2
    expect(result.get('ap-0')!.overlapCells).toBe(100);
  });

  it('should track peak RSSI', () => {
    const grids = makeGrids(10, 10, { rssi: -60 });
    grids.rssiGrid[42] = -25; // One hot spot

    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const result = computeAPMetrics(stats, ['ap-0'], emptyChannelAnalysis);
    expect(result.get('ap-0')!.peakRssi).toBe(-25);
  });

  it('should handle empty grids', () => {
    const stats = makeStats({ apIndexGrid: undefined, totalCells: 0 });
    const result = computeAPMetrics(stats, ['ap-0'], emptyChannelAnalysis);
    expect(result.get('ap-0')!.primaryCoverageCells).toBe(0);
  });
});

// ─── computeOverallScore ──────────────────────────────────────────

describe('computeOverallScore', () => {
  it('should score perfect coverage highly', () => {
    const stats = makeStats({
      coverageBins: { excellent: 100, good: 0, fair: 0, poor: 0, none: 0 },
      totalCells: 100,
    });
    const apMetrics = new Map();
    const score = computeOverallScore(stats, apMetrics, emptyChannelAnalysis, EXPERT_PROFILES.balanced);

    expect(score.coverageScore).toBe(100);
    expect(score.overallScore).toBeGreaterThan(50);
  });

  it('should score poor coverage low', () => {
    const stats = makeStats({
      coverageBins: { excellent: 0, good: 0, fair: 0, poor: 10, none: 90 },
      totalCells: 100,
    });
    const apMetrics = new Map();
    const score = computeOverallScore(stats, apMetrics, emptyChannelAnalysis, EXPERT_PROFILES.balanced);

    expect(score.coverageScore).toBeLessThan(10);
    expect(score.overallScore).toBeLessThan(30);
  });

  it('should clamp to 0-100', () => {
    const stats = makeStats({
      coverageBins: { excellent: 0, good: 0, fair: 0, poor: 0, none: 100 },
      totalCells: 100,
    });
    const apMetrics = new Map();
    const score = computeOverallScore(stats, apMetrics, emptyChannelAnalysis, EXPERT_PROFILES.balanced);

    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
  });

  it('should return bandSuitabilityScore 70 when no uplinkLimitedGrid', () => {
    const stats = makeStats({
      coverageBins: { excellent: 50, good: 30, fair: 10, poor: 5, none: 5 },
      totalCells: 100,
    });
    const apMetrics = new Map();
    const score = computeOverallScore(stats, apMetrics, emptyChannelAnalysis, EXPERT_PROFILES.balanced);
    // Without uplinkLimitedGrid, bandSuitabilityScore should be 70 (neutral-positive)
    expect(score.bandSuitabilityScore).toBe(70);
  });

  it('should reduce coverage score with priorityZone penalty', () => {
    const grids = makeGrids(10, 10, { rssi: -90 }); // all weak
    const stats = makeStats({
      ...grids,
      coverageBins: { excellent: 10, good: 20, fair: 30, poor: 30, none: 10 },
      totalCells: 100,
      gridWidth: 10,
      gridHeight: 10,
    });
    const apMetrics = new Map();
    const pz: PriorityZone = {
      zoneId: 'pz-1',
      label: 'Office',
      x: 0, y: 0, width: 10, height: 10,
      weight: 2.0,
      targetBand: 'either',
      mustHaveCoverage: true,
    };

    const withoutPZ = computeOverallScore(stats, apMetrics, emptyChannelAnalysis, EXPERT_PROFILES.balanced, '5ghz');
    const withPZ = computeOverallScore(stats, apMetrics, emptyChannelAnalysis, EXPERT_PROFILES.balanced, '5ghz', [pz]);

    // Coverage score should be reduced with priority zone penalty
    expect(withPZ.coverageScore).toBeLessThanOrEqual(withoutPZ.coverageScore);
  });
});

// ─── findWeakZones ────────────────────────────────────────────────

describe('findWeakZones', () => {
  it('should find weak zones below poor threshold', () => {
    const grids = makeGrids(10, 10, { rssi: -50 }); // all strong
    // Create a weak patch at rows 5-9, cols 5-9 (25 cells)
    for (let r = 5; r < 10; r++) {
      for (let c = 5; c < 10; c++) {
        grids.rssiGrid[r * 10 + c] = -90;
      }
    }

    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const zones = findWeakZones(stats, '5ghz', 0, 0);
    expect(zones.length).toBe(1);
    expect(zones[0]!.cellCount).toBe(25);
    expect(zones[0]!.avgRssi).toBeCloseTo(-90);
  });

  it('should return empty for all-strong coverage', () => {
    const grids = makeGrids(10, 10, { rssi: -40 });
    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const zones = findWeakZones(stats, '5ghz');
    expect(zones.length).toBe(0);
  });

  it('should ignore small zones below minimum', () => {
    const grids = makeGrids(10, 10, { rssi: -40 });
    // Only 3 weak cells (below minimum of 5)
    grids.rssiGrid[0] = -90;
    grids.rssiGrid[1] = -90;
    grids.rssiGrid[2] = -90;

    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const zones = findWeakZones(stats, '5ghz');
    expect(zones.length).toBe(0);
  });
});

// ─── findOverlapZones ─────────────────────────────────────────────

describe('findOverlapZones', () => {
  it('should find zones with overlap >= 3 and delta < 5', () => {
    const grids = makeGrids(10, 10, { overlap: 3, delta: 3 });
    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const zones = findOverlapZones(stats, 0, 0);
    expect(zones.length).toBe(1);
    expect(zones[0]!.cellCount).toBe(100);
  });

  it('should return empty when no excessive overlap', () => {
    const grids = makeGrids(10, 10, { overlap: 1, delta: 20 });
    const stats = makeStats({
      ...grids,
      gridWidth: 10,
      gridHeight: 10,
      totalCells: 100,
    });

    const zones = findOverlapZones(stats);
    expect(zones.length).toBe(0);
  });
});

// ─── findLowValueAPs ─────────────────────────────────────────────

describe('findLowValueAPs', () => {
  it('should detect APs with low primary coverage', () => {
    const apMetrics = new Map([
      ['ap-0', {
        apId: 'ap-0',
        primaryCoverageCells: 90,
        primaryCoverageRatio: 0.9,
        overlapCells: 0,
        avgDeltaInPrimary: 20,
        peakRssi: -30,
        secondBestCoverageCells: 0,
        channelConflictScore: 0,
      }],
      ['ap-1', {
        apId: 'ap-1',
        primaryCoverageCells: 3,
        primaryCoverageRatio: 0.03,
        overlapCells: 0,
        avgDeltaInPrimary: 5,
        peakRssi: -70,
        secondBestCoverageCells: 0,
        channelConflictScore: 0,
      }],
    ]);

    const lowValue = findLowValueAPs(apMetrics);
    expect(lowValue).toContain('ap-1');
    expect(lowValue).not.toContain('ap-0');
  });

  it('should return empty when all APs have good coverage', () => {
    const apMetrics = new Map([
      ['ap-0', {
        apId: 'ap-0',
        primaryCoverageCells: 50,
        primaryCoverageRatio: 0.5,
        overlapCells: 0,
        avgDeltaInPrimary: 15,
        peakRssi: -35,
        secondBestCoverageCells: 0,
        channelConflictScore: 0,
      }],
    ]);

    const lowValue = findLowValueAPs(apMetrics);
    expect(lowValue.length).toBe(0);
  });
});
