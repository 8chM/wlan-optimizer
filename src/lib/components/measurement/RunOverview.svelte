<!--
  RunOverview.svelte - Shows all 3 measurement runs with their status.

  Displays:
  - Run 1: Baseline (required)
  - Run 2: Post-Optimization (optional)
  - Run 3: Verification (optional)
  Each run shows status badge, point count, date, and click-to-select.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { MeasurementRunResponse, MeasurementResponse } from '$lib/api/invoke';

  // ─── Props ─────────────────────────────────────────────────────

  interface RunOverviewProps {
    /** All measurement runs for this floor */
    runs: MeasurementRunResponse[];
    /** All measurements (to count per run) */
    measurements: MeasurementResponse[];
    /** Currently selected run ID */
    activeRunId: string | null;
    /** Callback when a run is selected */
    onSelectRun?: (runId: string) => void;
    /** Callback when creating a new run */
    onCreateRun?: (runNumber: number, runType: string) => void;
  }

  let {
    runs,
    measurements,
    activeRunId = null,
    onSelectRun,
    onCreateRun,
  }: RunOverviewProps = $props();

  // ─── Run Definitions ──────────────────────────────────────────

  interface RunSlot {
    number: number;
    type: string;
    labelKey: string;
    required: boolean;
  }

  const RUN_SLOTS: RunSlot[] = [
    { number: 1, type: 'baseline', labelKey: 'measurement.baseline', required: true },
    { number: 2, type: 'post_optimization', labelKey: 'measurement.postOptimization', required: false },
    { number: 3, type: 'verification', labelKey: 'measurement.verification', required: false },
  ];

  // ─── Helpers ──────────────────────────────────────────────────

  function getRunForSlot(slot: RunSlot): MeasurementRunResponse | undefined {
    return runs.find((r) => r.run_number === slot.number);
  }

  function getMeasurementCount(runId: string): number {
    return measurements.filter((m) => m.measurement_run_id === runId).length;
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'completed': return 'badge-completed';
      case 'in_progress': return 'badge-progress';
      case 'cancelled': return 'badge-cancelled';
      case 'failed': return 'badge-cancelled';
      default: return 'badge-pending';
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleRunClick(runId: string): void {
    onSelectRun?.(runId);
  }

  function handleCreateClick(slot: RunSlot): void {
    onCreateRun?.(slot.number, slot.type);
  }
</script>

<div class="run-overview">
  <h3 class="overview-title">{t('measurement.title')}</h3>

  <div class="run-list">
    {#each RUN_SLOTS as slot (slot.number)}
      {@const run = getRunForSlot(slot)}
      {#if run}
        <button
          class="run-card"
          class:active={activeRunId === run.id}
          onclick={() => handleRunClick(run.id)}
        >
          <div class="run-header">
            <span class="run-label">
              {t('measurement.run')} {slot.number}: {t(slot.labelKey)}
            </span>
            <span class="run-badge {getStatusBadgeClass(run.status)}">
              {run.status}
            </span>
          </div>
          <div class="run-meta">
            <span class="run-points">
              {getMeasurementCount(run.id)} {t('measurement.pointsCount')}
            </span>
            <span class="run-date">{formatDate(run.created_at)}</span>
          </div>
        </button>
      {:else}
        <button
          class="run-card empty"
          onclick={() => handleCreateClick(slot)}
        >
          <span class="run-label">
            {t('measurement.run')} {slot.number}: {t(slot.labelKey)}
          </span>
          <span class="run-empty-hint">
            {slot.required ? '+' : '+ (' + t('measurement.optional') + ')'}
          </span>
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .run-overview {
    padding: 4px 0;
  }

  .overview-title {
    margin: 0 0 10px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .run-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .run-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #c0c0d0;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
    font-family: inherit;
    font-size: inherit;
  }

  .run-card:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .run-card.active {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.4);
  }

  .run-card.empty {
    border-style: dashed;
    align-items: center;
    justify-content: center;
    flex-direction: row;
    gap: 8px;
    opacity: 0.6;
  }

  .run-card.empty:hover {
    opacity: 0.9;
  }

  .run-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .run-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #e0e0f0;
  }

  .run-badge {
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .badge-completed {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
  }

  .badge-progress {
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
  }

  .badge-cancelled {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .badge-pending {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }

  .run-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .run-points {
    font-size: 0.7rem;
    color: #808090;
  }

  .run-date {
    font-size: 0.65rem;
    color: #606070;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .run-empty-hint {
    font-size: 0.7rem;
    color: #606070;
  }
</style>
