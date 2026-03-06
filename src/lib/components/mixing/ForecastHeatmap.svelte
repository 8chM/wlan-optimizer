<!--
  ForecastHeatmap.svelte - Renders a forecast heatmap based on modified AP parameters.

  Features:
  - When slider changes, debounce 200ms then trigger heatmap recalculation
  - Passes modified AP parameters to HeatmapRenderer
  - Uses HeatmapOverlay for canvas rendering
  - Integrates with existing HeatmapManager via HeatmapRenderer
-->
<script lang="ts">
  import { HeatmapRenderer } from '$lib/heatmap';
  import type { FloorBounds } from '$lib/heatmap';
  import type { AccessPointResponse, WallResponse } from '$lib/api/invoke';
  import type { APChange } from '$lib/stores/mixingStore.svelte';
  import type { FrequencyBand, ColorScheme } from '$lib/heatmap';
  import { convertApsToConfig, convertWallsToData } from '$lib/heatmap/convert';

  // ─── Props ─────────────────────────────────────────────────────

  interface ForecastHeatmapProps {
    /** Access points (original data) */
    accessPoints: AccessPointResponse[];
    /** Walls from the floor */
    walls: WallResponse[];
    /** Floor bounds in meters */
    bounds: FloorBounds;
    /** Current AP changes (from mixingStore) */
    changes: APChange[];
    /** Whether forecast mode is active */
    forecastActive?: boolean;
    /** Frequency band */
    band?: FrequencyBand;
    /** Color scheme */
    colorScheme?: ColorScheme;
    /** Output width in pixels */
    outputWidth?: number;
    /** Output height in pixels */
    outputHeight?: number;
    /** Scale: pixels per meter */
    scalePxPerMeter?: number;
    /** Calibrated path loss exponent */
    calibratedN?: number;
    /** Receiver gain in dBi */
    receiverGainDbi?: number;
    /** Wall-mount back sector penalty in dB */
    backSectorPenalty?: number;
    /** Wall-mount side sector penalty in dB */
    sideSectorPenalty?: number;
    /** Optional: only calculate for a single AP (filter) */
    apFilter?: string;
    /** Callback when forecast canvas is updated */
    onCanvas?: (canvas: HTMLCanvasElement | null) => void;
    /** Callback with heatmap statistics */
    onStats?: (stats: { minRSSI: number; maxRSSI: number; avgRSSI: number; calculationTimeMs: number } | null) => void;
  }

  let {
    accessPoints,
    walls,
    bounds,
    changes,
    forecastActive = false,
    band = '5ghz',
    colorScheme = 'viridis',
    outputWidth = 800,
    outputHeight = 600,
    scalePxPerMeter = 50,
    calibratedN = undefined,
    receiverGainDbi = undefined,
    backSectorPenalty = undefined,
    sideSectorPenalty = undefined,
    apFilter = undefined,
    onCanvas,
    onStats,
  }: ForecastHeatmapProps = $props();

  // ─── Derived: Build modified AP configs ─────────────────────────

  /**
   * Build overrides map from mixing console changes.
   */
  let overridesMap = $derived.by(() => {
    const map = new Map<string, Record<string, string>>();
    for (const change of changes) {
      if (change.newValue == null) continue;
      let record = map.get(change.apId);
      if (!record) {
        record = {};
        map.set(change.apId, record);
      }
      record[change.parameter] = change.newValue;
    }
    return map;
  });

  let modifiedAps = $derived(convertApsToConfig(accessPoints, band, overridesMap));
  let wallData = $derived(convertWallsToData(walls, band));
</script>

{#if forecastActive && modifiedAps.length > 0}
  <HeatmapRenderer
    aps={modifiedAps}
    walls={wallData}
    {bounds}
    {band}
    {colorScheme}
    {outputWidth}
    {outputHeight}
    {calibratedN}
    {receiverGainDbi}
    {backSectorPenalty}
    {sideSectorPenalty}
    {apFilter}
    {onCanvas}
    {onStats}
  />
{/if}
