import { describe, it, expect } from 'vitest';
import { median, computeRunComparisonStats } from '../measurement-compare';
import type { MeasurementResponse } from '$lib/api/invoke';

/** Minimal MeasurementResponse stub */
function makeMeasurement(overrides: Partial<MeasurementResponse> = {}): MeasurementResponse {
  return {
    id: `m-${Math.random().toString(36).slice(2, 7)}`,
    measurement_point_id: 'mp-1',
    measurement_run_id: 'run-1',
    timestamp: '2024-01-01T00:00:00Z',
    frequency_band: '5ghz',
    rssi_dbm: null,
    noise_dbm: null,
    snr_db: null,
    connected_bssid: null,
    connected_ssid: null,
    frequency_mhz: null,
    tx_rate_mbps: null,
    iperf_tcp_upload_bps: null,
    iperf_tcp_download_bps: null,
    iperf_tcp_retransmits: null,
    iperf_udp_throughput_bps: null,
    iperf_udp_jitter_ms: null,
    iperf_udp_lost_packets: null,
    iperf_udp_total_packets: null,
    iperf_udp_lost_percent: null,
    quality: 'good',
    raw_iperf_json: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('median', () => {
  it('MC-1: returns null for empty array', () => {
    expect(median([])).toBe(null);
  });

  it('MC-2: returns single element for array of 1', () => {
    expect(median([42])).toBe(42);
  });

  it('MC-3: returns middle for odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('MC-4: returns average of middle two for even-length array', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('MC-5: handles negative values (RSSI-like)', () => {
    expect(median([-80, -70, -60])).toBe(-70);
  });
});

describe('computeRunComparisonStats', () => {
  it('MC-6: empty measurements → all nulls/zeros', () => {
    const stats = computeRunComparisonStats([]);
    expect(stats.avgRssi).toBe(null);
    expect(stats.minRssi).toBe(null);
    expect(stats.maxRssi).toBe(null);
    expect(stats.pointCount).toBe(0);
    expect(stats.coverageExcellent).toBe(0);
    expect(stats.coverageGood).toBe(0);
    expect(stats.coverageFair).toBe(0);
    expect(stats.worst10Pct).toBe(null);
    expect(stats.medianUpload).toBe(null);
    expect(stats.medianDownload).toBe(null);
    expect(stats.roamingEvents).toBe(0);
  });

  it('MC-7: coverage bins computed correctly', () => {
    const measurements = [
      makeMeasurement({ rssi_dbm: -60 }), // counts for all 3
      makeMeasurement({ rssi_dbm: -68 }), // counts for good, fair
      makeMeasurement({ rssi_dbm: -72 }), // counts for fair only
      makeMeasurement({ rssi_dbm: -80 }), // counts for none
    ];
    const stats = computeRunComparisonStats(measurements);
    expect(stats.coverageExcellent).toBe(25);  // 1 of 4
    expect(stats.coverageGood).toBe(50);       // 2 of 4
    expect(stats.coverageFair).toBe(75);       // 3 of 4
  });

  it('MC-8: worst 10% average is deterministic', () => {
    // 10 measurements: -50, -55, -60, -65, -70, -75, -80, -85, -90, -95
    const measurements = [-50, -55, -60, -65, -70, -75, -80, -85, -90, -95].map(
      (rssi) => makeMeasurement({ rssi_dbm: rssi }),
    );
    const stats = computeRunComparisonStats(measurements);
    // worst 10% = ceil(10 * 0.1) = 1 → bottom 1 = -95
    expect(stats.worst10Pct).toBe(-95);
  });

  it('MC-9: throughput medians computed correctly', () => {
    const measurements = [
      makeMeasurement({ iperf_tcp_upload_bps: 10_000_000, iperf_tcp_download_bps: 50_000_000 }),
      makeMeasurement({ iperf_tcp_upload_bps: 20_000_000, iperf_tcp_download_bps: 30_000_000 }),
      makeMeasurement({ iperf_tcp_upload_bps: 30_000_000, iperf_tcp_download_bps: 40_000_000 }),
    ];
    const stats = computeRunComparisonStats(measurements);
    expect(stats.medianUpload).toBe(20_000_000);
    expect(stats.medianDownload).toBe(40_000_000);
  });

  it('MC-10: roaming events count BSSID transitions', () => {
    const measurements = [
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:01' }),
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:01' }),
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:02' }), // +1 roaming
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:02' }),
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:01' }), // +1 roaming
    ];
    const stats = computeRunComparisonStats(measurements);
    expect(stats.roamingEvents).toBe(2);
  });

  it('MC-11: no roaming events when all same BSSID', () => {
    const measurements = [
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:01' }),
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:01' }),
      makeMeasurement({ connected_bssid: 'AA:BB:CC:DD:EE:01' }),
    ];
    const stats = computeRunComparisonStats(measurements);
    expect(stats.roamingEvents).toBe(0);
  });

  it('MC-12: null RSSI measurements are excluded from stats', () => {
    const measurements = [
      makeMeasurement({ rssi_dbm: -60 }),
      makeMeasurement({ rssi_dbm: null }),
      makeMeasurement({ rssi_dbm: -70 }),
    ];
    const stats = computeRunComparisonStats(measurements);
    expect(stats.avgRssi).toBe(-65);
    expect(stats.pointCount).toBe(3); // All measurements counted
    // Coverage: 2 RSSI values, both >= -75
    expect(stats.coverageFair).toBe(100);
  });
});
