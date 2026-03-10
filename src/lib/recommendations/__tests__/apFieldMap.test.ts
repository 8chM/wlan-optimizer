import { describe, it, expect } from 'vitest';
import {
  mapSuggestedChangeToApUpdate,
  mapSuggestedChangeToOverrides,
  verifyApplyResult,
  type SuggestedParameter,
} from '../apFieldMap';
import type { AccessPointResponse } from '$lib/api/invoke';

describe('mapSuggestedChangeToApUpdate', () => {
  it('maps tx_power_24ghz to tx_power_24ghz_dbm', () => {
    expect(mapSuggestedChangeToApUpdate('tx_power_24ghz', 20)).toEqual({ tx_power_24ghz_dbm: 20 });
  });

  it('maps tx_power_5ghz to tx_power_5ghz_dbm', () => {
    expect(mapSuggestedChangeToApUpdate('tx_power_5ghz', 23)).toEqual({ tx_power_5ghz_dbm: 23 });
  });

  it('maps tx_power_6ghz to tx_power_6ghz_dbm', () => {
    expect(mapSuggestedChangeToApUpdate('tx_power_6ghz', 26)).toEqual({ tx_power_6ghz_dbm: 26 });
  });

  it('maps channel_24ghz to channel_24ghz', () => {
    expect(mapSuggestedChangeToApUpdate('channel_24ghz', 6)).toEqual({ channel_24ghz: 6 });
  });

  it('maps channel_5ghz to channel_5ghz', () => {
    expect(mapSuggestedChangeToApUpdate('channel_5ghz', 36)).toEqual({ channel_5ghz: 36 });
  });

  it('maps channel_6ghz to channel_6ghz', () => {
    expect(mapSuggestedChangeToApUpdate('channel_6ghz', 1)).toEqual({ channel_6ghz: 1 });
  });

  it('maps enabled "false" to { enabled: false }', () => {
    expect(mapSuggestedChangeToApUpdate('enabled', 'false')).toEqual({ enabled: false });
  });

  it('maps enabled "true" to { enabled: true }', () => {
    expect(mapSuggestedChangeToApUpdate('enabled', 'true')).toEqual({ enabled: true });
  });

  it('maps channel_width to string', () => {
    expect(mapSuggestedChangeToApUpdate('channel_width', '40')).toEqual({ channel_width: '40' });
  });

  it('maps position "(3.5, 7.2)" to { x, y }', () => {
    expect(mapSuggestedChangeToApUpdate('position', '(3.5, 7.2)')).toEqual({ x: 3.5, y: 7.2 });
  });

  it('returns {} for invalid position string', () => {
    expect(mapSuggestedChangeToApUpdate('position', 'invalid')).toEqual({});
  });

  it('maps orientationDeg to orientation_deg', () => {
    expect(mapSuggestedChangeToApUpdate('orientationDeg', 90)).toEqual({ orientation_deg: 90 });
  });

  it('maps mounting to mounting', () => {
    expect(mapSuggestedChangeToApUpdate('mounting', 'wall')).toEqual({ mounting: 'wall' });
  });

  it('returns {} for unknown parameter', () => {
    expect(mapSuggestedChangeToApUpdate('unknownParam', 42)).toEqual({});
  });
});

describe('mapSuggestedChangeToOverrides', () => {
  it('maps tx_power_5ghz to single override', () => {
    expect(mapSuggestedChangeToOverrides('tx_power_5ghz', 20)).toEqual([
      { key: 'tx_power_5ghz', value: '20' },
    ]);
  });

  it('maps channel_24ghz to single override', () => {
    expect(mapSuggestedChangeToOverrides('channel_24ghz', 11)).toEqual([
      { key: 'channel_24ghz', value: '11' },
    ]);
  });

  it('maps position to position_x + position_y overrides', () => {
    expect(mapSuggestedChangeToOverrides('position', '(5.0, 3.0)')).toEqual([
      { key: 'position_x', value: '5' },
      { key: 'position_y', value: '3' },
    ]);
  });

  it('maps orientationDeg to orientationDeg override', () => {
    expect(mapSuggestedChangeToOverrides('orientationDeg', 180)).toEqual([
      { key: 'orientationDeg', value: '180' },
    ]);
  });

  it('maps mounting to mounting override', () => {
    expect(mapSuggestedChangeToOverrides('mounting', 'ceiling')).toEqual([
      { key: 'mounting', value: 'ceiling' },
    ]);
  });

  it('maps enabled to enabled override', () => {
    expect(mapSuggestedChangeToOverrides('enabled', 'false')).toEqual([
      { key: 'enabled', value: 'false' },
    ]);
  });

  it('returns [] for unknown parameter', () => {
    expect(mapSuggestedChangeToOverrides('unknownParam', 42)).toEqual([]);
  });

  it('returns [] for invalid position', () => {
    expect(mapSuggestedChangeToOverrides('position', 'bad')).toEqual([]);
  });
});

describe('Apply/Preview consistency', () => {
  const ALL_PARAMS: SuggestedParameter[] = [
    'tx_power_24ghz', 'tx_power_5ghz', 'tx_power_6ghz',
    'channel_24ghz', 'channel_5ghz', 'channel_6ghz',
    'channel_width', 'enabled',
    'position', 'orientationDeg', 'mounting',
  ];

  const TEST_VALUES: Record<SuggestedParameter, string | number> = {
    tx_power_24ghz: 20,
    tx_power_5ghz: 23,
    tx_power_6ghz: 26,
    channel_24ghz: 6,
    channel_5ghz: 36,
    channel_6ghz: 1,
    channel_width: '40',
    enabled: 'true',
    position: '(4.0, 5.0)',
    orientationDeg: 90,
    mounting: 'wall',
  };

  for (const param of ALL_PARAMS) {
    it(`${param}: both toApUpdate and toOverrides produce non-empty results`, () => {
      const value = TEST_VALUES[param];
      const apUpdate = mapSuggestedChangeToApUpdate(param, value);
      const overrides = mapSuggestedChangeToOverrides(param, value);
      expect(Object.keys(apUpdate).length).toBeGreaterThan(0);
      expect(overrides.length).toBeGreaterThan(0);
    });
  }
});

// ─── Apply Verification Tests ────────────────────────────────────

/** Minimal AP stub for verification tests */
function makeApStub(overrides: Partial<AccessPointResponse> = {}): AccessPointResponse {
  return {
    id: 'ap-1',
    floor_id: 'floor-1',
    ap_model_id: null,
    label: null,
    x: 5,
    y: 5,
    height_m: 2.5,
    mounting: 'ceiling',
    tx_power_24ghz_dbm: 20,
    tx_power_5ghz_dbm: 23,
    tx_power_6ghz_dbm: null,
    channel_24ghz: 6,
    channel_5ghz: 36,
    channel_6ghz: null,
    channel_width: '80',
    band_steering_enabled: false,
    ip_address: null,
    ssid: null,
    enabled: true,
    orientation_deg: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ap_model: null,
    ...overrides,
  };
}

describe('verifyApplyResult', () => {
  it('V1: returns verified when DB matches tx_power_5ghz', () => {
    const ap = makeApStub({ tx_power_5ghz_dbm: 20 });
    const result = verifyApplyResult('tx_power_5ghz', 20, ap);
    expect(result.status).toBe('verified');
    expect(result.checkedFields).toEqual(['tx_power_5ghz_dbm']);
    expect(result.mismatchedFields).toBeUndefined();
    expect(result.hardwareVerified).toBe(false);
  });

  it('V2: returns failed when DB does not match tx_power_5ghz', () => {
    const ap = makeApStub({ tx_power_5ghz_dbm: 23 }); // still old value
    const result = verifyApplyResult('tx_power_5ghz', 20, ap);
    expect(result.status).toBe('failed');
    expect(result.mismatchedFields).toContain('tx_power_5ghz_dbm');
  });

  it('V3: returns verified for channel change', () => {
    const ap = makeApStub({ channel_5ghz: 44 });
    const result = verifyApplyResult('channel_5ghz', 44, ap);
    expect(result.status).toBe('verified');
    expect(result.checkedFields).toEqual(['channel_5ghz']);
  });

  it('V4: returns verified for enabled=false (boolean)', () => {
    const ap = makeApStub({ enabled: false });
    const result = verifyApplyResult('enabled', 'false', ap);
    expect(result.status).toBe('verified');
  });

  it('V5: returns failed for enabled mismatch', () => {
    const ap = makeApStub({ enabled: true });
    const result = verifyApplyResult('enabled', 'false', ap);
    expect(result.status).toBe('failed');
  });

  it('V6: returns verified for channel_width string match', () => {
    const ap = makeApStub({ channel_width: '40' });
    const result = verifyApplyResult('channel_width', '40', ap);
    expect(result.status).toBe('verified');
  });

  it('V7: returns verified for position match', () => {
    const ap = makeApStub({ x: 3.5, y: 7.2 });
    const result = verifyApplyResult('position', '(3.5, 7.2)', ap);
    expect(result.status).toBe('verified');
    expect(result.checkedFields).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('V8: returns unverified for unknown parameter', () => {
    const ap = makeApStub();
    const result = verifyApplyResult('unknownParam', 42, ap);
    expect(result.status).toBe('unverified');
    expect(result.checkedFields).toEqual([]);
  });

  it('V9: hardwareVerified is always false', () => {
    const ap = makeApStub({ tx_power_5ghz_dbm: 20 });
    const result = verifyApplyResult('tx_power_5ghz', 20, ap);
    expect(result.hardwareVerified).toBe(false);
  });
});
