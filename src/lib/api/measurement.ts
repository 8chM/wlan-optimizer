/**
 * Measurement API - IPC wrapper functions for measurement commands.
 *
 * Provides typed functions for creating measurement runs, placing
 * measurement points, running measurements, and checking iPerf servers.
 */

import {
  safeInvoke,
  type MeasurementRunResponse,
  type MeasurementPointResponse,
  type MeasurementResponse,
} from './invoke';

/**
 * Creates a new measurement run for a floor.
 */
export async function createMeasurementRun(params: {
  floor_id: string;
  run_number: number;
  run_type: string;
  iperf_server_ip?: string;
}): Promise<MeasurementRunResponse> {
  return safeInvoke('create_measurement_run', { params });
}

/**
 * Creates a measurement point on a floor.
 */
export async function createMeasurementPoint(params: {
  floor_id: string;
  label: string;
  x: number;
  y: number;
  auto_generated?: boolean;
  notes?: string;
}): Promise<MeasurementPointResponse> {
  return safeInvoke('create_measurement_point', { params });
}

/**
 * Starts a measurement at a specific point within a run.
 * Returns the measurement ID on success.
 */
export async function startMeasurement(
  pointId: string,
  runId: string,
): Promise<string> {
  return safeInvoke('start_measurement', {
    measurement_point_id: pointId,
    measurement_run_id: runId,
  });
}

/**
 * Loads all measurement points for a floor.
 */
export async function getMeasurementPoints(
  floorId: string,
): Promise<MeasurementPointResponse[]> {
  return safeInvoke('get_measurement_points', { floor_id: floorId });
}

/**
 * Loads all measurement runs for a floor.
 */
export async function getMeasurementRuns(
  floorId: string,
): Promise<MeasurementRunResponse[]> {
  return safeInvoke('get_measurement_runs', { floor_id: floorId });
}

/**
 * Loads all measurements for a specific run.
 */
export async function getMeasurementsByRun(
  runId: string,
): Promise<MeasurementResponse[]> {
  return safeInvoke('get_measurements_by_run', { measurement_run_id: runId });
}

/**
 * Checks if an iPerf3 server is reachable at the given IP.
 */
export async function checkIperfServer(serverIp: string): Promise<boolean> {
  return safeInvoke('check_iperf_server', { server_ip: serverIp });
}

/**
 * Cancels a running measurement run.
 */
export async function cancelMeasurement(runId: string): Promise<void> {
  await safeInvoke('cancel_measurement', { measurement_run_id: runId });
}

/**
 * Updates the status of a measurement run.
 */
export async function updateMeasurementRunStatus(
  runId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled',
): Promise<void> {
  await safeInvoke('update_measurement_run_status', {
    measurement_run_id: runId,
    status,
  });
}

/**
 * Deletes a measurement run and all its associated measurements.
 */
export async function deleteMeasurementRun(
  runId: string,
): Promise<{ success: boolean }> {
  return safeInvoke('delete_measurement_run', { run_id: runId });
}

/**
 * Deletes a measurement point and all its associated measurements.
 */
export async function deleteMeasurementPoint(
  pointId: string,
): Promise<{ success: boolean }> {
  return safeInvoke('delete_measurement_point', { point_id: pointId });
}
