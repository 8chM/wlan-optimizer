/**
 * Unit tests for heatmap/convert.ts (Phase 12b)
 */

import { describe, it, expect } from 'vitest';
import { convertApsToConfig, convertWallsToData } from '../convert';
import type { AccessPointResponse, WallResponse } from '$lib/api/invoke';

function makeMockAp(overrides: Partial<AccessPointResponse> = {}): AccessPointResponse {
  return {
    id: 'ap-1',
    floor_id: 'floor-1',
    ap_model_id: 'model-1',
    label: 'AP-1',
    x: 5.0,
    y: 3.0,
    height_m: 2.5,
    mounting: 'ceiling',
    tx_power_24ghz_dbm: 17,
    tx_power_5ghz_dbm: 20,
    tx_power_6ghz_dbm: null,
    channel_24ghz: 6,
    channel_5ghz: 36,
    channel_6ghz: null,
    channel_width: 80,
    band_steering_enabled: false,
    ip_address: null,
    ssid: null,
    enabled: true,
    ap_model: {
      id: 'model-1',
      manufacturer: 'D-Link',
      model_name: 'DAP-X2810',
      antenna_gain_24ghz_dbi: 3.5,
      antenna_gain_5ghz_dbi: 4.5,
      antenna_gain_6ghz_dbi: null,
      max_tx_power_24ghz_dbm: 23,
      max_tx_power_5ghz_dbm: 26,
      max_tx_power_6ghz_dbm: null,
      supported_channels_24ghz: '1,6,11',
      supported_channels_5ghz: '36,40,44,48',
      supported_channels_6ghz: null,
      supports_band_steering: true,
      is_custom: false,
    },
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as AccessPointResponse;
}

function makeMockWall(overrides: Partial<WallResponse> = {}): WallResponse {
  return {
    id: 'wall-1',
    floor_id: 'floor-1',
    material_id: 'mat-1',
    segments: [
      { id: 'seg-1', wall_id: 'wall-1', segment_order: 0, x1: 0, y1: 0, x2: 5, y2: 0 },
    ],
    attenuation_override_24ghz: null,
    attenuation_override_5ghz: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as WallResponse;
}

describe('convertApsToConfig', () => {
  it('converts enabled APs to APConfig for 5ghz', () => {
    const aps = [makeMockAp()];
    const result = convertApsToConfig(aps, '5ghz');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'ap-1',
      x: 5.0,
      y: 3.0,
      txPowerDbm: 20,
      antennaGainDbi: 4.5,
      enabled: true,
    });
  });

  it('converts for 2.4ghz with correct power and gain', () => {
    const aps = [makeMockAp()];
    const result = convertApsToConfig(aps, '2.4ghz');

    expect(result[0]!.txPowerDbm).toBe(17);
    expect(result[0]!.antennaGainDbi).toBe(3.5);
  });

  it('filters out disabled APs', () => {
    const aps = [makeMockAp({ enabled: false })];
    const result = convertApsToConfig(aps, '5ghz');
    expect(result).toHaveLength(0);
  });

  it('applies overrides when provided', () => {
    const aps = [makeMockAp()];
    const overrides = new Map<string, Record<string, string>>();
    overrides.set('ap-1', { tx_power_5ghz: '15' });

    const result = convertApsToConfig(aps, '5ghz', overrides);
    expect(result[0]!.txPowerDbm).toBe(15);
  });

  it('uses default when AP model is null', () => {
    const aps = [makeMockAp({ ap_model: null })];
    const result = convertApsToConfig(aps, '5ghz');
    expect(result[0]!.antennaGainDbi).toBe(4.3); // default
  });

  it('handles multiple APs', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 1, y: 1 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5 }),
    ];
    const result = convertApsToConfig(aps, '5ghz');
    expect(result).toHaveLength(2);
  });
});

describe('convertWallsToData', () => {
  it('converts walls with default attenuation for 5ghz', () => {
    const walls = [makeMockWall()];
    const result = convertWallsToData(walls, '5ghz');

    expect(result).toHaveLength(1);
    expect(result[0]!.attenuationDb).toBe(5); // default for 5ghz
    expect(result[0]!.segments).toEqual([{ x1: 0, y1: 0, x2: 5, y2: 0 }]);
  });

  it('uses override attenuation when set', () => {
    const walls = [makeMockWall({ attenuation_override_5ghz: 12 })];
    const result = convertWallsToData(walls, '5ghz');
    expect(result[0]!.attenuationDb).toBe(12);
  });

  it('uses 2.4ghz attenuation for that band', () => {
    const walls = [makeMockWall({ attenuation_override_24ghz: 8 })];
    const result = convertWallsToData(walls, '2.4ghz');
    expect(result[0]!.attenuationDb).toBe(8);
  });

  it('handles multiple segments', () => {
    const walls = [makeMockWall({
      segments: [
        { id: 'seg-1', wall_id: 'wall-1', segment_order: 0, x1: 0, y1: 0, x2: 3, y2: 0 },
        { id: 'seg-2', wall_id: 'wall-1', segment_order: 1, x1: 3, y1: 0, x2: 3, y2: 4 },
      ],
    })];
    const result = convertWallsToData(walls, '5ghz');
    expect(result[0]!.segments).toHaveLength(2);
  });
});
