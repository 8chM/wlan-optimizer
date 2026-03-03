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
  import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
  import MeasurementPoints from '$lib/canvas/MeasurementPoints.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import CrosshairCursor from '$lib/canvas/CrosshairCursor.svelte';
  import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
  import SavedMeasurements from '$lib/canvas/SavedMeasurements.svelte';
  import type { SavedMeasurement } from '$lib/canvas/SavedMeasurements.svelte';
  import TextAnnotation from '$lib/canvas/TextAnnotation.svelte';
  import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
  import MeasurementWizard from '$lib/components/measurement/MeasurementWizard.svelte';
  import EditorHeatmap from '$lib/components/editor/EditorHeatmap.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { measurementStore } from '$lib/stores/measurementStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { safeInvoke } from '$lib/api/invoke';
  import { t } from '$lib/i18n';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import type { Position } from '$lib/models/types';

  // Set page context for toolbar filtering
  $effect(() => {
    canvasStore.setPageContext('measure');
  });

  // ─── Layout State ─────────────────────────────────────────────

  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let floorImageDataUrl = $state<string | null>(null);
  let mousePosition = $state<Position | null>(null);
  let isPlacingMeasurementPoint = $state(false);
  let measureStart = $state<{ x: number; y: number } | null>(null);
  let measureEnd = $state<{ x: number; y: number } | null>(null);
  let annotations = $state<AnnotationData[]>([]);
  let savedMeasurements = $state<SavedMeasurement[]>([]);

  // Cursor per tool
  let canvasCursor = $derived.by(() => {
    if (canvasStore.spaceHeld) return 'grab';
    if (isPlacingMeasurementPoint) return 'crosshair';
    switch (canvasStore.activeTool) {
      case 'pan': return 'grab';
      case 'measure': return 'crosshair';
      default: return 'default';
    }
  });

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');
  let floorRotation = $derived(floor?.background_image_rotation ?? 0);

  // Floor bounds for heatmap (dynamic from wall/AP bounding box)
  let floorBounds = $derived.by(() => {
    const walls = floor?.walls ?? [];
    const aps = floor?.access_points ?? [];
    if (walls.length === 0 && aps.length === 0) {
      return { width: floor?.width_meters ?? 10, height: floor?.height_meters ?? 10, originX: 0, originY: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      for (const seg of w.segments) {
        minX = Math.min(minX, seg.x1, seg.x2);
        minY = Math.min(minY, seg.y1, seg.y2);
        maxX = Math.max(maxX, seg.x1, seg.x2);
        maxY = Math.max(maxY, seg.y1, seg.y2);
      }
    }
    for (const ap of aps) {
      minX = Math.min(minX, ap.x); minY = Math.min(minY, ap.y);
      maxX = Math.max(maxX, ap.x); maxY = Math.max(maxY, ap.y);
    }
    const pad = 2;
    return {
      originX: Math.floor(minX) - pad,
      originY: Math.floor(minY) - pad,
      width: Math.ceil(maxX - Math.floor(minX)) + 2 * pad,
      height: Math.ceil(maxY - Math.floor(minY)) + 2 * pad,
    };
  });

  // Determine active run number for shape rendering
  let activeRunNumber = $derived(
    measurementStore.currentRun?.run_number ?? 1,
  );

  // ─── Load background offset from localStorage ─────────────────

  $effect(() => {
    const id = floor?.id;
    if (!id) return;
    const stored = localStorage.getItem(`wlan-opt:bg-offset:${id}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          canvasStore.setBackgroundOffset(data.x, data.y);
        }
      } catch { /* ignore */ }
    }
  });

  // ─── Load annotations from localStorage (read-only) ─────────
  $effect(() => {
    const id = floor?.id;
    if (!id) return;
    const stored = localStorage.getItem(`wlan-opt:annotations:${id}`);
    if (stored) {
      try { annotations = JSON.parse(stored); } catch { /* ignore */ }
    } else {
      annotations = [];
    }
  });

  // ─── Load saved measurements from localStorage (read-only) ──
  $effect(() => {
    const id = floor?.id;
    if (!id) return;
    const stored = localStorage.getItem(`wlan-opt:measurements:${id}`);
    if (stored) {
      try { savedMeasurements = JSON.parse(stored); } catch { /* ignore */ }
    } else {
      savedMeasurements = [];
    }
  });

  // ─── Load floor image ────────────────────────────────────────

  $effect(() => {
    const currentFloorId = floor?.id;
    if (!currentFloorId) return;
    loadFloorImage(currentFloorId);

    return () => {
      if (floorImageDataUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(floorImageDataUrl);
      }
    };
  });

  async function loadFloorImage(id: string): Promise<void> {
    try {
      const result = await safeInvoke('get_floor_image', { floor_id: id });
      if (result?.background_image && result.background_image_format) {
        const bytes = new Uint8Array(result.background_image);
        const blob = new Blob([bytes], { type: `image/${result.background_image_format}` });
        floorImageDataUrl = URL.createObjectURL(blob);
      } else {
        // Check localStorage for browser-mode image
        const stored = localStorage.getItem(`wlan-opt:floor-image:${id}`);
        if (stored) {
          floorImageDataUrl = stored;
        }
      }
    } catch {
      // No image available
    }
  }

  // ─── Load Data on Mount ───────────────────────────────────────

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

  function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
    mousePosition = { x: canvasX, y: canvasY };
    canvasStore.setMousePosition(canvasX / scalePxPerMeter, canvasY / scalePxPerMeter);
  }

  // ─── Keyboard Shortcuts ────────────────────────────────────────
  $effect(() => {
    const cleanup = registerShortcuts({
      selectTool: () => canvasStore.setTool('select'),
      panTool: () => canvasStore.setTool('pan'),
      measureTool: () => canvasStore.setTool('measure'),
      gridToggle: () => canvasStore.toggleGrid(),
      deselect: () => {
        if (isPlacingMeasurementPoint) {
          isPlacingMeasurementPoint = false;
          return;
        }
        if (measureStart) {
          measureStart = null;
          measureEnd = null;
          return;
        }
        canvasStore.setTool('select');
        canvasStore.clearSelection();
      },
      save: () => {
        // no-op on viewer pages
      },
    });
    return cleanup;
  });

  // Track modifier keys for panning
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') canvasStore.setShiftHeld(true);
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      canvasStore.setSpaceHeld(true);
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') canvasStore.setShiftHeld(false);
    if (event.key === ' ' || event.code === 'Space') {
      canvasStore.setSpaceHeld(false);
    }
  }

  // Reset measure on tool change
  $effect(() => {
    if (canvasStore.activeTool !== 'measure') {
      measureStart = null;
      measureEnd = null;
    }
  });

  function handleMeasureCanvasClick(canvasX: number, canvasY: number): void {
    if (canvasStore.activeTool === 'measure') {
      if (!measureStart) {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      } else if (!measureEnd) {
        measureEnd = { x: canvasX, y: canvasY };
      } else {
        // Reset and start new
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      }
    }
  }

  function handleStartPlacingPoint(): void {
    isPlacingMeasurementPoint = true;
  }

  /**
   * Add a measurement point at the given position (meters).
   */
  async function addMeasurementPointAt(x: number, y: number): Promise<void> {
    if (!floorId) return;
    const pointIndex = measurementStore.points.length + 1;
    const label = `P${pointIndex}`;
    await measurementStore.addPoint(floorId, label, x, y);
  }

  /**
   * Handle canvas click: route to measurement point placement or other tools.
   */
  async function handleCanvasClick(event: MouseEvent): Promise<void> {
    if (!floorId) return;

    // Convert screen coordinates to world coordinates (meters)
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const scale = canvasStore.scale ?? 1;
    const oX = canvasStore.offsetX ?? 0;
    const oY = canvasStore.offsetY ?? 0;

    const containerX = event.clientX - rect.left;
    const containerY = event.clientY - rect.top;
    const worldPxX = (containerX - oX) / scale;
    const worldPxY = (containerY - oY) / scale;
    const x = worldPxX / scalePxPerMeter;
    const y = worldPxY / scalePxPerMeter;

    // Measurement point placement (from wizard button)
    if (isPlacingMeasurementPoint) {
      await addMeasurementPointAt(x, y);
      isPlacingMeasurementPoint = false;
      return;
    }

    // MeasureLayer distance tool is handled separately via FloorplanEditor onCanvasClick
  }
</script>

<svelte:head>
  <title>{t('nav.measure')} - {t('app.title')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Headless live heatmap renderer -->
{#if floor}
  <EditorHeatmap
    accessPoints={floor.access_points ?? []}
    walls={floor.walls ?? []}
    bounds={floorBounds}
    {scalePxPerMeter}
    outputWidth={containerWidth}
    outputHeight={containerHeight}
  />
{/if}

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
      onDeleteRun={handleDeleteRun}
      onUpdateRunStatus={handleUpdateRunStatus}
      onDeletePoint={handleDeletePoint}
      onStartPlacingPoint={handleStartPlacingPoint}
      isPlacingPoint={isPlacingMeasurementPoint}
    />
  </aside>

  <!-- Center area with canvas -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="measure-canvas"
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    role="application"
    tabindex="-1"
    onclick={handleCanvasClick}
    onkeydown={() => {}}
    style:cursor={canvasCursor}
  >
    {#if floor}
      <FloorplanEditor
        width={containerWidth}
        height={containerHeight}
        floorplanWidthM={floor.width_meters ?? 10}
        floorplanHeightM={floor.height_meters ?? 10}
        {scalePxPerMeter}
        onCanvasMouseMove={handleCanvasMouseMove}
        onCanvasClick={handleMeasureCanvasClick}
      >
        {#snippet background()}
          {#if canvasStore.backgroundVisible}
            <BackgroundImage
              imageData={floorImageDataUrl}
              {scalePxPerMeter}
              rotation={floorRotation}
              opacity={canvasStore.backgroundOpacity}
              userOffsetX={canvasStore.backgroundOffsetX}
              userOffsetY={canvasStore.backgroundOffsetY}
            />
          {/if}
          <GridOverlay
            gridSizeM={canvasStore.gridSize}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            stageOffsetX={canvasStore.offsetX}
            stageOffsetY={canvasStore.offsetY}
            viewportWidth={containerWidth}
            viewportHeight={containerHeight}
            visible={canvasStore.gridVisible}
          />
          <ScaleIndicator
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
          />
        {/snippet}

        {#snippet heatmap()}
          <HeatmapOverlay
            heatmapCanvas={editorHeatmapStore.canvas}
            bounds={floorBounds}
            {scalePxPerMeter}
            visible={editorHeatmapStore.visible && editorHeatmapStore.canvas !== null}
            opacity={editorHeatmapStore.opacity}
          />
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

          <!-- Text annotations (read-only) -->
          {#each annotations as annotation (annotation.id)}
            <TextAnnotation
              {annotation}
              {scalePxPerMeter}
              selected={false}
              draggable={false}
            />
          {/each}

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

          <!-- Measure tool layer (distance ruler) -->
          {#if canvasStore.activeTool === 'measure' && measureStart}
            <MeasureLayer
              startPoint={measureStart}
              endPoint={measureEnd}
              {scalePxPerMeter}
              mousePosition={mousePosition}
            />
          {/if}

          <!-- Saved/pinned measurements (read-only) -->
          {#if savedMeasurements.length > 0}
            <SavedMeasurements
              measurements={savedMeasurements}
              {scalePxPerMeter}
            />
          {/if}

          <!-- Crosshair cursor for measure tool -->
          {#if mousePosition && canvasStore.activeTool === 'measure'}
            <CrosshairCursor x={mousePosition.x} y={mousePosition.y} />
          {/if}

          <!-- Ruler overlay (always visible, rendered last so it's on top) -->
          <RulerOverlay
            widthPx={containerWidth}
            heightPx={containerHeight}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            stageOffsetX={canvasStore.offsetX}
            stageOffsetY={canvasStore.offsetY}
          />
        {/snippet}
      </FloorplanEditor>

      <!-- Canvas scrollbars overlay -->
      <CanvasScrollbars
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
        contentWidth={(floor.width_meters ?? 10) * scalePxPerMeter}
        contentHeight={(floor.height_meters ?? 10) * scalePxPerMeter}
        scale={canvasStore.scale}
        offsetX={canvasStore.offsetX}
        offsetY={canvasStore.offsetY}
        onOffsetChange={(x, y) => canvasStore.setOffset(x, y)}
      />
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
