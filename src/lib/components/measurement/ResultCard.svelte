<!--
  ResultCard.svelte - Shows measurement result for a single point.

  Displays:
  - RSSI value with color indicator
  - TCP Upload/Download speeds (formatted as Mbps)
  - UDP jitter and packet loss
  - Overall quality badge (good/fair/poor/failed with colors)
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { MeasurementResponse } from '$lib/api/invoke';

  // ─── Props ─────────────────────────────────────────────────────

  interface ResultCardProps {
    /** Measurement data */
    measurement: MeasurementResponse;
    /** Label for the measurement point */
    pointLabel?: string;
  }

  let {
    measurement,
    pointLabel = '',
  }: ResultCardProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  let qualityClass = $derived(getQualityClass(measurement.quality));
  let qualityLabel = $derived(getQualityLabel(measurement.quality));
  let rssiColor = $derived(getRssiColor(measurement.rssi_dbm));

  // ─── Helpers ──────────────────────────────────────────────────

  function getQualityClass(quality: string): string {
    switch (quality) {
      case 'good': return 'quality-good';
      case 'fair': return 'quality-fair';
      case 'poor': return 'quality-poor';
      case 'failed': return 'quality-failed';
      default: return 'quality-pending';
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

  function getRssiColor(rssi: number | null): string {
    if (rssi === null) return '#6b7280';
    if (rssi >= -50) return '#22c55e';
    if (rssi >= -60) return '#84cc16';
    if (rssi >= -70) return '#f59e0b';
    if (rssi >= -80) return '#f97316';
    return '#ef4444';
  }

  /**
   * Formats bits per second to a readable Mbps string.
   */
  function formatBps(bps: number | null): string {
    if (bps === null) return '--';
    const mbps = bps / 1_000_000;
    if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
    if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
    return `${mbps.toFixed(2)} Mbps`;
  }

  /**
   * Formats jitter in milliseconds.
   */
  function formatJitter(ms: number | null): string {
    if (ms === null) return '--';
    return `${ms.toFixed(2)} ms`;
  }

  /**
   * Formats packet loss percentage.
   */
  function formatPacketLoss(percent: number | null): string {
    if (percent === null) return '--';
    return `${percent.toFixed(2)}%`;
  }
</script>

<div class="result-card">
  {#if pointLabel}
    <div class="card-header">
      <span class="point-label">{pointLabel}</span>
      <span class="quality-badge {qualityClass}">{qualityLabel}</span>
    </div>
  {:else}
    <div class="card-header">
      <span class="quality-badge {qualityClass}">{qualityLabel}</span>
    </div>
  {/if}

  <div class="result-grid">
    <!-- RSSI -->
    <div class="result-row">
      <span class="result-label">{t('measurement.rssi')}</span>
      <span class="result-value" style="color: {rssiColor}">
        {measurement.rssi_dbm !== null ? `${measurement.rssi_dbm} dBm` : '--'}
      </span>
    </div>

    <!-- TCP Upload -->
    <div class="result-row">
      <span class="result-label">{t('measurement.upload')}</span>
      <span class="result-value">{formatBps(measurement.iperf_tcp_upload_bps)}</span>
    </div>

    <!-- TCP Download -->
    <div class="result-row">
      <span class="result-label">{t('measurement.download')}</span>
      <span class="result-value">{formatBps(measurement.iperf_tcp_download_bps)}</span>
    </div>

    <!-- UDP Jitter -->
    <div class="result-row">
      <span class="result-label">{t('measurement.jitter')}</span>
      <span class="result-value">{formatJitter(measurement.iperf_udp_jitter_ms)}</span>
    </div>

    <!-- Packet Loss -->
    <div class="result-row">
      <span class="result-label">{t('measurement.packetLoss')}</span>
      <span class="result-value">{formatPacketLoss(measurement.iperf_udp_lost_percent)}</span>
    </div>
  </div>

  <div class="result-band">
    {measurement.frequency_band} | {measurement.frequency_mhz ? `${measurement.frequency_mhz} MHz` : '--'}
  </div>
</div>

<style>
  .result-card {
    padding: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .point-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .quality-badge {
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

  .result-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .result-label {
    font-size: 0.7rem;
    color: #808090;
    font-weight: 500;
  }

  .result-value {
    font-size: 0.7rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    text-align: right;
  }

  .result-band {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.65rem;
    color: #606070;
    text-align: center;
  }
</style>
