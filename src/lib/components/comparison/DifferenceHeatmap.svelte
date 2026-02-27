<!--
  DifferenceHeatmap.svelte - Renders the difference canvas with a legend.
  Green = improved, Red = degraded, Gray = unchanged.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { DifferenceResult } from '$lib/heatmap/difference';

  interface DifferenceHeatmapProps {
    result: DifferenceResult | null;
  }

  let { result }: DifferenceHeatmapProps = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  // Draw the result canvas onto our display canvas
  $effect(() => {
    if (canvasEl && result) {
      const ctx = canvasEl.getContext('2d');
      if (ctx) {
        canvasEl.width = result.canvas.width;
        canvasEl.height = result.canvas.height;
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(result.canvas, 0, 0);
      }
    }
  });

  let totalPixels = $derived(
    result ? result.improvedCount + result.degradedCount + result.unchangedCount : 0,
  );
  let improvedPct = $derived(totalPixels > 0 ? (result!.improvedCount / totalPixels) * 100 : 0);
  let degradedPct = $derived(totalPixels > 0 ? (result!.degradedCount / totalPixels) * 100 : 0);
  let unchangedPct = $derived(totalPixels > 0 ? (result!.unchangedCount / totalPixels) * 100 : 0);
</script>

{#if result}
  <div class="difference-container">
    <canvas bind:this={canvasEl} class="diff-canvas"></canvas>

    <div class="diff-legend">
      <div class="legend-item">
        <span class="legend-dot improved"></span>
        <span class="legend-label">{t('comparison.improved')}</span>
        <span class="legend-value">{improvedPct.toFixed(1)}%</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot degraded"></span>
        <span class="legend-label">{t('comparison.degraded')}</span>
        <span class="legend-value">{degradedPct.toFixed(1)}%</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot unchanged"></span>
        <span class="legend-label">{t('comparison.unchanged')}</span>
        <span class="legend-value">{unchangedPct.toFixed(1)}%</span>
      </div>
      {#if result.avgDeltaDb !== 0}
        <div class="legend-delta">
          {result.avgDeltaDb > 0 ? '+' : ''}{result.avgDeltaDb.toFixed(1)} dB
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .difference-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .diff-canvas {
    width: 100%;
    height: auto;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .diff-legend {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-dot.improved {
    background: #22c55e;
  }

  .legend-dot.degraded {
    background: #ef4444;
  }

  .legend-dot.unchanged {
    background: #6b7280;
  }

  .legend-label {
    font-size: 0.65rem;
    color: #808090;
  }

  .legend-value {
    font-size: 0.65rem;
    font-weight: 600;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .legend-delta {
    font-size: 0.7rem;
    font-weight: 600;
    color: #a5b4fc;
    font-family: 'SF Mono', 'Fira Code', monospace;
    margin-left: auto;
  }
</style>
