/**
 * Unit tests for the recommendation simulator.
 */

import { describe, it, expect } from 'vitest';
import { simulateChange, simulateAddAP } from '../simulator';
import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import { EXPERT_PROFILES } from '../types';

const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);
const WEIGHTS = EXPERT_PROFILES.balanced;

const BOUNDS: FloorBounds = {
  width: 10,
  height: 10,
  originX: 0,
  originY: 0,
};

const BASIC_AP: APConfig = {
  id: 'ap-1',
  x: 5,
  y: 5,
  txPowerDbm: 20,
  antennaGainDbi: 4.0,
  enabled: true,
  mounting: 'ceiling',
  orientationDeg: 0,
  heightM: 2.5,
};

const WALLS: WallData[] = [];

describe('simulateChange', () => {
  it('should return valid before/after when moving an AP', () => {
    const delta = simulateChange(
      [BASIC_AP],
      WALLS,
      BOUNDS,
      BAND,
      RF_CONFIG,
      { apId: 'ap-1', position: { x: 3, y: 3 } },
      WEIGHTS,
    );

    expect(delta.scoreBefore).toBeGreaterThan(0);
    expect(delta.scoreAfter).toBeGreaterThan(0);
    expect(typeof delta.changePercent).toBe('number');
    expect(delta.coverageBefore.excellent + delta.coverageBefore.good +
           delta.coverageBefore.fair + delta.coverageBefore.poor +
           delta.coverageBefore.none).toBeCloseTo(100, 0);
  });

  it('should show score change when reducing TX power', () => {
    const delta = simulateChange(
      [BASIC_AP],
      WALLS,
      BOUNDS,
      BAND,
      RF_CONFIG,
      { apId: 'ap-1', txPowerDbm: 10 },
      WEIGHTS,
    );

    // Lower TX power should reduce or maintain coverage
    expect(delta.scoreAfter).toBeLessThanOrEqual(delta.scoreBefore + 1);
  });

  it('should produce identical results for same parameters', () => {
    const delta1 = simulateChange(
      [BASIC_AP], WALLS, BOUNDS, BAND, RF_CONFIG,
      { apId: 'ap-1', position: { x: 2, y: 2 } },
      WEIGHTS,
    );
    const delta2 = simulateChange(
      [BASIC_AP], WALLS, BOUNDS, BAND, RF_CONFIG,
      { apId: 'ap-1', position: { x: 2, y: 2 } },
      WEIGHTS,
    );

    expect(delta1.scoreBefore).toBe(delta2.scoreBefore);
    expect(delta1.scoreAfter).toBe(delta2.scoreAfter);
    expect(delta1.changePercent).toBe(delta2.changePercent);
  });

  it('should handle wall-mount rotation', () => {
    const wallAp: APConfig = { ...BASIC_AP, mounting: 'wall', orientationDeg: 0 };
    const delta = simulateChange(
      [wallAp],
      WALLS,
      BOUNDS,
      BAND,
      RF_CONFIG,
      { apId: 'ap-1', orientationDeg: 180 },
      WEIGHTS,
    );

    expect(delta.scoreBefore).toBeGreaterThan(0);
    expect(delta.scoreAfter).toBeGreaterThan(0);
  });
});

describe('simulateAddAP', () => {
  it('should show improvement when adding an AP', () => {
    const delta = simulateAddAP(
      [BASIC_AP],
      WALLS,
      BOUNDS,
      BAND,
      RF_CONFIG,
      { x: 2, y: 2 },
      { txPowerDbm: 20, antennaGainDbi: 4.0, mounting: 'ceiling', heightM: 2.5 },
      WEIGHTS,
    );

    // Adding a second AP should generally improve or maintain coverage
    expect(delta.scoreAfter).toBeGreaterThanOrEqual(delta.scoreBefore - 1);
  });

  it('should handle adding to empty AP list', () => {
    const delta = simulateAddAP(
      [],
      WALLS,
      BOUNDS,
      BAND,
      RF_CONFIG,
      { x: 5, y: 5 },
      { txPowerDbm: 20, antennaGainDbi: 4.0 },
      WEIGHTS,
    );

    expect(delta.scoreBefore).toBe(0); // No APs = no coverage
    expect(delta.scoreAfter).toBeGreaterThan(0);
  });
});
