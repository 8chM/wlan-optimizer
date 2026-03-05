/**
 * Unit tests for channel-analysis.ts (Phase 13a)
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeChannelConflicts,
  getRecommendedChannels,
  ALLOWED_CHANNELS,
  type AnalysisBand,
} from '../channel-analysis';
import type { AccessPointResponse } from '$lib/api/invoke';

function makeMockAp(overrides: Partial<AccessPointResponse> = {}): AccessPointResponse {
  return {
    id: 'ap-1',
    floor_id: 'floor-1',
    ap_model_id: 'model-1',
    label: 'AP-1',
    x: 5.0,
    y: 5.0,
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
    ap_model: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as AccessPointResponse;
}

describe('analyzeChannelConflicts', () => {
  it('returns no conflicts for a single AP', () => {
    const aps = [makeMockAp()];
    const result = analyzeChannelConflicts(aps, '2.4ghz');

    expect(result.conflicts).toHaveLength(0);
    expect(result.apSummaries).toHaveLength(1);
  });

  it('detects co-channel interference on same channel, nearby APs', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_24ghz: 6 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5, channel_24ghz: 6 }), // 3m away, same channel
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]!.type).toBe('co-channel');
    expect(result.conflicts[0]!.score).toBeGreaterThan(0);
  });

  it('detects adjacent channel interference on 2.4 GHz', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_24ghz: 1 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5, channel_24ghz: 3 }), // channel diff = 2
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');

    const adjacentConflicts = result.conflicts.filter((c) => c.type === 'adjacent-channel');
    expect(adjacentConflicts.length).toBeGreaterThan(0);
  });

  it('no adjacent interference for channels 1 and 11 (diff > 4)', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_24ghz: 1 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5, channel_24ghz: 11 }), // diff = 10
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');

    expect(result.conflicts).toHaveLength(0);
  });

  it('no conflict for APs far apart', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 0, y: 0, channel_24ghz: 6 }),
      makeMockAp({ id: 'ap-2', x: 100, y: 100, channel_24ghz: 6 }), // very far
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');
    expect(result.conflicts).toHaveLength(0);
  });

  it('filters disabled APs', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', enabled: true, channel_24ghz: 6, x: 5, y: 5 }),
      makeMockAp({ id: 'ap-2', enabled: false, channel_24ghz: 6, x: 8, y: 5 }),
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');
    expect(result.conflicts).toHaveLength(0);
  });

  it('handles APs without channel assignment', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', channel_24ghz: 6, x: 5, y: 5 }),
      makeMockAp({ id: 'ap-2', channel_24ghz: null, x: 8, y: 5 }),
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');
    expect(result.conflicts).toHaveLength(0);
  });

  it('scores closer APs higher', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_5ghz: 36 }),
      makeMockAp({ id: 'ap-2', x: 6, y: 5, channel_5ghz: 36 }), // 1m away
      makeMockAp({ id: 'ap-3', x: 15, y: 5, channel_5ghz: 36 }), // 10m away
    ];
    const result = analyzeChannelConflicts(aps, '5ghz');

    const conflict12 = result.conflicts.find(
      (c) => (c.ap1Id === 'ap-1' && c.ap2Id === 'ap-2') || (c.ap1Id === 'ap-2' && c.ap2Id === 'ap-1'),
    );
    const conflict13 = result.conflicts.find(
      (c) => (c.ap1Id === 'ap-1' && c.ap2Id === 'ap-3') || (c.ap1Id === 'ap-3' && c.ap2Id === 'ap-1'),
    );

    if (conflict12 && conflict13) {
      expect(conflict12.score).toBeGreaterThan(conflict13.score);
    }
  });

  it('builds correct AP summaries', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', label: 'Office', x: 5, y: 5, channel_24ghz: 6 }),
      makeMockAp({ id: 'ap-2', label: 'Kitchen', x: 8, y: 5, channel_24ghz: 6 }),
    ];
    const result = analyzeChannelConflicts(aps, '2.4ghz');

    expect(result.apSummaries).toHaveLength(2);
    expect(result.apSummaries[0]!.label).toBe('Office');
    expect(result.apSummaries[0]!.totalConflicts).toBeGreaterThan(0);
  });
});

describe('getRecommendedChannels', () => {
  it('returns up to 3 channels for 2.4 GHz', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_24ghz: 6 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5, channel_24ghz: 6 }),
    ];
    const recommended = getRecommendedChannels('ap-1', aps, '2.4ghz');

    expect(recommended.length).toBeLessThanOrEqual(3);
    expect(recommended.length).toBeGreaterThan(0);
    // Should recommend a channel different from 6
    expect(recommended[0]).not.toBe(6);
  });

  it('returns up to 3 channels for 5 GHz', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_5ghz: 36 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5, channel_5ghz: 36 }),
    ];
    const recommended = getRecommendedChannels('ap-1', aps, '5ghz');

    expect(recommended.length).toBeLessThanOrEqual(3);
    expect(recommended.length).toBeGreaterThan(0);
  });

  it('handles unknown AP ID gracefully', () => {
    const aps = [makeMockAp()];
    const recommended = getRecommendedChannels('nonexistent', aps, '2.4ghz');
    expect(recommended.length).toBeGreaterThan(0);
  });

  it('should only recommend non-DFS channels for 5 GHz', () => {
    const aps = [
      makeMockAp({ id: 'ap-1', x: 5, y: 5, channel_5ghz: 36 }),
      makeMockAp({ id: 'ap-2', x: 8, y: 5, channel_5ghz: 36 }),
    ];
    const recommended = getRecommendedChannels('ap-1', aps, '5ghz');

    for (const ch of recommended) {
      expect(ALLOWED_CHANNELS['5ghz']).toContain(ch);
    }
  });

  it('should have correct ALLOWED_CHANNELS pools', () => {
    expect(ALLOWED_CHANNELS['2.4ghz']).toEqual([1, 6, 11]);
    expect(ALLOWED_CHANNELS['5ghz']).toEqual([36, 40, 44, 48]);
    // No DFS channels (52-144) and no UNII-3 (149-165)
    for (const ch of ALLOWED_CHANNELS['5ghz']) {
      expect(ch).toBeLessThan(52);
    }
  });
});
