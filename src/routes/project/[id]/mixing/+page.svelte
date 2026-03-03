<!--
  Mixing Console page - AP parameter adjustment with forecast heatmap.

  Integrates:
  - MixingConsole in the left sidebar (320px) with AP slider groups
  - FloorplanEditor with Forecast Heatmap overlay in the center
  - ChangeList and AssistSteps below the sliders
  - mixingStore for state management
-->
<script lang="ts">
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
  import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import CrosshairCursor from '$lib/canvas/CrosshairCursor.svelte';
  import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
  import TextAnnotation from '$lib/canvas/TextAnnotation.svelte';
  import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
  import MixingConsole from '$lib/components/mixing/MixingConsole.svelte';
  import ChangeList from '$lib/components/mixing/ChangeList.svelte';
  import AssistSteps from '$lib/components/mixing/AssistSteps.svelte';
  import ForecastHeatmap from '$lib/components/mixing/ForecastHeatmap.svelte';
  import HeatmapComparison from '$lib/components/comparison/HeatmapComparison.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { mixingStore } from '$lib/stores/mixingStore.svelte';
  import { comparisonStore } from '$lib/stores/comparisonStore.svelte';
  import { safeInvoke } from '$lib/api/invoke';
  import { t } from '$lib/i18n';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import type { Position } from '$lib/models/types';

  // Set page context for toolbar filtering
  $effect(() => {
    canvasStore.setPageContext('mixing');
  });

  // ─── Layout State ─────────────────────────────────────────────

  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let floorImageDataUrl = $state<string | null>(null);
  let mousePosition = $state<Position | null>(null);
  let measureStart = $state<{ x: number; y: number } | null>(null);
  let measureEnd = $state<{ x: number; y: number } | null>(null);
  let annotations = $state<AnnotationData[]>([]);

  // Cursor per tool
  let canvasCursor = $derived.by(() => {
    if (canvasStore.spaceHeld) return 'grab';
    switch (canvasStore.activeTool) {
      case 'pan': return 'grab';
      case 'measure': return 'crosshair';
      default: return 'default';
    }
  });

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');
  let projectId = $derived(projectStore.currentProject?.id ?? '');

  // Access points from the floor data
  let accessPoints = $derived(floor?.access_points ?? []);
  let floorRotation = $derived(floor?.background_image_rotation ?? 0);

  // Forecast heatmap state
  let forecastCanvas = $state<HTMLCanvasElement | null>(null);
  let forecastStats = $state<{ minRSSI: number; maxRSSI: number; avgRSSI: number; calculationTimeMs: number } | null>(null);

  // Floor bounds for heatmap
  let floorBounds = $derived({
    width: floor?.width_meters ?? 10,
    height: floor?.height_meters ?? 10,
  });

  // Changes as an array for components
  let changesArray = $derived(mixingStore.getChangeSummary());

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

  // ─── Load Floor Image ──────────────────────────────────────────

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
        const stored = localStorage.getItem(`wlan-opt:floor-image:${id}`);
        if (stored) {
          floorImageDataUrl = stored;
        }
      }
    } catch {
      // No image available
    }
  }

  // ─── Load existing plan on mount, cleanup on unmount ────────────

  $effect(() => {
    // Try to load the latest plan for this project
    if (projectId) {
      mixingStore.listPlans(projectId).then((plans) => {
        if (plans.length > 0) {
          const latest = plans[plans.length - 1]!;
          mixingStore.loadPlan(latest.id);
        }
      });
    }

    return () => {
      // Persist changes before reset so they survive navigation
      comparisonStore.reset();
      mixingStore.reset();
    };
  });

  // ─── Handlers ─────────────────────────────────────────────────

  async function handleGeneratePlan(): Promise<void> {
    if (!projectId || !floorId) return;
    await mixingStore.generatePlan(projectId, floorId);
  }

  function handleChange(apId: string, parameter: string, oldValue: string | null, newValue: string | null): void {
    mixingStore.applyChange(apId, parameter, oldValue, newValue);
  }

  function handleResetAp(apId: string): void {
    mixingStore.resetAp(apId);
  }

  function handleResetAll(): void {
    mixingStore.resetAll();
    forecastCanvas = null;
    forecastStats = null;
  }

  async function handleApplyChanges(): Promise<void> {
    if (!mixingStore.currentPlan) return;

    // Mark all pending steps as applied individually
    for (const step of mixingStore.steps) {
      if (!step.applied) {
        await mixingStore.markStepApplied(step.id);
      }
    }

    // Then update the overall plan status
    await mixingStore.updatePlanStatus(mixingStore.currentPlan.id, 'applied');
  }

  async function handleToggleStep(stepId: string, applied: boolean): Promise<void> {
    if (applied) {
      await mixingStore.markStepApplied(stepId);
    } else {
      await mixingStore.markStepUnapplied(stepId);
    }
  }

  function handleForecastCanvas(canvas: HTMLCanvasElement | null): void {
    forecastCanvas = canvas;
  }

  function handleForecastStats(stats: { minRSSI: number; maxRSSI: number; avgRSSI: number; calculationTimeMs: number } | null): void {
    forecastStats = stats;
  }

  function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
    mousePosition = { x: canvasX, y: canvasY };
    canvasStore.setMousePosition(canvasX / scalePxPerMeter, canvasY / scalePxPerMeter);
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
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      }
    }
  }

  // ─── Keyboard Shortcuts ────────────────────────────────────────
  $effect(() => {
    const cleanup = registerShortcuts({
      selectTool: () => canvasStore.setTool('select'),
      panTool: () => canvasStore.setTool('pan'),
      measureTool: () => canvasStore.setTool('measure'),
      gridToggle: () => canvasStore.toggleGrid(),
      deselect: () => {
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

  function handleTakeSnapshot(): void {
    if (!forecastCanvas) return;
    if (!comparisonStore.beforeCanvas) {
      comparisonStore.setBeforeSnapshot(forecastCanvas, t('mixing.original'));
    } else {
      comparisonStore.setAfterSnapshot(forecastCanvas, t('mixing.forecast'));
      comparisonStore.computeDifference();
      comparisonStore.activate();
    }
  }
</script>

<svelte:head>
  <title>{t('nav.mixing')} - {t('app.title')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Headless forecast heatmap renderer -->
{#if floor}
  <ForecastHeatmap
    {accessPoints}
    walls={floor.walls ?? []}
    bounds={floorBounds}
    changes={changesArray}
    forecastActive={mixingStore.forecastMode}
    outputWidth={containerWidth}
    outputHeight={containerHeight}
    {scalePxPerMeter}
    onCanvas={handleForecastCanvas}
    onStats={handleForecastStats}
  />
{/if}

<div class="mixing-page">
  <!-- Left sidebar with mixing console -->
  <aside class="mixing-sidebar">
    <MixingConsole
      {accessPoints}
      changes={changesArray}
      isGenerating={mixingStore.isGenerating}
      hasChanges={mixingStore.hasChanges}
      planStatus={mixingStore.currentPlan?.status ?? null}
      error={mixingStore.error}
      onGeneratePlan={handleGeneratePlan}
      onChange={handleChange}
      onResetAp={handleResetAp}
      onResetAll={handleResetAll}
      onApplyChanges={handleApplyChanges}
    />

    <!-- Change List -->
    {#if mixingStore.hasChanges}
      <div class="section-divider"></div>
      <ChangeList
        changes={changesArray}
        {accessPoints}
      />
    {/if}

    <!-- Assist Steps (from plan) -->
    {#if mixingStore.steps.length > 0}
      <div class="section-divider"></div>
      <AssistSteps
        steps={mixingStore.steps}
        {accessPoints}
        onToggleStep={handleToggleStep}
      />
    {/if}
  </aside>

  <!-- Center area with canvas -->
  <div
    class="mixing-canvas"
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
          <!-- Forecast heatmap overlay -->
          <HeatmapOverlay
            heatmapCanvas={forecastCanvas}
            bounds={floorBounds}
            {scalePxPerMeter}
            visible={mixingStore.forecastMode && forecastCanvas !== null}
            opacity={editorHeatmapStore.opacity}
          />
        {/snippet}

        {#snippet ui()}
          <!-- Walls (read-only in mixing mode) -->
          {#if floor.walls}
            {#each floor.walls as wall (wall.id)}
              <WallDrawingTool
                {wall}
                selected={false}
                {scalePxPerMeter}
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

          <!-- Access points (read-only in mixing mode) -->
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

          <!-- Measure tool layer (distance ruler) -->
          {#if canvasStore.activeTool === 'measure' && measureStart}
            <MeasureLayer
              startPoint={measureStart}
              endPoint={measureEnd}
              {scalePxPerMeter}
              mousePosition={mousePosition}
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

      <!-- Forecast stats overlay -->
      {#if forecastStats && mixingStore.forecastMode}
        <div class="forecast-badge">
          <span class="badge-label">{t('mixing.forecast')}</span>
          <span class="badge-stat">{forecastStats.avgRSSI.toFixed(0)} dBm {t('heatmap.avgRSSI')}</span>
          <span class="badge-time">{forecastStats.calculationTimeMs.toFixed(0)} ms</span>
          {#if forecastCanvas}
            <button class="snapshot-btn" onclick={handleTakeSnapshot}>
              {comparisonStore.beforeCanvas ? t('comparison.compare') : t('comparison.takeSnapshot')}
            </button>
          {/if}
        </div>
      {/if}

      <!-- Heatmap Comparison Panel -->
      <HeatmapComparison visible={comparisonStore.isActive} />
    {:else}
      <div class="empty-canvas">
        <p>{t('editor.noFloorplan')}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .mixing-page {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .mixing-sidebar {
    width: 320px;
    min-width: 320px;
    background: #1a1a2e;
    color: #c0c0d0;
    overflow-y: auto;
    padding: 8px;
    border-right: 1px solid #2a2a4e;
    flex-shrink: 0;
  }

  .mixing-sidebar::-webkit-scrollbar {
    width: 5px;
  }

  .mixing-sidebar::-webkit-scrollbar-track {
    background: transparent;
  }

  .mixing-sidebar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 10px 0;
  }

  .mixing-canvas {
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

  /* ─── Forecast Badge ─────────────────────────────────────────── */

  .forecast-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(26, 26, 46, 0.85);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 5px;
    backdrop-filter: blur(4px);
  }

  .badge-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #a5b4fc;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge-stat {
    font-size: 0.7rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .badge-time {
    font-size: 0.6rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .snapshot-btn {
    padding: 3px 8px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 4px;
    color: #a5b4fc;
    font-size: 0.65rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .snapshot-btn:hover {
    background: rgba(99, 102, 241, 0.35);
  }
</style>
