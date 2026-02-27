<!--
  HeatmapRenderer.svelte - Manages the heatmap lifecycle using HeatmapManager.

  Features:
  - Creates and destroys HeatmapManager on mount/unmount
  - Progressive rendering: coarse grid first, refines automatically
  - Exposes rendered canvas and stats for parent components
  - Triggers recalculation when AP/wall/settings change
-->
<script lang="ts">
  import { HeatmapManager } from './heatmap-manager';
  import type { HeatmapStats, HeatmapParams } from './heatmap-manager';
  import type { APConfig, WallData, FloorBounds } from './worker-types';
  import type { FrequencyBand, ColorScheme } from './color-schemes';

  // ─── Props ─────────────────────────────────────────────────────

  interface HeatmapRendererProps {
    /** Access points to include in calculation */
    aps: APConfig[];
    /** Walls with attenuation data */
    walls: WallData[];
    /** Floor dimensions in meters */
    bounds: FloorBounds;
    /** Frequency band to calculate */
    band?: FrequencyBand;
    /** Color scheme for visualization */
    colorScheme?: ColorScheme;
    /** Output image width in pixels */
    outputWidth?: number;
    /** Output image height in pixels */
    outputHeight?: number;
    /** Calibrated path loss exponent (overrides default) */
    calibratedN?: number;
    /** Receiver gain in dBi (overrides default) */
    receiverGainDbi?: number;
    /** Callback with the rendered canvas */
    onCanvas?: (canvas: HTMLCanvasElement | null) => void;
    /** Callback with heatmap statistics */
    onStats?: (stats: HeatmapStats | null) => void;
  }

  let {
    aps,
    walls,
    bounds,
    band = '5ghz',
    colorScheme = 'viridis',
    outputWidth = 800,
    outputHeight = 600,
    calibratedN = undefined,
    receiverGainDbi = undefined,
    onCanvas,
    onStats,
  }: HeatmapRendererProps = $props();

  // ─── Internal State ────────────────────────────────────────────

  let manager: HeatmapManager | null = null;

  // ─── Manager Lifecycle ─────────────────────────────────────────

  $effect(() => {
    const mgr = new HeatmapManager({
      onResult: (canvas, stats) => {
        onCanvas?.(canvas);
        onStats?.(stats);
      },
      onError: (message) => {
        console.error('[HeatmapRenderer] Calculation error:', message);
      },
    });

    manager = mgr;

    return () => {
      mgr.destroy();
      manager = null;
    };
  });

  // ─── Reactive Recalculation ────────────────────────────────────

  $effect(() => {
    if (!manager) return;

    // Track all reactive dependencies
    const params: HeatmapParams = {
      aps,
      walls,
      bounds,
      band,
      colorScheme,
      outputWidth,
      outputHeight,
      calibratedN,
      receiverGainDbi,
    };

    // Progressive render: coarse immediately, then refine
    manager.requestProgressive(params);
  });
</script>

<!-- HeatmapRenderer is headless - it only manages the worker.
     The actual canvas is rendered by HeatmapOverlay via the onCanvas callback. -->
