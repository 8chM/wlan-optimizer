<!--
  WorkspaceCanvas.svelte - Persistent canvas rendered once in the layout.

  Consolidates ALL shared canvas logic that was previously duplicated across
  editor, measure, and mixing pages. Renders FloorplanEditor with background,
  heatmap, and UI layers. Mode-specific layers are conditionally rendered
  based on canvasStore.pageContext.
-->
<script lang="ts">
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
  import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import TextAnnotation from '$lib/canvas/TextAnnotation.svelte';
  import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
  import SavedMeasurements from '$lib/canvas/SavedMeasurements.svelte';
  import CrosshairCursor from '$lib/canvas/CrosshairCursor.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import SignalProbeMarker from '$lib/canvas/SignalProbeMarker.svelte';
  import EditorHeatmap from '$lib/components/editor/EditorHeatmap.svelte';
  import EditorHeatmapPanel from '$lib/components/editor/EditorHeatmapPanel.svelte';
  import EditorCanvasLayers from '$lib/canvas/EditorCanvasLayers.svelte';
  import MeasureCanvasLayers from '$lib/canvas/MeasureCanvasLayers.svelte';
  import MixingCanvasLayers from '$lib/canvas/MixingCanvasLayers.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { workspaceStore } from '$lib/stores/workspaceStore.svelte';
  import { probeSignalFromGrid } from '$lib/heatmap/signal-probe';
  import { safeInvoke } from '$lib/api/invoke';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import { t } from '$lib/i18n';
  import type { FloorBounds } from '$lib/heatmap';

  // ─── Container Sizing ──────────────────────────────────────────

  let containerWidth = $state(800);
  let containerHeight = $state(600);

  // ─── Floor Data ────────────────────────────────────────────────

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorRotation = $derived(floor?.background_image_rotation ?? 0);
  let pageContext = $derived(canvasStore.pageContext);

  // ─── Floor Image Loading ───────────────────────────────────────

  let floorImageDataUrl = $state<string | null>(null);

  $effect(() => {
    const floorId = floor?.id;
    if (!floorId) return;
    loadFloorImage(floorId);

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
        const stored = localStorage.getItem(`wlan-opt:floor-image:${id}`);
        if (stored) {
          floorImageDataUrl = stored;
        }
      }
    } catch {
      // No image available
    }
  }

  // ─── Floor Bounds (dynamic from wall/AP bounding box) ──────────

  let floorBounds = $derived.by((): FloorBounds => {
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

  // ─── Auto-Fit on Load ─────────────────────────────────────────

  let hasAutoFitted = $state(false);

  $effect(() => {
    const w = floor?.width_meters ?? 0;
    const h = floor?.height_meters ?? 0;
    if (w > 0 && h > 0) {
      canvasStore.setFloorDimensions(w, h, scalePxPerMeter);
    }
  });

  $effect(() => {
    canvasStore.setContainerSize(containerWidth, containerHeight);
  });

  $effect(() => {
    const w = floor?.width_meters ?? 0;
    const h = floor?.height_meters ?? 0;
    if (w > 0 && h > 0 && containerWidth > 100 && containerHeight > 100 && !hasAutoFitted) {
      hasAutoFitted = true;
      canvasStore.fitToScreen(w, h, scalePxPerMeter, containerWidth, containerHeight);
    }
  });

  // Reset auto-fit when floor changes
  $effect(() => {
    const _floorId = floor?.id;
    hasAutoFitted = false;
  });

  // ─── Load Shared Data from localStorage ────────────────────────

  $effect(() => {
    const floorId = floor?.id;
    if (!floorId) return;

    // Background offset
    const bgStored = localStorage.getItem(`wlan-opt:bg-offset:${floorId}`);
    if (bgStored) {
      try {
        const data = JSON.parse(bgStored);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          canvasStore.setBackgroundOffset(data.x, data.y);
        }
      } catch { /* ignore */ }
    } else {
      canvasStore.setBackgroundOffset(0, 0);
    }

    // Annotations
    const annStored = localStorage.getItem(`wlan-opt:annotations:${floorId}`);
    try {
      workspaceStore.setAnnotations(annStored ? JSON.parse(annStored) : []);
    } catch { workspaceStore.setAnnotations([]); }

    // Saved measurements
    const measStored = localStorage.getItem(`wlan-opt:measurements:${floorId}`);
    try {
      workspaceStore.setSavedMeasurements(measStored ? JSON.parse(measStored) : []);
    } catch { workspaceStore.setSavedMeasurements([]); }

    // Scale reference
    const scaleStored = localStorage.getItem(`wlan-opt:scale-ref:${floorId}`);
    if (scaleStored) {
      try {
        const data = JSON.parse(scaleStored);
        if (data.points?.length === 2 && typeof data.distanceM === 'number') {
          workspaceStore.setConfirmedScale(data.points, data.distanceM);
        }
      } catch { /* ignore */ }
    } else {
      workspaceStore.setConfirmedScale([], null);
    }

    // Background locked
    const pid = projectStore.currentProject?.id;
    if (pid) {
      workspaceStore.setBackgroundLocked(
        localStorage.getItem(`wlan-opt:wizard-done:${pid}`) === 'true',
      );
    }
  });

  // ─── Measure Tool State ────────────────────────────────────────

  let measureStart = $state<{ x: number; y: number } | null>(null);
  let measureEnd = $state<{ x: number; y: number } | null>(null);
  let selectedMeasurementId = $state<string | null>(null);

  // Reset measure on tool change
  $effect(() => {
    if (canvasStore.activeTool !== 'measure') {
      measureStart = null;
      measureEnd = null;
    }
  });

  // ─── Measured Distance (from measure tool) ────────────────────

  let measuredDistance = $derived.by((): number | null => {
    if (!measureStart || !measureEnd) return null;
    const dx = measureEnd.x - measureStart.x;
    const dy = measureEnd.y - measureStart.y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    return pixelDist / scalePxPerMeter;
  });

  function handlePinMeasurement(): void {
    if (!measureStart || !measureEnd) return;
    const x1m = measureStart.x / scalePxPerMeter;
    const y1m = measureStart.y / scalePxPerMeter;
    const x2m = measureEnd.x / scalePxPerMeter;
    const y2m = measureEnd.y / scalePxPerMeter;
    const dist = Math.sqrt((x2m - x1m) ** 2 + (y2m - y1m) ** 2);
    const updated = [...workspaceStore.savedMeasurements, {
      id: crypto.randomUUID(),
      x1: x1m, y1: y1m, x2: x2m, y2: y2m,
      distanceM: dist,
    }];
    workspaceStore.setSavedMeasurements(updated);
    // Persist to localStorage
    const floorId = floor?.id;
    if (floorId) {
      localStorage.setItem(`wlan-opt:measurements:${floorId}`, JSON.stringify(updated));
    }
    measureStart = null;
    measureEnd = null;
  }

  function handleSelectMeasurement(id: string): void {
    selectedMeasurementId = id;
    canvasStore.clearSelection();
  }

  function handleDeleteMeasurement(): void {
    if (!selectedMeasurementId) return;
    const updated = workspaceStore.savedMeasurements.filter(m => m.id !== selectedMeasurementId);
    workspaceStore.setSavedMeasurements(updated);
    selectedMeasurementId = null;
    const floorId = floor?.id;
    if (floorId) {
      localStorage.setItem(`wlan-opt:measurements:${floorId}`, JSON.stringify(updated));
    }
  }

  // Enter key to pin measurement, Delete to remove selected measurement
  $effect(() => {
    function handleMeasureKeys(e: KeyboardEvent): void {
      if (e.key === 'Enter' && measureStart && measureEnd) {
        e.preventDefault();
        handlePinMeasurement();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurementId) {
        e.preventDefault();
        handleDeleteMeasurement();
      }
      if (e.key === 'Escape' && selectedMeasurementId) {
        selectedMeasurementId = null;
      }
    }
    document.addEventListener('keydown', handleMeasureKeys);
    return () => document.removeEventListener('keydown', handleMeasureKeys);
  });

  // ─── Display Canvas (base vs forecast) ─────────────────────────

  let displayCanvas = $derived(
    workspaceStore.forecastActive && workspaceStore.forecastCanvas
      ? workspaceStore.forecastCanvas
      : editorHeatmapStore.canvas,
  );

  // ─── Display APs (with Mixing-Preview-Overrides) ───────────────

  let displayAps = $derived.by(() => {
    const aps = floor?.access_points ?? [];
    if (workspaceStore.displayApOverrides.size === 0) return aps;
    return aps.map(ap => {
      const overrides = workspaceStore.displayApOverrides.get(ap.id);
      return overrides ? { ...ap, ...overrides } : ap;
    });
  });

  // ─── Cursor ────────────────────────────────────────────────────

  let canvasCursor = $derived.by(() => {
    if (workspaceStore.cursorOverride) return workspaceStore.cursorOverride;
    if (canvasStore.spaceHeld) return 'grab';
    switch (canvasStore.activeTool) {
      case 'pan': return 'grab';
      case 'measure': return 'crosshair';
      default: return 'default';
    }
  });

  // ─── Central Click Dispatch ────────────────────────────────────

  function handleCanvasClick(canvasX: number, canvasY: number): void {
    // 1. Signal Probe (all modes)
    if (editorHeatmapStore.probeActive && editorHeatmapStore.visible && editorHeatmapStore.stats) {
      const meterX = canvasX / scalePxPerMeter;
      const meterY = canvasY / scalePxPerMeter;
      const result = probeSignalFromGrid(meterX, meterY, editorHeatmapStore.stats);
      if (result) {
        editorHeatmapStore.setProbeResult({ x: meterX, y: meterY }, result.rssiDbm, result.bestApId);
      }
      return;
    }

    // 2. Measure tool (all modes)
    if (canvasStore.activeTool === 'measure') {
      if (!measureStart) {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      } else if (!measureEnd) {
        measureEnd = { x: canvasX, y: canvasY };
      } else {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      }
      return;
    }

    // 3. Mode-specific (registered by child page)
    workspaceStore.clickHandler?.(canvasX, canvasY);
  }

  function handleCanvasDblClick(canvasX: number, canvasY: number): void {
    workspaceStore.dblClickHandler?.(canvasX, canvasY);
  }

  function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
    workspaceStore.setMousePosition({ x: canvasX, y: canvasY });
    canvasStore.setMousePosition(canvasX / scalePxPerMeter, canvasY / scalePxPerMeter);
  }

  // ─── Shared Keyboard Shortcuts ─────────────────────────────────

  $effect(() => {
    const cleanup = registerShortcuts({
      selectTool: () => canvasStore.setTool('select'),
      panTool: () => canvasStore.setTool('pan'),
      measureTool: () => canvasStore.setTool('measure'),
      gridToggle: () => canvasStore.toggleGrid(),
    });
    return cleanup;
  });

  // Track modifier keys
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

  // ─── Expose floorBounds for child pages ────────────────────────
  // (Used by mixing page for ForecastHeatmap)
  export function getFloorBounds(): FloorBounds {
    return floorBounds;
  }
</script>

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

<div
  class="workspace-canvas"
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
  style:cursor={canvasCursor}
>
  {#if floor}
    <FloorplanEditor
      width={containerWidth}
      height={containerHeight}
      floorplanWidthM={floor.width_meters ?? 10}
      floorplanHeightM={floor.height_meters ?? 10}
      {scalePxPerMeter}
      draggable={canvasStore.activeTool === 'pan'}
      backgroundInteractive={pageContext === 'editor' && canvasStore.activeTool === 'select' && canvasStore.backgroundVisible}
      onCanvasClick={handleCanvasClick}
      onCanvasDblClick={handleCanvasDblClick}
      onCanvasMouseMove={handleCanvasMouseMove}
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
            draggable={pageContext === 'editor' && canvasStore.activeTool === 'select'}
            locked={workspaceStore.backgroundLocked}
            onDragEnd={workspaceStore.editorCallbacks?.onBackgroundDragEnd}
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
          heatmapCanvas={displayCanvas}
          bounds={floorBounds}
          {scalePxPerMeter}
          visible={editorHeatmapStore.visible && displayCanvas !== null}
          opacity={editorHeatmapStore.opacity}
        />
      {/snippet}

      {#snippet ui()}
        <!-- Walls: interactive only in editor -->
        {#if floor.walls}
          {#each floor.walls as wall (wall.id)}
            <WallDrawingTool
              {wall}
              materialCategory={wall.material?.category ?? 'medium'}
              selected={pageContext === 'editor' && canvasStore.selectedIds.includes(wall.id)}
              {scalePxPerMeter}
              stageScale={canvasStore.scale}
              editMode={pageContext === 'editor' && canvasStore.activeTool === 'select'}
              interactive={pageContext === 'editor' && canvasStore.activeTool === 'select'}
              onSelect={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onItemSelect : undefined}
              onSegmentsUpdate={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onWallSegmentsUpdate : undefined}
            />
          {/each}
        {/if}

        <!-- APs: with Mixing-Preview-Overrides -->
        {#each displayAps as ap (ap.id)}
          <AccessPointMarker
            accessPoint={ap}
            selected={pageContext === 'editor' && canvasStore.selectedIds.includes(ap.id)}
            {scalePxPerMeter}
            draggable={pageContext === 'editor' && canvasStore.activeTool === 'select'}
            interactive={pageContext === 'editor'}
            onSelect={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onItemSelect : undefined}
            onPositionChange={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onApPositionChange : undefined}
          />
        {/each}

        <!-- Annotations: editable only in editor -->
        {#each workspaceStore.annotations as annotation (annotation.id)}
          <TextAnnotation
            {annotation}
            {scalePxPerMeter}
            selected={pageContext === 'editor' && canvasStore.selectedIds.includes(annotation.id)}
            draggable={pageContext === 'editor'}
            onSelect={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onItemSelect : undefined}
            onPositionChange={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onAnnotationPositionChange : undefined}
            onEdit={pageContext === 'editor' ? workspaceStore.editorCallbacks?.onAnnotationEdit : undefined}
          />
        {/each}

        <!-- Mode-specific layers -->
        {#if pageContext === 'editor'}
          <EditorCanvasLayers {floor} {scalePxPerMeter} {floorBounds} />
        {:else if pageContext === 'measure'}
          <MeasureCanvasLayers {scalePxPerMeter} />
        {:else if pageContext === 'mixing'}
          <MixingCanvasLayers {scalePxPerMeter} />
        {/if}

        <!-- Signal Probe marker -->
        {#if editorHeatmapStore.probeActive && editorHeatmapStore.probePoint && editorHeatmapStore.probeRssi !== null}
          <SignalProbeMarker
            x={editorHeatmapStore.probePoint.x * scalePxPerMeter}
            y={editorHeatmapStore.probePoint.y * scalePxPerMeter}
            rssiDbm={editorHeatmapStore.probeRssi}
          />
        {/if}

        <!-- Measure tool layer (distance ruler) -->
        {#if canvasStore.activeTool === 'measure' && measureStart}
          <MeasureLayer
            startPoint={measureStart}
            endPoint={measureEnd}
            {scalePxPerMeter}
            mousePosition={workspaceStore.mousePosition}
          />
        {/if}

        <!-- Saved/pinned measurements -->
        {#if workspaceStore.savedMeasurements.length > 0}
          <SavedMeasurements
            measurements={workspaceStore.savedMeasurements}
            {scalePxPerMeter}
            interactive={canvasStore.activeTool === 'select' || canvasStore.activeTool === 'measure'}
            selectedId={selectedMeasurementId}
            onSelect={handleSelectMeasurement}
          />
        {/if}

        <!-- Crosshair cursor -->
        {#if workspaceStore.mousePosition && (canvasStore.activeTool === 'measure' || (pageContext === 'editor' && canvasStore.activeTool !== 'pan' && canvasStore.activeTool !== 'select'))}
          <CrosshairCursor x={workspaceStore.mousePosition.x} y={workspaceStore.mousePosition.y} />
        {/if}

        <!-- Ruler overlay (always visible, rendered last) -->
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

    <!-- Floating heatmap controls panel (editor + mixing pages) -->
    {#if pageContext === 'editor' || pageContext === 'mixing'}
      <EditorHeatmapPanel />
    {/if}

    <!-- Measure tool result display -->
    {#if canvasStore.activeTool === 'measure' && measuredDistance !== null}
      <div class="measure-result">
        {t('editor.measureDistance')}: {measuredDistance.toFixed(2)} m
        <button
          class="pin-btn"
          onclick={handlePinMeasurement}
          title={t('editor.saveMeasurement')}
        >📌</button>
      </div>
    {/if}
  {:else}
    <div class="empty-canvas">
      <p>No floorplan loaded</p>
    </div>
  {/if}
</div>

<style>
  .workspace-canvas {
    flex: 1;
    overflow: hidden;
    background: var(--canvas-bg, #e8e8f0);
    position: relative;
    outline: none;
  }

  .empty-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-muted, #6a6a8a);
    font-size: 1rem;
  }

  .measure-result {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 16px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(74, 108, 247, 0.3);
    border-radius: 6px;
    color: #e0e0f0;
    font-size: 0.85rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    backdrop-filter: blur(8px);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pin-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .pin-btn:hover {
    opacity: 1;
  }
</style>
