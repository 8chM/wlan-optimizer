<!--
  HeatmapComparison.svelte - Main comparison component with three modes:
  1. Side-by-Side: Two canvases next to each other
  2. Overlay: Slider to blend between before/after
  3. Difference: Green/red diff canvas
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { comparisonStore } from '$lib/stores/comparisonStore.svelte';
  import ComparisonControls from './ComparisonControls.svelte';
  import DifferenceHeatmap from './DifferenceHeatmap.svelte';

  interface HeatmapComparisonProps {
    visible?: boolean;
  }

  let { visible = false }: HeatmapComparisonProps = $props();

  let beforeCanvasEl = $state<HTMLCanvasElement | null>(null);
  let afterCanvasEl = $state<HTMLCanvasElement | null>(null);

  // Draw before canvas
  $effect(() => {
    if (beforeCanvasEl && comparisonStore.beforeCanvas) {
      const src = comparisonStore.beforeCanvas;
      beforeCanvasEl.width = src.width;
      beforeCanvasEl.height = src.height;
      const ctx = beforeCanvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, beforeCanvasEl.width, beforeCanvasEl.height);
        ctx.drawImage(src, 0, 0);
      }
    }
  });

  // Draw after canvas
  $effect(() => {
    if (afterCanvasEl && comparisonStore.afterCanvas) {
      const src = comparisonStore.afterCanvas;
      afterCanvasEl.width = src.width;
      afterCanvasEl.height = src.height;
      const ctx = afterCanvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, afterCanvasEl.width, afterCanvasEl.height);
        ctx.drawImage(src, 0, 0);
      }
    }
  });

  function handleClose(): void {
    comparisonStore.deactivate();
  }
</script>

{#if visible && comparisonStore.canCompare}
  <div class="comparison-panel">
    <ComparisonControls
      mode={comparisonStore.mode}
      overlayOpacity={comparisonStore.overlayOpacity}
      beforeLabel={comparisonStore.beforeLabel}
      afterLabel={comparisonStore.afterLabel}
      onModeChange={(m) => comparisonStore.setMode(m)}
      onOpacityChange={(o) => comparisonStore.setOverlayOpacity(o)}
      onClose={handleClose}
    />

    <div class="comparison-content">
      {#if comparisonStore.mode === 'side-by-side'}
        <div class="side-by-side">
          <div class="side-panel">
            <span class="side-label">{comparisonStore.beforeLabel || t('comparison.before')}</span>
            <canvas bind:this={beforeCanvasEl} class="preview-canvas"></canvas>
          </div>
          <div class="side-panel">
            <span class="side-label">{comparisonStore.afterLabel || t('comparison.after')}</span>
            <canvas bind:this={afterCanvasEl} class="preview-canvas"></canvas>
          </div>
        </div>
      {:else if comparisonStore.mode === 'overlay'}
        <div class="overlay-container">
          <canvas
            bind:this={beforeCanvasEl}
            class="preview-canvas overlay-before"
            style="opacity: {1 - comparisonStore.overlayOpacity}"
          ></canvas>
          <canvas
            bind:this={afterCanvasEl}
            class="preview-canvas overlay-after"
            style="opacity: {comparisonStore.overlayOpacity}"
          ></canvas>
        </div>
      {:else if comparisonStore.mode === 'difference'}
        <DifferenceHeatmap result={comparisonStore.diffResult} />
      {/if}
    </div>
  </div>
{/if}

<style>
  .comparison-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 360px;
    max-height: 50vh;
    background: rgba(26, 26, 46, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 25;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    overflow-y: auto;
  }

  .comparison-content {
    margin-top: 8px;
  }

  .side-by-side {
    display: flex;
    gap: 6px;
  }

  .side-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .side-label {
    font-size: 0.6rem;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-align: center;
  }

  .preview-canvas {
    width: 100%;
    height: auto;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
  }

  .overlay-container {
    position: relative;
    width: 100%;
    min-height: 100px;
  }

  .overlay-before,
  .overlay-after {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
  }

  .overlay-before {
    z-index: 1;
  }

  .overlay-after {
    z-index: 2;
  }
</style>
