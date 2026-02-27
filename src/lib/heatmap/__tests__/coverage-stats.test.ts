/**
 * Unit tests for coverage-stats.ts (Phase 12c)
 */

import { describe, it, expect } from 'vitest';
import {
  classifyRSSI,
  calculateCoverageFromBins,
  estimateCoverageFromStats,
  type CoverageBins,
} from '../coverage-stats';

describe('classifyRSSI', () => {
  it('classifies excellent signal (>= -50)', () => {
    expect(classifyRSSI(-30)).toBe('excellent');
    expect(classifyRSSI(-50)).toBe('excellent');
  });

  it('classifies good signal (>= -65, < -50)', () => {
    expect(classifyRSSI(-51)).toBe('good');
    expect(classifyRSSI(-65)).toBe('good');
  });

  it('classifies fair signal (>= -75, < -65)', () => {
    expect(classifyRSSI(-66)).toBe('fair');
    expect(classifyRSSI(-75)).toBe('fair');
  });

  it('classifies poor signal (>= -85, < -75)', () => {
    expect(classifyRSSI(-76)).toBe('poor');
    expect(classifyRSSI(-85)).toBe('poor');
  });

  it('classifies no signal (< -85)', () => {
    expect(classifyRSSI(-86)).toBe('none');
    expect(classifyRSSI(-100)).toBe('none');
  });
});

describe('calculateCoverageFromBins', () => {
  it('calculates correct coverage percentage', () => {
    const bins: CoverageBins = {
      excellent: 20,
      good: 30,
      fair: 25,
      poor: 15,
      none: 10,
    };
    const result = calculateCoverageFromBins(bins, 100);

    // Coverage = excellent + good + fair = 20 + 30 + 25 = 75%
    expect(result.coveragePercent).toBe(75);
    expect(result.totalCells).toBe(100);
  });

  it('calculates correct percentages', () => {
    const bins: CoverageBins = {
      excellent: 10,
      good: 20,
      fair: 30,
      poor: 25,
      none: 15,
    };
    const result = calculateCoverageFromBins(bins, 100);

    expect(result.percentages.excellent).toBe(10);
    expect(result.percentages.good).toBe(20);
    expect(result.percentages.fair).toBe(30);
    expect(result.percentages.poor).toBe(25);
    expect(result.percentages.none).toBe(15);
  });

  it('handles zero total cells', () => {
    const bins: CoverageBins = { excellent: 0, good: 0, fair: 0, poor: 0, none: 0 };
    const result = calculateCoverageFromBins(bins, 0);

    expect(result.coveragePercent).toBe(0);
    expect(result.percentages.excellent).toBe(0);
  });

  it('handles 100% coverage', () => {
    const bins: CoverageBins = { excellent: 50, good: 30, fair: 20, poor: 0, none: 0 };
    const result = calculateCoverageFromBins(bins, 100);
    expect(result.coveragePercent).toBe(100);
  });

  it('handles 0% coverage', () => {
    const bins: CoverageBins = { excellent: 0, good: 0, fair: 0, poor: 40, none: 60 };
    const result = calculateCoverageFromBins(bins, 100);
    expect(result.coveragePercent).toBe(0);
  });
});

describe('estimateCoverageFromStats', () => {
  it('estimates high coverage for excellent average', () => {
    const result = estimateCoverageFromStats(-100, -30, -45);
    expect(result.coveragePercent).toBeGreaterThan(80);
  });

  it('estimates medium coverage for good average', () => {
    const result = estimateCoverageFromStats(-100, -40, -60);
    expect(result.coveragePercent).toBeGreaterThan(50);
    expect(result.coveragePercent).toBeLessThan(100);
  });

  it('estimates low coverage for poor average', () => {
    const result = estimateCoverageFromStats(-100, -70, -80);
    expect(result.coveragePercent).toBeLessThan(30);
  });

  it('estimates very low coverage for very poor average', () => {
    const result = estimateCoverageFromStats(-100, -85, -95);
    expect(result.coveragePercent).toBeLessThan(10);
  });

  it('returns valid percentage structure', () => {
    const result = estimateCoverageFromStats(-95, -40, -65);
    const total = result.percentages.excellent + result.percentages.good +
      result.percentages.fair + result.percentages.poor + result.percentages.none;
    expect(total).toBeCloseTo(100, 1);
  });
});
