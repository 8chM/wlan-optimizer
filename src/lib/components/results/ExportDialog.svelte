<!--
  ExportDialog.svelte - Modal dialog for exporting measurement results.

  Supports:
  - JSON export (full measurement data)
  - CSV export (tabular measurement data)
  Uses browser download API (Blob + URL.createObjectURL) for MVP.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { MeasurementRunResponse, MeasurementResponse } from '$lib/api/invoke';

  // ─── Props ─────────────────────────────────────────────────────

  interface ExportDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** All measurement runs to export */
    runs: MeasurementRunResponse[];
    /** All measurements grouped by run ID */
    measurementsByRun: Record<string, MeasurementResponse[]>;
    /** Callback to close the dialog */
    onClose: () => void;
  }

  let {
    open,
    runs,
    measurementsByRun,
    onClose,
  }: ExportDialogProps = $props();

  // ─── Export Functions ──────────────────────────────────────────

  /**
   * Triggers a browser download with the given content.
   */
  function downloadFile(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  /**
   * Export measurement data as JSON.
   */
  function exportJson(): void {
    const exportData = {
      exportedAt: new Date().toISOString(),
      runs: runs.map((run) => ({
        ...run,
        measurements: measurementsByRun[run.id] ?? [],
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(`wlan-optimizer-results-${timestamp}.json`, json, 'application/json');
    onClose();
  }

  /**
   * Export measurement data as CSV.
   */
  function exportCsv(): void {
    const headers = [
      'run_number',
      'run_type',
      'run_status',
      'measurement_id',
      'point_id',
      'timestamp',
      'frequency_band',
      'rssi_dbm',
      'noise_dbm',
      'snr_db',
      'connected_bssid',
      'connected_ssid',
      'frequency_mhz',
      'tx_rate_mbps',
      'tcp_upload_bps',
      'tcp_download_bps',
      'tcp_retransmits',
      'udp_throughput_bps',
      'udp_jitter_ms',
      'udp_lost_packets',
      'udp_total_packets',
      'udp_lost_percent',
      'quality',
    ];

    const rows: string[] = [headers.join(',')];

    for (const run of runs) {
      const measurements = measurementsByRun[run.id] ?? [];
      for (const m of measurements) {
        const row = [
          run.run_number,
          run.run_type,
          run.status,
          m.id,
          m.measurement_point_id,
          m.timestamp,
          m.frequency_band,
          m.rssi_dbm ?? '',
          m.noise_dbm ?? '',
          m.snr_db ?? '',
          m.connected_bssid ?? '',
          m.connected_ssid ?? '',
          m.frequency_mhz ?? '',
          m.tx_rate_mbps ?? '',
          m.iperf_tcp_upload_bps ?? '',
          m.iperf_tcp_download_bps ?? '',
          m.iperf_tcp_retransmits ?? '',
          m.iperf_udp_throughput_bps ?? '',
          m.iperf_udp_jitter_ms ?? '',
          m.iperf_udp_lost_packets ?? '',
          m.iperf_udp_total_packets ?? '',
          m.iperf_udp_lost_percent ?? '',
          m.quality,
        ];
        // Escape values that may contain commas
        rows.push(row.map((v) => {
          const str = String(v);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(','));
      }
    }

    const csv = rows.join('\n');
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadFile(`wlan-optimizer-results-${timestamp}.csv`, csv, 'text/csv');
    onClose();
  }

  /**
   * Handle keyboard events for closing the dialog.
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  /**
   * Handle backdrop click to close.
   */
  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="dialog-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label={t('results.exportTitle')}
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div class="dialog-content">
      <div class="dialog-header">
        <h3>{t('results.exportTitle')}</h3>
        <button class="close-btn" onclick={onClose} aria-label={t('action.close')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <div class="dialog-body">
        <p class="export-info">
          {runs.length} {runs.length === 1 ? t('measurement.run') : t('measurement.runs')}
        </p>

        <div class="export-buttons">
          <button class="export-btn json-btn" onclick={exportJson}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4zm8 10a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L12 15.586V12z"/>
            </svg>
            <span>{t('results.exportJson')}</span>
          </button>

          <button class="export-btn csv-btn" onclick={exportCsv}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
            </svg>
            <span>{t('results.exportCsv')}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog-content {
    background: #1e1e3a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    width: 360px;
    max-width: 90vw;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  }

  .dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #808090;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e0e0f0;
  }

  .dialog-body {
    padding: 20px;
  }

  .export-info {
    margin: 0 0 16px;
    font-size: 0.8rem;
    color: #808090;
  }

  .export-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .export-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #c0c0d0;
    font-size: 0.85rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
  }

  .export-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: #e0e0f0;
  }

  .export-btn svg {
    flex-shrink: 0;
    opacity: 0.7;
  }
</style>
