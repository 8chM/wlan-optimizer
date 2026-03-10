/**
 * Tests for measurement-export.ts (Phase 29a)
 */

import { describe, it, expect } from 'vitest';
import { exportMeasurementsToJson, type MeasurementExport } from '$lib/utils/measurement-export';
import type {
  MeasurementRunResponse,
  MeasurementPointResponse,
  MeasurementResponse,
} from '$lib/api/invoke';

function makeRun(id: string): MeasurementRunResponse {
  return {
    id,
    floor_id: 'floor-1',
    run_number: 1,
    run_type: 'calibration',
    iperf_server_ip: null,
    status: 'completed',
    started_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T01:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  };
}

function makePoint(id: string): MeasurementPointResponse {
  return {
    id,
    floor_id: 'floor-1',
    label: 'P1',
    x: 5.0,
    y: 3.0,
    auto_generated: false,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function makeMeasurement(id: string, runId: string): MeasurementResponse {
  return {
    id,
    measurement_point_id: 'point-1',
    measurement_run_id: runId,
    timestamp: '2026-01-01T00:00:00Z',
    frequency_band: '5ghz',
    rssi_dbm: -55,
    noise_dbm: -95,
    snr_db: 40,
    connected_bssid: 'aa:bb:cc:dd:ee:ff',
    connected_ssid: 'TestNet',
    frequency_mhz: 5180,
    tx_rate_mbps: 300,
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
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('exportMeasurementsToJson', () => {
  it('ME1: produces valid JSON', () => {
    const json = exportMeasurementsToJson(
      [makeRun('r1')],
      [makePoint('p1')],
      [makeMeasurement('m1', 'r1')],
      'floor-1',
    );

    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.points).toHaveLength(1);
    expect(parsed.measurements).toHaveLength(1);
  });

  it('ME2: contains _meta with version and floorId', () => {
    const json = exportMeasurementsToJson([], [], [], 'floor-42');
    const parsed: MeasurementExport = JSON.parse(json);

    expect(parsed._meta.version).toBe(1);
    expect(parsed._meta.floorId).toBe('floor-42');
    expect(parsed._meta.exportedAt).toBeDefined();
    // Verify exportedAt is a valid ISO date
    expect(new Date(parsed._meta.exportedAt).toISOString()).toBe(parsed._meta.exportedAt);
  });

  it('ME3: empty measurements produce empty arrays', () => {
    const json = exportMeasurementsToJson([], [], [], 'floor-1');
    const parsed: MeasurementExport = JSON.parse(json);

    expect(parsed.runs).toEqual([]);
    expect(parsed.points).toEqual([]);
    expect(parsed.measurements).toEqual([]);
  });

  it('ME4: round-trip preserves data', () => {
    const runs = [makeRun('r1'), makeRun('r2')];
    const points = [makePoint('p1')];
    const measurements = [makeMeasurement('m1', 'r1'), makeMeasurement('m2', 'r2')];

    const json = exportMeasurementsToJson(runs, points, measurements, 'floor-1');
    const parsed: MeasurementExport = JSON.parse(json);

    expect(parsed.runs).toEqual(runs);
    expect(parsed.points).toEqual(points);
    expect(parsed.measurements).toEqual(measurements);
  });
});
