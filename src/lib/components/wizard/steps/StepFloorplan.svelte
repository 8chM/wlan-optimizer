<!--
  StepFloorplan.svelte - Step 2: Upload, rotate and position the floor plan image.

  After upload shows a full-size Konva canvas with:
  - Background image (slightly transparent)
  - Grid overlay on top for visual reference
  - Zoom: mouse wheel, +/- buttons, fit-to-screen
  - Mode buttons: View / Rotate / Move
  - Rotation: 90 deg button + smooth slider (0-360 deg)
  - Image dragging: unlock image to reposition with mouse
  - Replace image button
  Drag-and-drop or file browser for upload. Can be skipped.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { importFloorImage } from '$lib/api/floor';
  import { getRotatedBoundingBox } from '$lib/editor/editorUtils';
  import { setFloorScale, setFloorRotation } from '$lib/api/floor';
  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';

  let previewUrl = $state<string | null>(null);
  let uploading = $state(false);
  let errorMsg = $state<string | null>(null);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  // Canvas state
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let editorRef: FloorplanEditor | undefined = $state();
  let canvasReady = $state(false);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  // Rotation & positioning
  let rotation = $state(wizardStore.stepData.imageRotation || 0);
  let imageOffsetX = $state(0);
  let imageOffsetY = $state(0);
  type PositionMode = 'view' | 'rotate' | 'drag';
  let mode = $state<PositionMode>('view');

  // Mouse rotation state
  let isRotating = $state(false);
  let rotateStartAngle = $state(0);
  let rotateStartRotation = $state(0);

  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);

  // Derive canvas dimensions from image (accounting for rotation)
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

  // Image center in canvas pixels (for mouse rotation)
  let imageCenterX = $derived((canvasWidthM * scalePxPerMeter) / 2);
  let imageCenterY = $derived((canvasHeightM * scalePxPerMeter) / 2);

  // Reset canvas state on mount (untrack to avoid reactive dependency loops)
  $effect(() => {
    untrack(() => canvasStore.reset());
  });

  // Load persisted image offset from localStorage (set in a previous session)
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

  // Load existing image preview in edit mode
  $effect(() => {
    if (wizardStore.isEditMode && wizardStore.floorId) {
      const stored = localStorage.getItem(`wlan-opt:floor-image:${wizardStore.floorId}`);
      if (stored) {
        previewUrl = stored;
        loadImageDimensions(stored);
      }
    }
  });

  // Load rotation from floor DB data in edit mode
  $effect(() => {
    if (wizardStore.isEditMode && floor?.background_image_rotation) {
      rotation = wizardStore.stepData.imageRotation || floor.background_image_rotation;
    }
  });

  // Auto-fit when canvas and image are ready
  $effect(() => {
    if (previewUrl && imageWidth > 0 && containerWidth > 0 && containerHeight > 0 && editorRef && !canvasReady) {
      requestAnimationFrame(() => editorRef?.fitToScreen());
      canvasReady = true;
    }
  });

  function loadImageDimensions(src: string): void {
    const img = new Image();
    img.onload = () => {
      imageWidth = img.naturalWidth;
      imageHeight = img.naturalHeight;
    };
    img.src = src;
  }

  async function processFile(file: File): Promise<void> {
    const floorId = wizardStore.floorId;
    if (!floorId) return;

    const format = file.type.replace('image/', '');
    if (!['png', 'jpeg', 'jpg', 'webp'].includes(format)) {
      errorMsg = 'Unsupported format. Use JPG, PNG, or WebP.';
      return;
    }

    uploading = true;
    errorMsg = null;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      await importFloorImage(floorId, bytes, format);

      // Create preview URL
      const dataUrl = URL.createObjectURL(file);
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrl = dataUrl;
      canvasReady = false;
      loadImageDimensions(dataUrl);

      // Store in localStorage for browser-mode persistence
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          localStorage.setItem(`wlan-opt:floor-image:${floorId}`, reader.result);
        }
      };
      reader.readAsDataURL(file);

      // Reset rotation & offset for fresh upload
      rotation = 0;
      imageOffsetX = 0;
      imageOffsetY = 0;

      wizardStore.updateStepData({ hasFloorplan: true, imageRotation: 0 });
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : t('editor.uploadFailed');
    } finally {
      uploading = false;
    }
  }

  // ── Rotation helpers ──

  /** Set rotation and adjust viewport offset so the image center stays in place. */
  function setRotationWithViewAdjust(newRotation: number): void {
    if (imageWidth <= 0 || imageHeight <= 0) {
      rotation = newRotation;
      return;
    }
    const oldBB = getRotatedBoundingBox(imageWidth, imageHeight, rotation);
    const newBB = getRotatedBoundingBox(imageWidth, imageHeight, newRotation);
    const scale = canvasStore.scale;
    const dx = (oldBB.w - newBB.w) / 2 * scale;
    const dy = (oldBB.h - newBB.h) / 2 * scale;
    rotation = newRotation;
    canvasStore.setOffset(canvasStore.offsetX + dx, canvasStore.offsetY + dy);
  }

  async function handleRotate90(): Promise<void> {
    setRotationWithViewAdjust((rotation + 90) % 360);
    await applyRotation();
  }

  function handleRotationSlider(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) {
      setRotationWithViewAdjust(((val % 360) + 360) % 360);
    }
  }

  async function handleRotationSliderEnd(): Promise<void> {
    await applyRotation();
  }

  async function handleRotationInput(event: Event): Promise<void> {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) {
      setRotationWithViewAdjust(((val % 360) + 360) % 360);
      await applyRotation();
    }
  }

  /** Persist rotation to DB (called after slider end / 90° / input / mouse drag end). */
  async function applyRotation(): Promise<void> {
    const floorId = wizardStore.floorId;
    if (!floorId) return;
    try {
      await setFloorRotation(floorId, rotation);
      if (imageWidth > 0 && imageHeight > 0) {
        const scalePx = floor?.scale_px_per_meter ?? 50;
        const { w, h } = getRotatedBoundingBox(imageWidth, imageHeight, rotation);
        await setFloorScale(floorId, scalePx, w / scalePx, h / scalePx);
      }
      await projectStore.refreshFloorData();
      wizardStore.updateStepData({ imageRotation: rotation });
    } catch (err) {
      console.error('[Wizard] Rotation failed:', err);
    }
  }

  // ── Mouse rotation handlers (rotate mode) ──
  function handleCanvasPointerDown(canvasX: number, canvasY: number): void {
    if (mode === 'rotate') {
      isRotating = true;
      rotateStartAngle = Math.atan2(canvasY - imageCenterY, canvasX - imageCenterX) * 180 / Math.PI;
      rotateStartRotation = rotation;
    }
  }

  function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
    if (mode === 'rotate' && isRotating) {
      const angle = Math.atan2(canvasY - imageCenterY, canvasX - imageCenterX) * 180 / Math.PI;
      const delta = angle - rotateStartAngle;
      setRotationWithViewAdjust(((rotateStartRotation + delta) % 360 + 360) % 360);
    }
  }

  function handleCanvasPointerUp(): void {
    if (isRotating) {
      isRotating = false;
      applyRotation();
    }
  }

  // ── Drag handler ──
  function handleImageDragEnd(x: number, y: number): void {
    imageOffsetX = x;
    imageOffsetY = y;
    const floorId = wizardStore.floorId;
    if (floorId) {
      localStorage.setItem(`wlan-opt:bg-offset:${floorId}`, JSON.stringify({ x, y }));
    }
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dragOver = false;
    const file = event.dataTransfer?.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(): void {
    dragOver = false;
  }

  function handleFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) processFile(file);
    target.value = '';
  }

  function handleNext(): void {
    wizardStore.updateStepData({ imageRotation: rotation });
    wizardStore.nextStep();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') { event.preventDefault(); canvasStore.setSpaceHeld(true); }
    if (event.key === 'Shift') canvasStore.setShiftHeld(true);
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') canvasStore.setSpaceHeld(false);
    if (event.key === 'Shift') canvasStore.setShiftHeld(false);
  }
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept="image/png,image/jpeg,image/webp"
  onchange={handleFileSelected}
  style="display: none"
/>

<div class="step-floorplan">
  {#if previewUrl}
    <!-- Header: Title + Mode + Rotation + Zoom + Replace -->
    <div class="step-header">
      <h2 class="step-title">{t('wizard.step2')}</h2>
      <div class="header-controls">
        <!-- Mode buttons: View / Rotate / Move -->
        <div class="mode-buttons">
          <button
            class="mode-btn"
            class:active={mode === 'view'}
            onclick={() => mode = 'view'}
            title={t('wizard.viewMode')}
          >
            &#x1F441; {t('wizard.viewMode')}
          </button>
          <button
            class="mode-btn"
            class:active={mode === 'rotate'}
            onclick={() => mode = 'rotate'}
            title={t('wizard.rotateMode')}
          >
            &#x21BB; {t('wizard.rotateMode')}
          </button>
          <button
            class="mode-btn"
            class:active={mode === 'drag'}
            onclick={() => mode = 'drag'}
            title={t('wizard.dragMode')}
          >
            &#x2725; {t('wizard.dragMode')}
          </button>
        </div>

        <!-- Rotation controls (always visible when image loaded) -->
        <div class="rotation-controls">
          <span class="control-label">{t('wizard.rotateImage')}</span>
          <button class="ctrl-btn" onclick={handleRotate90}>90&deg;</button>
          <input
            type="range"
            class="rotation-slider"
            min="0"
            max="359"
            value={rotation}
            oninput={handleRotationSlider}
            onchange={handleRotationSliderEnd}
          />
          <input
            type="number"
            class="rotation-input"
            min="0"
            max="359"
            value={rotation}
            onchange={handleRotationInput}
          />
          <span class="rotation-suffix">&deg;</span>
        </div>

        <!-- Zoom controls -->
        <div class="zoom-controls">
          <button class="ctrl-btn" onclick={() => canvasStore.zoomOut()}>&#x2212;</button>
          <span class="zoom-label">{Math.round(canvasStore.zoomPercent)}%</span>
          <button class="ctrl-btn" onclick={() => canvasStore.zoomIn()}>+</button>
          <button class="ctrl-btn" onclick={() => editorRef?.fitToScreen()} title="Fit to screen">&#x2B1C;</button>
        </div>

        <button class="ctrl-btn btn-replace" onclick={() => fileInput?.click()}>
          {t('wizard.replaceImage')}
        </button>
      </div>
    </div>

    <!-- Full-size canvas -->
    <div
      class="canvas-container"
      class:cursor-grab={mode === 'drag' || mode === 'rotate'}
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
        draggable={mode !== 'rotate'}
        backgroundInteractive={mode === 'drag'}
        onCanvasPointerDown={handleCanvasPointerDown}
        onCanvasMouseMove={handleCanvasMouseMove}
        onCanvasPointerUp={handleCanvasPointerUp}
      >
        {#snippet background()}
          <BackgroundImage
            imageData={previewUrl}
            {scalePxPerMeter}
            rotation={rotation}
            opacity={0.45}
            locked={mode !== 'drag'}
            draggable={mode === 'drag'}
            userOffsetX={imageOffsetX}
            userOffsetY={imageOffsetY}
            onDragEnd={handleImageDragEnd}
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
          <!-- No ruler in Step 2: calibration has not been done yet -->
        {/snippet}
      </FloorplanEditor>

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

    <!-- Bottom bar -->
    <div class="bottom-bar">
      {#if mode === 'drag'}
        <p class="mode-hint">&#x2725; {t('wizard.dragMode')}</p>
      {:else if mode === 'rotate'}
        <p class="mode-hint">&#x21BB; {t('wizard.rotateMode')}</p>
      {/if}
      <button class="btn-next" onclick={handleNext}>
        {t('wizard.next')} &rarr;
      </button>
    </div>
  {:else}
    <!-- Upload state: centered card -->
    <div class="upload-section">
      <h2 class="step-title">{t('wizard.step2')}</h2>

      <div
        class="drop-zone"
        class:drag-over={dragOver}
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        role="button"
        tabindex="0"
        onclick={() => fileInput?.click()}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput?.click(); }}
      >
        {#if uploading}
          <div class="drop-content">
            <span class="drop-icon">&#x23F3;</span>
            <span class="drop-text">{t('action.creating')}</span>
          </div>
        {:else}
          <div class="drop-content">
            <span class="drop-icon">&#x1F4C1;</span>
            <span class="drop-text">{t('wizard.uploadImage')}</span>
            <span class="drop-hint">{t('wizard.dragDrop')}</span>
            <span class="drop-formats">JPG, PNG, WebP</span>
          </div>
        {/if}
      </div>

      {#if errorMsg}
        <p class="error-msg">{errorMsg}</p>
      {/if}

      <button class="btn-skip" onclick={handleNext}>
        {t('wizard.noFloorplan')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* ── Layout ── */
  .step-floorplan {
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

  .mode-buttons {
    display: flex;
    gap: 2px;
    background: var(--bg-tertiary, #f0f0f5);
    border-radius: 6px;
    padding: 2px;
  }

  .mode-btn {
    padding: 7px 14px;
    background: transparent;
    border: none;
    border-radius: 4px;
    font-size: 0.82rem;
    cursor: pointer;
    color: var(--text-secondary, #4a4a6a);
    font-family: inherit;
    line-height: 1;
    transition: all 0.1s ease;
  }

  .mode-btn:hover {
    background: var(--bg-primary, #ffffff);
  }

  .mode-btn.active {
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  .rotation-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .rotation-slider {
    width: 80px;
    accent-color: var(--accent, #4a6cf7);
    cursor: pointer;
  }

  .rotation-input {
    width: 48px;
    padding: 4px 5px;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 5px;
    font-size: 0.78rem;
    text-align: center;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    font-family: inherit;
  }

  .rotation-suffix {
    font-size: 0.78rem;
    color: var(--text-muted, #6a6a8a);
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

  .btn-replace {
    font-size: 0.78rem;
    padding: 5px 12px;
  }

  /* ── Canvas ── */
  .canvas-container {
    flex: 1;
    min-height: 300px;
    overflow: hidden;
    background: #e8e8ee;
    position: relative;
    cursor: default;
  }

  .canvas-container.cursor-grab {
    cursor: grab;
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

  .mode-hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--accent, #4a6cf7);
    font-weight: 500;
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

  /* ── Upload section (before image) ── */
  .upload-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    flex: 1;
  }

  .upload-section .step-title {
    margin-bottom: 20px;
  }

  .drop-zone {
    border: 2px dashed var(--border, #d0d0e0);
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--bg-secondary, #fafafe);
    width: 100%;
    max-width: 420px;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--accent, #4a6cf7);
    background: rgba(74, 108, 247, 0.04);
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .drop-icon {
    font-size: 2rem;
  }

  .drop-text {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a2e);
  }

  .drop-hint {
    font-size: 0.8rem;
    color: var(--text-muted, #6a6a8a);
  }

  .drop-formats {
    font-size: 0.7rem;
    color: var(--text-muted, #6a6a8a);
    margin-top: 4px;
  }

  .error-msg {
    color: #f44336;
    font-size: 0.8rem;
    margin: 8px 0;
  }

  .btn-skip {
    width: 100%;
    max-width: 420px;
    margin-top: 12px;
    padding: 10px;
    background: transparent;
    color: var(--text-muted, #6a6a8a);
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 8px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .btn-skip:hover {
    background: var(--bg-tertiary, #f0f0f5);
    color: var(--text-secondary, #4a4a6a);
  }
</style>
