/**
 * Measurement comparison utilities.
 *
 * Pure functions for computing run comparison metrics:
 * coverage bins, worst 10%, throughput medians, roaming events.
 */

import type { MeasurementResponse } from '$lib/api/invoke';

export interface RunComparisonStats {
  avgRssi: number | null;
  minRssi: number | null;
  maxRssi: number | null;
  pointCount: number;
  /** Coverage bins: % of measurements with RSSI >= threshold */
  coverageExcellent: number; // >= -67 dBm
  coverageGood: number;     // >= -70 dBm
  coverageFair: number;     // >= -75 dBm
  /** Average of worst 10% RSSI values */
  worst10Pct: number | null;
  /** Median upload throughput in bps */
  medianUpload: number | null;
  /** Median download throughput in bps */
  medianDownload: number | null;
  /** Number of BSSID changes (roaming events) across measurements */
  roamingEvents: number;
}

/** Compute median of an array of numbers. Returns null for empty array. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Compute comparison stats from a set of measurements.
 *
 * Coverage bins use standard thresholds:
 *   -67 dBm (excellent), -70 dBm (good), -75 dBm (fair)
 *
 * Worst 10% is the average RSSI of the bottom 10% measurements.
 * Roaming events count consecutive BSSID changes.
 */
export function computeRunComparisonStats(measurements: MeasurementResponse[]): RunComparisonStats {
  const rssiValues = measurements
    .map((m) => m.rssi_dbm)
    .filter((v): v is number => v !== null);

  const avgRssi = rssiValues.length > 0
    ? rssiValues.reduce((sum, v) => sum + v, 0) / rssiValues.length
    : null;
  const minRssi = rssiValues.length > 0 ? Math.min(...rssiValues) : null;
  const maxRssi = rssiValues.length > 0 ? Math.max(...rssiValues) : null;

  // Coverage bins
  const total = rssiValues.length;
  const coverageExcellent = total > 0 ? (rssiValues.filter((v) => v >= -67).length / total) * 100 : 0;
  const coverageGood = total > 0 ? (rssiValues.filter((v) => v >= -70).length / total) * 100 : 0;
  const coverageFair = total > 0 ? (rssiValues.filter((v) => v >= -75).length / total) * 100 : 0;

  // Worst 10%
  let worst10Pct: number | null = null;
  if (rssiValues.length >= 2) {
    const sorted = [...rssiValues].sort((a, b) => a - b);
    const count10 = Math.max(1, Math.ceil(sorted.length * 0.1));
    const worst = sorted.slice(0, count10);
    worst10Pct = worst.reduce((s, v) => s + v, 0) / worst.length;
  }

  // Throughput medians
  const uploads = measurements
    .map((m) => m.iperf_tcp_upload_bps)
    .filter((v): v is number => v !== null);
  const downloads = measurements
    .map((m) => m.iperf_tcp_download_bps)
    .filter((v): v is number => v !== null);

  // Roaming events: count unique BSSID transitions
  let roamingEvents = 0;
  const bssids = measurements
    .map((m) => m.connected_bssid)
    .filter((v): v is string => v !== null);
  for (let i = 1; i < bssids.length; i++) {
    if (bssids[i] !== bssids[i - 1]) roamingEvents++;
  }

  return {
    avgRssi,
    minRssi,
    maxRssi,
    pointCount: measurements.length,
    coverageExcellent,
    coverageGood,
    coverageFair,
    worst10Pct,
    medianUpload: median(uploads),
    medianDownload: median(downloads),
    roamingEvents,
  };
}
