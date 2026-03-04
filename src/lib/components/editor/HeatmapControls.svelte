<!--
  HeatmapControls.svelte - Controls for heatmap visualization.

  Features:
  - Band toggle: 2.4 GHz / 5 GHz radio buttons
  - Color scheme selector: Viridis / Jet / Inferno
  - Opacity slider (0-100%)
  - Visibility toggle
  - Stats display: min/max/avg RSSI, calc time
  - Signal legend (embedded)

  Styling: Dark theme matching the sidebar (MaterialPicker reference).
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { FrequencyBand, ColorScheme } from '$lib/heatmap/color-schemes';
  import SignalLegend from './SignalLegend.svelte';

  // ─── Props ─────────────────────────────────────────────────────

  interface HeatmapControlsProps {
    /** Active frequency band */
    band: FrequencyBand;
    /** Active color scheme */
    colorScheme: ColorScheme;
    /** Heatmap opacity (0-1) */
    opacity: number;
    /** Whether the heatmap is visible */
    visible: boolean;
    /** Calculation statistics (null if no calculation has run yet) */
    stats?: {
      minRSSI: number;
      maxRSSI: number;
      avgRSSI: number;
      calculationTimeMs: number;
    } | null;
    /** Label of the currently filtered AP (null = all APs) */
    apFilterLabel?: string | null;
    /** Callback when frequency band changes */
    onBandChange?: (band: FrequencyBand) => void;
    /** Callback when color scheme changes */
    onColorSchemeChange?: (scheme: ColorScheme) => void;
    /** Callback when opacity changes */
    onOpacityChange?: (opacity: number) => void;
    /** Callback when visibility changes */
    onVisibilityChange?: (visible: boolean) => void;
  }

  let {
    band,
    colorScheme,
    opacity,
    visible,
    stats = null,
    apFilterLabel = null,
    onBandChange,
    onColorSchemeChange,
    onOpacityChange,
    onVisibilityChange,
  }: HeatmapControlsProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  /** Opacity as a percentage for the slider display (0-100) */
  let opacityPercent = $derived(Math.round(opacity * 100));

  // ─── Constants ─────────────────────────────────────────────────

  /** Available frequency bands */
  const BANDS: Array<{ value: FrequencyBand; label: string }> = [
    { value: '2.4ghz', label: '2.4 GHz' },
    { value: '5ghz', label: '5 GHz' },
  ];

  /** Available color schemes with preview colors (start -> mid -> end) */
  const COLOR_SCHEMES: Array<{
    value: ColorScheme;
    label: string;
    colors: [string, string, string];
  }> = [
    { value: 'viridis', label: 'Viridis', colors: ['#440154', '#21918c', '#fde725'] },
    { value: 'jet', label: 'Jet', colors: ['#0000ff', '#00ff00', '#ff0000'] },
    { value: 'inferno', label: 'Inferno', colors: ['#000004', '#d44842', '#fcffa4'] },
  ];

  // ─── Handlers ─────────────────────────────────────────────────

  function handleBandChange(newBand: FrequencyBand): void {
    onBandChange?.(newBand);
  }

  function handleColorSchemeChange(scheme: ColorScheme): void {
    onColorSchemeChange?.(scheme);
  }

  function handleOpacityInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const percent = parseInt(target.value, 10);
    if (!isNaN(percent)) {
      onOpacityChange?.(percent / 100);
    }
  }

  function handleVisibilityToggle(): void {
    onVisibilityChange?.(!visible);
  }
</script>

<div class="heatmap-controls">
  <!-- Panel title with visibility toggle -->
  <div class="panel-header">
    <h3 class="panel-title">{t('heatmap.title')}</h3>
    <label class="visibility-toggle">
      <input
        type="checkbox"
        checked={visible}
        onchange={handleVisibilityToggle}
      />
      <span class="toggle-label">{t('heatmap.visible')}</span>
    </label>
  </div>

  <!-- Frequency band radio buttons -->
  <div class="control-group">
    <span class="group-label">{t('heatmap.band')}</span>
    <div class="band-buttons">
      {#each BANDS as bandOption (bandOption.value)}
        <button
          class="band-btn"
          class:active={band === bandOption.value}
          onclick={() => handleBandChange(bandOption.value)}
        >
          {bandOption.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Color scheme selector -->
  <div class="control-group">
    <span class="group-label">{t('heatmap.colorScheme')}</span>
    <div class="scheme-buttons">
      {#each COLOR_SCHEMES as scheme (scheme.value)}
        <button
          class="scheme-btn"
          class:active={colorScheme === scheme.value}
          onclick={() => handleColorSchemeChange(scheme.value)}
          title={scheme.label}
        >
          <span
            class="scheme-preview"
            style="background: linear-gradient(to right, {scheme.colors[0]}, {scheme.colors[1]}, {scheme.colors[2]})"
          ></span>
          <span class="scheme-label">{scheme.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Opacity slider -->
  <div class="control-group">
    <div class="slider-header">
      <span class="group-label">{t('heatmap.opacity')}</span>
      <span class="slider-value">{opacityPercent}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      value={opacityPercent}
      oninput={handleOpacityInput}
      class="opacity-slider"
    />
  </div>

  <!-- Stats section -->
  {#if stats}
    <div class="stats-section">
      <span class="group-label">{t('heatmap.stats')}</span>
      {#if apFilterLabel}
        <div class="single-ap-indicator">
          {t('heatmap.singleAp')}: {apFilterLabel}
        </div>
      {/if}
      <div class="stats-grid">
        <span class="stat-label">{t('heatmap.minRSSI')}</span>
        <span class="stat-value">{stats.minRSSI.toFixed(0)} dBm</span>
        <span class="stat-label">{t('heatmap.maxRSSI')}</span>
        <span class="stat-value">{stats.maxRSSI.toFixed(0)} dBm</span>
        <span class="stat-label">{t('heatmap.avgRSSI')}</span>
        <span class="stat-value">{stats.avgRSSI.toFixed(0)} dBm</span>
        <span class="stat-label">{t('heatmap.calcTime')}</span>
        <span class="stat-value">{stats.calculationTimeMs.toFixed(0)} ms</span>
      </div>
    </div>
  {/if}

  <!-- Signal legend (embedded at bottom) -->
  <div class="legend-section">
    <SignalLegend {colorScheme} />
  </div>
</div>

<style>
  .heatmap-controls {
    padding: 4px 0;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .panel-title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .visibility-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 0.7rem;
    color: #808090;
  }

  .visibility-toggle input[type='checkbox'] {
    accent-color: #4a6cf7;
    cursor: pointer;
    width: 14px;
    height: 14px;
  }

  .toggle-label {
    white-space: nowrap;
  }

  .control-group {
    margin-bottom: 10px;
  }

  .group-label {
    display: block;
    font-size: 0.7rem;
    color: #808090;
    margin-bottom: 4px;
    font-weight: 500;
  }

  /* ─── Band Buttons ──────────────────────────────────────────── */

  .band-buttons {
    display: flex;
    gap: 4px;
  }

  .band-btn {
    flex: 1;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    color: #a0a0b0;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .band-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: #c0c0d0;
  }

  .band-btn.active {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.4);
    color: #e0e0f0;
    font-weight: 600;
  }

  /* ─── Color Scheme Buttons ──────────────────────────────────── */

  .scheme-buttons {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .scheme-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    color: #a0a0b0;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
  }

  .scheme-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: #c0c0d0;
  }

  .scheme-btn.active {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.4);
    color: #e0e0f0;
  }

  .scheme-preview {
    display: inline-block;
    width: 40px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .scheme-label {
    font-weight: 500;
  }

  /* ─── Opacity Slider ────────────────────────────────────────── */

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .slider-value {
    font-size: 0.7rem;
    color: #e0e0f0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-weight: 600;
  }

  .opacity-slider {
    width: 100%;
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4a6cf7;
    border: 2px solid #1a1a2e;
    cursor: pointer;
  }

  .opacity-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4a6cf7;
    border: 2px solid #1a1a2e;
    cursor: pointer;
  }

  /* ─── Stats Section ─────────────────────────────────────────── */

  .stats-section {
    margin-bottom: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .single-ap-indicator {
    font-size: 0.65rem;
    color: #c0c0d0;
    background: rgba(74, 108, 247, 0.1);
    border-radius: 3px;
    padding: 2px 6px;
    margin-top: 4px;
    margin-bottom: 2px;
    font-weight: 500;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    margin-top: 4px;
  }

  .stat-label {
    font-size: 0.7rem;
    color: #808090;
  }

  .stat-value {
    font-size: 0.7rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    text-align: right;
  }

  /* ─── Legend Section ─────────────────────────────────────────── */

  .legend-section {
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
</style>
