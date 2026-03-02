<!--
  Measure page - Measurement workflow with canvas and wizard sidebar.

  Integrates:
  - MeasurementWizard in the sidebar area
  - FloorplanEditor with MeasurementPoints overlay
  - measurementStore for state management
-->
<script lang="ts">
  import { page } from '$app/stores';
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
  import MeasurementPoints from '$lib/canvas/MeasurementPoints.svelte';
  import MeasurementWizard from '$lib/components/measurement/MeasurementWizard.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { measurementStore } from '$lib/stores/measurementStore.svelte';
  import { safeInvoke } from '$lib/api/invoke';
  import { t } from '$lib/i18n';

  // ─── Layout State ─────────────────────────────────────────────

  let containerWidth = $state(800);
  let containerHeight = $state(600);

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');

  // Determine active run number for shape rendering
  let activeRunNumber = $derived(
    measurementStore.currentRun?.run_number ?? 1,
  );

  // ─── Load Data on Mount ───────────────────────────────────────

  $effect(() => {
    if (floorId) {
      measurementStore.loadRuns(floorId);
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

  // ─── Handlers ─────────────────────────────────────────────────

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

    // Persist the calibrated path loss exponent to heatmap settings
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
    // Select the point in the wizard
    console.log('[Measure] Point clicked:', pointId);
  }

  /**
   * Handle canvas click to add measurement points in measure mode.
   */
  async function handleCanvasClick(event: MouseEvent): Promise<void> {
    if (canvasStore.activeTool !== 'measure') return;
    if (!floorId) return;

    // Convert screen coordinates to world coordinates (meters),
    // accounting for canvas zoom level
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const scale = canvasStore.scale ?? 1;
    const x = (event.clientX - rect.left) / (scalePxPerMeter * scale);
    const y = (event.clientY - rect.top) / (scalePxPerMeter * scale);

    const pointIndex = measurementStore.points.length + 1;
    const label = `P${pointIndex}`;
    await measurementStore.addPoint(floorId, label, x, y);
  }
</script>

<svelte:head>
  <title>{t('nav.measure')} - {t('app.title')}</title>
</svelte:head>

<div class="measure-page">
  <!-- Left sidebar with measurement wizard -->
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
    />
  </aside>

  <!-- Center area with canvas -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="measure-canvas"
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    role="application"
    tabindex="-1"
    onclick={handleCanvasClick}
    onkeydown={() => {}}
  >
    {#if floor}
      <FloorplanEditor
        width={containerWidth}
        height={containerHeight}
        floorplanWidthM={floor.width_meters ?? 10}
        floorplanHeightM={floor.height_meters ?? 10}
        {scalePxPerMeter}
      >
        {#snippet background()}
          <GridOverlay
            widthPx={(floor.width_meters ?? 10) * scalePxPerMeter}
            heightPx={(floor.height_meters ?? 10) * scalePxPerMeter}
            gridSizeM={canvasStore.gridSize}
            {scalePxPerMeter}
            visible={canvasStore.gridVisible}
          />
          <BackgroundImage
            imageData={null}
            {scalePxPerMeter}
          />
          <ScaleIndicator
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
          />
        {/snippet}

        {#snippet heatmap()}
          <!-- Heatmap overlay placeholder -->
        {/snippet}

        {#snippet ui()}
          <!-- Walls (read-only in measure mode) -->
          {#if floor.walls}
            {#each floor.walls as wall (wall.id)}
              <WallDrawingTool
                {wall}
                selected={false}
                {scalePxPerMeter}
              />
            {/each}
          {/if}

          <!-- Access points (read-only in measure mode) -->
          {#if floor.access_points}
            {#each floor.access_points as ap (ap.id)}
              <AccessPointMarker
                accessPoint={ap}
                selected={false}
                {scalePxPerMeter}
                draggable={false}
              />
            {/each}
          {/if}

          <!-- Measurement points -->
          <MeasurementPoints
            points={measurementStore.points}
            measurements={measurementStore.measurements}
            {scalePxPerMeter}
            activeRunId={measurementStore.currentRunId}
            {activeRunNumber}
            interactive={!measurementStore.isMeasuring}
            onPointClick={handlePointClick}
          />
        {/snippet}
      </FloorplanEditor>
    {:else}
      <div class="empty-canvas">
        <p>{t('editor.noFloorplan')}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .measure-page {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

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

  .measure-canvas {
    flex: 1;
    overflow: hidden;
    background: #e8e8f0;
    position: relative;
    outline: none;
  }

  .empty-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #6a6a8a;
    font-size: 1rem;
  }
</style>
