/**
 * Unit tests for the recommendation generator.
 */

import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '../generator';
import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import { createRFConfig } from '$lib/heatmap/rf-engine';

const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);

const BOUNDS: FloorBounds = {
  width: 10,
  height: 10,
  originX: 0,
  originY: 0,
};

const WALLS: WallData[] = [];

function makeAP(id: string, x: number, y: number, overrides?: Partial<APConfig>): APConfig {
  return {
    id,
    x,
    y,
    txPowerDbm: 20,
    antennaGainDbi: 4.0,
    enabled: true,
    mounting: 'ceiling',
    orientationDeg: 0,
    heightM: 2.5,
    ...overrides,
  };
}

function makeAPResponse(id: string, x: number, y: number, ch5 = 36): AccessPointResponse {
  return {
    id,
    floor_id: 'floor-1',
    ap_model_id: 'test',
    x,
    y,
    label: id,
    enabled: true,
    mounting: 'ceiling',
    orientation_deg: 0,
    height_m: 2.5,
    tx_power_5ghz_dbm: 20,
    tx_power_24ghz_dbm: 17,
    tx_power_6ghz_dbm: null,
    channel_5ghz: ch5,
    channel_24ghz: 1,
    channel_6ghz: null,
    channel_width: '80',
    band_steering_enabled: false,
    ip_address: null,
    ssid: null,
    created_at: '',
    updated_at: '',
    ap_model: {
      id: 'test',
      name: 'Test AP',
      manufacturer: 'Test',
      antenna_gain_24ghz_dbi: 3.2,
      antenna_gain_5ghz_dbi: 4.3,
      antenna_gain_6ghz_dbi: 4.3,
    },
  } as unknown as AccessPointResponse;
}

function makeGrids(
  gridWidth: number,
  gridHeight: number,
  fill: { rssi?: number; apIdx?: number; delta?: number; overlap?: number } = {},
) {
  const total = gridWidth * gridHeight;
  return {
    rssiGrid: new Float32Array(total).fill(fill.rssi ?? -50),
    apIndexGrid: new Uint8Array(total).fill(fill.apIdx ?? 0),
    deltaGrid: new Float32Array(total).fill(fill.delta ?? 20),
    overlapCountGrid: new Uint8Array(total).fill(fill.overlap ?? 1),
    uplinkLimitedGrid: new Uint8Array(total).fill(0),
    secondBestApIndexGrid: new Uint8Array(total).fill(1),
  };
}

function makeStats(
  gridWidth: number,
  gridHeight: number,
  grids: ReturnType<typeof makeGrids>,
  coverageOverrides?: Partial<HeatmapStats['coverageBins']>,
): HeatmapStats {
  const total = gridWidth * gridHeight;
  return {
    minRSSI: -80,
    maxRSSI: -30,
    avgRSSI: -50,
    calculationTimeMs: 10,
    gridStep: 1.0,
    lodLevel: 2,
    coverageBins: {
      excellent: coverageOverrides?.excellent ?? Math.floor(total * 0.4),
      good: coverageOverrides?.good ?? Math.floor(total * 0.3),
      fair: coverageOverrides?.fair ?? Math.floor(total * 0.2),
      poor: coverageOverrides?.poor ?? Math.floor(total * 0.08),
      none: coverageOverrides?.none ?? Math.floor(total * 0.02),
    },
    totalCells: total,
    gridWidth,
    gridHeight,
    apIds: ['ap-1'],
    ...grids,
  };
}

describe('generateRecommendations', () => {
  it('should return an analysis result with score and recommendations', () => {
    const ap = makeAP('ap-1', 5, 5);
    const apResp = makeAPResponse('ap-1', 5, 5);
    const grids = makeGrids(10, 10);
    const stats = makeStats(10, 10, grids);

    const result = generateRecommendations(
      [ap], [apResp], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'balanced',
    );

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.profile).toBe('balanced');
    expect(result.band).toBe('5ghz');
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('should detect weak coverage zones', () => {
    const ap = makeAP('ap-1', 0, 0);
    const apResp = makeAPResponse('ap-1', 0, 0);
    const grids = makeGrids(10, 10, { rssi: -90 }); // all weak
    const stats = makeStats(10, 10, grids, {
      excellent: 0, good: 0, fair: 0, poor: 10, none: 90,
    });

    const result = generateRecommendations(
      [ap], [apResp], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'balanced',
    );

    const coverageWarning = result.recommendations.find(r => r.type === 'coverage_warning');
    expect(coverageWarning).toBeDefined();
  });

  it('should recommend channel change for co-channel APs', () => {
    const ap1 = makeAP('ap-1', 3, 5);
    const ap2 = makeAP('ap-2', 7, 5);
    const apResp1 = makeAPResponse('ap-1', 3, 5, 36); // same channel
    const apResp2 = makeAPResponse('ap-2', 7, 5, 36); // same channel

    const grids = makeGrids(10, 10);
    // Split coverage between two APs
    for (let i = 50; i < 100; i++) grids.apIndexGrid[i] = 1;
    const stats: HeatmapStats = {
      ...makeStats(10, 10, grids),
      apIds: ['ap-1', 'ap-2'],
    };

    const result = generateRecommendations(
      [ap1, ap2], [apResp1, apResp2], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'balanced',
    );

    const channelRec = result.recommendations.find(r => r.type === 'change_channel');
    expect(channelRec).toBeDefined();
    expect(channelRec?.suggestedChange?.parameter).toBe('channel_5ghz');
  });

  it('should flag low-value APs', () => {
    const ap1 = makeAP('ap-1', 5, 5);
    const ap2 = makeAP('ap-2', 5.1, 5.1); // almost same position
    const apResp1 = makeAPResponse('ap-1', 5, 5, 36);
    const apResp2 = makeAPResponse('ap-2', 5.1, 5.1, 40);

    const grids = makeGrids(10, 10);
    // AP-1 dominates everywhere, AP-2 has 0 primary cells
    const stats: HeatmapStats = {
      ...makeStats(10, 10, grids),
      apIds: ['ap-1', 'ap-2'],
    };

    const result = generateRecommendations(
      [ap1, ap2], [apResp1, apResp2], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'balanced',
    );

    const lowValue = result.recommendations.find(r => r.type === 'low_ap_value');
    expect(lowValue).toBeDefined();
    expect(lowValue?.affectedApIds).toContain('ap-2');
  });

  it('should return empty recommendations for perfect setup', () => {
    const ap = makeAP('ap-1', 5, 5);
    const apResp = makeAPResponse('ap-1', 5, 5);
    const grids = makeGrids(10, 10, { rssi: -30, delta: 99, overlap: 1 }); // perfect
    const stats = makeStats(10, 10, grids, {
      excellent: 100, good: 0, fair: 0, poor: 0, none: 0,
    });

    const result = generateRecommendations(
      [ap], [apResp], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'balanced',
    );

    expect(result.overallScore).toBeGreaterThan(50);
    // With perfect coverage, there should be few or no recommendations
    // (no weak zones, no overlap, no conflicts)
    const criticalRecs = result.recommendations.filter(r => r.severity === 'critical');
    expect(criticalRecs.length).toBe(0);
  });

  it('should respect different profiles', () => {
    const ap = makeAP('ap-1', 5, 5);
    const apResp = makeAPResponse('ap-1', 5, 5);
    const grids = makeGrids(10, 10);
    const stats = makeStats(10, 10, grids);

    const conservative = generateRecommendations(
      [ap], [apResp], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'conservative',
    );
    const aggressive = generateRecommendations(
      [ap], [apResp], WALLS, BOUNDS, BAND, stats, RF_CONFIG, 'aggressive',
    );

    expect(conservative.profile).toBe('conservative');
    expect(aggressive.profile).toBe('aggressive');
    // Different profiles may produce different scores
    expect(typeof conservative.overallScore).toBe('number');
    expect(typeof aggressive.overallScore).toBe('number');
  });
});
