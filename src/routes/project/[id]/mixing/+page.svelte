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
  import MixingConsole from '$lib/components/mixing/MixingConsole.svelte';
  import ChangeList from '$lib/components/mixing/ChangeList.svelte';
  import AssistSteps from '$lib/components/mixing/AssistSteps.svelte';
  import ForecastHeatmap from '$lib/components/mixing/ForecastHeatmap.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { mixingStore } from '$lib/stores/mixingStore.svelte';
  import { t } from '$lib/i18n';

  // ─── Layout State ─────────────────────────────────────────────

  let containerWidth = $state(800);
  let containerHeight = $state(600);

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorId = $derived(floor?.id ?? '');
  let projectId = $derived(projectStore.currentProject?.id ?? '');

  // Access points from the floor data
  let accessPoints = $derived(floor?.access_points ?? []);

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

  // ─── Cleanup on Mount/Unmount ──────────────────────────────────

  $effect(() => {
    return () => {
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
</script>

<svelte:head>
  <title>{t('nav.mixing')} - {t('app.title')}</title>
</svelte:head>

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
          <!-- Forecast heatmap overlay -->
          <HeatmapOverlay
            heatmapCanvas={forecastCanvas}
            bounds={floorBounds}
            {scalePxPerMeter}
            visible={mixingStore.forecastMode && forecastCanvas !== null}
            opacity={0.65}
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
        {/snippet}
      </FloorplanEditor>

      <!-- Forecast stats overlay -->
      {#if forecastStats && mixingStore.forecastMode}
        <div class="forecast-badge">
          <span class="badge-label">{t('mixing.forecast')}</span>
          <span class="badge-stat">{forecastStats.avgRSSI.toFixed(0)} dBm {t('heatmap.avgRSSI')}</span>
          <span class="badge-time">{forecastStats.calculationTimeMs.toFixed(0)} ms</span>
        </div>
      {/if}
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
</style>
