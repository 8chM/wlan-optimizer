<!--
  StepCalibration.svelte - Step 3: Rotate and scale the floor plan image.

  Shows the floor plan image with rotation controls and a 2-point
  calibration tool for setting the scale (pixels per meter).
  If no image was uploaded, shows manual dimension input instead.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { setFloorScale, setFloorRotation } from '$lib/api/floor';

  let rotation = $state(projectStore.activeFloor?.background_image_rotation ?? 0);
  let imageUrl = $state<string | null>(null);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  // Manual dimension inputs (when no image)
  let manualWidth = $state(projectStore.activeFloor?.width_meters?.toString() ?? '10');
  let manualHeight = $state(projectStore.activeFloor?.height_meters?.toString() ?? '10');

  // Scale calibration state
  let calibrationPoints = $state<Array<{ x: number; y: number }>>([]);
  let scaleDistanceInput = $state('');
  let scaleConfirmed = $state(wizardStore.stepData.scaleConfirmed);
  let saving = $state(false);

  // Canvas display state
  let containerRef: HTMLDivElement | undefined = $state();
  let displayScale = $state(1);

  let hasFloorplan = $derived(wizardStore.stepData.hasFloorplan);
  let floor = $derived(projectStore.activeFloor);

  // Load image
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
        updateDisplayScale();
      };
      img.src = stored;
    }
  });

  function updateDisplayScale(): void {
    if (!containerRef || imageWidth === 0) return;
    const containerW = containerRef.clientWidth - 48;
    const containerH = 400;
    const scaleW = containerW / imageWidth;
    const scaleH = containerH / imageHeight;
    displayScale = Math.min(scaleW, scaleH, 1);
  }

  /** Compute bounding box dimensions of a rotated rectangle. */
  function getRotatedBoundingBox(w: number, h: number, angleDeg: number): { w: number; h: number } {
    const rad = ((angleDeg % 360 + 360) % 360) * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return { w: w * cos + h * sin, h: w * sin + h * cos };
  }

  async function handleRotate90(): Promise<void> {
    rotation = (rotation + 90) % 360;
    await applyRotation();
  }

  async function handleRotationInput(event: Event): Promise<void> {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) {
      rotation = ((val % 360) + 360) % 360;
      await applyRotation();
    }
  }

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
    } catch (err) {
      console.error('[Wizard] Rotation failed:', err);
    }
  }

  function handleImageClick(event: MouseEvent): void {
    if (scaleConfirmed) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / displayScale;
    const y = (event.clientY - rect.top) / displayScale;

    if (calibrationPoints.length < 2) {
      calibrationPoints = [...calibrationPoints, { x, y }];
    }
  }

  function resetCalibration(): void {
    calibrationPoints = [];
    scaleDistanceInput = '';
    scaleConfirmed = false;
  }

  async function confirmScale(): Promise<void> {
    const distance = parseFloat(scaleDistanceInput);
    if (isNaN(distance) || distance <= 0 || calibrationPoints.length !== 2) return;

    const floorId = wizardStore.floorId;
    if (!floorId) return;

    const dx = calibrationPoints[1]!.x - calibrationPoints[0]!.x;
    const dy = calibrationPoints[1]!.y - calibrationPoints[0]!.y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const pxPerMeter = pixelDist / distance;

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
      wizardStore.updateStepData({ scaleConfirmed: true });
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

  let calibrationLinePx = $derived.by(() => {
    if (calibrationPoints.length !== 2) return null;
    return {
      x1: calibrationPoints[0]!.x * displayScale,
      y1: calibrationPoints[0]!.y * displayScale,
      x2: calibrationPoints[1]!.x * displayScale,
      y2: calibrationPoints[1]!.y * displayScale,
    };
  });
</script>

<div class="step-calibration" bind:this={containerRef}>
  <div class="step-card">
    <h2 class="step-title">{t('wizard.step3')}</h2>

    {#if hasFloorplan && imageUrl}
      <!-- Rotation controls -->
      <div class="control-row">
        <label class="control-label">{t('wizard.rotateImage')}</label>
        <div class="rotation-controls">
          <button class="ctrl-btn" onclick={handleRotate90}>90&deg;</button>
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
      </div>

      <!-- Image with calibration overlay -->
      <div class="image-container">
        <div
          class="image-wrapper"
          style="width: {imageWidth * displayScale}px; height: {imageHeight * displayScale}px;"
          onclick={handleImageClick}
          role="button"
          tabindex="0"
          onkeydown={() => {}}
        >
          <img
            src={imageUrl}
            alt="Floor plan"
            class="calibration-image"
            style="transform: rotate({rotation}deg); transform-origin: center center;"
            draggable="false"
          />

          <!-- Calibration points overlay -->
          <svg class="calibration-overlay" viewBox="0 0 {imageWidth * displayScale} {imageHeight * displayScale}">
            {#each calibrationPoints as pt, i (i)}
              <circle
                cx={pt.x * displayScale}
                cy={pt.y * displayScale}
                r="6"
                fill="#4a6cf7"
                stroke="#ffffff"
                stroke-width="2"
              />
            {/each}
            {#if calibrationLinePx}
              <line
                x1={calibrationLinePx.x1}
                y1={calibrationLinePx.y1}
                x2={calibrationLinePx.x2}
                y2={calibrationLinePx.y2}
                stroke="#4a6cf7"
                stroke-width="2"
                stroke-dasharray="6,4"
              />
            {/if}
          </svg>
        </div>

        {#if !scaleConfirmed}
          <p class="calibration-hint">{t('wizard.drawCalibration')}</p>
        {/if}
      </div>

      <!-- Scale input (shown when 2 points are placed) -->
      {#if calibrationPoints.length === 2 && !scaleConfirmed}
        <div class="scale-input-row">
          <label class="control-label">{t('wizard.enterDistance')}</label>
          <div class="scale-input-group">
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
          </div>
          <button class="btn-reset" onclick={resetCalibration}>
            {t('action.retry')}
          </button>
        </div>
      {/if}

      {#if scaleConfirmed}
        <div class="scale-confirmed">
          <span class="confirmed-icon">✓</span>
          <span>{t('wizard.calibrationDone')}</span>
          <button class="btn-redo" onclick={resetCalibration}>
            {t('action.retry')}
          </button>
        </div>

        <button class="btn-next" onclick={handleNext}>
          {t('wizard.next')} &rarr;
        </button>
      {/if}
    {:else}
      <!-- No image: manual dimensions -->
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
    {/if}
  </div>
</div>

<style>
  .step-calibration {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 24px;
    min-height: 100%;
  }

  .step-card {
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 640px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .step-title {
    margin: 0 0 20px;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 12px;
  }

  .control-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary, #4a4a6a);
  }

  .rotation-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ctrl-btn {
    padding: 6px 12px;
    background: var(--bg-tertiary, #f0f0f5);
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    color: var(--text-secondary, #4a4a6a);
    font-family: inherit;
  }

  .ctrl-btn:hover {
    background: var(--border, #d0d0e0);
  }

  .rotation-input {
    width: 60px;
    padding: 6px 8px;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    font-size: 0.8rem;
    text-align: center;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    font-family: inherit;
  }

  .rotation-suffix {
    font-size: 0.8rem;
    color: var(--text-muted, #6a6a8a);
  }

  .image-container {
    margin-bottom: 16px;
  }

  .image-wrapper {
    position: relative;
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 8px;
    background: #f0f0f5;
    cursor: crosshair;
  }

  .calibration-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    pointer-events: none;
  }

  .calibration-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .calibration-hint {
    text-align: center;
    font-size: 0.8rem;
    color: var(--text-muted, #6a6a8a);
    margin: 8px 0 0;
  }

  .scale-input-row {
    margin-top: 12px;
  }

  .scale-input-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  .scale-num {
    width: 100px;
  }

  .scale-unit {
    font-size: 0.85rem;
    color: var(--text-muted, #6a6a8a);
  }

  .btn-confirm {
    padding: 8px 16px;
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
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
    padding: 4px 12px;
    background: transparent;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--text-muted, #6a6a8a);
    cursor: pointer;
    margin-top: 6px;
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
    padding: 12px;
    background: rgba(76, 175, 80, 0.08);
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 8px;
    margin-top: 12px;
    font-size: 0.85rem;
    color: #4caf50;
    font-weight: 500;
  }

  .confirmed-icon {
    font-size: 1.1rem;
  }

  .manual-hint {
    font-size: 0.85rem;
    color: var(--text-muted, #6a6a8a);
    margin-bottom: 16px;
  }

  .manual-row {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
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

  .btn-next {
    width: 100%;
    margin-top: 16px;
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
</style>
