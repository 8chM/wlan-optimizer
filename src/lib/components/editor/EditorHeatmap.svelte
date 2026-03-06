<!--
  EditorHeatmap.svelte - Headless heatmap renderer for the editor page.

  Watches AP/wall data from projectStore and renders live heatmap
  via HeatmapRenderer whenever data changes. Results are pushed
  to editorHeatmapStore for display by HeatmapOverlay.

  Supports three overlay modes:
  - 'signal': Standard RSSI heatmap (from worker)
  - 'ap-zones': Categorical AP assignment colors (rendered from metadata)
  - 'delta': Best-minus-second-best stability map (rendered from metadata)
-->
<script lang="ts">
  import { HeatmapRenderer } from '$lib/heatmap';
  import type { FloorBounds, HeatmapStats } from '$lib/heatmap';
  import type { AccessPointResponse, WallResponse } from '$lib/api/invoke';
  import { convertApsToConfig, convertWallsToData } from '$lib/heatmap/convert';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';

  interface EditorHeatmapProps {
    accessPoints: AccessPointResponse[];
    walls: WallResponse[];
    bounds: FloorBounds;
    scalePxPerMeter: number;
    outputWidth: number;
    outputHeight: number;
  }

  let {
    accessPoints,
    walls,
    bounds,
    scalePxPerMeter,
    outputWidth,
    outputHeight,
  }: EditorHeatmapProps = $props();

  let aps = $derived(convertApsToConfig(accessPoints, editorHeatmapStore.band));
  let wallData = $derived(convertWallsToData(walls, editorHeatmapStore.band));

  /** The original signal canvas from the worker */
  let signalCanvas: HTMLCanvasElement | null = null;
  /** Latest stats from the worker */
  let latestStats: HeatmapStats | null = null;

  function handleCanvas(canvas: HTMLCanvasElement | null): void {
    signalCanvas = canvas;
    // Don't call updateOverlayCanvas() here — handleStats will call it
    // after latestStats is set. Calling here causes a flash where ap-zones/delta
    // falls back to signal because latestStats hasn't been updated yet.
    if (editorHeatmapStore.overlayMode === 'signal') {
      editorHeatmapStore.setCanvas(canvas);
    }
  }

  function handleStats(stats: HeatmapStats | null): void {
    latestStats = stats;
    editorHeatmapStore.setStats(stats);
    updateOverlayCanvas();
  }

  // ─── AP-Zones / Delta rendering from metadata grids ─────────

  /** Categorical color palette for AP zones (max 10 APs) */
  const AP_COLORS: [number, number, number, number][] = [
    [66, 133, 244, 180],   // Blue
    [234, 67, 53, 180],    // Red
    [52, 168, 83, 180],    // Green
    [251, 188, 4, 180],    // Yellow
    [171, 71, 188, 180],   // Purple
    [0, 172, 193, 180],    // Cyan
    [255, 112, 67, 180],   // Deep Orange
    [124, 179, 66, 180],   // Light Green
    [3, 169, 244, 180],    // Light Blue
    [233, 30, 99, 180],    // Pink
  ];

  /**
   * Renders AP-zones overlay from apIndexGrid metadata.
   * Uses bilinear-style nearest-neighbor upscaling (categorical data).
   */
  function renderApZonesCanvas(
    apIndexGrid: Uint8Array,
    gridW: number,
    gridH: number,
    outW: number,
    outH: number,
  ): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(outW, outH);
    const data = imageData.data;
    const scaleX = outW > 1 ? (gridW - 1) / (outW - 1) : 0;
    const scaleY = outH > 1 ? (gridH - 1) / (outH - 1) : 0;

    for (let py = 0; py < outH; py++) {
      const gy = Math.round(py * scaleY);
      for (let px = 0; px < outW; px++) {
        const gx = Math.round(px * scaleX);
        const apIdx = apIndexGrid[gy * gridW + gx] ?? 0;
        const color = AP_COLORS[apIdx % AP_COLORS.length]!;
        const off = (py * outW + px) * 4;
        data[off] = color[0];
        data[off + 1] = color[1];
        data[off + 2] = color[2];
        data[off + 3] = color[3];
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /**
   * Renders delta overlay from deltaGrid metadata.
   * Green (>15dB stable) → Yellow (5-15dB ok) → Red (<5dB handoff risk).
   * Uses bilinear interpolation for smooth gradients.
   */
  function renderDeltaCanvas(
    deltaGrid: Float32Array,
    gridW: number,
    gridH: number,
    outW: number,
    outH: number,
  ): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(outW, outH);
    const data = imageData.data;
    const scaleX = outW > 1 ? (gridW - 1) / (outW - 1) : 0;
    const scaleY = outH > 1 ? (gridH - 1) / (outH - 1) : 0;

    for (let py = 0; py < outH; py++) {
      const gy = py * scaleY;
      const gy0 = Math.floor(gy);
      const gy1 = Math.min(gy0 + 1, gridH - 1);
      const ty = gy - gy0;

      for (let px = 0; px < outW; px++) {
        const gx = px * scaleX;
        const gx0 = Math.floor(gx);
        const gx1 = Math.min(gx0 + 1, gridW - 1);
        const tx = gx - gx0;

        // Bilinear interpolation of delta values
        const v00 = deltaGrid[gy0 * gridW + gx0] ?? 0;
        const v10 = deltaGrid[gy0 * gridW + gx1] ?? 0;
        const v01 = deltaGrid[gy1 * gridW + gx0] ?? 0;
        const v11 = deltaGrid[gy1 * gridW + gx1] ?? 0;
        const top = v00 + (v10 - v00) * tx;
        const bottom = v01 + (v11 - v01) * tx;
        const delta = top + (bottom - top) * ty;

        // Map delta to color: Red (<5) → Yellow (5-15) → Green (>15)
        let r: number, g: number, b: number;
        if (delta >= 15) {
          // Stable: green
          r = 56; g = 142; b = 60;
        } else if (delta >= 5) {
          // OK: interpolate yellow to green
          const t = (delta - 5) / 10;
          r = Math.round(251 + (56 - 251) * t);
          g = Math.round(192 + (142 - 192) * t);
          b = Math.round(45 + (60 - 45) * t);
        } else {
          // Risk: interpolate red to yellow
          const t = Math.max(0, delta) / 5;
          r = Math.round(229 + (251 - 229) * t);
          g = Math.round(57 + (192 - 57) * t);
          b = Math.round(53 + (45 - 53) * t);
        }

        const off = (py * outW + px) * 4;
        data[off] = r;
        data[off + 1] = g;
        data[off + 2] = b;
        data[off + 3] = 180;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /** Update the canvas in the store based on the current overlay mode */
  function updateOverlayCanvas(): void {
    const mode = editorHeatmapStore.overlayMode;
    const stats = latestStats;

    if (mode === 'signal') {
      editorHeatmapStore.setCanvas(signalCanvas);
      return;
    }

    // Need metadata grids for ap-zones and delta
    if (!stats?.apIndexGrid || !stats?.deltaGrid || !stats?.gridWidth || !stats?.gridHeight) {
      // Fallback to signal canvas if metadata not available
      editorHeatmapStore.setCanvas(signalCanvas);
      return;
    }

    let overlayCanvas: HTMLCanvasElement | null = null;

    if (mode === 'ap-zones') {
      overlayCanvas = renderApZonesCanvas(
        stats.apIndexGrid, stats.gridWidth, stats.gridHeight,
        outputWidth, outputHeight,
      );
    } else if (mode === 'delta') {
      overlayCanvas = renderDeltaCanvas(
        stats.deltaGrid, stats.gridWidth, stats.gridHeight,
        outputWidth, outputHeight,
      );
    }

    editorHeatmapStore.setCanvas(overlayCanvas ?? signalCanvas);
  }

  // Re-render overlay when mode changes
  $effect(() => {
    // Track overlayMode dependency
    const _mode = editorHeatmapStore.overlayMode;
    updateOverlayCanvas();
  });
</script>

{#if editorHeatmapStore.visible && aps.length > 0}
  <HeatmapRenderer
    {aps}
    walls={wallData}
    {bounds}
    band={editorHeatmapStore.band}
    colorScheme={editorHeatmapStore.colorScheme}
    {outputWidth}
    {outputHeight}
    calibratedN={editorHeatmapStore.calibratedN}
    receiverGainDbi={editorHeatmapStore.receiverGainDbi}
    backSectorPenalty={editorHeatmapStore.backSectorPenalty}
    sideSectorPenalty={editorHeatmapStore.sideSectorPenalty}
    apFilter={editorHeatmapStore.apFilter ?? undefined}
    onCanvas={handleCanvas}
    onStats={handleStats}
  />
{/if}
