<!--
  ManualEntryForm.svelte - Manual RSSI/Noise entry for passive measurements.

  Allows users to manually enter signal strength and noise floor values
  when iPerf-based measurement is not available or desired.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { measurementStore } from '$lib/stores/measurementStore.svelte';

  // ─── Props ──────────────────────────────────────────────────────

  interface ManualEntryFormProps {
    pointId: string;
    runId: string;
    onSave?: (measId: string) => void;
  }

  let { pointId, runId, onSave }: ManualEntryFormProps = $props();

  // ─── Local State ──────────────────────────────────────────────

  let band = $state<string>('5ghz');
  let rssi = $state<number>(-65);
  let noise = $state<number | undefined>(undefined);
  let isSaving = $state(false);

  // ─── Derived ──────────────────────────────────────────────────

  let snr = $derived(
    rssi !== undefined && noise !== undefined ? rssi - noise : null,
  );
  let isValid = $derived(rssi >= -100 && rssi <= -10);

  // ─── Handlers ─────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    if (!isValid || isSaving) return;
    isSaving = true;
    try {
      const measId = await measurementStore.saveManualMeasurement(
        pointId,
        runId,
        band,
        rssi,
        noise,
      );
      if (measId) {
        onSave?.(measId);
      }
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="manual-entry">
  <div class="form-header">
    <span class="form-title">{t('measurement.manualEntry')}</span>
    <span class="form-hint">{t('measurement.manualEntryHint')}</span>
  </div>

  <div class="form-fields">
    <!-- Band Select -->
    <label class="field">
      <span class="field-label">{t('measurement.band')}</span>
      <select bind:value={band} class="field-input">
        <option value="2.4ghz">2.4 GHz</option>
        <option value="5ghz">5 GHz</option>
        <option value="6ghz">6 GHz</option>
      </select>
    </label>

    <!-- RSSI -->
    <label class="field">
      <span class="field-label">{t('measurement.rssiLabel')}</span>
      <div class="input-row">
        <input
          type="number"
          bind:value={rssi}
          min="-100"
          max="-10"
          step="1"
          class="field-input"
          class:invalid={!isValid}
        />
        <span class="unit">dBm</span>
      </div>
    </label>

    <!-- Noise -->
    <label class="field">
      <span class="field-label">{t('measurement.noiseLabel')}</span>
      <div class="input-row">
        <input
          type="number"
          bind:value={noise}
          min="-120"
          max="-30"
          step="1"
          class="field-input"
          placeholder="{t('measurement.optional')}"
        />
        <span class="unit">dBm</span>
      </div>
    </label>

    <!-- SNR (calculated, read-only) -->
    {#if snr !== null}
      <div class="field snr-field">
        <span class="field-label">{t('measurement.snrLabel')}</span>
        <span class="snr-value">{snr} dB</span>
      </div>
    {/if}
  </div>

  <button
    class="save-btn"
    onclick={handleSave}
    disabled={!isValid || isSaving}
  >
    {isSaving ? '...' : t('measurement.saveManual')}
  </button>
</div>

<style>
  .manual-entry {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
  }

  .form-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .form-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #c0c0d0;
  }

  .form-hint {
    font-size: 0.65rem;
    color: #808090;
    font-style: italic;
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: 0.65rem;
    color: #808090;
    font-weight: 500;
  }

  .field-input {
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #c0c0d0;
    font-size: 0.75rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .field-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .field-input.invalid {
    border-color: rgba(239, 68, 68, 0.5);
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .input-row .field-input {
    flex: 1;
    min-width: 0;
  }

  .unit {
    font-size: 0.65rem;
    color: #808090;
    white-space: nowrap;
  }

  .snr-field {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    background: rgba(34, 197, 94, 0.06);
    border-radius: 4px;
  }

  .snr-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: #86efac;
  }

  .save-btn {
    width: 100%;
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 5px;
    color: #86efac;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .save-btn:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.5);
  }

  .save-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
