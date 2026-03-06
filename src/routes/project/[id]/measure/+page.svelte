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
  import { workspaceStore } from '$lib/stores/workspaceStore.svelte';
  import { safeInvoke } from '$lib/api/invoke';
  import { t } from '$lib/i18n';

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

  // ─── Register Click Handler ─────────────────────────────────────

  $effect(() => {
    workspaceStore.registerHandlers({
      onClick: handleCanvasClick,
    });

    return () => {
      workspaceStore.unregisterHandlers();
      workspaceStore.setCursorOverride(null);
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
</script>

<svelte:head>
  <title>{t('nav.measure')} - {t('app.title')}</title>
</svelte:head>

<!-- Sidebar with measurement wizard -->
<aside class="measure-sidebar">
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
</style>
