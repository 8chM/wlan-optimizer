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
  import type { APConfig, WallData, FloorBounds } from '$lib/heatmap';
  import type { AccessPointResponse, WallResponse } from '$lib/api/invoke';
  import type { APChange } from '$lib/stores/mixingStore.svelte';
  import type { FrequencyBand, ColorScheme } from '$lib/heatmap';

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
    onCanvas,
    onStats,
  }: ForecastHeatmapProps = $props();

  // ─── Derived: Build modified AP configs ─────────────────────────

  /**
   * Converts AccessPointResponse + changes into APConfig for heatmap calculation.
   * Applies any parameter overrides from the mixing console.
   */
  let modifiedAps = $derived.by(() => {
    return accessPoints
      .filter((ap) => ap.enabled)
      .map((ap): APConfig => {
        // Find changes for this AP
        const apChanges = changes.filter((c) => c.apId === ap.id);

        // Get overridden TX power values
        let txPower: number;
        if (band === '2.4ghz') {
          const txChange = apChanges.find((c) => c.parameter === 'tx_power_24ghz');
          txPower = txChange?.newValue != null
            ? parseFloat(txChange.newValue)
            : (ap.tx_power_24ghz_dbm ?? 23);
        } else {
          const txChange = apChanges.find((c) => c.parameter === 'tx_power_5ghz');
          txPower = txChange?.newValue != null
            ? parseFloat(txChange.newValue)
            : (ap.tx_power_5ghz_dbm ?? 26);
        }

        // Get antenna gain from the AP model for the selected band
        const antennaGain = band === '2.4ghz'
          ? (ap.ap_model?.antenna_gain_24ghz_dbi ?? 3.2)
          : (ap.ap_model?.antenna_gain_5ghz_dbi ?? 4.3);

        return {
          id: ap.id,
          x: ap.x,
          y: ap.y,
          txPowerDbm: txPower,
          antennaGainDbi: antennaGain,
          enabled: true,
        };
      });
  });

  /**
   * Converts WallResponse[] into WallData[] for heatmap calculation.
   */
  let wallData = $derived.by(() => {
    return walls.map((wall): WallData => ({
      segments: wall.segments.map((seg) => ({
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
      })),
      attenuationDb: band === '2.4ghz'
        ? (wall.attenuation_override_24ghz ?? 3)
        : (wall.attenuation_override_5ghz ?? 5),
    }));
  });
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
    {onCanvas}
    {onStats}
  />
{/if}
