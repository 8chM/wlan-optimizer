<!--
  RunComparisonCard.svelte - Side-by-side comparison of two measurement runs.

  Displays:
  - Stats for each run: avg RSSI, min RSSI, measurement count, overall quality
  - Improvement indicator (percentage change, green for better, red for worse)
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { MeasurementRunResponse, MeasurementResponse } from '$lib/api/invoke';

  // ─── Props ─────────────────────────────────────────────────────

  interface RunComparisonCardProps {
    /** Baseline run */
    baselineRun: MeasurementRunResponse;
    /** Comparison run */
    comparisonRun: MeasurementRunResponse;
    /** Measurements for baseline run */
    baselineMeasurements: MeasurementResponse[];
    /** Measurements for comparison run */
    comparisonMeasurements: MeasurementResponse[];
  }

  let {
    baselineRun,
    comparisonRun,
    baselineMeasurements,
    comparisonMeasurements,
  }: RunComparisonCardProps = $props();

  // ─── Derived Stats ─────────────────────────────────────────────

  interface RunStats {
    avgRssi: number | null;
    minRssi: number | null;
    maxRssi: number | null;
    pointCount: number;
    qualityDistribution: Record<string, number>;
    overallQuality: string;
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
  function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  function computeStats(measurements: MeasurementResponse[]): RunStats {
    const rssiValues = measurements
      .map((m) => m.rssi_dbm)
      .filter((v): v is number => v !== null);

    const avgRssi = rssiValues.length > 0
      ? rssiValues.reduce((sum, v) => sum + v, 0) / rssiValues.length
      : null;
    const minRssi = rssiValues.length > 0
      ? Math.min(...rssiValues)
      : null;
    const maxRssi = rssiValues.length > 0
      ? Math.max(...rssiValues)
      : null;

    const qualityDistribution: Record<string, number> = {};
    for (const m of measurements) {
      qualityDistribution[m.quality] = (qualityDistribution[m.quality] ?? 0) + 1;
    }

    // Determine overall quality by most common quality
    let overallQuality = 'unknown';
    let maxCount = 0;
    for (const [quality, count] of Object.entries(qualityDistribution)) {
      if (count > maxCount) {
        maxCount = count;
        overallQuality = quality;
      }
    }

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
      qualityDistribution,
      overallQuality,
      coverageExcellent,
      coverageGood,
      coverageFair,
      worst10Pct,
      medianUpload: median(uploads),
      medianDownload: median(downloads),
      roamingEvents,
    };
  }

  let baselineStats = $derived(computeStats(baselineMeasurements));
  let comparisonStats = $derived(computeStats(comparisonMeasurements));

  // Improvement calculation (RSSI: higher is better, so positive diff = improvement)
  let rssiDiff = $derived(
    baselineStats.avgRssi !== null && comparisonStats.avgRssi !== null
      ? comparisonStats.avgRssi - baselineStats.avgRssi
      : null
  );

  let improvementLabel = $derived(getImprovementLabel(rssiDiff));
  let improvementClass = $derived(getImprovementClass(rssiDiff));

  // ─── Helpers ───────────────────────────────────────────────────

  function getImprovementLabel(diff: number | null): string {
    if (diff === null) return '--';
    if (Math.abs(diff) < 0.5) return t('results.noChange');
    if (diff > 0) return `+${diff.toFixed(1)} dB (${t('results.improvement')})`;
    return `${diff.toFixed(1)} dB (${t('results.degradation')})`;
  }

  function getImprovementClass(diff: number | null): string {
    if (diff === null) return 'neutral';
    if (Math.abs(diff) < 0.5) return 'neutral';
    return diff > 0 ? 'improved' : 'degraded';
  }

  function formatRssi(value: number | null): string {
    if (value === null) return '--';
    return `${value.toFixed(1)} dBm`;
  }

  function formatPct(value: number): string {
    return `${value.toFixed(0)}%`;
  }

  function formatBps(bps: number | null): string {
    if (bps === null) return '--';
    const mbps = bps / 1_000_000;
    if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
    if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
    return `${mbps.toFixed(2)} Mbps`;
  }

  function getQualityLabel(quality: string): string {
    switch (quality) {
      case 'good': return t('measurement.qualityGood');
      case 'fair': return t('measurement.qualityFair');
      case 'poor': return t('measurement.qualityPoor');
      case 'failed': return t('measurement.qualityFailed');
      default: return quality;
    }
  }

  function getRunLabel(run: MeasurementRunResponse): string {
    switch (run.run_type) {
      case 'baseline': return t('measurement.baseline');
      case 'post_optimization': return t('measurement.postOptimization');
      case 'verification': return t('measurement.verification');
      default: return `${t('measurement.run')} ${run.run_number}`;
    }
  }
</script>

<div class="comparison-card">
  <!-- Header with improvement indicator -->
  <div class="comparison-header">
    <h3 class="comparison-title">{t('results.comparison')}</h3>
    <span class="improvement-badge {improvementClass}">
      {improvementLabel}
    </span>
  </div>

  <!-- Side-by-side columns -->
  <div class="comparison-columns">
    <!-- Baseline column -->
    <div class="run-column">
      <div class="column-header">
        <span class="column-label">{t('results.baseline')}</span>
        <span class="run-name">{getRunLabel(baselineRun)}</span>
      </div>
      <div class="stat-grid">
        <div class="stat-row">
          <span class="stat-label">{t('results.avgRssi')}</span>
          <span class="stat-value">{formatRssi(baselineStats.avgRssi)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.minRssi')}</span>
          <span class="stat-value">{formatRssi(baselineStats.minRssi)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.maxRssi')}</span>
          <span class="stat-value">{formatRssi(baselineStats.maxRssi)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.pointsCount')}</span>
          <span class="stat-value">{baselineStats.pointCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.qualityOverall')}</span>
          <span class="stat-value quality-{baselineStats.overallQuality}">
            {getQualityLabel(baselineStats.overallQuality)}
          </span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-row">
          <span class="stat-label">{t('results.coverageExcellent')}</span>
          <span class="stat-value">{formatPct(baselineStats.coverageExcellent)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.coverageGood')}</span>
          <span class="stat-value">{formatPct(baselineStats.coverageGood)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.coverageFair')}</span>
          <span class="stat-value">{formatPct(baselineStats.coverageFair)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.worst10Pct')}</span>
          <span class="stat-value">{formatRssi(baselineStats.worst10Pct)}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-row">
          <span class="stat-label">{t('results.medianUpload')}</span>
          <span class="stat-value">{formatBps(baselineStats.medianUpload)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.medianDownload')}</span>
          <span class="stat-value">{formatBps(baselineStats.medianDownload)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.roamingEvents')}</span>
          <span class="stat-value">{baselineStats.roamingEvents}</span>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="column-divider"></div>

    <!-- Comparison column -->
    <div class="run-column">
      <div class="column-header">
        <span class="column-label">{t('results.comparison')}</span>
        <span class="run-name">{getRunLabel(comparisonRun)}</span>
      </div>
      <div class="stat-grid">
        <div class="stat-row">
          <span class="stat-label">{t('results.avgRssi')}</span>
          <span class="stat-value">{formatRssi(comparisonStats.avgRssi)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.minRssi')}</span>
          <span class="stat-value">{formatRssi(comparisonStats.minRssi)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.maxRssi')}</span>
          <span class="stat-value">{formatRssi(comparisonStats.maxRssi)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.pointsCount')}</span>
          <span class="stat-value">{comparisonStats.pointCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.qualityOverall')}</span>
          <span class="stat-value quality-{comparisonStats.overallQuality}">
            {getQualityLabel(comparisonStats.overallQuality)}
          </span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-row">
          <span class="stat-label">{t('results.coverageExcellent')}</span>
          <span class="stat-value">{formatPct(comparisonStats.coverageExcellent)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.coverageGood')}</span>
          <span class="stat-value">{formatPct(comparisonStats.coverageGood)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.coverageFair')}</span>
          <span class="stat-value">{formatPct(comparisonStats.coverageFair)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.worst10Pct')}</span>
          <span class="stat-value">{formatRssi(comparisonStats.worst10Pct)}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-row">
          <span class="stat-label">{t('results.medianUpload')}</span>
          <span class="stat-value">{formatBps(comparisonStats.medianUpload)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.medianDownload')}</span>
          <span class="stat-value">{formatBps(comparisonStats.medianDownload)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">{t('results.roamingEvents')}</span>
          <span class="stat-value">{comparisonStats.roamingEvents}</span>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .comparison-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 16px;
  }

  .comparison-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .comparison-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .improvement-badge {
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 4px;
    font-weight: 600;
  }

  .improvement-badge.improved {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  .improvement-badge.degraded {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .improvement-badge.neutral {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }

  .comparison-columns {
    display: flex;
    gap: 0;
  }

  .run-column {
    flex: 1;
    min-width: 0;
  }

  .column-divider {
    width: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 0 16px;
    align-self: stretch;
  }

  .column-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
  }

  .column-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .run-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: #c0c0d0;
  }

  .stat-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-size: 0.7rem;
    color: #808090;
    font-weight: 500;
  }

  .stat-value {
    font-size: 0.75rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .stat-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 4px 0;
  }

  /* Quality color classes */
  .stat-value:global(.quality-good) {
    color: #4ade80;
  }

  .stat-value:global(.quality-fair) {
    color: #fbbf24;
  }

  .stat-value:global(.quality-poor) {
    color: #fb923c;
  }

  .stat-value:global(.quality-failed) {
    color: #f87171;
  }
</style>
