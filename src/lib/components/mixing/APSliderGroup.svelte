<!--
  APSliderGroup.svelte - Parameter control group for a single access point.

  Features:
  - AP label + model info header
  - TX Power 2.4 GHz slider
  - TX Power 5 GHz slider
  - Channel 2.4 GHz dropdown
  - Channel 5 GHz dropdown
  - Channel Width dropdown
  - Reset button per AP
  - Visual diff: changed values highlighted in amber
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { AccessPointResponse } from '$lib/api/invoke';
  import type { APChange } from '$lib/stores/mixingStore.svelte';
  import {
    TX_POWER_RANGE_24GHZ,
    TX_POWER_RANGE_5GHZ,
    CHANNELS_24GHZ,
    CHANNELS_5GHZ,
    CHANNEL_WIDTHS,
  } from '$lib/stores/mixingStore.svelte';
  import MixingSlider from './MixingSlider.svelte';

  // ─── Props ─────────────────────────────────────────────────────

  interface APSliderGroupProps {
    /** Access point data */
    ap: AccessPointResponse;
    /** Current changes for this AP */
    changes: APChange[];
    /** Callback when a parameter changes */
    onChange?: (apId: string, parameter: string, oldValue: string | null, newValue: string | null) => void;
    /** Callback to reset all changes for this AP */
    onReset?: (apId: string) => void;
  }

  let {
    ap,
    changes,
    onChange,
    onReset,
  }: APSliderGroupProps = $props();

  // ─── Derived Values ──────────────────────────────────────────

  let hasChanges = $derived(changes.length > 0);

  /** Get the current effective value for a parameter (changed or original) */
  function getCurrentValue(parameter: string, defaultValue: number | null): number {
    const change = changes.find((c) => c.parameter === parameter);
    if (change?.newValue != null) {
      return parseFloat(change.newValue);
    }
    return defaultValue ?? 0;
  }

  function getOriginalValue(parameter: string, defaultValue: number | null): number {
    const change = changes.find((c) => c.parameter === parameter);
    if (change?.oldValue != null) {
      return parseFloat(change.oldValue);
    }
    return defaultValue ?? 0;
  }

  let txPower24 = $derived(getCurrentValue('tx_power_24ghz', ap.tx_power_24ghz_dbm ?? TX_POWER_RANGE_24GHZ.max));
  let txPower24Orig = $derived(ap.tx_power_24ghz_dbm ?? TX_POWER_RANGE_24GHZ.max);

  let txPower5 = $derived(getCurrentValue('tx_power_5ghz', ap.tx_power_5ghz_dbm ?? TX_POWER_RANGE_5GHZ.max));
  let txPower5Orig = $derived(ap.tx_power_5ghz_dbm ?? TX_POWER_RANGE_5GHZ.max);

  // For channel/width: use plan step's old_value as original when available, else sensible defaults
  let channel24 = $derived(getCurrentValue('channel_24ghz', 1));
  let channel24Orig = $derived(getOriginalValue('channel_24ghz', 1));

  let channel5 = $derived(getCurrentValue('channel_5ghz', 36));
  let channel5Orig = $derived(getOriginalValue('channel_5ghz', 36));

  let channelWidth = $derived(getCurrentValue('channel_width', 80));
  let channelWidthOrig = $derived(getOriginalValue('channel_width', 80));

  // Check if specific parameters are changed
  function isParamChanged(parameter: string): boolean {
    return changes.some((c) => c.parameter === parameter);
  }

  // ─── Handlers ─────────────────────────────────────────────────

  function handleSliderChange(parameter: string, originalValue: number, newValue: number): void {
    onChange?.(ap.id, parameter, String(originalValue), String(newValue));
  }

  function handleSelectChange(parameter: string, originalValue: number, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newValue = parseFloat(target.value);
    if (!isNaN(newValue)) {
      onChange?.(ap.id, parameter, String(originalValue), String(newValue));
    }
  }

  function handleReset(): void {
    onReset?.(ap.id);
  }
</script>

<div class="ap-group" class:has-changes={hasChanges}>
  <!-- AP Header -->
  <div class="ap-header">
    <div class="ap-info">
      <span class="ap-label">{ap.label ?? 'AP'}</span>
    </div>
    {#if hasChanges}
      <button class="reset-btn" onclick={handleReset} title={t('mixing.resetAp')}>
        {t('mixing.resetAp')}
      </button>
    {/if}
  </div>

  <!-- TX Power 2.4 GHz -->
  <MixingSlider
    label="{t('mixing.txPower')} 2.4 GHz"
    value={txPower24}
    originalValue={txPower24Orig}
    min={TX_POWER_RANGE_24GHZ.min}
    max={TX_POWER_RANGE_24GHZ.max}
    step={TX_POWER_RANGE_24GHZ.step}
    unit="dBm"
    onChange={(v) => handleSliderChange('tx_power_24ghz', txPower24Orig, v)}
  />

  <!-- TX Power 5 GHz -->
  <MixingSlider
    label="{t('mixing.txPower')} 5 GHz"
    value={txPower5}
    originalValue={txPower5Orig}
    min={TX_POWER_RANGE_5GHZ.min}
    max={TX_POWER_RANGE_5GHZ.max}
    step={TX_POWER_RANGE_5GHZ.step}
    unit="dBm"
    onChange={(v) => handleSliderChange('tx_power_5ghz', txPower5Orig, v)}
  />

  <!-- Channel 2.4 GHz -->
  <div class="select-group" class:changed={isParamChanged('channel_24ghz')}>
    <label class="select-label" for="ch24-{ap.id}">{t('mixing.channel')} 2.4 GHz</label>
    <select
      id="ch24-{ap.id}"
      class="select-input"
      value={channel24}
      onchange={(e) => handleSelectChange('channel_24ghz', channel24Orig, e)}
    >
      {#each CHANNELS_24GHZ as ch (ch)}
        <option value={ch}>{ch}</option>
      {/each}
    </select>
  </div>

  <!-- Channel 5 GHz -->
  <div class="select-group" class:changed={isParamChanged('channel_5ghz')}>
    <label class="select-label" for="ch5-{ap.id}">{t('mixing.channel')} 5 GHz</label>
    <select
      id="ch5-{ap.id}"
      class="select-input"
      value={channel5}
      onchange={(e) => handleSelectChange('channel_5ghz', channel5Orig, e)}
    >
      {#each CHANNELS_5GHZ as ch (ch)}
        <option value={ch}>{ch}</option>
      {/each}
    </select>
  </div>

  <!-- Channel Width -->
  <div class="select-group" class:changed={isParamChanged('channel_width')}>
    <label class="select-label" for="cw-{ap.id}">{t('mixing.channelWidth')}</label>
    <select
      id="cw-{ap.id}"
      class="select-input"
      value={channelWidth}
      onchange={(e) => handleSelectChange('channel_width', channelWidthOrig, e)}
    >
      {#each CHANNEL_WIDTHS as w (w)}
        <option value={w}>{w} MHz</option>
      {/each}
    </select>
  </div>
</div>

<style>
  .ap-group {
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    transition: border-color 0.15s ease;
  }

  .ap-group.has-changes {
    border-color: rgba(245, 158, 11, 0.3);
  }

  .ap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .ap-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .ap-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .reset-btn {
    padding: 2px 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #808090;
    font-size: 0.65rem;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .reset-btn:hover {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
    color: #fbbf24;
  }

  /* ─── Select Groups ──────────────────────────────────────────── */

  .select-group {
    padding: 4px 0;
  }

  .select-group.changed {
    border-left: 2px solid rgba(245, 158, 11, 0.6);
    padding-left: 6px;
    margin-left: -8px;
  }

  .select-label {
    display: block;
    font-size: 0.7rem;
    color: #808090;
    font-weight: 500;
    margin-bottom: 3px;
  }

  .select-input {
    width: 100%;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #c0c0d0;
    font-size: 0.7rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .select-input:hover {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .select-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .select-input option {
    background: #1a1a2e;
    color: #c0c0d0;
  }
</style>
