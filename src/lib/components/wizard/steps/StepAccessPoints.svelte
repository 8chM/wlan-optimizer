<!--
  StepAccessPoints.svelte - Step 5: Place access points on the floor plan.

  Embedded canvas with:
  - Background image + grid overlay
  - Existing walls (read-only, for context)
  - Interactive access point markers (add, move, delete)
  - Click on canvas to place new AP
  - Space+Drag for panning
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { getRotatedBoundingBox } from '$lib/editor/editorUtils';
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import { createAccessPoint, updateAccessPoint, deleteAccessPoint } from '$lib/api/accessPoint';

  // Canvas state
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let editorRef: FloorplanEditor | undefined = $state();
  let canvasReady = $state(false);

  // Image state
  let imageUrl = $state<string | null>(null);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorRotation = $derived(floor?.background_image_rotation ?? 0);
  let apCount = $derived(floor?.access_points?.length ?? 0);

  let canvasWidthM = $derived.by(() => {
    if (imageWidth > 0 && scalePxPerMeter > 0) {
      const { w } = getRotatedBoundingBox(imageWidth, imageHeight, floorRotation);
      return w / scalePxPerMeter;
    }
    return floor?.width_meters ?? 10;
  });

  let canvasHeightM = $derived.by(() => {
    if (imageHeight > 0 && scalePxPerMeter > 0) {
      const { h } = getRotatedBoundingBox(imageWidth, imageHeight, floorRotation);
      return h / scalePxPerMeter;
    }
    return floor?.height_meters ?? 10;
  });

  // Reset canvas state on mount (untrack to avoid reactive dependency loops)
  $effect(() => {
    untrack(() => canvasStore.reset());
  });

  // Load background offset from localStorage (set in StepCalibration drag)
  $effect(() => {
    const floorId = wizardStore.floorId;
    if (!floorId) return;
    const stored = localStorage.getItem(`wlan-opt:bg-offset:${floorId}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          canvasStore.setBackgroundOffset(data.x, data.y);
        }
      } catch { /* ignore */ }
    } else {
      canvasStore.setBackgroundOffset(0, 0);
    }
  });

  // Load image from localStorage
  $effect(() => {
    const floorId = wizardStore.floorId;
    if (!floorId) return;

    const stored = localStorage.getItem(`wlan-opt:floor-image:${floorId}`);
    if (stored) {
      imageUrl = stored;
      const img = new Image();
      img.onload = () => {
        imageWidth = img.naturalWidth;
        imageHeight = img.naturalHeight;
      };
      img.src = stored;
    }
  });

  // Auto-fit when canvas and image are ready
  $effect(() => {
    if (imageUrl && imageWidth > 0 && containerWidth > 0 && containerHeight > 0 && editorRef && !canvasReady) {
      requestAnimationFrame(() => editorRef?.fitToScreen());
      canvasReady = true;
    }
  });

  // Fit also when no image but floor dimensions are available
  $effect(() => {
    if (!imageUrl && containerWidth > 0 && containerHeight > 0 && editorRef && !canvasReady) {
      requestAnimationFrame(() => editorRef?.fitToScreen());
      canvasReady = true;
    }
  });

  async function handleCanvasClick(canvasX: number, canvasY: number): Promise<void> {
    if (!floor?.id) return;
    const xM = canvasX / scalePxPerMeter;
    const yM = canvasY / scalePxPerMeter;
    try {
      await createAccessPoint(floor.id, xM, yM);
      await projectStore.refreshFloorData();
    } catch (err) {
      console.error('[Wizard] Failed to create AP:', err);
    }
  }

  async function handleAPMove(apId: string, xM: number, yM: number): Promise<void> {
    try {
      await updateAccessPoint(apId, { x: xM, y: yM });
      await projectStore.refreshFloorData();
    } catch (err) {
      console.error('[Wizard] Failed to move AP:', err);
    }
  }

  function handleAPSelect(apId: string): void {
    canvasStore.selectItem(apId);
  }

  async function handleDeleteSelected(): Promise<void> {
    const selected = canvasStore.selectedIds;
    if (selected.length === 0) return;
    for (const id of selected) {
      try {
        await deleteAccessPoint(id);
      } catch (err) {
        console.error('[Wizard] Failed to delete AP:', err);
      }
    }
    canvasStore.clearSelection();
    await projectStore.refreshFloorData();
  }

  function handleNext(): void {
    wizardStore.updateStepData({ apsPlaced: apCount > 0 });
    wizardStore.nextStep();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') { event.preventDefault(); canvasStore.setSpaceHeld(true); }
    if (event.key === 'Shift') canvasStore.setShiftHeld(true);
    if (event.key === 'Escape') canvasStore.clearSelection();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      handleDeleteSelected();
    }
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') canvasStore.setSpaceHeld(false);
    if (event.key === 'Shift') canvasStore.setShiftHeld(false);
  }
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<div class="step-aps">
  <!-- Header: Title + AP badge + Zoom -->
  <div class="step-header">
    <h2 class="step-title">{t('wizard.step5')}</h2>

    <div class="header-controls">
      {#if apCount > 0}
        <div class="ap-badge">
          <span class="badge-count">{apCount}</span>
          <span class="badge-label">{t('wizard.apCount')}</span>
        </div>
      {/if}

      <!-- Zoom controls -->
      <div class="zoom-controls">
        <button class="ctrl-btn" onclick={() => canvasStore.zoomOut()}>&#x2212;</button>
        <span class="zoom-label">{Math.round(canvasStore.zoomPercent)}%</span>
        <button class="ctrl-btn" onclick={() => canvasStore.zoomIn()}>+</button>
        <button class="ctrl-btn" onclick={() => editorRef?.fitToScreen()} title="Fit to screen">&#x2B1C;</button>
      </div>
    </div>
  </div>

  <!-- Full-size canvas -->
  <div class="canvas-container" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
    <FloorplanEditor
      bind:this={editorRef}
      width={containerWidth}
      height={containerHeight}
      floorplanWidthM={canvasWidthM}
      floorplanHeightM={canvasHeightM}
      {scalePxPerMeter}
      draggable={true}
      onCanvasClick={handleCanvasClick}
    >
      {#snippet background()}
        {#if imageUrl}
          <BackgroundImage
            imageData={imageUrl}
            {scalePxPerMeter}
            rotation={floorRotation}
            opacity={0.45}
            locked={true}
            userOffsetX={canvasStore.backgroundOffsetX}
            userOffsetY={canvasStore.backgroundOffsetY}
          />
        {/if}
        <GridOverlay
          gridSizeM={1}
          {scalePxPerMeter}
          stageScale={canvasStore.scale}
          stageOffsetX={canvasStore.offsetX}
          stageOffsetY={canvasStore.offsetY}
          viewportWidth={containerWidth}
          viewportHeight={containerHeight}
          visible={true}
          color={'#222222'}
          opacity={0.35}
        />
      {/snippet}
      {#snippet ui()}
        <!-- Existing walls (read-only, for context) -->
        {#if floor?.walls}
          {#each floor.walls as wall (wall.id)}
            <WallDrawingTool
              {wall}
              materialCategory={wall.material?.category ?? 'medium'}
              {scalePxPerMeter}
              stageScale={canvasStore.scale}
              editMode={false}
              interactive={false}
            />
          {/each}
        {/if}

        <!-- Access points (interactive) -->
        {#if floor?.access_points}
          {#each floor.access_points as ap (ap.id)}
            <AccessPointMarker
              accessPoint={ap}
              selected={canvasStore.isSelected(ap.id)}
              {scalePxPerMeter}
              draggable={true}
              onSelect={handleAPSelect}
              onPositionChange={handleAPMove}
              onDelete={(id) => { deleteAccessPoint(id).then(() => projectStore.refreshFloorData()); }}
            />
          {/each}
        {/if}

        <!-- Ruler overlay -->
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

    <!-- Canvas scrollbars -->
    <CanvasScrollbars
      viewportWidth={containerWidth}
      viewportHeight={containerHeight}
      contentWidth={canvasWidthM * scalePxPerMeter}
      contentHeight={canvasHeightM * scalePxPerMeter}
      scale={canvasStore.scale}
      offsetX={canvasStore.offsetX}
      offsetY={canvasStore.offsetY}
      onOffsetChange={(x, y) => canvasStore.setOffset(x, y)}
    />
  </div>

  <!-- Bottom bar: hint + next -->
  <div class="bottom-bar">
    <p class="placement-hint">{t('wizard.placeApHint')}</p>
    <button class="btn-next" onclick={handleNext}>
      {#if apCount > 0}
        {t('wizard.next')} &rarr;
      {:else}
        {t('wizard.skip')}
      {/if}
    </button>
  </div>
</div>

<style>
  /* ── Layout ── */
  .step-aps {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* ── Header ── */
  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--bg-primary, #ffffff);
    border-bottom: 1px solid var(--border, #e0e0e0);
    flex-shrink: 0;
    gap: 10px;
    flex-wrap: wrap;
  }

  .step-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
    white-space: nowrap;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .ap-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(76, 175, 80, 0.1);
    border-radius: 12px;
    font-size: 0.78rem;
    color: #4caf50;
    font-weight: 500;
  }

  .badge-count {
    font-weight: 700;
    font-size: 0.85rem;
  }

  .badge-label {
    font-weight: 400;
  }

  .ctrl-btn {
    padding: 5px 10px;
    background: var(--bg-tertiary, #f0f0f5);
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 5px;
    font-size: 0.8rem;
    cursor: pointer;
    color: var(--text-secondary, #4a4a6a);
    font-family: inherit;
    line-height: 1;
  }

  .ctrl-btn:hover {
    background: var(--border, #d0d0e0);
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .zoom-label {
    min-width: 42px;
    text-align: center;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary, #4a4a6a);
  }

  /* ── Canvas ── */
  .canvas-container {
    flex: 1;
    min-height: 300px;
    overflow: hidden;
    background: #e8e8ee;
    cursor: crosshair;
    position: relative;
  }

  /* ── Bottom bar ── */
  .bottom-bar {
    flex-shrink: 0;
    padding: 12px 20px;
    background: var(--bg-primary, #ffffff);
    border-top: 1px solid var(--border, #e0e0e0);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .placement-hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-muted, #6a6a8a);
    text-align: center;
  }

  .btn-next {
    width: 100%;
    max-width: 500px;
    padding: 12px;
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: inherit;
  }

  .btn-next:hover {
    background: #3a5ce5;
  }
</style>
