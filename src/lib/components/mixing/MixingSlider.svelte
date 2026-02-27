<!--
  MixingSlider.svelte - Individual slider component for AP parameter adjustment.

  Features:
  - Label + current value display
  - Range input with configurable min/max/step
  - Original value indicator
  - Changed state visual (amber border when modified)
-->
<script lang="ts">
  // ─── Props ─────────────────────────────────────────────────────

  interface MixingSliderProps {
    /** Display label for the parameter */
    label: string;
    /** Current value */
    value: number;
    /** Original (before change) value */
    originalValue: number;
    /** Minimum value */
    min: number;
    /** Maximum value */
    max: number;
    /** Step increment */
    step?: number;
    /** Unit suffix (e.g., "dBm", "MHz") */
    unit?: string;
    /** Whether the slider is disabled */
    disabled?: boolean;
    /** Callback when value changes */
    onChange?: (value: number) => void;
  }

  let {
    label,
    value,
    originalValue,
    min,
    max,
    step = 1,
    unit = '',
    disabled = false,
    onChange,
  }: MixingSliderProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  let isChanged = $derived(value !== originalValue);

  // ─── Handlers ─────────────────────────────────────────────────

  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    if (!isNaN(newValue)) {
      onChange?.(newValue);
    }
  }
</script>

<div class="mixing-slider" class:changed={isChanged}>
  <div class="slider-header">
    <span class="slider-label">{label}</span>
    <span class="slider-value" class:changed={isChanged}>
      {value}{unit ? ` ${unit}` : ''}
    </span>
  </div>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    {disabled}
    oninput={handleInput}
    class="slider-input"
  />
  {#if isChanged}
    <div class="original-value">
      <span class="original-label">was</span>
      <span class="original-num">{originalValue}{unit ? ` ${unit}` : ''}</span>
    </div>
  {/if}
</div>

<style>
  .mixing-slider {
    padding: 4px 0;
  }

  .mixing-slider.changed {
    border-left: 2px solid rgba(245, 158, 11, 0.6);
    padding-left: 6px;
    margin-left: -8px;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }

  .slider-label {
    font-size: 0.7rem;
    color: #808090;
    font-weight: 500;
  }

  .slider-value {
    font-size: 0.7rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-weight: 600;
  }

  .slider-value.changed {
    color: #fbbf24;
  }

  .slider-input {
    width: 100%;
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .slider-input:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6366f1;
    border: 2px solid #1a1a2e;
    cursor: pointer;
  }

  .slider-input::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #6366f1;
    border: 2px solid #1a1a2e;
    cursor: pointer;
  }

  .original-value {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 2px;
  }

  .original-label {
    font-size: 0.6rem;
    color: #606070;
    font-style: italic;
  }

  .original-num {
    font-size: 0.6rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
    text-decoration: line-through;
  }
</style>
