<!--
  MultiWallProperties.svelte - Bulk editing panel for multiple selected walls.

  Shows shared material, total length, and allows applying material to all.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { WallResponse, MaterialResponse } from '$lib/api/invoke';

  interface MultiWallPropertiesProps {
    /** The selected walls */
    walls: WallResponse[];
    /** Available materials */
    materials?: MaterialResponse[];
    /** Callback to apply updates to all walls */
    onBulkUpdate?: (wallIds: string[], updates: { materialId?: string }) => void;
    /** Callback to delete walls */
    onBulkDelete?: (wallId: string) => void;
  }

  let {
    walls,
    materials = [],
    onBulkUpdate,
    onBulkDelete,
  }: MultiWallPropertiesProps = $props();

  let confirmingDelete = $state(false);

  let wallIds = $derived(walls.map(w => w.id));

  // Detect shared material or "mixed"
  let sharedMaterialId = $derived.by(() => {
    if (walls.length === 0) return null;
    const first = walls[0]!.material_id;
    return walls.every(w => w.material_id === first) ? first : null;
  });

  let selectedMaterialId = $state('');

  // Sync when selection changes
  let lastWallIds = $state('');
  $effect(() => {
    const ids = wallIds.join(',');
    if (ids !== lastWallIds) {
      lastWallIds = ids;
      selectedMaterialId = sharedMaterialId ?? '';
      confirmingDelete = false;
    }
  });

  // Total length of all walls
  let totalLength = $derived.by(() => {
    let total = 0;
    for (const wall of walls) {
      for (const seg of wall.segments) {
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        total += Math.sqrt(dx * dx + dy * dy);
      }
    }
    return total;
  });

  // Wall materials for dropdown (exclude floor materials)
  let wallMaterials = $derived(
    materials.filter(m => !m.is_floor)
  );

  function handleApplyMaterial(): void {
    if (!selectedMaterialId) return;
    onBulkUpdate?.(wallIds, { materialId: selectedMaterialId });
  }

  function handleDeleteAll(): void {
    for (const id of wallIds) {
      onBulkDelete?.(id);
    }
    confirmingDelete = false;
  }
</script>

<div class="multi-wall-properties">
  <h3 class="panel-title">{t('editor.properties')}</h3>

  <div class="selection-count">
    {walls.length} {t('properties.wallsSelected')}
  </div>

  <!-- Total Length -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('properties.wallLength')}</span>
      <span class="prop-value mono">{totalLength.toFixed(2)} m</span>
    </div>
  </div>

  <!-- Bulk Material -->
  <div class="prop-section">
    <h4 class="section-title">{t('label.material')}</h4>
    <div class="prop-row">
      <select
        class="prop-select"
        bind:value={selectedMaterialId}
      >
        {#if sharedMaterialId === null}
          <option value="">{t('properties.mixed')}</option>
        {/if}
        {#each wallMaterials as mat (mat.id)}
          <option value={mat.id}>{mat.name_en}</option>
        {/each}
      </select>
    </div>
    <button class="btn-apply" onclick={handleApplyMaterial} disabled={!selectedMaterialId}>
      {t('properties.applyToAll')}
    </button>
  </div>

  <!-- Delete all -->
  <div class="prop-section delete-section">
    {#if confirmingDelete}
      <div role="alertdialog" aria-label={t('properties.deleteConfirmWall')}>
        <p class="confirm-text">{t('properties.deleteConfirmWall')}</p>
        <div class="confirm-actions">
          <button class="btn-danger" onclick={handleDeleteAll}>
            {t('action.confirm')}
          </button>
          <button class="btn-cancel" onclick={() => { confirmingDelete = false; }}>
            {t('project.cancel')}
          </button>
        </div>
      </div>
    {:else}
      <button class="btn-delete" onclick={() => { confirmingDelete = true; }}>
        {t('editor.deleteWall')} ({walls.length})
      </button>
    {/if}
  </div>
</div>

<style>
  .multi-wall-properties {
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

  .selection-count {
    padding: 6px 10px;
    margin-bottom: 8px;
    background: rgba(74, 108, 247, 0.15);
    border: 1px solid rgba(74, 108, 247, 0.3);
    border-radius: 6px;
    color: #4a6cf7;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
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

  .prop-value.mono {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.7rem;
    color: #e0e0f0;
  }

  .prop-select {
    width: 100%;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e0e0f0;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .prop-select option {
    background: #1a1a2e;
    color: #e0e0f0;
  }

  .btn-apply {
    width: 100%;
    margin-top: 6px;
    padding: 6px 12px;
    background: rgba(74, 108, 247, 0.15);
    border: 1px solid rgba(74, 108, 247, 0.3);
    border-radius: 6px;
    color: #4a6cf7;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-apply:hover:not(:disabled) {
    background: rgba(74, 108, 247, 0.25);
  }

  .btn-apply:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
    font-family: inherit;
  }

  .btn-delete:hover {
    background: rgba(244, 67, 54, 0.2);
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
    font-family: inherit;
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
    font-family: inherit;
  }
</style>
