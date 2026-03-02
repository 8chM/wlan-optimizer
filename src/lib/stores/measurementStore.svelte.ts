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
  AccessPointResponse,
} from '$lib/api/invoke';
import {
  getMeasurementRuns,
  getMeasurementPoints,
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
import {
  REFERENCE_LOSS,
  DEFAULT_PATH_LOSS_EXPONENT,
  DEFAULT_RECEIVER_GAIN_DBI,
  MIN_DISTANCE,
} from '$lib/heatmap/rf-engine';

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

// ─── Calibration ────────────────────────────────────────────────

interface CalibrationInput {
  /** Measured RSSI in dBm */
  rssiDbm: number;
  /** Distance from AP to measurement point in meters */
  distance: number;
  /** TX power of the closest AP in dBm */
  txPowerDbm: number;
  /** Antenna gain of the closest AP in dBi */
  antennaGainDbi: number;
  /** Reference loss for the frequency band */
  referenceLoss: number;
}

interface CalibrationOutput {
  n: number;
  rmse: number;
  confidence: string;
  originalN: number;
  rSquared: number;
  maxDeviation: number;
  pointCount: number;
}

/**
 * Computes the calibrated path loss exponent from measured RSSI data.
 *
 * Uses the ITU-R P.1238 model:
 *   RSSI = TxPower + AntennaGain + ReceiverGain - PL(1m) - 10*n*log10(d)
 *
 * Rearranging for n per measurement:
 *   n_i = (TxPower + AntennaGain + ReceiverGain - PL(1m) - RSSI) / (10 * log10(d))
 *
 * The calibrated n is the average across all measurements (least-squares fit).
 */
function computeCalibration(inputs: CalibrationInput[]): CalibrationOutput | null {
  if (inputs.length < 2) return null;

  const originalN = DEFAULT_PATH_LOSS_EXPONENT;
  const receiverGain = DEFAULT_RECEIVER_GAIN_DBI;

  // Compute individual n estimates
  const nEstimates: number[] = [];
  for (const input of inputs) {
    const d = Math.max(MIN_DISTANCE, input.distance);
    const logD = Math.log10(d);
    if (logD <= 0) continue; // Skip points too close to AP

    // n = (TxPower + AntennaGain + ReceiverGain - ReferenceLoss - RSSI) / (10 * log10(d))
    const numerator = input.txPowerDbm + input.antennaGainDbi + receiverGain - input.referenceLoss - input.rssiDbm;
    const n = numerator / (10 * logD);

    // Clamp to physically reasonable range
    if (n >= 1.5 && n <= 6.0) {
      nEstimates.push(n);
    }
  }

  if (nEstimates.length < 2) return null;

  // Average n (least-squares estimate for single-parameter model)
  const calibratedN = nEstimates.reduce((sum, v) => sum + v, 0) / nEstimates.length;

  // Compute RMSE and R-squared
  let sumSquaredError = 0;
  let maxDeviation = 0;
  let sumSquaredTotal = 0;
  const meanRssi = inputs.reduce((sum, i) => sum + i.rssiDbm, 0) / inputs.length;

  for (const input of inputs) {
    const d = Math.max(MIN_DISTANCE, input.distance);
    const predictedRssi = input.txPowerDbm + input.antennaGainDbi + receiverGain
      - input.referenceLoss - 10 * calibratedN * Math.log10(d);
    const error = input.rssiDbm - predictedRssi;
    sumSquaredError += error * error;
    sumSquaredTotal += (input.rssiDbm - meanRssi) ** 2;
    maxDeviation = Math.max(maxDeviation, Math.abs(error));
  }

  const rmse = Math.sqrt(sumSquaredError / inputs.length);
  const rSquared = sumSquaredTotal > 0 ? 1 - sumSquaredError / sumSquaredTotal : 0;

  // Confidence based on RMSE and point count
  let confidence: string;
  if (rmse <= 3 && nEstimates.length >= 5) {
    confidence = 'high';
  } else if (rmse <= 5 && nEstimates.length >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    n: Math.round(calibratedN * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    confidence,
    originalN,
    rSquared: Math.round(rSquared * 1000) / 1000,
    maxDeviation: Math.round(maxDeviation * 100) / 100,
    pointCount: nEstimates.length,
  };
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

    async loadPoints(floorId: string): Promise<void> {
      error = null;
      try {
        points = await getMeasurementPoints(floorId);
      } catch (err: unknown) {
        error = extractErrorMessage(err);
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

    /**
     * Computes calibration from baseline measurements and AP positions.
     * Automatically called after a baseline run completes.
     */
    runCalibration(
      accessPointsList: AccessPointResponse[],
    ): void {
      if (measurements.length === 0 || points.length === 0 || accessPointsList.length === 0) return;

      // Build calibration inputs from measurements + points + nearest AP
      const inputs: CalibrationInput[] = [];
      for (const measurement of measurements) {
        if (measurement.rssi_dbm === null) continue;

        // Find the measurement point
        const point = points.find((p) => p.id === measurement.measurement_point_id);
        if (!point) continue;

        // Find the closest AP
        let closestAp: AccessPointResponse | null = null;
        let minDist = Infinity;
        for (const ap of accessPointsList) {
          if (!ap.enabled) continue;
          const dx = point.x - ap.x;
          const dy = point.y - ap.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            closestAp = ap;
          }
        }

        if (!closestAp || minDist < MIN_DISTANCE) continue;

        // Determine frequency band and reference loss
        const freqMhz = measurement.frequency_mhz ?? 5000;
        const band: '2.4ghz' | '5ghz' | '6ghz' = freqMhz < 3000 ? '2.4ghz' : freqMhz < 5900 ? '5ghz' : '6ghz';
        const txPower = band === '2.4ghz'
          ? (closestAp.tx_power_24ghz_dbm ?? 20)
          : (closestAp.tx_power_5ghz_dbm ?? 23);

        const antennaGain = band === '2.4ghz'
          ? (closestAp.ap_model?.antenna_gain_24ghz_dbi ?? 3)
          : (closestAp.ap_model?.antenna_gain_5ghz_dbi ?? 3);

        inputs.push({
          rssiDbm: measurement.rssi_dbm,
          distance: minDist,
          txPowerDbm: txPower,
          antennaGainDbi: antennaGain,
          referenceLoss: REFERENCE_LOSS[band],
        });
      }

      const result = computeCalibration(inputs);
      if (result) {
        calibratedN = result.n;
        calibrationRMSE = result.rmse;
        calibrationConfidence = result.confidence;
        calibrationOriginalN = result.originalN;
        calibrationRSquared = result.rSquared;
        calibrationMaxDeviation = result.maxDeviation;
        calibrationPointCount = result.pointCount;
      }
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
