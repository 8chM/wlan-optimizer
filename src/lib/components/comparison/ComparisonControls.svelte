<!--
  ComparisonControls.svelte - Mode selection and opacity slider for heatmap comparison.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ComparisonMode } from '$lib/stores/comparisonStore.svelte';

  interface ComparisonControlsProps {
    mode: ComparisonMode;
    overlayOpacity: number;
    beforeLabel?: string;
    afterLabel?: string;
    onModeChange?: (mode: ComparisonMode) => void;
    onOpacityChange?: (opacity: number) => void;
    onClose?: () => void;
  }

  let {
    mode,
    overlayOpacity,
    beforeLabel = '',
    afterLabel = '',
    onModeChange,
    onOpacityChange,
    onClose,
  }: ComparisonControlsProps = $props();

  const modes: { value: ComparisonMode; labelKey: string }[] = [
    { value: 'side-by-side', labelKey: 'comparison.sideBySide' },
    { value: 'overlay', labelKey: 'comparison.overlay' },
    { value: 'difference', labelKey: 'comparison.difference' },
  ];
</script>

<div class="comparison-controls">
  <div class="controls-header">
    <h4 class="controls-title">{t('comparison.title')}</h4>
    {#if onClose}
      <button class="close-btn" onclick={onClose}>&times;</button>
    {/if}
  </div>

  <!-- Labels -->
  {#if beforeLabel || afterLabel}
    <div class="labels-row">
      <span class="label-before">{beforeLabel || t('comparison.before')}</span>
      <span class="label-vs">vs</span>
      <span class="label-after">{afterLabel || t('comparison.after')}</span>
    </div>
  {/if}

  <!-- Mode buttons -->
  <div class="mode-buttons">
    {#each modes as m (m.value)}
      <button
        class="mode-btn"
        class:active={mode === m.value}
        onclick={() => onModeChange?.(m.value)}
      >
        {t(m.labelKey)}
      </button>
    {/each}
  </div>

  <!-- Overlay opacity slider (only in overlay mode) -->
  {#if mode === 'overlay'}
    <div class="opacity-slider">
      <label>
        <span class="slider-label">{t('comparison.before')}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={overlayOpacity}
          oninput={(e) => onOpacityChange?.(Number((e.target as HTMLInputElement).value))}
        />
        <span class="slider-label">{t('comparison.after')}</span>
      </label>
    </div>
  {/if}
</div>

<style>
  .comparison-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .controls-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .controls-title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .close-btn {
    background: none;
    border: none;
    color: #808090;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0f0;
  }

  .labels-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
  }

  .label-before {
    color: #60a5fa;
    font-weight: 500;
  }

  .label-vs {
    color: #606070;
  }

  .label-after {
    color: #a78bfa;
    font-weight: 500;
  }

  .mode-buttons {
    display: flex;
    gap: 4px;
  }

  .mode-btn {
    flex: 1;
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #808090;
    font-size: 0.65rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #c0c0d0;
  }

  .mode-btn.active {
    background: rgba(99, 102, 241, 0.2);
    border-color: rgba(99, 102, 241, 0.4);
    color: #a5b4fc;
  }

  .opacity-slider {
    padding: 4px 0;
  }

  .opacity-slider label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .slider-label {
    font-size: 0.6rem;
    color: #808090;
    white-space: nowrap;
  }

  .opacity-slider input[type='range'] {
    flex: 1;
    height: 4px;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .opacity-slider input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6366f1;
    cursor: pointer;
  }
</style>
