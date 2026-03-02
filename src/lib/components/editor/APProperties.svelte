<!--
  APProperties.svelte - Properties panel for a selected access point.

  Shows label, TX power sliders, enabled toggle, position,
  and delete with confirmation.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { AccessPointResponse } from '$lib/api/invoke';

  interface APPropertiesProps {
    /** The selected access point */
    accessPoint: AccessPointResponse;
    /** Callback when AP is updated */
    onUpdate?: (apId: string, updates: {
      label?: string;
      txPower24ghzDbm?: number;
      txPower5ghzDbm?: number;
      enabled?: boolean;
      height_m?: number;
      mounting?: string;
      channel_24ghz?: number;
      channel_5ghz?: number;
      channel_width?: string;
    }) => void;
    /** Callback when AP is deleted */
    onDelete?: (apId: string) => void;
  }

  let {
    accessPoint,
    onUpdate,
    onDelete,
  }: APPropertiesProps = $props();

  let confirmingDelete = $state(false);
  let labelValue = $state('');
  let txPower24 = $state(17);
  let txPower5 = $state(20);
  let enabled = $state(true);
  let mounting = $state('ceiling');
  let heightM = $state(2.5);
  let channel24 = $state(0);
  let channel5 = $state(0);
  let channelWidth = $state('20');

  // Sync state from props when a different AP is selected or when the AP object reference
  // changes with the same ID (e.g. after undo). We track a serialized version to detect changes.
  let lastSyncedApId = $state('');
  let lastSyncedVersion = $state('');
  $effect(() => {
    const version = `${accessPoint.id}-${accessPoint.label}-${accessPoint.tx_power_24ghz_dbm}-${accessPoint.tx_power_5ghz_dbm}-${accessPoint.enabled}-${accessPoint.mounting}-${accessPoint.height_m}-${accessPoint.channel_24ghz}-${accessPoint.channel_5ghz}-${accessPoint.channel_width}`;
    if (accessPoint.id !== lastSyncedApId || version !== lastSyncedVersion) {
      lastSyncedApId = accessPoint.id;
      lastSyncedVersion = version;
      labelValue = accessPoint.label ?? '';
      txPower24 = accessPoint.tx_power_24ghz_dbm ?? 17;
      txPower5 = accessPoint.tx_power_5ghz_dbm ?? 20;
      enabled = accessPoint.enabled;
      mounting = accessPoint.mounting ?? 'ceiling';
      heightM = accessPoint.height_m ?? 2.5;
      channel24 = accessPoint.channel_24ghz ?? 0;
      channel5 = accessPoint.channel_5ghz ?? 0;
      channelWidth = accessPoint.channel_width ?? '20';
    }
  });

  function handleLabelChange(): void {
    onUpdate?.(accessPoint.id, { label: labelValue });
  }

  function handleTxPower24Change(): void {
    onUpdate?.(accessPoint.id, { txPower24ghzDbm: txPower24 });
  }

  function handleTxPower5Change(): void {
    onUpdate?.(accessPoint.id, { txPower5ghzDbm: txPower5 });
  }

  function handleEnabledChange(): void {
    enabled = !enabled;
    onUpdate?.(accessPoint.id, { enabled });
  }

  function handleMountingChange(event: Event): void {
    mounting = (event.target as HTMLSelectElement).value;
    onUpdate?.(accessPoint.id, { mounting });
  }

  function handleHeightChange(): void {
    if (Number.isFinite(heightM) && heightM > 0) {
      onUpdate?.(accessPoint.id, { height_m: heightM });
    }
  }

  function handleChannel24Change(event: Event): void {
    channel24 = parseInt((event.target as HTMLSelectElement).value, 10);
    onUpdate?.(accessPoint.id, { channel_24ghz: channel24 || undefined });
  }

  function handleChannel5Change(event: Event): void {
    channel5 = parseInt((event.target as HTMLSelectElement).value, 10);
    onUpdate?.(accessPoint.id, { channel_5ghz: channel5 || undefined });
  }

  function handleChannelWidthChange(event: Event): void {
    channelWidth = (event.target as HTMLSelectElement).value;
    onUpdate?.(accessPoint.id, { channel_width: channelWidth });
  }

  const channels24 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const channels5 = [0, 36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 149, 153, 157, 161, 165];
  const channelWidths = ['20', '40', '80', '160'];

  function handleDeleteClick(): void {
    confirmingDelete = true;
  }

  function handleConfirmDelete(): void {
    onDelete?.(accessPoint.id);
    confirmingDelete = false;
  }

  function handleCancelDelete(): void {
    confirmingDelete = false;
  }
</script>

<div class="ap-properties">
  <h3 class="panel-title">{t('editor.properties')}</h3>

  <!-- Label -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('properties.label')}</span>
      <input
        type="text"
        class="prop-input text-input"
        bind:value={labelValue}
        onblur={handleLabelChange}
        placeholder="AP-1"
      />
    </div>
  </div>

  <!-- TX Power -->
  <div class="prop-section">
    <h4 class="section-title">{t('label.txPower')}</h4>

    <div class="slider-row">
      <label for="tx-power-24" class="prop-label">2.4 GHz</label>
      <div class="slider-group">
        <input
          id="tx-power-24"
          type="range"
          class="slider"
          min="1"
          max="23"
          step="1"
          bind:value={txPower24}
          onchange={handleTxPower24Change}
          aria-valuemin={1}
          aria-valuemax={23}
          aria-valuenow={txPower24}
        />
        <span class="slider-value">{txPower24} dBm</span>
      </div>
    </div>

    <div class="slider-row">
      <label for="tx-power-5" class="prop-label">5 GHz</label>
      <div class="slider-group">
        <input
          id="tx-power-5"
          type="range"
          class="slider"
          min="1"
          max="26"
          step="1"
          bind:value={txPower5}
          onchange={handleTxPower5Change}
          aria-valuemin={1}
          aria-valuemax={26}
          aria-valuenow={txPower5}
        />
        <span class="slider-value">{txPower5} dBm</span>
      </div>
    </div>
  </div>

  <!-- Mounting & Height -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('properties.mounting')}</span>
      <select class="prop-select" value={mounting} onchange={handleMountingChange}>
        <option value="ceiling">{t('properties.mountingCeiling')}</option>
        <option value="wall">{t('properties.mountingWall')}</option>
      </select>
    </div>

    <div class="prop-row">
      <span class="prop-label">{t('properties.height')}</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input"
          bind:value={heightM}
          onblur={handleHeightChange}
          min="0.5"
          max="10"
          step="0.1"
        />
        <span class="input-suffix">m</span>
      </div>
    </div>
  </div>

  <!-- Channels -->
  <div class="prop-section">
    <h4 class="section-title">{t('label.channel')}</h4>

    <div class="prop-row">
      <span class="prop-label">{t('properties.channel24')}</span>
      <select class="prop-select" value={String(channel24)} onchange={handleChannel24Change}>
        {#each channels24 as ch (ch)}
          <option value={String(ch)}>{ch === 0 ? 'Auto' : String(ch)}</option>
        {/each}
      </select>
    </div>

    <div class="prop-row">
      <span class="prop-label">{t('properties.channel5')}</span>
      <select class="prop-select" value={String(channel5)} onchange={handleChannel5Change}>
        {#each channels5 as ch (ch)}
          <option value={String(ch)}>{ch === 0 ? 'Auto' : String(ch)}</option>
        {/each}
      </select>
    </div>

    <div class="prop-row">
      <span class="prop-label">{t('properties.channelWidth')}</span>
      <select class="prop-select" value={channelWidth} onchange={handleChannelWidthChange}>
        {#each channelWidths as cw (cw)}
          <option value={cw}>{cw} MHz</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Enabled -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('properties.enabled')}</span>
      <label class="toggle-label">
        <input
          type="checkbox"
          class="toggle-input"
          checked={enabled}
          onchange={handleEnabledChange}
        />
        <span class="toggle-switch"></span>
      </label>
    </div>
  </div>

  <!-- Position (read-only) -->
  <div class="prop-section">
    <h4 class="section-title">{t('properties.position')}</h4>
    <div class="prop-row">
      <span class="prop-label">X</span>
      <span class="prop-value mono">{accessPoint.x.toFixed(2)} m</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">Y</span>
      <span class="prop-value mono">{accessPoint.y.toFixed(2)} m</span>
    </div>
  </div>

  <!-- Delete -->
  <div class="prop-section delete-section">
    {#if confirmingDelete}
      <div role="alertdialog" aria-label={t('properties.deleteConfirmAp')}>
        <p class="confirm-text">{t('properties.deleteConfirmAp')}</p>
        <div class="confirm-actions">
          <button class="btn-danger" onclick={handleConfirmDelete}>
            {t('action.confirm')}
          </button>
          <button class="btn-cancel" onclick={handleCancelDelete}>
            {t('project.cancel')}
          </button>
        </div>
      </div>
    {:else}
      <button class="btn-delete" onclick={handleDeleteClick}>
        {t('editor.deleteAp')}
      </button>
    {/if}
  </div>
</div>

<style>
  .ap-properties {
    padding: 4px 0;
  }

  .panel-title {
    margin: 0 0 12px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .prop-section {
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .prop-section:last-child {
    border-bottom: none;
  }

  .section-title {
    margin: 0 0 8px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prop-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    gap: 8px;
  }

  .prop-label {
    font-size: 0.75rem;
    color: #a0a0b0;
    flex-shrink: 0;
  }

  .prop-value {
    font-size: 0.75rem;
    color: #e0e0f0;
    text-align: right;
  }

  .prop-value.mono {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.7rem;
  }

  .prop-input {
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e0e0f0;
    font-size: 0.75rem;
  }

  .prop-input:focus {
    outline: none;
    border-color: rgba(74, 108, 247, 0.5);
  }

  .text-input {
    flex: 1;
    min-width: 0;
  }

  .prop-select {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e0e0f0;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .prop-select:hover {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .prop-select option {
    background: #1a1a2e;
    color: #e0e0f0;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .input-suffix {
    font-size: 0.65rem;
    color: #6a6a8a;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }

  .slider-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #4a6cf7;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid #1a1a2e;
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #4a6cf7;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid #1a1a2e;
  }

  .slider-value {
    font-size: 0.7rem;
    color: #e0e0f0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    min-width: 55px;
    text-align: right;
    flex-shrink: 0;
  }

  /* Toggle switch */
  .toggle-label {
    position: relative;
    display: inline-block;
    cursor: pointer;
  }

  .toggle-input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .toggle-switch {
    display: block;
    width: 36px;
    height: 20px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    transition: background 0.2s ease;
    position: relative;
  }

  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #808090;
    border-radius: 50%;
    transition: transform 0.2s ease, background 0.2s ease;
  }

  .toggle-input:checked + .toggle-switch {
    background: rgba(74, 108, 247, 0.3);
  }

  .toggle-input:checked + .toggle-switch::after {
    transform: translateX(16px);
    background: #4a6cf7;
  }

  .delete-section {
    padding-top: 12px;
  }

  .confirm-text {
    margin: 0 0 8px;
    font-size: 0.75rem;
    color: #f44336;
  }

  .confirm-actions {
    display: flex;
    gap: 6px;
  }

  .btn-delete {
    width: 100%;
    padding: 8px;
    background: rgba(244, 67, 54, 0.1);
    border: 1px solid rgba(244, 67, 54, 0.3);
    border-radius: 6px;
    color: #f44336;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-delete:hover {
    background: rgba(244, 67, 54, 0.2);
    border-color: rgba(244, 67, 54, 0.5);
  }

  .btn-danger {
    flex: 1;
    padding: 6px 12px;
    background: #f44336;
    border: none;
    border-radius: 4px;
    color: #ffffff;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-danger:hover {
    background: #d32f2f;
  }

  .btn-cancel {
    flex: 1;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #a0a0b0;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0f0;
  }
</style>
