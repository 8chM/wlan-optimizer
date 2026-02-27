<!--
  APLibraryPanel.svelte - Sidebar panel with available AP models.

  Shows predefined and user-defined AP models loaded from the backend.
  User can select an AP model to place on the canvas.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { listApModels } from '$lib/api/apModel';
  import type { ApModelResponse } from '$lib/api/invoke';

  interface APLibraryPanelProps {
    /** Callback when an AP model is selected for placement */
    onSelectModel?: (modelId: string) => void;
    /** Currently selected model ID */
    selectedModelId?: string | null;
  }

  let {
    onSelectModel,
    selectedModelId = null,
  }: APLibraryPanelProps = $props();

  let apModels = $state<ApModelResponse[]>([]);
  let loadingError = $state<string | null>(null);

  // Load AP models from backend on mount
  $effect(() => {
    let cancelled = false;

    listApModels()
      .then((result) => {
        if (!cancelled) {
          apModels = result;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          loadingError = message;
          console.error('[APLibraryPanel] Failed to load AP models:', message);
        }
      });

    return () => {
      cancelled = true;
    };
  });

  function handleSelect(modelId: string): void {
    onSelectModel?.(modelId);
  }
</script>

<div class="ap-library">
  <h3 class="panel-title">{t('ap.library')}</h3>
  <p class="panel-hint">{t('ap.dragOrClick')}</p>

  {#if loadingError}
    <p class="error-text">{loadingError}</p>
  {:else if apModels.length === 0}
    <p class="loading-text">{t('label.loading') ?? 'Loading...'}</p>
  {:else}
    <div class="model-list">
      {#each apModels as model (model.id)}
        <button
          class="model-card"
          class:selected={selectedModelId === model.id}
          onclick={() => handleSelect(model.id)}
        >
          <div class="model-icon">
            {#if model.is_user_defined}
              <span class="icon-custom">+</span>
            {:else}
              <span class="icon-ap">&#9673;</span>
            {/if}
          </div>
          <div class="model-info">
            <span class="model-name">{model.manufacturer} {model.model}</span>
            <span class="model-standard">{model.wifi_standard ?? '-'}</span>
            <div class="model-specs">
              <span>2.4G: {model.max_tx_power_24ghz_dbm ?? '-'}dBm / {model.antenna_gain_24ghz_dbi ?? '-'}dBi</span>
              <span>5G: {model.max_tx_power_5ghz_dbm ?? '-'}dBm / {model.antenna_gain_5ghz_dbi ?? '-'}dBi</span>
              {#if model.mimo_streams}
                <span>{model.mimo_streams}x{model.mimo_streams} MIMO</span>
              {/if}
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ap-library {
    padding: 4px 0;
  }

  .panel-title {
    margin: 0 0 4px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .panel-hint {
    margin: 0 0 8px;
    font-size: 0.7rem;
    color: #808090;
    line-height: 1.3;
  }

  .loading-text,
  .error-text {
    font-size: 0.75rem;
    color: #808090;
    padding: 8px 0;
  }

  .error-text {
    color: #f44336;
  }

  .model-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .model-card {
    display: flex;
    gap: 10px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    color: #c0c0d0;
    transition: all 0.15s ease;
    width: 100%;
  }

  .model-card:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .model-card.selected {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.4);
  }

  .model-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(74, 108, 247, 0.15);
    border-radius: 8px;
    flex-shrink: 0;
  }

  .icon-ap {
    font-size: 1.2rem;
    color: #4a6cf7;
  }

  .icon-custom {
    font-size: 1.4rem;
    color: #808090;
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .model-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: #e0e0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .model-standard {
    font-size: 0.7rem;
    color: #808090;
  }

  .model-specs {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 2px;
    font-size: 0.65rem;
    color: #6a6a8a;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
</style>
