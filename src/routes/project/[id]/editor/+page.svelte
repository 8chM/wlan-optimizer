<!--
  Editor page - Main canvas workspace with FloorplanEditor.

  Binds container dimensions for responsive canvas sizing.
  Integrates the FloorplanEditor with tool state from canvasStore.
-->
<script lang="ts">
  import { FloorplanEditor } from '$lib/canvas';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
  import MaterialPicker from '$lib/components/editor/MaterialPicker.svelte';
  import APLibraryPanel from '$lib/components/editor/APLibraryPanel.svelte';
  import { t } from '$lib/i18n';

  let containerWidth = $state(800);
  let containerHeight = $state(600);

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);

  /** Convert screen coords to meters for StatusBar display */
  function screenToMeters(screenX: number, screenY: number): { x: number; y: number } {
    if (!scalePxPerMeter || scalePxPerMeter <= 0) return { x: 0, y: 0 };
    const canvasX = (screenX - canvasStore.offsetX) / canvasStore.scale;
    const canvasY = (screenY - canvasStore.offsetY) / canvasStore.scale;
    return {
      x: canvasX / scalePxPerMeter,
      y: canvasY / scalePxPerMeter,
    };
  }
</script>

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
        <!-- Heatmap overlay will be added in Phase 8c -->
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
      {/snippet}
    </FloorplanEditor>
  {:else}
    <div class="empty-canvas">
      <p>{t('editor.noFloorplan')}</p>
    </div>
  {/if}
</div>

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
</style>
