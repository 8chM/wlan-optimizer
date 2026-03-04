<!--
  MaterialPicker.svelte - Material selection panel for wall drawing.

  Features:
  - All materials always visible, grouped by category (light/medium/heavy)
  - Category headers are clickable (select quick-category material)
  - Each material shows name, thickness (cm), and attenuation (dB)
  - Selected material is highlighted
  - Fixed material display for door/window tools
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

  const CATEGORY_ORDER = ['light', 'medium', 'heavy'] as const;

  function categoryColor(cat: string): string {
    switch (cat) {
      case 'light': return '#4caf50';
      case 'medium': return '#ff9800';
      case 'heavy': return '#f44336';
      default: return '#808080';
    }
  }

  function categoryLabel(cat: string): string {
    switch (cat) {
      case 'light': return t('material.categoryLight');
      case 'medium': return t('material.categoryMedium');
      case 'heavy': return t('material.categoryHeavy');
      default: return cat;
    }
  }

  function quickCategoryForCategory(category: string): MaterialResponse | undefined {
    return materials.find((m) => m.is_quick_category && m.category === category);
  }

  function detailMaterialsForCategory(category: string): MaterialResponse[] {
    return materials.filter((m) => !m.is_quick_category && m.category === category);
  }

  function materialDisplayName(mat: MaterialResponse): string {
    return mat.name_en || mat.name_de;
  }

  function handleSelect(materialId: string): void {
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
    <div class="material-list">
      {#each CATEGORY_ORDER as cat (cat)}
        {@const qc = quickCategoryForCategory(cat)}
        {@const details = detailMaterialsForCategory(cat)}

        <!-- Category header (clickable -> selects quick-category) -->
        {#if qc}
          <button
            class="category-header"
            class:selected={selectedMaterialId === qc.id}
            style="--cat-color: {categoryColor(cat)}"
            onclick={() => handleSelect(qc.id)}
            title="{materialDisplayName(qc)} — {qc.default_thickness_cm} cm | {qc.attenuation_24ghz_db}/{qc.attenuation_5ghz_db}/{qc.attenuation_6ghz_db} dB"
          >
            <span class="cat-dot"></span>
            <span class="cat-label">{categoryLabel(cat)}</span>
            <span class="cat-specs">{qc.default_thickness_cm} cm | {qc.attenuation_24ghz_db}/{qc.attenuation_5ghz_db} dB</span>
          </button>
        {/if}

        <!-- Detail materials always visible -->
        {#each details as mat (mat.id)}
          <button
            class="detail-btn"
            class:selected={selectedMaterialId === mat.id}
            style="--cat-color: {categoryColor(cat)}"
            onclick={() => handleSelect(mat.id)}
            title="{materialDisplayName(mat)} — {mat.default_thickness_cm} cm | {mat.attenuation_24ghz_db}/{mat.attenuation_5ghz_db}/{mat.attenuation_6ghz_db} dB"
          >
            <span class="detail-dot"></span>
            <span class="detail-name">{materialDisplayName(mat)}</span>
            <span class="detail-specs">{mat.default_thickness_cm} cm | {mat.attenuation_24ghz_db}/{mat.attenuation_5ghz_db}</span>
          </button>
        {/each}
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

  .material-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 360px;
    overflow-y: auto;
  }

  /* Category header */
  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    cursor: pointer;
    color: #d0d0e0;
    font-size: 0.8rem;
    text-align: left;
    width: 100%;
    transition: all 0.15s ease;
    margin-top: 4px;
  }

  .category-header:first-child {
    margin-top: 0;
  }

  .category-header:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .category-header.selected {
    border-color: var(--cat-color);
    background: rgba(255, 255, 255, 0.12);
  }

  .cat-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat-color);
    flex-shrink: 0;
  }

  .cat-label {
    flex: 1;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
  }

  .cat-specs {
    font-size: 0.65rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
    white-space: nowrap;
  }

  /* Detail material button */
  .detail-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px 5px 20px;
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

  .detail-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cat-color);
    opacity: 0.6;
    flex-shrink: 0;
  }

  .detail-name {
    flex: 1;
    font-weight: 500;
  }

  .detail-specs {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.65rem;
    color: #6a6a8a;
    white-space: nowrap;
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
