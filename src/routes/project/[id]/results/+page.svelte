<!--
  Results page - Dashboard showing measurement results with run comparison and export.

  Features:
  - Load measurement runs for the current floor
  - Run comparison: select two runs (baseline vs post-optimization)
  - Signal quality summary cards: min/avg/max RSSI, coverage percentage
  - Performance metrics table: throughput, jitter, packet loss per measurement
  - Export dialog for JSON and CSV
  - Empty state when no measurements exist
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type {
    MeasurementRunResponse,
    MeasurementResponse,
  } from '$lib/api/invoke';
  import { getMeasurementRuns, getMeasurementsByRun } from '$lib/api/measurement';
  import RunComparisonCard from '$lib/components/results/RunComparisonCard.svelte';
  import ExportDialog from '$lib/components/results/ExportDialog.svelte';

  // ─── State ──────────────────────────────────────────────────────

  let runs = $state<MeasurementRunResponse[]>([]);
  let measurementsByRun = $state<Record<string, MeasurementResponse[]>>({});
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  let baselineRunId = $state<string>('');
  let comparisonRunId = $state<string>('');
  let exportDialogOpen = $state(false);

  // ─── Derived ────────────────────────────────────────────────────

  let floor = $derived(projectStore.activeFloor);
  let floorId = $derived(floor?.id ?? '');

  let baselineRun = $derived(runs.find((r) => r.id === baselineRunId) ?? null);
  let comparisonRun = $derived(runs.find((r) => r.id === comparisonRunId) ?? null);
  let baselineMeasurements = $derived(measurementsByRun[baselineRunId] ?? []);
  let comparisonMeasurements = $derived(measurementsByRun[comparisonRunId] ?? []);

  let hasData = $derived(runs.length > 0);
  let canCompare = $derived(
    baselineRun !== null &&
    comparisonRun !== null &&
    baselineRunId !== comparisonRunId
  );

  // All measurements across all runs (for summary)
  let allMeasurements = $derived(
    Object.values(measurementsByRun).flat()
  );

  // ─── Summary Stats ─────────────────────────────────────────────

  interface SummaryStats {
    totalRuns: number;
    totalPoints: number;
    avgRssi: number | null;
    minRssi: number | null;
    maxRssi: number | null;
    coveragePercent: number;
  }

  let summaryStats = $derived<SummaryStats>(computeSummary(allMeasurements, runs));

  function computeSummary(
    measurements: MeasurementResponse[],
    allRuns: MeasurementRunResponse[],
  ): SummaryStats {
    const rssiValues = measurements
      .map((m) => m.rssi_dbm)
      .filter((v): v is number => v !== null);

    const avgRssi = rssiValues.length > 0
      ? rssiValues.reduce((sum, v) => sum + v, 0) / rssiValues.length
      : null;
    const minRssi = rssiValues.length > 0 ? Math.min(...rssiValues) : null;
    const maxRssi = rssiValues.length > 0 ? Math.max(...rssiValues) : null;

    // Coverage: percentage of points with RSSI >= -75 dBm (reasonable coverage threshold)
    const coveredCount = rssiValues.filter((v) => v >= -75).length;
    const coveragePercent = rssiValues.length > 0
      ? (coveredCount / rssiValues.length) * 100
      : 0;

    return {
      totalRuns: allRuns.length,
      totalPoints: measurements.length,
      avgRssi,
      minRssi,
      maxRssi,
      coveragePercent,
    };
  }

  // ─── Performance metrics for display (from the most recent completed run) ─────

  let latestCompletedRun = $derived(
    [...runs]
      .filter((r) => r.status === 'completed')
      .sort((a, b) => b.run_number - a.run_number)[0] ?? null
  );
  let latestMeasurements = $derived(
    latestCompletedRun ? (measurementsByRun[latestCompletedRun.id] ?? []) : []
  );

  // ─── Load Data ─────────────────────────────────────────────────

  $effect(() => {
    if (floorId) {
      loadData(floorId);
    }
  });

  async function loadData(fId: string): Promise<void> {
    isLoading = true;
    error = null;
    try {
      const loadedRuns = await getMeasurementRuns(fId);
      runs = loadedRuns;

      // Load measurements for all runs
      const byRun: Record<string, MeasurementResponse[]> = {};
      for (const run of loadedRuns) {
        try {
          byRun[run.id] = await getMeasurementsByRun(run.id);
        } catch {
          byRun[run.id] = [];
        }
      }
      measurementsByRun = byRun;

      // Auto-select runs for comparison (first two if available)
      if (loadedRuns.length >= 2) {
        baselineRunId = loadedRuns[0]!.id;
        comparisonRunId = loadedRuns[1]!.id;
      } else if (loadedRuns.length === 1) {
        baselineRunId = loadedRuns[0]!.id;
        comparisonRunId = '';
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading = false;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  function formatRssi(value: number | null): string {
    if (value === null) return '--';
    return `${value.toFixed(1)} dBm`;
  }

  function formatBps(bps: number | null): string {
    if (bps === null) return '--';
    const mbps = bps / 1_000_000;
    if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
    if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
    return `${mbps.toFixed(2)} Mbps`;
  }

  function formatJitter(ms: number | null): string {
    if (ms === null) return '--';
    return `${ms.toFixed(2)} ms`;
  }

  function formatPacketLoss(percent: number | null): string {
    if (percent === null) return '--';
    return `${percent.toFixed(2)}%`;
  }

  function getRunOptionLabel(run: MeasurementRunResponse): string {
    const typeLabel = getRunTypeLabel(run.run_type);
    return `${t('measurement.run')} ${run.run_number}: ${typeLabel}`;
  }

  function getRunTypeLabel(runType: string): string {
    switch (runType) {
      case 'baseline': return t('measurement.baseline');
      case 'post_optimization': return t('measurement.postOptimization');
      case 'verification': return t('measurement.verification');
      default: return runType;
    }
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

  function getQualityClass(quality: string): string {
    switch (quality) {
      case 'good': return 'quality-good';
      case 'fair': return 'quality-fair';
      case 'poor': return 'quality-poor';
      case 'failed': return 'quality-failed';
      default: return 'quality-pending';
    }
  }

  function getRssiColor(rssi: number | null): string {
    if (rssi === null) return '#6b7280';
    if (rssi >= -50) return '#22c55e';
    if (rssi >= -60) return '#84cc16';
    if (rssi >= -70) return '#f59e0b';
    if (rssi >= -80) return '#f97316';
    return '#ef4444';
  }
</script>

<svelte:head>
  <title>{t('nav.results')} - {t('app.title')}</title>
</svelte:head>

<div class="results-page">
  {#if isLoading}
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  {:else if !hasData}
    <!-- Empty State -->
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 36V12a4 4 0 014-4h24a4 4 0 014 4v24a4 4 0 01-4 4H12a4 4 0 01-4-4z" />
          <path d="M16 28l4-8 4 6 4-4 6 10" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h2>{t('results.noData')}</h2>
      <p>{t('results.noDataHint')}</p>
    </div>
  {:else}
    <!-- Results Dashboard -->
    <div class="results-header">
      <h2>{t('results.title')}</h2>
      <button class="export-btn" onclick={() => (exportDialogOpen = true)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a.5.5 0 01.5.5v8.793l2.146-2.147a.5.5 0 01.708.708l-3 3a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L7.5 10.293V1.5A.5.5 0 018 1z"/>
          <path d="M2 12.5a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5z"/>
        </svg>
        {t('results.export')}
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="summary-cards">
      <div class="summary-card">
        <span class="card-label">{t('results.avgRssi')}</span>
        <span class="card-value" style="color: {getRssiColor(summaryStats.avgRssi)}">
          {formatRssi(summaryStats.avgRssi)}
        </span>
      </div>
      <div class="summary-card">
        <span class="card-label">{t('results.minRssi')}</span>
        <span class="card-value" style="color: {getRssiColor(summaryStats.minRssi)}">
          {formatRssi(summaryStats.minRssi)}
        </span>
      </div>
      <div class="summary-card">
        <span class="card-label">{t('results.maxRssi')}</span>
        <span class="card-value" style="color: {getRssiColor(summaryStats.maxRssi)}">
          {formatRssi(summaryStats.maxRssi)}
        </span>
      </div>
      <div class="summary-card">
        <span class="card-label">{t('results.coverage')}</span>
        <span class="card-value coverage-value">
          {summaryStats.coveragePercent.toFixed(0)}%
        </span>
      </div>
      <div class="summary-card">
        <span class="card-label">{t('results.pointsCount')}</span>
        <span class="card-value">{summaryStats.totalPoints}</span>
      </div>
    </div>

    <!-- Run Comparison Section -->
    {#if runs.length >= 2}
      <div class="comparison-section">
        <h3>{t('results.selectRuns')}</h3>
        <div class="run-selectors">
          <div class="selector-group">
            <label for="baseline-select">{t('results.baseline')}</label>
            <select id="baseline-select" bind:value={baselineRunId}>
              {#each runs as run (run.id)}
                <option value={run.id}>{getRunOptionLabel(run)}</option>
              {/each}
            </select>
          </div>
          <div class="selector-group">
            <label for="comparison-select">{t('results.comparison')}</label>
            <select id="comparison-select" bind:value={comparisonRunId}>
              <option value="">--</option>
              {#each runs.filter((r) => r.id !== baselineRunId) as run (run.id)}
                <option value={run.id}>{getRunOptionLabel(run)}</option>
              {/each}
            </select>
          </div>
        </div>

        {#if canCompare && baselineRun && comparisonRun}
          <RunComparisonCard
            {baselineRun}
            {comparisonRun}
            {baselineMeasurements}
            {comparisonMeasurements}
          />
        {/if}
      </div>
    {/if}

    <!-- Performance Metrics Table -->
    {#if latestMeasurements.length > 0}
      <div class="metrics-section">
        <h3>
          {t('measurement.throughput')} - {latestCompletedRun ? getRunOptionLabel(latestCompletedRun) : ''}
        </h3>
        <div class="metrics-table-wrapper">
          <table class="metrics-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('measurement.rssi')}</th>
                <th>{t('measurement.upload')}</th>
                <th>{t('measurement.download')}</th>
                <th>{t('measurement.jitter')}</th>
                <th>{t('measurement.packetLoss')}</th>
                <th>{t('measurement.quality')}</th>
              </tr>
            </thead>
            <tbody>
              {#each latestMeasurements as m, idx (m.id)}
                <tr>
                  <td class="row-index">{idx + 1}</td>
                  <td class="rssi-cell" style="color: {getRssiColor(m.rssi_dbm)}">
                    {m.rssi_dbm !== null ? `${m.rssi_dbm} dBm` : '--'}
                  </td>
                  <td>{formatBps(m.iperf_tcp_upload_bps)}</td>
                  <td>{formatBps(m.iperf_tcp_download_bps)}</td>
                  <td>{formatJitter(m.iperf_udp_jitter_ms)}</td>
                  <td>{formatPacketLoss(m.iperf_udp_lost_percent)}</td>
                  <td>
                    <span class="quality-badge {getQualityClass(m.quality)}">
                      {getQualityLabel(m.quality)}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Error display -->
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}
  {/if}
</div>

<!-- Export Dialog -->
<ExportDialog
  open={exportDialogOpen}
  projectId={projectStore.currentProject?.id ?? ''}
  {runs}
  {measurementsByRun}
  onClose={() => (exportDialogOpen = false)}
/>

<style>
  .results-page {
    padding: 24px;
    max-width: 1000px;
    margin: 0 auto;
    color: #c0c0d0;
    overflow-y: auto;
    height: 100%;
  }

  /* ── Loading ──────────────────────────────────────────────── */

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Empty State ──────────────────────────────────────────── */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 20px;
  }

  .empty-icon {
    color: #4a4a6a;
    margin-bottom: 16px;
  }

  .empty-state h2 {
    margin: 0 0 8px;
    font-size: 1.1rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.85rem;
    color: #808090;
  }

  /* ── Header ───────────────────────────────────────────────── */

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .export-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 6px;
    color: #a5b4fc;
    font-size: 0.8rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .export-btn:hover {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.5);
  }

  /* ── Summary Cards ────────────────────────────────────────── */

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }

  .summary-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-value {
    font-size: 1.1rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #e0e0f0;
  }

  .coverage-value {
    color: #a5b4fc;
  }

  /* ── Comparison Section ───────────────────────────────────── */

  .comparison-section {
    margin-bottom: 24px;
  }

  .comparison-section h3 {
    margin: 0 0 12px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .run-selectors {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
  }

  .selector-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .selector-group label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .selector-group select {
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #c0c0d0;
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .selector-group select:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .selector-group select option {
    background: #1e1e3a;
    color: #c0c0d0;
  }

  /* ── Metrics Table ────────────────────────────────────────── */

  .metrics-section {
    margin-bottom: 24px;
  }

  .metrics-section h3 {
    margin: 0 0 12px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .metrics-table-wrapper {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .metrics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .metrics-table thead {
    background: rgba(255, 255, 255, 0.04);
  }

  .metrics-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.65rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .metrics-table td {
    padding: 8px 12px;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  .metrics-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .row-index {
    color: #606070;
    font-weight: 500;
  }

  .rssi-cell {
    font-weight: 600;
  }

  .quality-badge {
    display: inline-block;
    font-size: 0.65rem;
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .quality-good {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  .quality-fair {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .quality-poor {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
  }

  .quality-failed {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .quality-pending {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }

  /* ── Error ────────────────────────────────────────────────── */

  .error-banner {
    margin-top: 16px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 6px;
    color: #f87171;
    font-size: 0.8rem;
  }
</style>
