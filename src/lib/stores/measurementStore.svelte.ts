/**
 * Measurement Store - Svelte 5 Runes-based store for measurement state.
 *
 * Manages measurement runs, measurement points, iPerf server config,
 * measurement progress, and calibration results.
 */

import type {
  MeasurementRunResponse,
  MeasurementResponse,
  MeasurementPointResponse,
} from '$lib/api/invoke';
import {
  getMeasurementRuns,
  getMeasurementsByRun,
  checkIperfServer,
  createMeasurementRun,
  createMeasurementPoint,
  startMeasurement,
  cancelMeasurement,
  deleteMeasurementRun,
  deleteMeasurementPoint,
  updateMeasurementRunStatus,
} from '$lib/api/measurement';

// ─── Types ──────────────────────────────────────────────────────

export interface MeasurementProgress {
  current: number;
  total: number;
  currentPointId: string;
  currentStep: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Extracts a readable error message from Tauri invoke errors or standard errors. */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

// ─── Store ──────────────────────────────────────────────────────

function createMeasurementStore() {
  // State
  let runs = $state<MeasurementRunResponse[]>([]);
  let currentRunId = $state<string | null>(null);
  let measurements = $state<MeasurementResponse[]>([]);
  let points = $state<MeasurementPointResponse[]>([]);
  let iperfServerIp = $state<string>('');
  let iperfServerReachable = $state<boolean | null>(null);
  let isCheckingServer = $state(false);
  let isMeasuring = $state(false);
  let measurementProgress = $state<MeasurementProgress>({
    current: 0,
    total: 0,
    currentPointId: '',
    currentStep: '',
  });
  let calibratedN = $state<number | null>(null);
  let calibrationRMSE = $state<number | null>(null);
  let calibrationConfidence = $state<string | null>(null);
  let calibrationOriginalN = $state<number | null>(null);
  let calibrationRSquared = $state<number | null>(null);
  let calibrationMaxDeviation = $state<number | null>(null);
  let calibrationPointCount = $state<number>(0);
  let error = $state<string | null>(null);
  let isLoading = $state(false);

  // Derived
  let currentRun = $derived(runs.find((r) => r.id === currentRunId) ?? null);
  let completedMeasurements = $derived(
    measurements.filter((m) => m.measurement_run_id === currentRunId),
  );
  let runCount = $derived(runs.length);

  return {
    // ── Getters (reactive via $state) ───────────────────────
    get runs() { return runs; },
    get currentRun() { return currentRun; },
    get currentRunId() { return currentRunId; },
    get measurements() { return measurements; },
    get points() { return points; },
    get isMeasuring() { return isMeasuring; },
    get iperfServerIp() { return iperfServerIp; },
    get iperfServerReachable() { return iperfServerReachable; },
    get isCheckingServer() { return isCheckingServer; },
    get measurementProgress() { return measurementProgress; },
    get calibratedN() { return calibratedN; },
    get calibrationRMSE() { return calibrationRMSE; },
    get calibrationConfidence() { return calibrationConfidence; },
    get calibrationOriginalN() { return calibrationOriginalN; },
    get calibrationRSquared() { return calibrationRSquared; },
    get calibrationMaxDeviation() { return calibrationMaxDeviation; },
    get calibrationPointCount() { return calibrationPointCount; },
    get error() { return error; },
    get isLoading() { return isLoading; },
    get completedMeasurements() { return completedMeasurements; },
    get runCount() { return runCount; },

    // ── Actions ─────────────────────────────────────────────

    async loadRuns(floorId: string): Promise<void> {
      isLoading = true;
      error = null;
      try {
        runs = await getMeasurementRuns(floorId);
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isLoading = false;
      }
    },

    async loadMeasurements(runId: string): Promise<void> {
      isLoading = true;
      error = null;
      try {
        measurements = await getMeasurementsByRun(runId);
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isLoading = false;
      }
    },

    async checkServer(ip: string): Promise<boolean> {
      isCheckingServer = true;
      iperfServerIp = ip;
      iperfServerReachable = null;
      error = null;
      try {
        const reachable = await checkIperfServer(ip);
        iperfServerReachable = reachable;
        return reachable;
      } catch (err: unknown) {
        iperfServerReachable = false;
        error = extractErrorMessage(err);
        return false;
      } finally {
        isCheckingServer = false;
      }
    },

    async createRun(
      floorId: string,
      runNumber: number,
      runType: string,
    ): Promise<MeasurementRunResponse | null> {
      isLoading = true;
      error = null;
      try {
        const run = await createMeasurementRun({
          floor_id: floorId,
          run_number: runNumber,
          run_type: runType,
          iperf_server_ip: iperfServerIp || undefined,
        });
        runs = [...runs, run];
        currentRunId = run.id;
        return run;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return null;
      } finally {
        isLoading = false;
      }
    },

    async addPoint(
      floorId: string,
      label: string,
      x: number,
      y: number,
    ): Promise<MeasurementPointResponse | null> {
      error = null;
      try {
        const point = await createMeasurementPoint({
          floor_id: floorId,
          label,
          x,
          y,
        });
        points = [...points, point];
        return point;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return null;
      }
    },

    async runMeasurement(
      pointId: string,
      runId: string,
    ): Promise<string | null> {
      isMeasuring = true;
      // Progress is set statically because the backend runs all steps in a
      // single IPC call. TODO: Use Tauri events for step-by-step updates.
      measurementProgress = {
        current: 0,
        total: 4,
        currentPointId: pointId,
        currentStep: 'readingWifi',
      };
      error = null;
      try {
        const measurementId = await startMeasurement(pointId, runId);
        // Reload measurements after completion
        measurements = await getMeasurementsByRun(runId);
        return measurementId;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return null;
      } finally {
        isMeasuring = false;
        measurementProgress = {
          current: 0,
          total: 0,
          currentPointId: '',
          currentStep: '',
        };
      }
    },

    async cancelCurrentMeasurement(): Promise<void> {
      if (!currentRunId) return;
      error = null;
      try {
        await cancelMeasurement(currentRunId);
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isMeasuring = false;
      }
    },

    async deleteRun(runId: string): Promise<boolean> {
      error = null;
      try {
        await deleteMeasurementRun(runId);
        runs = runs.filter((r) => r.id !== runId);
        measurements = measurements.filter((m) => m.measurement_run_id !== runId);
        if (currentRunId === runId) {
          currentRunId = null;
        }
        return true;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return false;
      }
    },

    async deletePoint(pointId: string): Promise<boolean> {
      error = null;
      try {
        await deleteMeasurementPoint(pointId);
        points = points.filter((p) => p.id !== pointId);
        measurements = measurements.filter((m) => m.measurement_point_id !== pointId);
        return true;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return false;
      }
    },

    async updateRunStatus(
      runId: string,
      status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled',
    ): Promise<boolean> {
      error = null;
      try {
        await updateMeasurementRunStatus(runId, status);
        runs = runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                status,
                ...(status === 'in_progress' && { started_at: new Date().toISOString() }),
                ...(status === 'completed' && { completed_at: new Date().toISOString() }),
              }
            : r,
        );
        return true;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return false;
      }
    },

    selectRun(runId: string): void {
      currentRunId = runId;
    },

    setServerIp(ip: string): void {
      iperfServerIp = ip;
      // Reset reachability when IP changes
      iperfServerReachable = null;
    },

    setProgress(current: number, total: number, step: string): void {
      measurementProgress = {
        ...measurementProgress,
        current,
        total,
        currentStep: step,
      };
    },

    setCalibration(
      n: number,
      rmse: number,
      confidence: string,
      originalN?: number,
      rSquared?: number,
      maxDeviation?: number,
      pointCount?: number,
    ): void {
      calibratedN = n;
      calibrationRMSE = rmse;
      calibrationConfidence = confidence;
      calibrationOriginalN = originalN ?? null;
      calibrationRSquared = rSquared ?? null;
      calibrationMaxDeviation = maxDeviation ?? null;
      calibrationPointCount = pointCount ?? 0;
    },

    clearError(): void {
      error = null;
    },

    reset(): void {
      runs = [];
      currentRunId = null;
      measurements = [];
      points = [];
      iperfServerIp = '';
      iperfServerReachable = null;
      isCheckingServer = false;
      isMeasuring = false;
      measurementProgress = { current: 0, total: 0, currentPointId: '', currentStep: '' };
      calibratedN = null;
      calibrationRMSE = null;
      calibrationConfidence = null;
      calibrationOriginalN = null;
      calibrationRSquared = null;
      calibrationMaxDeviation = null;
      calibrationPointCount = 0;
      error = null;
      isLoading = false;
    },
  };
}

/** Singleton measurement store instance */
export const measurementStore = createMeasurementStore();
