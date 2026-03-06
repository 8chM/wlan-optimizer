<!--
  APCapabilitiesSection.svelte - Collapsible capabilities section for AP properties.

  Shows 9 toggle switches for AP permission flags.
  Collapsed by default.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { APCapabilities } from '$lib/recommendations/types';
  import { DEFAULT_AP_CAPABILITIES } from '$lib/recommendations/types';

  interface APCapabilitiesSectionProps {
    apId: string;
    capabilities?: APCapabilities | null;
    onCapabilitiesChange?: (apId: string, caps: APCapabilities) => void;
  }

  let {
    apId,
    capabilities = null,
    onCapabilitiesChange,
  }: APCapabilitiesSectionProps = $props();

  let expanded = $state(false);

  let caps = $derived<APCapabilities>(capabilities ?? { apId, ...DEFAULT_AP_CAPABILITIES });

  const TOGGLES: Array<{ key: keyof Omit<APCapabilities, 'apId'>; labelKey: string }> = [
    { key: 'canMove', labelKey: 'capabilities.canMove' },
    { key: 'canRotate', labelKey: 'capabilities.canRotate' },
    { key: 'canChangeMounting', labelKey: 'capabilities.canChangeMounting' },
    { key: 'canChangeTxPower24', labelKey: 'capabilities.canChangeTxPower24' },
    { key: 'canChangeTxPower5', labelKey: 'capabilities.canChangeTxPower5' },
    { key: 'canChangeTxPower6', labelKey: 'capabilities.canChangeTxPower6' },
    { key: 'canChangeChannel24', labelKey: 'capabilities.canChangeChannel24' },
    { key: 'canChangeChannel5', labelKey: 'capabilities.canChangeChannel5' },
    { key: 'canChangeChannel6', labelKey: 'capabilities.canChangeChannel6' },
  ];

  function handleToggle(key: keyof Omit<APCapabilities, 'apId'>): void {
    const updated: APCapabilities = { ...caps, [key]: !caps[key] };
    onCapabilitiesChange?.(apId, updated);
  }
</script>

<div class="capabilities-section">
  <button class="collapse-toggle" onclick={() => { expanded = !expanded; }}>
    <span class="toggle-arrow">{expanded ? '\u25BE' : '\u25B8'}</span>
    <span class="toggle-text">{t('capabilities.title')}</span>
  </button>

  {#if expanded}
    <div class="capabilities-list">
      {#each TOGGLES as toggle (toggle.key)}
        <div class="cap-row">
          <span class="cap-label">{t(toggle.labelKey)}</span>
          <label class="toggle-label">
            <input
              type="checkbox"
              class="toggle-input"
              checked={caps[toggle.key]}
              onchange={() => handleToggle(toggle.key)}
            />
            <span class="toggle-switch"></span>
          </label>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .capabilities-section { padding: 4px 0; }

  .collapse-toggle {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: #808090;
    font-size: 0.7rem; cursor: pointer; padding: 4px 0;
    width: 100%; text-align: left;
  }
  .collapse-toggle:hover { color: #c0c0d0; }
  .toggle-arrow { font-size: 0.6rem; }
  .toggle-text { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }

  .capabilities-list { padding: 4px 0; }

  .cap-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 3px 0; gap: 8px;
  }
  .cap-label { font-size: 0.7rem; color: #a0a0b0; }

  .toggle-label { position: relative; display: inline-block; cursor: pointer; }
  .toggle-input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-switch {
    display: block; width: 32px; height: 18px;
    background: rgba(255, 255, 255, 0.12); border-radius: 9px;
    transition: background 0.2s ease; position: relative;
  }
  .toggle-switch::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; background: #808090;
    border-radius: 50%; transition: transform 0.2s ease, background 0.2s ease;
  }
  .toggle-input:checked + .toggle-switch { background: rgba(74, 108, 247, 0.3); }
  .toggle-input:checked + .toggle-switch::after { transform: translateX(14px); background: #4a6cf7; }
</style>
