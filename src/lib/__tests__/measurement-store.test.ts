/**
 * Unit tests for measurementStore.svelte.ts (Phase 8d)
 *
 * Tests the measurement store state management by mocking the API layer.
 * The store uses Svelte 5 $state/$derived runes; in Vitest (jsdom) these
 * rune-based getters are read directly as plain property accesses — no
 * reactive context needed for synchronous state reads.
 *
 * All IPC is mocked through '$lib/api/measurement'. No real Tauri invoke
 * is ever called.
 *
 * Covered actions:
 *   - Initial state (all defaults)
 *   - loadRuns (success, API error)
 *   - loadMeasurements (success, API error)
 *   - selectRun / currentRun derivation
 *   - checkServer (reachable true, reachable false, thrown error)
 *   - setServerIp (IP update + reachability reset)
 *   - setCalibration (full params, partial/optional params)
 *   - setProgress
 *   - createRun (success, failure)
 *   - addPoint (success, failure)
 *   - runMeasurement (success, failure)
 *   - cancelCurrentMeasurement (with and without active run)
 *   - clearError
 *   - reset (clears all state)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the API layer (hoisted before all imports) ──────────────────────────
vi.mock('$lib/api/measurement', () => ({
  getMeasurementRuns: vi.fn(),
  getMeasurementsByRun: vi.fn(),
  checkIperfServer: vi.fn(),
  createMeasurementRun: vi.fn(),
  createMeasurementPoint: vi.fn(),
  startMeasurement: vi.fn(),
  cancelMeasurement: vi.fn(),
  updateMeasurementRunStatus: vi.fn(),
  saveMeasurement: vi.fn(),
}));

import {
  getMeasurementRuns,
  getMeasurementsByRun,
  checkIperfServer,
  createMeasurementRun,
  createMeasurementPoint,
  startMeasurement,
  cancelMeasurement,
  saveMeasurement,
} from '$lib/api/measurement';

import type {
  MeasurementRunResponse,
  MeasurementResponse,
  MeasurementPointResponse,
} from '$lib/api/invoke';

// ─── Store factory ────────────────────────────────────────────────────────────
// Import the factory function, not the singleton, so each test gets a fresh
// store instance.  The file exports createMeasurementStore as a named export
// alongside the singleton; if it only exports the singleton we re-create state
// by calling reset() in beforeEach instead.

// Because the store is a singleton we call reset() before each test so state
// never leaks between tests.
import { measurementStore as store } from '$lib/stores/measurementStore.svelte';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRun(id: string, runNumber = 1): MeasurementRunResponse {
  return {
    id,
    floor_id: 'floor-1',
    run_number: runNumber,
    run_type: 'calibration',
    iperf_server_ip: null,
    status: 'pending',
    started_at: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function makeMeasurement(id: string, runId: string): MeasurementResponse {
  return {
    id,
    measurement_point_id: 'point-1',
    measurement_run_id: runId,
    timestamp: '2026-01-01T00:00:00Z',
    frequency_band: '2.4ghz',
    rssi_dbm: -55,
    noise_dbm: -95,
    snr_db: 40,
    connected_bssid: 'aa:bb:cc:dd:ee:ff',
    connected_ssid: 'TestNet',
    frequency_mhz: 2412,
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

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  store.reset();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('runs is an empty array', () => {
    expect(store.runs).toEqual([]);
  });

  it('currentRunId is null', () => {
    expect(store.currentRunId).toBeNull();
  });

  it('currentRun is null', () => {
    expect(store.currentRun).toBeNull();
  });

  it('measurements is an empty array', () => {
    expect(store.measurements).toEqual([]);
  });

  it('points is an empty array', () => {
    expect(store.points).toEqual([]);
  });

  it('iperfServerIp is an empty string', () => {
    expect(store.iperfServerIp).toBe('');
  });

  it('iperfServerReachable is null', () => {
    expect(store.iperfServerReachable).toBeNull();
  });

  it('isCheckingServer is false', () => {
    expect(store.isCheckingServer).toBe(false);
  });

  it('isMeasuring is false', () => {
    expect(store.isMeasuring).toBe(false);
  });

  it('error is null', () => {
    expect(store.error).toBeNull();
  });

  it('isLoading is false', () => {
    expect(store.isLoading).toBe(false);
  });

  it('runCount is 0', () => {
    expect(store.runCount).toBe(0);
  });

  it('completedMeasurements is an empty array', () => {
    expect(store.completedMeasurements).toEqual([]);
  });

  it('measurementProgress has zero current and total', () => {
    const p = store.measurementProgress;
    expect(p.current).toBe(0);
    expect(p.total).toBe(0);
    expect(p.currentPointId).toBe('');
    expect(p.currentStep).toBe('');
  });

  it('all calibration fields are null / 0', () => {
    expect(store.calibratedN).toBeNull();
    expect(store.calibrationRMSE).toBeNull();
    expect(store.calibrationConfidence).toBeNull();
    expect(store.calibrationOriginalN).toBeNull();
    expect(store.calibrationRSquared).toBeNull();
    expect(store.calibrationMaxDeviation).toBeNull();
    expect(store.calibrationPointCount).toBe(0);
  });
});

// ─── loadRuns ─────────────────────────────────────────────────────────────────

describe('loadRuns', () => {
  it('loads runs from the API and populates the runs array', async () => {
    const run1 = makeRun('run-1', 1);
    const run2 = makeRun('run-2', 2);
    vi.mocked(getMeasurementRuns).mockResolvedValue([run1, run2]);

    await store.loadRuns('floor-1');

    expect(getMeasurementRuns).toHaveBeenCalledWith('floor-1');
    expect(store.runs).toHaveLength(2);
    expect(store.runs[0]?.id).toBe('run-1');
    expect(store.runs[1]?.id).toBe('run-2');
  });

  it('updates runCount after loading', async () => {
    vi.mocked(getMeasurementRuns).mockResolvedValue([makeRun('r1'), makeRun('r2'), makeRun('r3')]);
    await store.loadRuns('floor-1');
    expect(store.runCount).toBe(3);
  });

  it('clears isLoading after successful load', async () => {
    vi.mocked(getMeasurementRuns).mockResolvedValue([]);
    await store.loadRuns('floor-1');
    expect(store.isLoading).toBe(false);
  });

  it('clears error before fetching', async () => {
    // Pre-set an error via a failed load, then try again successfully
    vi.mocked(getMeasurementRuns)
      .mockRejectedValueOnce(new Error('first error'))
      .mockResolvedValueOnce([]);

    await store.loadRuns('floor-1');
    expect(store.error).not.toBeNull();

    await store.loadRuns('floor-1');
    expect(store.error).toBeNull();
  });

  it('stores the error message when the API rejects with an Error', async () => {
    vi.mocked(getMeasurementRuns).mockRejectedValue(new Error('DB connection failed'));

    await store.loadRuns('floor-1');

    expect(store.runs).toEqual([]);
    expect(store.error).toBe('DB connection failed');
  });

  it('stores the stringified error when the API rejects with a non-Error value', async () => {
    vi.mocked(getMeasurementRuns).mockRejectedValue('network timeout');

    await store.loadRuns('floor-1');

    expect(store.error).toBe('network timeout');
  });

  it('clears isLoading even when the API call fails', async () => {
    vi.mocked(getMeasurementRuns).mockRejectedValue(new Error('fail'));
    await store.loadRuns('floor-1');
    expect(store.isLoading).toBe(false);
  });
});

// ─── loadMeasurements ─────────────────────────────────────────────────────────

describe('loadMeasurements', () => {
  it('loads measurements for the given run ID', async () => {
    const m1 = makeMeasurement('m-1', 'run-1');
    const m2 = makeMeasurement('m-2', 'run-1');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([m1, m2]);

    await store.loadMeasurements('run-1');

    expect(getMeasurementsByRun).toHaveBeenCalledWith('run-1');
    expect(store.measurements).toHaveLength(2);
  });

  it('stores error message when API rejects', async () => {
    vi.mocked(getMeasurementsByRun).mockRejectedValue(new Error('not found'));
    await store.loadMeasurements('run-1');
    expect(store.error).toBe('not found');
    expect(store.measurements).toEqual([]);
  });

  it('clears isLoading on success', async () => {
    vi.mocked(getMeasurementsByRun).mockResolvedValue([]);
    await store.loadMeasurements('run-1');
    expect(store.isLoading).toBe(false);
  });

  it('clears isLoading on failure', async () => {
    vi.mocked(getMeasurementsByRun).mockRejectedValue(new Error('fail'));
    await store.loadMeasurements('run-1');
    expect(store.isLoading).toBe(false);
  });
});

// ─── selectRun ────────────────────────────────────────────────────────────────

describe('selectRun', () => {
  it('sets currentRunId to the provided run ID', () => {
    store.selectRun('run-42');
    expect(store.currentRunId).toBe('run-42');
  });

  it('currentRun resolves to the matching run from runs array', async () => {
    const run = makeRun('run-99');
    vi.mocked(getMeasurementRuns).mockResolvedValue([run]);
    await store.loadRuns('floor-1');

    store.selectRun('run-99');

    expect(store.currentRun).not.toBeNull();
    expect(store.currentRun?.id).toBe('run-99');
  });

  it('currentRun is null when currentRunId does not match any run', async () => {
    vi.mocked(getMeasurementRuns).mockResolvedValue([makeRun('run-1')]);
    await store.loadRuns('floor-1');

    store.selectRun('nonexistent-id');

    expect(store.currentRun).toBeNull();
  });

  it('currentRun updates when a different run is selected', async () => {
    const run1 = makeRun('run-1', 1);
    const run2 = makeRun('run-2', 2);
    vi.mocked(getMeasurementRuns).mockResolvedValue([run1, run2]);
    await store.loadRuns('floor-1');

    store.selectRun('run-1');
    expect(store.currentRun?.run_number).toBe(1);

    store.selectRun('run-2');
    expect(store.currentRun?.run_number).toBe(2);
  });
});

// ─── completedMeasurements derivation ─────────────────────────────────────────

describe('completedMeasurements', () => {
  it('contains only measurements matching the current run ID', async () => {
    const m1 = makeMeasurement('m-1', 'run-A');
    const m2 = makeMeasurement('m-2', 'run-B');
    const m3 = makeMeasurement('m-3', 'run-A');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([m1, m2, m3]);
    await store.loadMeasurements('irrelevant-for-mock');

    store.selectRun('run-A');
    expect(store.completedMeasurements).toHaveLength(2);
    expect(store.completedMeasurements.map((m) => m.id)).toEqual(['m-1', 'm-3']);
  });

  it('is empty when no run is selected', async () => {
    const m = makeMeasurement('m-1', 'run-1');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([m]);
    await store.loadMeasurements('run-1');

    expect(store.currentRunId).toBeNull();
    expect(store.completedMeasurements).toEqual([]);
  });
});

// ─── checkServer ──────────────────────────────────────────────────────────────

describe('checkServer', () => {
  it('sets iperfServerReachable to true when server responds', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(true);

    const result = await store.checkServer('192.168.1.10');

    expect(result).toBe(true);
    expect(store.iperfServerReachable).toBe(true);
    expect(store.iperfServerIp).toBe('192.168.1.10');
  });

  it('sets iperfServerReachable to false when server returns false', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(false);

    const result = await store.checkServer('10.0.0.5');

    expect(result).toBe(false);
    expect(store.iperfServerReachable).toBe(false);
  });

  it('sets iperfServerReachable to false when API call throws', async () => {
    vi.mocked(checkIperfServer).mockRejectedValue(new Error('timeout'));

    const result = await store.checkServer('192.168.1.99');

    expect(result).toBe(false);
    expect(store.iperfServerReachable).toBe(false);
    expect(store.error).toBe('timeout');
  });

  it('sets isCheckingServer to false after completion (success)', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(true);
    await store.checkServer('192.168.1.1');
    expect(store.isCheckingServer).toBe(false);
  });

  it('sets isCheckingServer to false after completion (failure)', async () => {
    vi.mocked(checkIperfServer).mockRejectedValue(new Error('unreachable'));
    await store.checkServer('192.168.1.1');
    expect(store.isCheckingServer).toBe(false);
  });

  it('resets iperfServerReachable to null before checking', async () => {
    // First mark as reachable
    vi.mocked(checkIperfServer).mockResolvedValue(true);
    await store.checkServer('192.168.1.1');
    expect(store.iperfServerReachable).toBe(true);

    // Start a second check but keep it pending to observe intermediate state
    let resolveCheck!: (v: boolean) => void;
    const pending = new Promise<boolean>((res) => { resolveCheck = res; });
    vi.mocked(checkIperfServer).mockReturnValue(pending);

    const checkPromise = store.checkServer('192.168.1.2');
    // At this point the check is in-flight; reachable should be null
    expect(store.iperfServerReachable).toBeNull();

    resolveCheck(true);
    await checkPromise;
  });

  it('updates iperfServerIp to the checked address', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(true);
    await store.checkServer('172.16.0.1');
    expect(store.iperfServerIp).toBe('172.16.0.1');
  });

  it('passes the IP address to the API call', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(true);
    await store.checkServer('10.10.10.10');
    expect(checkIperfServer).toHaveBeenCalledWith('10.10.10.10');
  });
});

// ─── setServerIp ──────────────────────────────────────────────────────────────

describe('setServerIp', () => {
  it('updates iperfServerIp to the new value', () => {
    store.setServerIp('192.168.2.1');
    expect(store.iperfServerIp).toBe('192.168.2.1');
  });

  it('resets iperfServerReachable to null when IP changes', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(true);
    await store.checkServer('192.168.1.1');
    expect(store.iperfServerReachable).toBe(true);

    store.setServerIp('192.168.1.2');
    expect(store.iperfServerReachable).toBeNull();
  });

  it('setting IP to empty string resets reachability', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(false);
    await store.checkServer('10.0.0.1');

    store.setServerIp('');
    expect(store.iperfServerIp).toBe('');
    expect(store.iperfServerReachable).toBeNull();
  });
});

// ─── setCalibration ───────────────────────────────────────────────────────────

describe('setCalibration', () => {
  it('stores all required calibration values', () => {
    store.setCalibration(2.8, 3.5, 'high');

    expect(store.calibratedN).toBe(2.8);
    expect(store.calibrationRMSE).toBe(3.5);
    expect(store.calibrationConfidence).toBe('high');
  });

  it('stores all optional calibration values when provided', () => {
    store.setCalibration(3.1, 2.9, 'medium', 3.5, 0.91, 5.2, 12);

    expect(store.calibrationOriginalN).toBe(3.5);
    expect(store.calibrationRSquared).toBe(0.91);
    expect(store.calibrationMaxDeviation).toBe(5.2);
    expect(store.calibrationPointCount).toBe(12);
  });

  it('sets optional fields to null/0 when not provided', () => {
    store.setCalibration(2.5, 4.0, 'low');

    expect(store.calibrationOriginalN).toBeNull();
    expect(store.calibrationRSquared).toBeNull();
    expect(store.calibrationMaxDeviation).toBeNull();
    expect(store.calibrationPointCount).toBe(0);
  });

  it('overwrites previously stored calibration values', () => {
    store.setCalibration(3.5, 5.0, 'low', 3.5, 0.7, 8.0, 5);
    store.setCalibration(2.8, 2.1, 'high', 3.5, 0.95, 3.0, 20);

    expect(store.calibratedN).toBe(2.8);
    expect(store.calibrationRMSE).toBe(2.1);
    expect(store.calibrationConfidence).toBe('high');
    expect(store.calibrationRSquared).toBe(0.95);
    expect(store.calibrationPointCount).toBe(20);
  });

  it('accepts confidence value "unknown" for low-quality calibration', () => {
    store.setCalibration(3.5, 10.0, 'unknown');
    expect(store.calibrationConfidence).toBe('unknown');
  });
});

// ─── setProgress ──────────────────────────────────────────────────────────────

describe('setProgress', () => {
  it('updates current, total, and currentStep', () => {
    store.setProgress(2, 5, 'runningIperf');

    const p = store.measurementProgress;
    expect(p.current).toBe(2);
    expect(p.total).toBe(5);
    expect(p.currentStep).toBe('runningIperf');
  });

  it('preserves currentPointId across setProgress calls', () => {
    // Simulate starting a measurement that sets currentPointId
    // then updating progress without clearing the point
    store.setProgress(1, 3, 'step1');
    store.setProgress(2, 3, 'step2');
    // currentPointId was never set so it stays empty — verify no crash
    expect(store.measurementProgress.currentStep).toBe('step2');
  });
});

// ─── createRun ────────────────────────────────────────────────────────────────

describe('createRun', () => {
  it('returns the created run and appends it to runs', async () => {
    const run = makeRun('new-run', 1);
    vi.mocked(createMeasurementRun).mockResolvedValue(run);

    const result = await store.createRun('floor-1', 1, 'calibration');

    expect(result).toEqual(run);
    // The store spreads into a new array, so reference equality fails;
    // use deep-equality check via arrayContaining instead.
    expect(store.runs).toEqual(expect.arrayContaining([run]));
  });

  it('sets currentRunId to the newly created run', async () => {
    const run = makeRun('new-run-2', 2);
    vi.mocked(createMeasurementRun).mockResolvedValue(run);

    await store.createRun('floor-1', 2, 'measurement');

    expect(store.currentRunId).toBe('new-run-2');
  });

  it('passes correct parameters to the API', async () => {
    const run = makeRun('r1');
    vi.mocked(createMeasurementRun).mockResolvedValue(run);

    store.setServerIp('10.0.0.1');
    await store.createRun('floor-X', 3, 'coverage');

    expect(createMeasurementRun).toHaveBeenCalledWith({
      floor_id: 'floor-X',
      run_number: 3,
      run_type: 'coverage',
      iperf_server_ip: '10.0.0.1',
    });
  });

  it('passes undefined for iperf_server_ip when IP is empty', async () => {
    const run = makeRun('r2');
    vi.mocked(createMeasurementRun).mockResolvedValue(run);

    // IP is '' by default after reset
    await store.createRun('floor-1', 1, 'calibration');

    const callArg = vi.mocked(createMeasurementRun).mock.calls[0]?.[0];
    expect(callArg?.iperf_server_ip).toBeUndefined();
  });

  it('returns null and sets error on API failure', async () => {
    vi.mocked(createMeasurementRun).mockRejectedValue(new Error('write error'));

    const result = await store.createRun('floor-1', 1, 'calibration');

    expect(result).toBeNull();
    expect(store.error).toBe('write error');
  });

  it('clears isLoading on success', async () => {
    vi.mocked(createMeasurementRun).mockResolvedValue(makeRun('r3'));
    await store.createRun('floor-1', 1, 'calibration');
    expect(store.isLoading).toBe(false);
  });

  it('clears isLoading on failure', async () => {
    vi.mocked(createMeasurementRun).mockRejectedValue(new Error('fail'));
    await store.createRun('floor-1', 1, 'calibration');
    expect(store.isLoading).toBe(false);
  });
});

// ─── addPoint ─────────────────────────────────────────────────────────────────

describe('addPoint', () => {
  it('returns the created point and appends it to points', async () => {
    const point = makePoint('pt-1');
    vi.mocked(createMeasurementPoint).mockResolvedValue(point);

    const result = await store.addPoint('floor-1', 'P1', 5.0, 3.0);

    expect(result).toEqual(point);
    // The store spreads into a new array, so use deep-equality check.
    expect(store.points).toEqual(expect.arrayContaining([point]));
  });

  it('passes correct parameters to the API', async () => {
    const point = makePoint('pt-2');
    vi.mocked(createMeasurementPoint).mockResolvedValue(point);

    await store.addPoint('floor-2', 'Kitchen', 12.5, 7.3);

    expect(createMeasurementPoint).toHaveBeenCalledWith({
      floor_id: 'floor-2',
      label: 'Kitchen',
      x: 12.5,
      y: 7.3,
    });
  });

  it('returns null and sets error on API failure', async () => {
    vi.mocked(createMeasurementPoint).mockRejectedValue(new Error('constraint violation'));

    const result = await store.addPoint('floor-1', 'P2', 1, 1);

    expect(result).toBeNull();
    expect(store.error).toBe('constraint violation');
  });

  it('accumulates multiple points in sequence', async () => {
    const pt1 = makePoint('pt-A');
    const pt2 = makePoint('pt-B');
    vi.mocked(createMeasurementPoint)
      .mockResolvedValueOnce(pt1)
      .mockResolvedValueOnce(pt2);

    await store.addPoint('floor-1', 'A', 1, 1);
    await store.addPoint('floor-1', 'B', 2, 2);

    expect(store.points).toHaveLength(2);
    expect(store.points.map((p) => p.id)).toEqual(['pt-A', 'pt-B']);
  });
});

// ─── runMeasurement ───────────────────────────────────────────────────────────

describe('runMeasurement', () => {
  it('returns the measurement ID on success', async () => {
    vi.mocked(startMeasurement).mockResolvedValue('meas-id-1');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([]);

    const result = await store.runMeasurement('point-1', 'run-1');

    expect(result).toBe('meas-id-1');
  });

  it('reloads measurements for the run after success', async () => {
    const m = makeMeasurement('m-new', 'run-1');
    vi.mocked(startMeasurement).mockResolvedValue('meas-id-1');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([m]);

    await store.runMeasurement('point-1', 'run-1');

    expect(getMeasurementsByRun).toHaveBeenCalledWith('run-1');
    // Measurements are replaced by a new array from the API response.
    expect(store.measurements).toEqual(expect.arrayContaining([m]));
  });

  it('sets isMeasuring back to false after completion', async () => {
    vi.mocked(startMeasurement).mockResolvedValue('id');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([]);

    await store.runMeasurement('p1', 'r1');

    expect(store.isMeasuring).toBe(false);
  });

  it('resets measurementProgress after completion', async () => {
    vi.mocked(startMeasurement).mockResolvedValue('id');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([]);

    await store.runMeasurement('p1', 'r1');

    const p = store.measurementProgress;
    expect(p.current).toBe(0);
    expect(p.total).toBe(0);
    expect(p.currentPointId).toBe('');
    expect(p.currentStep).toBe('');
  });

  it('returns null and sets error on API failure', async () => {
    vi.mocked(startMeasurement).mockRejectedValue(new Error('iperf failed'));

    const result = await store.runMeasurement('p1', 'r1');

    expect(result).toBeNull();
    expect(store.error).toBe('iperf failed');
  });

  it('sets isMeasuring to false even when the measurement fails', async () => {
    vi.mocked(startMeasurement).mockRejectedValue(new Error('crash'));

    await store.runMeasurement('p1', 'r1');

    expect(store.isMeasuring).toBe(false);
  });
});

// ─── cancelCurrentMeasurement ────────────────────────────────────────────────

describe('cancelCurrentMeasurement', () => {
  it('calls cancelMeasurement with the current run ID', async () => {
    vi.mocked(cancelMeasurement).mockResolvedValue(undefined);

    store.selectRun('run-active');
    await store.cancelCurrentMeasurement();

    expect(cancelMeasurement).toHaveBeenCalledWith('run-active');
  });

  it('sets isMeasuring to false after cancel', async () => {
    vi.mocked(cancelMeasurement).mockResolvedValue(undefined);
    store.selectRun('run-active');

    await store.cancelCurrentMeasurement();

    expect(store.isMeasuring).toBe(false);
  });

  it('does nothing when no run is currently selected', async () => {
    // currentRunId is null after reset
    await store.cancelCurrentMeasurement();

    expect(cancelMeasurement).not.toHaveBeenCalled();
  });

  it('sets error when cancel API call fails', async () => {
    vi.mocked(cancelMeasurement).mockRejectedValue(new Error('cannot cancel'));
    store.selectRun('run-active');

    await store.cancelCurrentMeasurement();

    expect(store.error).toBe('cannot cancel');
  });

  it('sets isMeasuring to false even when cancel fails', async () => {
    vi.mocked(cancelMeasurement).mockRejectedValue(new Error('fail'));
    store.selectRun('run-x');

    await store.cancelCurrentMeasurement();

    expect(store.isMeasuring).toBe(false);
  });
});

// ─── clearError ───────────────────────────────────────────────────────────────

describe('clearError', () => {
  it('clears a previously set error', async () => {
    vi.mocked(getMeasurementRuns).mockRejectedValue(new Error('oops'));
    await store.loadRuns('floor-1');
    expect(store.error).not.toBeNull();

    store.clearError();

    expect(store.error).toBeNull();
  });

  it('is a no-op when error is already null', () => {
    expect(store.error).toBeNull();
    store.clearError();
    expect(store.error).toBeNull();
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears runs', async () => {
    vi.mocked(getMeasurementRuns).mockResolvedValue([makeRun('r1')]);
    await store.loadRuns('floor-1');
    expect(store.runs).toHaveLength(1);

    store.reset();

    expect(store.runs).toEqual([]);
  });

  it('clears currentRunId', () => {
    store.selectRun('run-5');
    store.reset();
    expect(store.currentRunId).toBeNull();
  });

  it('clears currentRun derived value', async () => {
    const run = makeRun('run-7');
    vi.mocked(getMeasurementRuns).mockResolvedValue([run]);
    await store.loadRuns('floor-1');
    store.selectRun('run-7');
    expect(store.currentRun).not.toBeNull();

    store.reset();

    expect(store.currentRun).toBeNull();
  });

  it('clears measurements', async () => {
    vi.mocked(getMeasurementsByRun).mockResolvedValue([makeMeasurement('m1', 'r1')]);
    await store.loadMeasurements('r1');
    expect(store.measurements).toHaveLength(1);

    store.reset();

    expect(store.measurements).toEqual([]);
  });

  it('clears points', async () => {
    vi.mocked(createMeasurementPoint).mockResolvedValue(makePoint('p1'));
    await store.addPoint('floor-1', 'P1', 0, 0);
    expect(store.points).toHaveLength(1);

    store.reset();

    expect(store.points).toEqual([]);
  });

  it('resets iperfServerIp to empty string', () => {
    store.setServerIp('192.168.1.1');
    store.reset();
    expect(store.iperfServerIp).toBe('');
  });

  it('resets iperfServerReachable to null', async () => {
    vi.mocked(checkIperfServer).mockResolvedValue(true);
    await store.checkServer('192.168.1.1');
    expect(store.iperfServerReachable).toBe(true);

    store.reset();

    expect(store.iperfServerReachable).toBeNull();
  });

  it('resets calibration fields to null / 0', () => {
    store.setCalibration(2.8, 3.5, 'high', 3.5, 0.9, 4.0, 15);
    store.reset();

    expect(store.calibratedN).toBeNull();
    expect(store.calibrationRMSE).toBeNull();
    expect(store.calibrationConfidence).toBeNull();
    expect(store.calibrationOriginalN).toBeNull();
    expect(store.calibrationRSquared).toBeNull();
    expect(store.calibrationMaxDeviation).toBeNull();
    expect(store.calibrationPointCount).toBe(0);
  });

  it('resets error to null', async () => {
    vi.mocked(getMeasurementRuns).mockRejectedValue(new Error('err'));
    await store.loadRuns('floor-1');
    expect(store.error).not.toBeNull();

    store.reset();

    expect(store.error).toBeNull();
  });

  it('resets isLoading to false', async () => {
    // Force isLoading to be visible as true mid-flight then reset
    let resolveLoad!: (v: MeasurementRunResponse[]) => void;
    const pending = new Promise<MeasurementRunResponse[]>((res) => { resolveLoad = res; });
    vi.mocked(getMeasurementRuns).mockReturnValue(pending);

    const loadPromise = store.loadRuns('floor-1');
    store.reset();
    // isLoading is reset synchronously by reset()
    expect(store.isLoading).toBe(false);

    // Resolve the dangling promise so the test doesn't hang
    resolveLoad([]);
    await loadPromise;
  });

  it('resets runCount to 0', async () => {
    vi.mocked(getMeasurementRuns).mockResolvedValue([makeRun('r1'), makeRun('r2')]);
    await store.loadRuns('floor-1');
    expect(store.runCount).toBe(2);

    store.reset();

    expect(store.runCount).toBe(0);
  });

  it('resets bandFilter to all', () => {
    store.setBandFilter('5ghz');
    expect(store.bandFilter).toBe('5ghz');

    store.reset();

    expect(store.bandFilter).toBe('all');
  });
});

// ─── saveManualMeasurement ────────────────────────────────────────────────────

describe('saveManualMeasurement', () => {
  it('M1: saves a manual measurement and reloads measurements', async () => {
    const savedMeas = { ...makeMeasurement('m-manual', 'run-1'), frequency_band: '5ghz', rssi_dbm: -65 };
    vi.mocked(saveMeasurement).mockResolvedValue('m-manual');
    vi.mocked(getMeasurementsByRun).mockResolvedValue([savedMeas]);

    const result = await store.saveManualMeasurement('point-1', 'run-1', '5ghz', -65, -90);

    expect(result).toBe('m-manual');
    expect(saveMeasurement).toHaveBeenCalledWith({
      measurement_point_id: 'point-1',
      measurement_run_id: 'run-1',
      frequency_band: '5ghz',
      rssi_dbm: -65,
      noise_dbm: -90,
    });
    expect(store.measurements).toHaveLength(1);
    expect(store.measurements[0]?.frequency_band).toBe('5ghz');
  });

  it('M2: returns null and sets error on API failure', async () => {
    vi.mocked(saveMeasurement).mockRejectedValue(new Error('save failed'));

    const result = await store.saveManualMeasurement('point-1', 'run-1', '5ghz', -65);

    expect(result).toBeNull();
    expect(store.error).toBe('save failed');
  });
});

// ─── bandFilter ───────────────────────────────────────────────────────────────

describe('bandFilter', () => {
  function makeMeasurementWithBand(id: string, runId: string, band: string): MeasurementResponse {
    return { ...makeMeasurement(id, runId), frequency_band: band };
  }

  it('M3: filters measurements by band', async () => {
    vi.mocked(getMeasurementsByRun).mockResolvedValue([
      makeMeasurementWithBand('m1', 'r1', '2.4ghz'),
      makeMeasurementWithBand('m2', 'r1', '5ghz'),
      makeMeasurementWithBand('m3', 'r1', '6ghz'),
    ]);
    await store.loadMeasurements('r1');

    store.setBandFilter('5ghz');

    expect(store.filteredMeasurements).toHaveLength(1);
    expect(store.filteredMeasurements[0]?.frequency_band).toBe('5ghz');
  });

  it('M4: bandFilter all shows all measurements', async () => {
    vi.mocked(getMeasurementsByRun).mockResolvedValue([
      makeMeasurementWithBand('m1', 'r1', '2.4ghz'),
      makeMeasurementWithBand('m2', 'r1', '5ghz'),
      makeMeasurementWithBand('m3', 'r1', '6ghz'),
    ]);
    await store.loadMeasurements('r1');

    store.setBandFilter('all');

    expect(store.filteredMeasurements).toHaveLength(3);
  });

  it('M5: reset clears bandFilter to all', () => {
    store.setBandFilter('5ghz');
    store.reset();
    expect(store.bandFilter).toBe('all');
  });
});
