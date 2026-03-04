<!--
  StepCalibration.svelte - Step 3: Scale the floor plan image.

  Konva canvas with:
  - Full-size responsive canvas (fills available space)
  - Zoom: mouse wheel (pointer-relative), +/- buttons, fit-to-screen
  - Grid overlay (clearly visible over transparent background)
  - 2-point calibration: click two points, enter real-world distance
  - Visual feedback: numbered markers, dashed measurement line, distance labels
  - Calibration line persists after confirmation (green + meter label)
  - Escape key to reset calibration
  - Manual dimension fallback (when no image uploaded)

  Rotation and positioning are handled in Step 2 (StepFloorplan).
  This step only handles scale calibration.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { getRotatedBoundingBox } from '$lib/editor/editorUtils';
  import { setFloorScale } from '$lib/api/floor';
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
  import { Line, Circle, Text, Group, Rect } from 'svelte-konva';

  // Rotation from Step 2 (read-only)
  let rotation = $derived(wizardStore.stepData.imageRotation || (projectStore.activeFloor?.background_image_rotation ?? 0));

  let imageUrl = $state<string | null>(null);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  // Manual dimension inputs (when no image)
  let manualWidth = $state(projectStore.activeFloor?.width_meters?.toString() ?? '10');
  let manualHeight = $state(projectStore.activeFloor?.height_meters?.toString() ?? '10');

  // Scale calibration state — loaded from wizardStore for persistence across steps
  let calibrationPoints = $state<Array<{ x: number; y: number }>>(
    wizardStore.stepData.calibrationPoints?.length > 0
      ? [...wizardStore.stepData.calibrationPoints]
      : [],
  );
  let scaleDistanceInput = $state(
    wizardStore.stepData.confirmedDistanceM > 0
      ? String(wizardStore.stepData.confirmedDistanceM)
      : '',
  );
  let confirmedDistanceM = $state(wizardStore.stepData.confirmedDistanceM || 0);
  let scaleConfirmed = $state(wizardStore.stepData.scaleConfirmed && confirmedDistanceM > 0);
  let saving = $state(false);

  // Image positioning (read-only, loaded from localStorage set in Step 2)
  let imageOffsetX = $state(0);
  let imageOffsetY = $state(0);

  // Canvas state
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let editorRef: FloorplanEditor | undefined = $state();
  let canvasReady = $state(false);

  let hasFloorplan = $derived(wizardStore.stepData.hasFloorplan);
  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);

  // Derive canvas floorplan dimensions from IMAGE size so fitToScreen()
  // properly frames the entire image, not just the default 10x10m area.
  let canvasWidthM = $derived.by(() => {
    if (imageWidth > 0 && scalePxPerMeter > 0) {
      const { w } = getRotatedBoundingBox(imageWidth, imageHeight, rotation);
      return w / scalePxPerMeter;
    }
    return floor?.width_meters ?? 10;
  });

  let canvasHeightM = $derived.by(() => {
    if (imageHeight > 0 && scalePxPerMeter > 0) {
      const { h } = getRotatedBoundingBox(imageWidth, imageHeight, rotation);
      return h / scalePxPerMeter;
    }
    return floor?.height_meters ?? 10;
  });

  // Calibration pixel distance (live)
  let pixelDistance = $derived.by(() => {
    if (calibrationPoints.length !== 2) return 0;
    const dx = calibrationPoints[1]!.x - calibrationPoints[0]!.x;
    const dy = calibrationPoints[1]!.y - calibrationPoints[0]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  let calibrationLinePoints = $derived.by(() => {
    if (calibrationPoints.length !== 2) return null;
    return [
      calibrationPoints[0]!.x, calibrationPoints[0]!.y,
      calibrationPoints[1]!.x, calibrationPoints[1]!.y,
    ];
  });

  let lineMidpoint = $derived.by(() => {
    if (calibrationPoints.length !== 2) return null;
    return {
      x: (calibrationPoints[0]!.x + calibrationPoints[1]!.x) / 2,
      y: (calibrationPoints[0]!.y + calibrationPoints[1]!.y) / 2,
    };
  });

  // Dynamic instruction text
  let instructionText = $derived.by(() => {
    if (scaleConfirmed) return '';
    if (calibrationPoints.length === 0) return t('wizard.drawCalibration');
    if (calibrationPoints.length === 1) return t('wizard.clickSecondPoint');
    return t('wizard.enterDistance');
  });

  // Reset canvas state on mount (untrack to avoid reactive dependency loops)
  $effect(() => {
    untrack(() => canvasStore.reset());
  });

  // Load persisted image offset from localStorage (set in Step 2)
  $effect(() => {
    const floorId = wizardStore.floorId;
    if (!floorId) return;
    const stored = localStorage.getItem(`wlan-opt:bg-offset:${floorId}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          imageOffsetX = data.x;
          imageOffsetY = data.y;
        }
      } catch { /* ignore */ }
    }
  });

  // Load image from localStorage
  $effect(() => {
    const floorId = wizardStore.floorId;
    if (!floorId || !hasFloorplan) return;

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

  function handleCanvasClick(canvasX: number, canvasY: number): void {
    if (scaleConfirmed) return;
    if (calibrationPoints.length < 2) {
      calibrationPoints = [...calibrationPoints, { x: canvasX, y: canvasY }];
    }
  }

  function resetCalibration(): void {
    calibrationPoints = [];
    scaleDistanceInput = '';
    scaleConfirmed = false;
    confirmedDistanceM = 0;
    wizardStore.updateStepData({
      calibrationPoints: [],
      confirmedDistanceM: 0,
      scaleConfirmed: false,
    });
    const floorId = wizardStore.floorId;
    if (floorId) {
      localStorage.removeItem(`wlan-opt:scale-ref:${floorId}`);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') { event.preventDefault(); canvasStore.setSpaceHeld(true); }
    if (event.key === 'Shift') canvasStore.setShiftHeld(true);
    if (event.key === 'Escape' && !scaleConfirmed) {
      event.preventDefault();
      resetCalibration();
    }
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') canvasStore.setSpaceHeld(false);
    if (event.key === 'Shift') canvasStore.setShiftHeld(false);
  }

  async function confirmScale(): Promise<void> {
    const distance = parseFloat(scaleDistanceInput);
    if (isNaN(distance) || distance <= 0 || calibrationPoints.length !== 2) return;

    const floorId = wizardStore.floorId;
    if (!floorId) return;

    const pxPerMeter = pixelDistance / distance;

    saving = true;
    try {
      let wM: number, hM: number;
      if (imageWidth > 0 && imageHeight > 0) {
        const { w, h } = getRotatedBoundingBox(imageWidth, imageHeight, rotation);
        wM = w / pxPerMeter;
        hM = h / pxPerMeter;
      } else {
        wM = parseFloat(manualWidth) || 10;
        hM = parseFloat(manualHeight) || 10;
      }

      await setFloorScale(floorId, pxPerMeter, wM, hM);
      await projectStore.refreshFloorData();

      scaleConfirmed = true;
      confirmedDistanceM = distance;

      // Persist calibration line so the Editor can show it
      localStorage.setItem(`wlan-opt:scale-ref:${floorId}`, JSON.stringify({
        points: [...calibrationPoints],
        distanceM: distance,
      }));

      wizardStore.updateStepData({
        scaleConfirmed: true,
        calibrationPoints: [...calibrationPoints],
        confirmedDistanceM: distance,
      });
    } catch (err) {
      console.error('[Wizard] Scale failed:', err);
    } finally {
      saving = false;
    }
  }

  async function handleManualDimensions(): Promise<void> {
    const floorId = wizardStore.floorId;
    if (!floorId) return;

    const w = parseFloat(manualWidth);
    const h = parseFloat(manualHeight);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;

    saving = true;
    try {
      const scalePx = floor?.scale_px_per_meter ?? 50;
      await setFloorScale(floorId, scalePx, w, h);
      await projectStore.refreshFloorData();
      wizardStore.updateStepData({ scaleConfirmed: true });
      wizardStore.nextStep();
    } catch (err) {
      console.error('[Wizard] Manual dimensions failed:', err);
    } finally {
      saving = false;
    }
  }

  function handleNext(): void {
    wizardStore.nextStep();
  }
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<div class="step-calibration">
  {#if hasFloorplan && imageUrl}
    <!-- Header: Title + Zoom controls only -->
    <div class="step-header">
      <h2 class="step-title">{t('wizard.step3')}</h2>
      <div class="header-controls">
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
    <div
      class="canvas-container cursor-crosshair"
      bind:clientWidth={containerWidth}
      bind:clientHeight={containerHeight}
    >
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
          <BackgroundImage
            imageData={imageUrl}
            {scalePxPerMeter}
            rotation={rotation}
            opacity={0.45}
            locked={true}
            userOffsetX={imageOffsetX}
            userOffsetY={imageOffsetY}
          />
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
          <!-- Calibration line -->
          {#if calibrationLinePoints}
            <!-- White background stroke -->
            <Line
              points={calibrationLinePoints}
              stroke={'#ffffff'}
              strokeWidth={5 / canvasStore.scale}
              lineCap={'round'}
              listening={false}
            />
            <!-- Colored foreground stroke -->
            <Line
              points={calibrationLinePoints}
              stroke={scaleConfirmed ? '#4caf50' : '#e53935'}
              strokeWidth={3 / canvasStore.scale}
              dash={scaleConfirmed ? [] : [10 / canvasStore.scale, 6 / canvasStore.scale]}
              lineCap={'round'}
              listening={false}
            />
          {/if}
          <!-- Calibration points with numbered labels -->
          {#each calibrationPoints as pt, i (i)}
            <Circle
              x={pt.x}
              y={pt.y}
              radius={12 / canvasStore.scale}
              fill={scaleConfirmed ? '#4caf50' : (i === 0 ? '#1e88e5' : '#e53935')}
              stroke={'#ffffff'}
              strokeWidth={3 / canvasStore.scale}
              shadowColor={'#000000'}
              shadowBlur={4 / canvasStore.scale}
              shadowOpacity={0.4}
              listening={false}
            />
            <Text
              x={pt.x - 5 / canvasStore.scale}
              y={pt.y - 6 / canvasStore.scale}
              text={String(i + 1)}
              fontSize={13 / canvasStore.scale}
              fontStyle={'bold'}
              fontFamily={'system-ui, sans-serif'}
              fill={'#ffffff'}
              listening={false}
            />
          {/each}
          <!-- Distance label at line midpoint -->
          {#if lineMidpoint && pixelDistance > 0}
            {@const labelText = scaleConfirmed && confirmedDistanceM > 0
              ? `${confirmedDistanceM.toFixed(2)} m`
              : `${Math.round(pixelDistance)} px`}
            {@const labelW = 90 / canvasStore.scale}
            {@const labelH = 24 / canvasStore.scale}
            <Group
              x={lineMidpoint.x + 10 / canvasStore.scale}
              y={lineMidpoint.y - labelH - 4 / canvasStore.scale}
              listening={false}
            >
              <Rect
                width={labelW}
                height={labelH}
                fill={scaleConfirmed ? 'rgba(76, 175, 80, 0.92)' : 'rgba(26, 26, 46, 0.88)'}
                cornerRadius={4 / canvasStore.scale}
                shadowColor={'#000000'}
                shadowBlur={3 / canvasStore.scale}
                shadowOpacity={0.3}
                listening={false}
              />
              <Text
                width={labelW}
                height={labelH}
                text={labelText}
                fontSize={13 / canvasStore.scale}
                fontStyle={'600'}
                fontFamily={"'SF Mono', 'Fira Code', monospace"}
                fill={'#ffffff'}
                align={'center'}
                verticalAlign={'middle'}
                listening={false}
              />
            </Group>
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

    <!-- Bottom bar: instructions + scale input + next -->
    <div class="bottom-bar">
      {#if !scaleConfirmed && calibrationPoints.length < 2}
        <p class="calibration-hint">
          {instructionText}
        </p>
      {/if}

      {#if calibrationPoints.length === 2 && !scaleConfirmed}
        <div class="scale-input-row">
          <span class="pixel-info">{Math.round(pixelDistance)} px =</span>
          <input
            type="number"
            class="form-input scale-num"
            bind:value={scaleDistanceInput}
            placeholder="0.00"
            min="0.01"
            step="0.01"
            autofocus
            onkeydown={(e) => { if (e.key === 'Enter') confirmScale(); }}
          />
          <span class="scale-unit">m</span>
          <button class="btn-confirm" onclick={confirmScale} disabled={saving}>
            {t('action.confirm')}
          </button>
          <button class="btn-reset" onclick={resetCalibration}>
            {t('action.retry')}
          </button>
        </div>
      {/if}

      {#if scaleConfirmed}
        <div class="scale-confirmed">
          <span class="confirmed-icon">&#x2714;</span>
          <span>{t('wizard.calibrationDone')}</span>
          {#if floor?.width_meters && floor?.height_meters}
            <span class="dim-info">
              {floor.width_meters.toFixed(1)} &times; {floor.height_meters.toFixed(1)} m
            </span>
          {/if}
          <button class="btn-redo" onclick={resetCalibration}>
            {t('action.retry')}
          </button>
        </div>

        <button class="btn-next" onclick={handleNext}>
          {t('wizard.next')} &rarr;
        </button>
      {/if}
    </div>
  {:else}
    <!-- No image: manual dimensions -->
    <div class="manual-section">
      <h2 class="step-title">{t('wizard.step3')}</h2>
      <p class="manual-hint">{t('wizard.manualDimensions')}</p>

      <div class="manual-row">
        <div class="manual-field">
          <label class="control-label" for="manual-w">{t('wizard.widthM')}</label>
          <input id="manual-w" type="number" class="form-input" bind:value={manualWidth} min="1" step="0.5" />
        </div>
        <div class="manual-field">
          <label class="control-label" for="manual-h">{t('wizard.heightM')}</label>
          <input id="manual-h" type="number" class="form-input" bind:value={manualHeight} min="1" step="0.5" />
        </div>
      </div>

      <button class="btn-next" onclick={handleManualDimensions} disabled={saving}>
        {t('wizard.next')} &rarr;
      </button>
    </div>
  {/if}
</div>

<style>
  /* ── Layout ── */
  .step-calibration {
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

  .control-label {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-secondary, #4a4a6a);
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

  /* ── Canvas ── */
  .canvas-container {
    flex: 1;
    min-height: 300px;
    border-bottom: 1px solid var(--border, #e0e0e0);
    overflow: hidden;
    background: #e8e8ee;
    cursor: default;
    position: relative;
  }

  .canvas-container.cursor-crosshair {
    cursor: crosshair;
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

  .calibration-hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted, #6a6a8a);
    text-align: center;
  }

  .scale-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .pixel-info {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary, #4a4a6a);
    font-variant-numeric: tabular-nums;
  }

  .scale-num {
    width: 90px;
    padding: 8px 10px;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    font-size: 0.9rem;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    font-family: inherit;
    text-align: center;
  }

  .scale-num:focus {
    outline: none;
    border-color: var(--accent, #4a6cf7);
    box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
  }

  .scale-unit {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted, #6a6a8a);
  }

  .btn-confirm {
    padding: 8px 18px;
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .btn-confirm:hover:not(:disabled) {
    background: #3a5ce5;
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-reset,
  .btn-redo {
    padding: 5px 12px;
    background: transparent;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 5px;
    font-size: 0.78rem;
    color: var(--text-muted, #6a6a8a);
    cursor: pointer;
    font-family: inherit;
  }

  .btn-reset:hover,
  .btn-redo:hover {
    background: var(--bg-tertiary, #f0f0f5);
  }

  .scale-confirmed {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(76, 175, 80, 0.08);
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 8px;
    font-size: 0.85rem;
    color: #4caf50;
    font-weight: 500;
    width: 100%;
    max-width: 500px;
    box-sizing: border-box;
  }

  .confirmed-icon {
    font-size: 1.1rem;
  }

  .dim-info {
    font-size: 0.8rem;
    color: var(--text-muted, #6a6a8a);
    font-weight: 400;
    margin-left: auto;
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

  .btn-next:hover:not(:disabled) {
    background: #3a5ce5;
  }

  .btn-next:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Manual dimensions fallback ── */
  .manual-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    flex: 1;
  }

  .manual-section .step-title {
    margin-bottom: 8px;
  }

  .manual-hint {
    font-size: 0.85rem;
    color: var(--text-muted, #6a6a8a);
    margin: 0 0 20px;
  }

  .manual-row {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    width: 100%;
    max-width: 360px;
  }

  .manual-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-input {
    padding: 10px 12px;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    font-family: inherit;
    box-sizing: border-box;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--accent, #4a6cf7);
    box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
  }

  .manual-section .btn-next {
    max-width: 360px;
  }
</style>
