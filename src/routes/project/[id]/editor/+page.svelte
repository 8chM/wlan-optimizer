<!--
  Editor page - Main canvas workspace with FloorplanEditor.

  Binds container dimensions for responsive canvas sizing.
  Integrates the FloorplanEditor with tool state from canvasStore.
  Features: Undo/Redo, Live Heatmap, Properties Panel.
-->
<script lang="ts">
  import { FloorplanEditor } from '$lib/canvas';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { undoStore } from '$lib/stores/undoStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import { channelStore } from '$lib/stores/channelStore.svelte';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
  import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
  import MaterialPicker from '$lib/components/editor/MaterialPicker.svelte';
  import APLibraryPanel from '$lib/components/editor/APLibraryPanel.svelte';
  import EditorHeatmap from '$lib/components/editor/EditorHeatmap.svelte';
  import EditorHeatmapPanel from '$lib/components/editor/EditorHeatmapPanel.svelte';
  import ChannelConflictOverlay from '$lib/components/editor/ChannelConflictOverlay.svelte';
  import ChannelMapPanel from '$lib/components/editor/ChannelMapPanel.svelte';
  import PropertiesPanel from '$lib/components/editor/PropertiesPanel.svelte';
  import ShortcutHelp from '$lib/components/common/ShortcutHelp.svelte';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import { t } from '$lib/i18n';

  let containerWidth = $state(800);
  let containerHeight = $state(600);
  let shortcutHelpOpen = $state(false);

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);

  // ── Floor bounds for heatmap ──────────────────────────────────
  let floorBounds = $derived({
    width: floor?.width_meters ?? 10,
    height: floor?.height_meters ?? 10,
  });

  // ── Selection-based properties panel ──────────────────────────
  let selectedWall = $derived.by(() => {
    const ids = canvasStore.selectedIds;
    if (ids.length !== 1) return null;
    return floor?.walls?.find((w) => w.id === ids[0]) ?? null;
  });

  let selectedAp = $derived.by(() => {
    const ids = canvasStore.selectedIds;
    if (ids.length !== 1) return null;
    return floor?.access_points?.find((ap) => ap.id === ids[0]) ?? null;
  });

  let showPropertiesPanel = $derived(selectedWall !== null || selectedAp !== null);

  // ── Channel analysis (re-run when APs change) ──────────────
  $effect(() => {
    const aps = floor?.access_points ?? [];
    if (aps.length > 0) {
      channelStore.analyze(aps);
    }
  });

  // ── Keyboard Shortcuts ────────────────────────────────────────
  $effect(() => {
    const cleanup = registerShortcuts({
      undo: () => {
        undoStore.undo();
      },
      redo: () => {
        undoStore.redo();
      },
      delete: () => {
        canvasStore.clearSelection();
      },
      save: () => {
        // TODO: Trigger save via projectStore
      },
      deselect: () => {
        canvasStore.setTool('select');
        canvasStore.clearSelection();
      },
      wallTool: () => {
        canvasStore.setTool('wall');
      },
      apTool: () => {
        canvasStore.setTool('ap');
      },
      measureTool: () => {
        canvasStore.setTool('measure');
      },
      selectTool: () => {
        canvasStore.setTool('select');
      },
      gridToggle: () => {
        canvasStore.toggleGrid();
      },
      heatmapToggle: () => {
        editorHeatmapStore.toggleVisible();
      },
      shortcutHelp: () => {
        shortcutHelpOpen = !shortcutHelpOpen;
      },
    });

    return cleanup;
  });

  // ── Cleanup on unmount ────────────────────────────────────────
  $effect(() => {
    return () => {
      editorHeatmapStore.reset();
      channelStore.reset();
    };
  });
</script>

<svelte:head>
  <title>{t('nav.editor')} - {t('app.title')}</title>
</svelte:head>

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

<div class="editor-container" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
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
        <HeatmapOverlay
          heatmapCanvas={editorHeatmapStore.canvas}
          bounds={floorBounds}
          {scalePxPerMeter}
          visible={editorHeatmapStore.visible && editorHeatmapStore.canvas !== null}
          opacity={editorHeatmapStore.opacity}
        />
      {/snippet}

      {#snippet ui()}
        {#if floor.walls}
          {#each floor.walls as wall (wall.id)}
            <WallDrawingTool
              {wall}
              selected={canvasStore.isSelected(wall.id)}
              {scalePxPerMeter}
              onSelect={(id) => canvasStore.selectItem(id)}
            />
          {/each}
        {/if}

        {#if floor.access_points}
          {#each floor.access_points as ap (ap.id)}
            <AccessPointMarker
              accessPoint={ap}
              selected={canvasStore.isSelected(ap.id)}
              {scalePxPerMeter}
              onSelect={(id) => canvasStore.selectItem(id)}
            />
          {/each}
        {/if}

        <!-- Channel conflict overlay lines -->
        {#if channelStore.overlayVisible && channelStore.analysis}
          <ChannelConflictOverlay
            conflicts={channelStore.analysis.conflicts}
            accessPoints={floor.access_points ?? []}
            {scalePxPerMeter}
            visible={channelStore.overlayVisible}
          />
        {/if}
      {/snippet}
    </FloorplanEditor>

    <!-- Floating Heatmap Controls Panel -->
    <EditorHeatmapPanel visible={editorHeatmapStore.visible} />

    <!-- Channel Map Panel -->
    <ChannelMapPanel
      analysis={channelStore.analysis}
      visible={channelStore.overlayVisible}
      onToggle={() => channelStore.toggleOverlay()}
    />

    <!-- Floating Properties Panel -->
    {#if showPropertiesPanel}
      <div class="properties-floating-panel">
        <PropertiesPanel
          {selectedWall}
          {selectedAp}
        />
      </div>
    {/if}
  {:else}
    <div class="empty-canvas">
      <p>{t('editor.noFloorplan')}</p>
    </div>
  {/if}
</div>

<ShortcutHelp bind:open={shortcutHelpOpen} />

<style>
  .editor-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #e8e8f0;
    position: relative;
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

  .properties-floating-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 240px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    max-height: 60vh;
    overflow-y: auto;
  }
</style>
