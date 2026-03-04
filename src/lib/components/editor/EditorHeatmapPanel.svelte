<!--
  EditorHeatmapPanel.svelte - Floating heatmap controls panel for the editor.

  Positioned at bottom-right corner of the editor canvas.
  Wraps HeatmapControls with editorHeatmapStore bindings.
-->
<script lang="ts">
  import HeatmapControls from './HeatmapControls.svelte';
  import { t } from '$lib/i18n';
  import { editorHeatmapStore, type HeatmapOverlayMode } from '$lib/stores/editorHeatmapStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { FrequencyBand, ColorScheme } from '$lib/heatmap';
  import { PATH_LOSS_EXPONENTS, DEFAULT_RECEIVER_GAIN_DBI } from '$lib/heatmap/rf-engine';

  interface EditorHeatmapPanelProps {
    visible?: boolean;
  }

  let { visible = true }: EditorHeatmapPanelProps = $props();

  let activeAps = $derived(
    (projectStore.activeFloor?.access_points ?? []).filter((ap) => ap.enabled),
  );

  let filteredApLabel = $derived.by(() => {
    if (!editorHeatmapStore.apFilter) return null;
    const ap = activeAps.find((a) => a.id === editorHeatmapStore.apFilter);
    return ap ? (ap.label || ap.id) : editorHeatmapStore.apFilter;
  });

  /** Whether the advanced parameters section is expanded */
  let advancedOpen = $state(false);

  /** Band-specific default PL exponent for display */
  let defaultN = $derived(PATH_LOSS_EXPONENTS[editorHeatmapStore.band] ?? 3.2);

  const OVERLAY_MODES: Array<{ value: HeatmapOverlayMode; labelKey: string }> = [
    { value: 'signal', labelKey: 'heatmap.modeSignal' },
    { value: 'ap-zones', labelKey: 'heatmap.modeApZones' },
    { value: 'delta', labelKey: 'heatmap.modeDelta' },
  ];
</script>

{#if visible}
  <div class="editor-heatmap-panel">
    <HeatmapControls
      band={editorHeatmapStore.band}
      colorScheme={editorHeatmapStore.colorScheme}
      opacity={editorHeatmapStore.opacity}
      visible={editorHeatmapStore.visible}
      stats={editorHeatmapStore.stats}
      apFilterLabel={filteredApLabel}
      onBandChange={(b: FrequencyBand) => editorHeatmapStore.setBand(b)}
      onColorSchemeChange={(cs: ColorScheme) => editorHeatmapStore.setColorScheme(cs)}
      onOpacityChange={(o: number) => editorHeatmapStore.setOpacity(o)}
      onVisibilityChange={(v: boolean) => editorHeatmapStore.setVisible(v)}
    />

    {#if editorHeatmapStore.visible && activeAps.length > 1}
      <div class="ap-filter">
        <span class="ap-filter-heading">{t('heatmap.apFilter')}</span>

        {#if filteredApLabel}
          <div class="ap-filter-banner">
            {t('heatmap.showingAp').replace('{ap}', filteredApLabel)}
          </div>
        {/if}

        <div class="ap-filter-buttons">
          <button
            class="ap-btn"
            class:active={!editorHeatmapStore.apFilter}
            onclick={() => editorHeatmapStore.setApFilter(null)}
          >
            {t('heatmap.allAps')}
          </button>
          {#each activeAps as ap (ap.id)}
            <button
              class="ap-btn"
              class:active={editorHeatmapStore.apFilter === ap.id}
              onclick={() => editorHeatmapStore.setApFilter(ap.id)}
            >
              {ap.label || ap.id}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Overlay mode toggle (Signal / AP Zones / Delta) -->
    {#if editorHeatmapStore.visible}
      <div class="overlay-mode">
        <span class="section-label">{t('heatmap.overlayMode')}</span>
        <div class="overlay-mode-buttons">
          {#each OVERLAY_MODES as mode (mode.value)}
            <button
              class="mode-btn"
              class:active={editorHeatmapStore.overlayMode === mode.value}
              onclick={() => editorHeatmapStore.setOverlayMode(mode.value)}
            >
              {t(mode.labelKey)}
            </button>
          {/each}
        </div>
      </div>

      <!-- Advanced model parameters (collapsible) -->
      <div class="advanced-section">
        <button class="advanced-toggle" onclick={() => { advancedOpen = !advancedOpen; }}>
          <span class="advanced-arrow">{advancedOpen ? '▾' : '▸'}</span>
          {t('heatmap.advanced')}
        </button>

        {#if advancedOpen}
          <div class="advanced-controls">
            <!-- Path Loss Exponent -->
            <label class="adv-row">
              <span class="adv-label">{t('heatmap.pathLossExponent')}</span>
              <input
                type="number"
                class="adv-input"
                min="2.0"
                max="5.0"
                step="0.1"
                value={editorHeatmapStore.calibratedN ?? defaultN}
                oninput={(e) => {
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (!isNaN(v)) editorHeatmapStore.setCalibratedN(v);
                }}
              />
            </label>

            <!-- Receiver Gain -->
            <label class="adv-row">
              <span class="adv-label">{t('heatmap.receiverGain')}</span>
              <input
                type="number"
                class="adv-input"
                min="-10"
                max="0"
                step="0.5"
                value={editorHeatmapStore.receiverGainDbi ?? DEFAULT_RECEIVER_GAIN_DBI}
                oninput={(e) => {
                  const v = parseFloat((e.target as HTMLInputElement).value);
                  if (!isNaN(v)) editorHeatmapStore.setReceiverGainDbi(v);
                }}
              />
            </label>

            <!-- Back Sector Penalty -->
            <label class="adv-row">
              <span class="adv-label">{t('heatmap.backSectorPenalty')}</span>
              <div class="slider-row">
                <input
                  type="range"
                  class="adv-slider"
                  min="-25"
                  max="0"
                  step="1"
                  value={editorHeatmapStore.backSectorPenalty}
                  oninput={(e) => {
                    editorHeatmapStore.setBackSectorPenalty(parseInt((e.target as HTMLInputElement).value, 10));
                  }}
                />
                <span class="slider-val">{editorHeatmapStore.backSectorPenalty} dB</span>
              </div>
            </label>

            <!-- Side Sector Penalty -->
            <label class="adv-row">
              <span class="adv-label">{t('heatmap.sideSectorPenalty')}</span>
              <div class="slider-row">
                <input
                  type="range"
                  class="adv-slider"
                  min="-15"
                  max="0"
                  step="1"
                  value={editorHeatmapStore.sideSectorPenalty}
                  oninput={(e) => {
                    editorHeatmapStore.setSideSectorPenalty(parseInt((e.target as HTMLInputElement).value, 10));
                  }}
                />
                <span class="slider-val">{editorHeatmapStore.sideSectorPenalty} dB</span>
              </div>
            </label>

            <button class="reset-btn" onclick={() => editorHeatmapStore.resetAdvanced()}>
              {t('heatmap.resetDefaults')}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .editor-heatmap-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 220px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .ap-filter {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .ap-filter-heading {
    display: block;
    font-size: 0.7rem;
    color: #808090;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .ap-filter-banner {
    font-size: 0.65rem;
    color: #c0c0d0;
    background: rgba(74, 108, 247, 0.1);
    border: 1px solid rgba(74, 108, 247, 0.2);
    border-radius: 4px;
    padding: 3px 6px;
    margin-bottom: 6px;
    font-weight: 500;
  }

  .ap-filter-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .ap-btn {
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    color: #a0a0b0;
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .ap-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: #c0c0d0;
  }

  .ap-btn.active {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.4);
    color: #e0e0f0;
    font-weight: 600;
  }

  /* ── Overlay mode toggle ──────────────────────────────────── */

  .overlay-mode {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .section-label {
    display: block;
    font-size: 0.7rem;
    color: #808090;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .overlay-mode-buttons {
    display: flex;
    gap: 4px;
  }

  .mode-btn {
    flex: 1;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    color: #a0a0b0;
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .mode-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: #c0c0d0;
  }

  .mode-btn.active {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.4);
    color: #e0e0f0;
    font-weight: 600;
  }

  /* ── Advanced section ─────────────────────────────────────── */

  .advanced-section {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .advanced-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: #808090;
    font-size: 0.7rem;
    cursor: pointer;
    padding: 2px 0;
    font-weight: 500;
  }

  .advanced-toggle:hover {
    color: #c0c0d0;
  }

  .advanced-arrow {
    font-size: 0.6rem;
    width: 10px;
  }

  .advanced-controls {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .adv-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .adv-label {
    font-size: 0.65rem;
    color: #808090;
    font-weight: 500;
  }

  .adv-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #e0e0f0;
    font-size: 0.7rem;
    padding: 4px 6px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .adv-input:focus {
    outline: none;
    border-color: rgba(74, 108, 247, 0.5);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .adv-slider {
    flex: 1;
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .adv-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4a6cf7;
    border: 2px solid #1a1a2e;
    cursor: pointer;
  }

  .adv-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4a6cf7;
    border: 2px solid #1a1a2e;
    cursor: pointer;
  }

  .slider-val {
    font-size: 0.65rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    min-width: 40px;
    text-align: right;
  }

  .reset-btn {
    align-self: flex-start;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #a0a0b0;
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #c0c0d0;
  }
</style>
