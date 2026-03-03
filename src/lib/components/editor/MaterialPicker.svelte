<!--
  MaterialPicker.svelte - Material selection panel for wall drawing.

  Features:
  - Quick-category buttons (Light/Medium/Heavy/Blocking) with color coding
  - Expandable detail materials under each category
  - Shows attenuation values (dB @ 2.4/5 GHz)
  - Selected material is applied when drawing walls
  - Loads materials from the backend on mount
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { listMaterials } from '$lib/api/material';
  import type { MaterialResponse } from '$lib/api/invoke';

  interface MaterialPickerProps {
    /** Currently selected material ID */
    selectedMaterialId?: string | null;
    /** Callback when material is selected */
    onSelect?: (materialId: string) => void;
    /** Active tool type - disables picker for door/window tools */
    activeTool?: string;
  }

  let {
    selectedMaterialId = null,
    onSelect,
    activeTool = 'wall',
  }: MaterialPickerProps = $props();

  /** Whether the picker is locked because the tool has a fixed material */
  let isFixedMaterial = $derived(activeTool === 'door' || activeTool === 'window');

  /** Display text for fixed material tools */
  let fixedMaterialLabel = $derived(
    activeTool === 'door' ? t('material.fixedDoor')
    : activeTool === 'window' ? t('material.fixedWindow')
    : ''
  );

  let expandedCategory = $state<string | null>(null);
  let materials = $state<MaterialResponse[]>([]);
  let loadingError = $state<string | null>(null);

  // Load materials from backend on mount
  $effect(() => {
    let cancelled = false;

    listMaterials(false)
      .then((result) => {
        if (!cancelled) {
          materials = result;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          loadingError = message;
          console.error('[MaterialPicker] Failed to load materials:', message);
        }
      });

    return () => {
      cancelled = true;
    };
  });

  let quickCategories = $derived(materials.filter((m) => m.is_quick_category));

  function categoryColor(cat: string): string {
    switch (cat) {
      case 'light': return '#4caf50';
      case 'medium': return '#ff9800';
      case 'heavy': return '#f44336';
      case 'blocking': return '#1a1a2e';
      default: return '#808080';
    }
  }

  function detailMaterialsForCategory(category: string): MaterialResponse[] {
    return materials.filter((m) => !m.is_quick_category && m.category === category);
  }

  function materialDisplayName(mat: MaterialResponse): string {
    // Use locale-appropriate name; fallback to English
    return mat.name_en || mat.name_de;
  }

  function handleQuickSelect(materialId: string, category: string): void {
    onSelect?.(materialId);
    // Toggle expansion of this category
    expandedCategory = expandedCategory === category ? null : category;
  }

  function handleDetailSelect(materialId: string): void {
    onSelect?.(materialId);
  }
</script>

<div class="material-picker">
  <h3 class="panel-title">{t('label.material')}</h3>

  {#if isFixedMaterial}
    <!-- Fixed material info for door/window tools -->
    <div class="fixed-material-info">
      <span class="fixed-dot" style="background: {activeTool === 'door' ? '#8B6914' : '#64B5F6'}"></span>
      <span class="fixed-label">{fixedMaterialLabel}</span>
    </div>
  {:else if loadingError}
    <p class="error-text">{loadingError}</p>
  {:else if materials.length === 0}
    <p class="loading-text">{t('label.loading') ?? 'Loading...'}</p>
  {:else}
    <!-- Quick category buttons -->
    <div class="quick-categories">
      {#each quickCategories as mat (mat.id)}
        <button
          class="quick-btn"
          class:selected={selectedMaterialId === mat.id}
          style="--cat-color: {categoryColor(mat.category)}"
          onclick={() => handleQuickSelect(mat.id, mat.category)}
          title="{materialDisplayName(mat)}: {mat.attenuation_24ghz_db}/{mat.attenuation_5ghz_db} dB"
        >
          <span class="quick-dot"></span>
          <span class="quick-label">{materialDisplayName(mat)}</span>
          <span class="quick-db">{mat.attenuation_24ghz_db}/{mat.attenuation_5ghz_db}</span>
        </button>

        <!-- Expanded detail materials -->
        {#if expandedCategory === mat.category}
          <div class="detail-materials">
            {#each detailMaterialsForCategory(mat.category) as detail (detail.id)}
              <button
                class="detail-btn"
                class:selected={selectedMaterialId === detail.id}
                onclick={() => handleDetailSelect(detail.id)}
              >
                <span class="detail-name">{materialDisplayName(detail)}</span>
                <span class="detail-specs">
                  {detail.attenuation_24ghz_db}/{detail.attenuation_5ghz_db} dB
                  {#if detail.default_thickness_cm}
                    | {detail.default_thickness_cm}cm
                  {/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Attenuation legend -->
  <div class="legend">
    <span class="legend-label">{t('material.attenuation')}:</span>
    <span class="legend-value">2.4 / 5 GHz (dB)</span>
  </div>
</div>

<style>
  .material-picker {
    padding: 4px 0;
  }

  .panel-title {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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

  .quick-categories {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .quick-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    cursor: pointer;
    color: #c0c0d0;
    font-size: 0.8rem;
    text-align: left;
    width: 100%;
    transition: all 0.15s ease;
  }

  .quick-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .quick-btn.selected {
    border-color: var(--cat-color);
    background: rgba(255, 255, 255, 0.1);
  }

  .quick-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat-color);
    flex-shrink: 0;
  }

  .quick-label {
    flex: 1;
    font-weight: 500;
  }

  .quick-db {
    font-size: 0.7rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .detail-materials {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0 4px 18px;
    margin-bottom: 2px;
  }

  .detail-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    color: #a0a0b0;
    font-size: 0.75rem;
    text-align: left;
    width: 100%;
    transition: all 0.15s ease;
  }

  .detail-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #c0c0d0;
  }

  .detail-btn.selected {
    background: rgba(74, 108, 247, 0.12);
    border-color: rgba(74, 108, 247, 0.3);
    color: #e0e0f0;
  }

  .detail-name {
    font-weight: 500;
  }

  .detail-specs {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.65rem;
    color: #6a6a8a;
  }

  .legend {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.65rem;
    color: #6a6a8a;
    display: flex;
    gap: 4px;
  }

  .legend-label {
    font-weight: 500;
  }

  .fixed-material-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: #c0c0d0;
    font-size: 0.8rem;
  }

  .fixed-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .fixed-label {
    font-weight: 500;
  }
</style>
