<!--
  EditorHeatmap.svelte - Headless heatmap renderer for the editor page.

  Watches AP/wall data from projectStore and renders live heatmap
  via HeatmapRenderer whenever data changes. Results are pushed
  to editorHeatmapStore for display by HeatmapOverlay.
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

  function handleCanvas(canvas: HTMLCanvasElement | null): void {
    editorHeatmapStore.setCanvas(canvas);
  }

  function handleStats(stats: HeatmapStats | null): void {
    editorHeatmapStore.setStats(stats);
  }
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
    onCanvas={handleCanvas}
    onStats={handleStats}
  />
{/if}
