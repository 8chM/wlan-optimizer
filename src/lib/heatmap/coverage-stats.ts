/**
 * Coverage statistics calculation from heatmap RSSI data.
 *
 * Provides signal quality distribution bins and coverage percentage.
 */

// ─── Types ──────────────────────────────────────────────────────

/** Signal quality thresholds in dBm */
export const COVERAGE_THRESHOLDS = {
  excellent: -50,  // >= -50 dBm
  good: -65,       // >= -65 dBm
  fair: -75,       // >= -75 dBm
  poor: -85,       // >= -85 dBm
  // none: < -85 dBm
} as const;

/** Coverage bin counts */
export interface CoverageBins {
  /** Number of cells with RSSI >= -50 dBm */
  excellent: number;
  /** Number of cells with RSSI >= -65 and < -50 dBm */
  good: number;
  /** Number of cells with RSSI >= -75 and < -65 dBm */
  fair: number;
  /** Number of cells with RSSI >= -85 and < -75 dBm */
  poor: number;
  /** Number of cells with RSSI < -85 dBm */
  none: number;
}

/** Coverage statistics result */
export interface CoverageStats {
  /** Distribution of signal quality */
  bins: CoverageBins;
  /** Total number of cells analyzed */
  totalCells: number;
  /** Coverage percentage (cells >= -75 dBm / total) */
  coveragePercent: number;
  /** Percentage for each bin */
  percentages: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    none: number;
  };
}

// ─── Functions ──────────────────────────────────────────────────

/**
 * Classify an RSSI value into a coverage bin.
 */
export function classifyRSSI(rssi: number): keyof CoverageBins {
  if (rssi >= COVERAGE_THRESHOLDS.excellent) return 'excellent';
  if (rssi >= COVERAGE_THRESHOLDS.good) return 'good';
  if (rssi >= COVERAGE_THRESHOLDS.fair) return 'fair';
  if (rssi >= COVERAGE_THRESHOLDS.poor) return 'poor';
  return 'none';
}

/**
 * Calculate coverage statistics from min/max/avg RSSI and bin data.
 * If bins are not provided, estimates from the average RSSI value.
 */
export function calculateCoverageFromBins(bins: CoverageBins, totalCells: number): CoverageStats {
  const coveredCells = bins.excellent + bins.good + bins.fair;

  const coveragePercent = totalCells > 0
    ? (coveredCells / totalCells) * 100
    : 0;

  const pct = (count: number) => totalCells > 0 ? (count / totalCells) * 100 : 0;

  return {
    bins,
    totalCells,
    coveragePercent,
    percentages: {
      excellent: pct(bins.excellent),
      good: pct(bins.good),
      fair: pct(bins.fair),
      poor: pct(bins.poor),
      none: pct(bins.none),
    },
  };
}

/**
 * Estimate coverage statistics from basic RSSI stats (min/max/avg).
 * Used as a fallback when per-cell bin data is not available.
 */
export function estimateCoverageFromStats(
  minRSSI: number,
  maxRSSI: number,
  avgRSSI: number,
): CoverageStats {
  // Rough estimation: assume normal-ish distribution around avgRSSI
  const range = maxRSSI - minRSSI;
  const totalCells = 100; // normalized to percentages

  const bins: CoverageBins = { excellent: 0, good: 0, fair: 0, poor: 0, none: 0 };

  // Simple heuristic: distribute based on where avg falls relative to thresholds
  if (avgRSSI >= COVERAGE_THRESHOLDS.excellent) {
    bins.excellent = 60;
    bins.good = 25;
    bins.fair = 10;
    bins.poor = 4;
    bins.none = 1;
  } else if (avgRSSI >= COVERAGE_THRESHOLDS.good) {
    bins.excellent = 20;
    bins.good = 40;
    bins.fair = 25;
    bins.poor = 10;
    bins.none = 5;
  } else if (avgRSSI >= COVERAGE_THRESHOLDS.fair) {
    bins.excellent = 5;
    bins.good = 20;
    bins.fair = 35;
    bins.poor = 25;
    bins.none = 15;
  } else if (avgRSSI >= COVERAGE_THRESHOLDS.poor) {
    bins.excellent = 0;
    bins.good = 5;
    bins.fair = 15;
    bins.poor = 40;
    bins.none = 40;
  } else {
    bins.excellent = 0;
    bins.good = 0;
    bins.fair = 5;
    bins.poor = 15;
    bins.none = 80;
  }

  return calculateCoverageFromBins(bins, totalCells);
}
