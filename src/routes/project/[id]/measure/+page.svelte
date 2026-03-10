<!--
  Measure page - Sidebar-only: MeasurementWizard + point placement.

  Canvas rendering is handled by the persistent WorkspaceCanvas in the layout.
  This page registers a click handler for measurement point placement
  and renders the MeasurementWizard sidebar.
-->
<script lang="ts">
  import MeasurementWizard from '$lib/components/measurement/MeasurementWizard.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { measurementStore } from '$lib/stores/measurementStore.svelte';
  import { optimierungStore } from '$lib/stores/optimierungStore.svelte';
  import { workspaceStore } from '$lib/stores/workspaceStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import { safeInvoke } from '$lib/api/invoke';
  import { t } from '$lib/i18n';
  import { exportMeasurementsToJson } from '$lib/utils/measurement-export';

  // Set page context for toolbar filtering
  $effect(() => {
    canvasStore.setPageContext('measure');
    return () => {
      // Don't reset — layout handles that
    };
  });

  // ─── Floor Data ─────────────────────────────────────────────────

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');

  // ─── Placement State ────────────────────────────────────────────

  let isPlacingMeasurementPoint = $state(false);

  // Cursor override for measurement placement
  $effect(() => {
    if (isPlacingMeasurementPoint) {
      workspaceStore.setCursorOverride('crosshair');
    } else {
      workspaceStore.setCursorOverride(null);
    }
  });

  // ─── Keyboard Shortcuts ────────────────────────────────────────

  $effect(() => {
    const cleanup = registerShortcuts({
      heatmapToggle: () => { editorHeatmapStore.toggleVisible(); },
    });
    return cleanup;
  });

  // ─── Register Click Handler ─────────────────────────────────────

  $effect(() => {
    workspaceStore.registerHandlers({
      onClick: handleCanvasClick,
    });

    return () => {
      workspaceStore.unregisterHandlers();
      workspaceStore.setCursorOverride(null);
      editorHeatmapStore.setProbeActive(false);
    };
  });

  function handleCanvasClick(canvasX: number, canvasY: number): void {
    if (!floorId) return;

    // Measurement point placement (from wizard button)
    if (isPlacingMeasurementPoint) {
      const x = canvasX / scalePxPerMeter;
      const y = canvasY / scalePxPerMeter;
      addMeasurementPointAt(x, y);
      isPlacingMeasurementPoint = false;
      return;
    }
  }

  // ─── Load Data on Mount ─────────────────────────────────────────

  $effect(() => {
    if (floorId) {
      measurementStore.loadRuns(floorId);
      measurementStore.loadPoints(floorId);
    }
    return () => {
      measurementStore.reset();
    };
  });

  // Load measurements when run changes
  $effect(() => {
    const runId = measurementStore.currentRunId;
    if (runId) {
      measurementStore.loadMeasurements(runId);
    }
  });

  // Auto-compute calibration when measurements change
  $effect(() => {
    const mCount = measurementStore.measurements.length;
    const aps = floor?.access_points ?? [];
    if (mCount >= 2 && aps.length > 0) {
      measurementStore.runCalibration(aps);
    }
  });

  // ─── Handlers ───────────────────────────────────────────────────

  function handleServerIpChange(ip: string): void {
    measurementStore.setServerIp(ip);
  }

  function handleTestServer(): void {
    measurementStore.checkServer(measurementStore.iperfServerIp);
  }

  function handleSelectRun(runId: string): void {
    measurementStore.selectRun(runId);
  }

  async function handleCreateRun(runNumber: number, runType: string): Promise<void> {
    if (!floorId) return;
    await measurementStore.createRun(floorId, runNumber, runType);
  }

  async function handleStartMeasurement(pointId: string): Promise<void> {
    const runId = measurementStore.currentRunId;
    if (!runId) return;
    await measurementStore.runMeasurement(pointId, runId);
  }

  function handleCancelMeasurement(): void {
    measurementStore.cancelCurrentMeasurement();
  }

  async function handleApplyCalibration(calibratedN: number): Promise<void> {
    const projectId = projectStore.currentProject?.id;
    if (!projectId) return;
    try {
      await safeInvoke('update_heatmap_settings', {
        params: {
          project_id: projectId,
          path_loss_exponent: calibratedN,
        },
      });
    } catch (err) {
      console.error('[Measure] Failed to persist calibration:', err);
    }
  }

  function handlePointClick(pointId: string): void {
    console.log('[Measure] Point clicked:', pointId);
  }

  async function handleDeleteRun(runId: string): Promise<void> {
    await measurementStore.deleteRun(runId);
  }

  async function handleUpdateRunStatus(
    runId: string,
    status: 'completed' | 'cancelled',
  ): Promise<void> {
    await measurementStore.updateRunStatus(runId, status);
    // Trigger re-analyze on the Optimierung page when a run is completed
    if (status === 'completed') {
      optimierungStore.setStale(true);
    }
  }

  async function handleDeletePoint(pointId: string): Promise<void> {
    await measurementStore.deletePoint(pointId);
  }

  function handleStartPlacingPoint(): void {
    isPlacingMeasurementPoint = true;
  }

  async function addMeasurementPointAt(x: number, y: number): Promise<void> {
    if (!floorId) return;
    const pointIndex = measurementStore.points.length + 1;
    const label = `P${pointIndex}`;
    await measurementStore.addPoint(floorId, label, x, y);
  }

  function handleExportJson(): void {
    const json = exportMeasurementsToJson(
      measurementStore.runs,
      measurementStore.points,
      measurementStore.measurements,
      floorId,
    );
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurements-${floorId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>{t('nav.measure')} - {t('app.title')}</title>
</svelte:head>

<!-- Sidebar with measurement wizard -->
<aside class="measure-sidebar">
  {#if measurementStore.runs.length > 0}
    <button
      class="export-btn"
      onclick={handleExportJson}
      title={t('measurement.exportJsonTooltip')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
      </svg>
      {t('measurement.exportJson')}
    </button>
  {/if}
  <MeasurementWizard
    {floorId}
    runs={measurementStore.runs}
    measurements={measurementStore.measurements}
    points={measurementStore.points}
    activeRunId={measurementStore.currentRunId}
    isMeasuring={measurementStore.isMeasuring}
    iperfServerIp={measurementStore.iperfServerIp}
    iperfServerReachable={measurementStore.iperfServerReachable}
    isCheckingServer={measurementStore.isCheckingServer}
    progress={measurementStore.measurementProgress}
    calibratedN={measurementStore.calibratedN}
    calibrationRMSE={measurementStore.calibrationRMSE}
    calibrationConfidence={measurementStore.calibrationConfidence}
    calibrationOriginalN={measurementStore.calibrationOriginalN}
    calibrationRSquared={measurementStore.calibrationRSquared}
    calibrationMaxDeviation={measurementStore.calibrationMaxDeviation}
    calibrationPointCount={measurementStore.calibrationPointCount}
    error={measurementStore.error}
    onServerIpChange={handleServerIpChange}
    onTestServer={handleTestServer}
    onSelectRun={handleSelectRun}
    onCreateRun={handleCreateRun}
    onStartMeasurement={handleStartMeasurement}
    onCancelMeasurement={handleCancelMeasurement}
    onApplyCalibration={handleApplyCalibration}
    onDeleteRun={handleDeleteRun}
    onUpdateRunStatus={handleUpdateRunStatus}
    onDeletePoint={handleDeletePoint}
    onStartPlacingPoint={handleStartPlacingPoint}
    isPlacingPoint={isPlacingMeasurementPoint}
  />
</aside>

<style>
  .measure-sidebar {
    width: 280px;
    min-width: 280px;
    background: #1a1a2e;
    color: #c0c0d0;
    overflow-y: auto;
    padding: 8px;
    border-right: 1px solid #2a2a4e;
    flex-shrink: 0;
  }

  .export-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    color: #808090;
    font-size: 0.7rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: 6px;
  }

  .export-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    color: #a0a0b0;
  }
</style>
