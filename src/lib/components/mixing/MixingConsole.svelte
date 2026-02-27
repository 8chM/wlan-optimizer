<!--
  MixingConsole.svelte - Main container for AP parameter mixing.

  Features:
  - "Generate Plan" button at top
  - List of APSliderGroup components (one per AP)
  - Global "Reset All" button
  - "Apply Changes" button
  - Error display
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { AccessPointResponse } from '$lib/api/invoke';
  import type { APChange } from '$lib/stores/mixingStore.svelte';
  import APSliderGroup from './APSliderGroup.svelte';

  // ─── Props ─────────────────────────────────────────────────────

  interface MixingConsoleProps {
    /** Access points to display sliders for */
    accessPoints: AccessPointResponse[];
    /** All current AP changes (from mixingStore) */
    changes: APChange[];
    /** Whether an optimization plan is being generated */
    isGenerating?: boolean;
    /** Whether changes exist */
    hasChanges?: boolean;
    /** Error message to display */
    error?: string | null;
    /** Callback to generate an optimization plan */
    onGeneratePlan?: () => void;
    /** Callback when a parameter changes */
    onChange?: (apId: string, parameter: string, oldValue: string | null, newValue: string | null) => void;
    /** Callback to reset all changes for a specific AP */
    onResetAp?: (apId: string) => void;
    /** Callback to reset all changes globally */
    onResetAll?: () => void;
    /** Callback to apply all changes */
    onApplyChanges?: () => void;
  }

  let {
    accessPoints,
    changes,
    isGenerating = false,
    hasChanges = false,
    error = null,
    onGeneratePlan,
    onChange,
    onResetAp,
    onResetAll,
    onApplyChanges,
  }: MixingConsoleProps = $props();

  // ─── Helpers ──────────────────────────────────────────────────

  /** Get changes for a specific AP */
  function changesForAp(apId: string): APChange[] {
    return changes.filter((c) => c.apId === apId);
  }
</script>

<div class="mixing-console">
  <!-- Title -->
  <h3 class="console-title">{t('mixing.title')}</h3>

  <!-- Error display -->
  {#if error}
    <div class="error-banner">
      <span class="error-text">{error}</span>
    </div>
  {/if}

  <!-- Generate Plan button -->
  <button
    class="generate-btn"
    onclick={onGeneratePlan}
    disabled={isGenerating || accessPoints.length === 0}
  >
    {#if isGenerating}
      <span class="spinner"></span>
      {t('mixing.generating')}
    {:else}
      {t('mixing.generatePlan')}
    {/if}
  </button>

  <div class="section-divider"></div>

  <!-- AP List or Empty State -->
  {#if accessPoints.length === 0}
    <p class="empty-text">{t('mixing.noAps')}</p>
  {:else}
    <div class="ap-list">
      {#each accessPoints as ap (ap.id)}
        <APSliderGroup
          {ap}
          changes={changesForAp(ap.id)}
          {onChange}
          onReset={onResetAp}
        />
      {/each}
    </div>
  {/if}

  <!-- Bottom actions -->
  {#if hasChanges}
    <div class="section-divider"></div>
    <div class="bottom-actions">
      <button class="reset-all-btn" onclick={onResetAll}>
        {t('mixing.resetAll')}
      </button>
      <button class="apply-btn" onclick={onApplyChanges}>
        {t('mixing.applyChanges')}
      </button>
    </div>
  {/if}
</div>

<style>
  .mixing-console {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 4px 0;
  }

  .console-title {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .error-banner {
    padding: 6px 10px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 5px;
    margin-bottom: 8px;
  }

  .error-text {
    font-size: 0.7rem;
    color: #f87171;
  }

  .section-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 10px 0;
  }

  .empty-text {
    margin: 0;
    font-size: 0.75rem;
    color: #808090;
    text-align: center;
    padding: 12px 0;
    font-style: italic;
  }

  /* ─── Generate Button ────────────────────────────────────────── */

  .generate-btn {
    width: 100%;
    padding: 10px 12px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 6px;
    color: #c7d2fe;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .generate-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.3);
    border-color: rgba(99, 102, 241, 0.6);
    color: #e0e7ff;
  }

  .generate-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(199, 210, 254, 0.3);
    border-top-color: #c7d2fe;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── AP List ────────────────────────────────────────────────── */

  .ap-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 300px);
    overflow-y: auto;
  }

  .ap-list::-webkit-scrollbar {
    width: 4px;
  }

  .ap-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .ap-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  /* ─── Bottom Actions ─────────────────────────────────────────── */

  .bottom-actions {
    display: flex;
    gap: 6px;
  }

  .reset-all-btn {
    flex: 1;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    color: #a0a0b0;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .reset-all-btn:hover {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
    color: #fbbf24;
  }

  .apply-btn {
    flex: 1;
    padding: 8px 10px;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 5px;
    color: #86efac;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .apply-btn:hover {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.5);
    color: #bbf7d0;
  }
</style>
