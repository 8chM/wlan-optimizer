<!--
  OptimierungTabs.svelte - Two-tab switcher for Empfehlungen / Manuell.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { optimierungStore, type OptimierungTab } from '$lib/stores/optimierungStore.svelte';

  const TABS: Array<{ value: OptimierungTab; labelKey: string }> = [
    { value: 'empfehlungen', labelKey: 'opt.tabRecommendations' },
    { value: 'manuell', labelKey: 'opt.tabManual' },
  ];
</script>

<div class="tabs">
  {#each TABS as tab (tab.value)}
    <button
      class="tab-btn"
      class:active={optimierungStore.activeTab === tab.value}
      onclick={() => optimierungStore.setTab(tab.value)}
    >
      {t(tab.labelKey)}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 8px;
  }

  .tab-btn {
    flex: 1;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #808090;
    font-size: 0.8rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: #c0c0d0;
    background: rgba(255, 255, 255, 0.03);
  }

  .tab-btn.active {
    color: #a5b4fc;
    border-bottom-color: #6366f1;
  }
</style>
