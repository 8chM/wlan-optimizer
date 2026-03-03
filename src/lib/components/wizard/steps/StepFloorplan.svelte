<!--
  StepFloorplan.svelte - Step 2: Upload a floor plan image.

  Supports drag-and-drop or file browser for JPG/PNG images.
  Shows preview after upload. Can be skipped.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { importFloorImage } from '$lib/api/floor';

  let previewUrl = $state<string | null>(null);
  let uploading = $state(false);
  let errorMsg = $state<string | null>(null);
  let dragOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  // Load existing image preview in edit mode
  $effect(() => {
    if (wizardStore.isEditMode && wizardStore.floorId) {
      const stored = localStorage.getItem(`wlan-opt:floor-image:${wizardStore.floorId}`);
      if (stored) {
        previewUrl = stored;
      }
    }
  });

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

      // Store in localStorage for browser-mode persistence
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          localStorage.setItem(`wlan-opt:floor-image:${floorId}`, reader.result);
        }
      };
      reader.readAsDataURL(file);

      wizardStore.updateStepData({ hasFloorplan: true });
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : t('editor.uploadFailed');
    } finally {
      uploading = false;
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
    wizardStore.nextStep();
  }
</script>

<div class="step-floorplan">
  <div class="step-card">
    <h2 class="step-title">{t('wizard.step2')}</h2>

    {#if previewUrl}
      <!-- Image preview -->
      <div class="preview-container">
        <img src={previewUrl} alt="Floor plan" class="preview-image" />
        <div class="preview-actions">
          <button class="btn-replace" onclick={() => fileInput?.click()}>
            {t('wizard.replaceImage')}
          </button>
        </div>
      </div>

      <button class="btn-next" onclick={handleNext}>
        {t('wizard.next')} &rarr;
      </button>
    {:else}
      <!-- Drop zone -->
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
            <span class="drop-icon">⏳</span>
            <span class="drop-text">{t('action.creating')}</span>
          </div>
        {:else}
          <div class="drop-content">
            <span class="drop-icon">📁</span>
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
    {/if}
  </div>
</div>

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  accept="image/png,image/jpeg,image/webp"
  onchange={handleFileSelected}
  style="display: none"
/>

<style>
  .step-floorplan {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 40px 24px;
    min-height: 100%;
  }

  .step-card {
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 12px;
    padding: 32px;
    width: 100%;
    max-width: 520px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .step-title {
    margin: 0 0 24px;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .drop-zone {
    border: 2px dashed var(--border, #d0d0e0);
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--bg-secondary, #fafafe);
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

  .preview-container {
    margin-bottom: 16px;
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 8px;
    overflow: hidden;
  }

  .preview-image {
    width: 100%;
    max-height: 300px;
    object-fit: contain;
    display: block;
    background: #f0f0f5;
  }

  .preview-actions {
    padding: 8px;
    display: flex;
    justify-content: center;
    background: var(--bg-secondary, #fafafe);
    border-top: 1px solid var(--border, #e0e0e0);
  }

  .btn-replace {
    padding: 6px 16px;
    background: transparent;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-secondary, #4a4a6a);
    cursor: pointer;
    font-family: inherit;
  }

  .btn-replace:hover {
    background: var(--bg-tertiary, #f0f0f5);
    border-color: var(--text-muted, #6a6a8a);
  }

  .error-msg {
    color: #f44336;
    font-size: 0.8rem;
    margin: 8px 0;
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

  .btn-next:hover {
    background: #3a5ce5;
  }

  .btn-skip {
    width: 100%;
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
