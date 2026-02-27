<!--
  SignalLegend.svelte - Color scale legend for heatmap signal strength.

  Displays signal quality thresholds with color indicators:
  - Excellent: > -50 dBm (green/yellow in viridis)
  - Good: -50 to -65 dBm
  - Fair: -65 to -75 dBm
  - Poor: -75 to -85 dBm
  - No signal: < -85 dBm (dark in viridis)

  Generates a gradient bar from the active color scheme LUT
  and shows labeled threshold markers below it.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { getColorLUT, RSSI_MIN, RSSI_MAX } from '$lib/heatmap/color-schemes';
  import type { ColorScheme } from '$lib/heatmap/color-schemes';

  // ─── Props ─────────────────────────────────────────────────────

  interface SignalLegendProps {
    /** Active color scheme for the gradient bar */
    colorScheme?: ColorScheme;
    /** Coverage percentage (0-100), shown if provided */
    coveragePercent?: number | null;
  }

  let {
    colorScheme = 'viridis',
    coveragePercent = null,
  }: SignalLegendProps = $props();

  // ─── Constants ─────────────────────────────────────────────────

  /** Signal quality thresholds in dBm (from rf-modell.md) */
  const THRESHOLDS = [
    { labelKey: 'signal.excellent', minDbm: -50, maxDbm: RSSI_MAX },
    { labelKey: 'signal.good', minDbm: -65, maxDbm: -50 },
    { labelKey: 'signal.fair', minDbm: -75, maxDbm: -65 },
    { labelKey: 'signal.poor', minDbm: -85, maxDbm: -75 },
    { labelKey: 'signal.none', minDbm: RSSI_MIN, maxDbm: -85 },
  ];

  /** dBm values to show as labels under the gradient bar */
  const TICK_VALUES = [-30, -50, -65, -75, -85, -95];

  // ─── Gradient Canvas ──────────────────────────────────────────

  /** Reference to the container element for the gradient bar */
  let gradientContainer = $state<HTMLDivElement | null>(null);

  /**
   * Renders the color gradient bar using the LUT from color-schemes.ts.
   * Creates a 256x1 canvas and uses CSS scaling for display width.
   */
  $effect(() => {
    if (!gradientContainer) return;

    // Remove previous canvas if present
    while (gradientContainer.firstChild) {
      gradientContainer.removeChild(gradientContainer.firstChild);
    }

    const lut = getColorLUT(colorScheme, 255);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(256, 1);
    const data = imageData.data;

    for (let i = 0; i < 256; i++) {
      const packed = lut[i] ?? 0;
      // Unpack from ABGR (little-endian Uint32) to RGBA bytes
      data[i * 4] = packed & 0xff;             // R
      data[i * 4 + 1] = (packed >> 8) & 0xff;  // G
      data[i * 4 + 2] = (packed >> 16) & 0xff;  // B
      data[i * 4 + 3] = 255;                     // Full opacity for legend
    }

    ctx.putImageData(imageData, 0, 0);

    canvas.style.width = '100%';
    canvas.style.height = '12px';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '3px';
    canvas.style.imageRendering = 'auto';

    gradientContainer.appendChild(canvas);

    return () => {
      canvas.remove();
    };
  });

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Converts a dBm value to a percentage position along the gradient bar.
   * 0% = RSSI_MIN (-95 dBm, left), 100% = RSSI_MAX (-30 dBm, right).
   */
  function dbmToPercent(dbm: number): number {
    const clamped = Math.max(RSSI_MIN, Math.min(RSSI_MAX, dbm));
    return ((clamped - RSSI_MIN) / (RSSI_MAX - RSSI_MIN)) * 100;
  }
</script>

<div class="signal-legend">
  <!-- Gradient bar -->
  <div class="gradient-bar" bind:this={gradientContainer}></div>

  <!-- Tick marks with dBm labels -->
  <div class="tick-row">
    {#each TICK_VALUES as dbm (dbm)}
      <span
        class="tick-label"
        style="left: {dbmToPercent(dbm)}%"
      >
        {dbm}
      </span>
    {/each}
  </div>

  <!-- Signal quality labels -->
  <div class="quality-labels">
    {#each THRESHOLDS as threshold (threshold.labelKey)}
      {@const leftPercent = dbmToPercent(threshold.minDbm)}
      {@const rightPercent = dbmToPercent(threshold.maxDbm)}
      {@const widthPercent = rightPercent - leftPercent}
      <span
        class="quality-label"
        style="left: {leftPercent}%; width: {widthPercent}%"
      >
        {t(threshold.labelKey)}
      </span>
    {/each}
  </div>

  <!-- Coverage percentage -->
  {#if coveragePercent != null}
    <div class="coverage">
      <span class="coverage-label">{t('heatmap.coverage')}:</span>
      <span class="coverage-value">{coveragePercent.toFixed(0)}%</span>
    </div>
  {/if}
</div>

<style>
  .signal-legend {
    padding: 4px 0;
  }

  .gradient-bar {
    width: 100%;
    height: 12px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
  }

  .tick-row {
    position: relative;
    height: 16px;
    margin-top: 2px;
  }

  .tick-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: 0.6rem;
    color: #6a6a8a;
    font-family: 'SF Mono', 'Fira Code', monospace;
    white-space: nowrap;
  }

  .quality-labels {
    position: relative;
    height: 14px;
    margin-top: 2px;
  }

  .quality-label {
    position: absolute;
    text-align: center;
    font-size: 0.55rem;
    color: #808090;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .coverage {
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .coverage-label {
    color: #808090;
  }

  .coverage-value {
    color: #e0e0f0;
    font-weight: 600;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
</style>
