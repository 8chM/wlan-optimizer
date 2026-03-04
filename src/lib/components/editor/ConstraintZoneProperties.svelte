<!--
  ConstraintZoneProperties.svelte - Properties panel for a selected constraint zone.

  Shows zone type dropdown, priority selector (1-5), editable size,
  notes, and delete with confirmation.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ConstraintZone, ConstraintZoneType } from '$lib/recommendations/types';

  interface ConstraintZonePropertiesProps {
    zone: ConstraintZone;
    onUpdate?: (id: string, updates: Partial<ConstraintZone>) => void;
    onDelete?: (id: string) => void;
  }

  let {
    zone,
    onUpdate,
    onDelete,
  }: ConstraintZonePropertiesProps = $props();

  let confirmingDelete = $state(false);
  let zoneType = $state<ConstraintZoneType>('forbidden');
  let priority = $state(3);
  let notes = $state('');
  let zoneWidth = $state(2.0);
  let zoneHeight = $state(2.0);

  let lastSyncedId = $state('');
  $effect(() => {
    if (zone.id !== lastSyncedId) {
      lastSyncedId = zone.id;
      zoneType = zone.type;
      priority = Math.round(zone.weight) || 3;
      notes = zone.notes ?? '';
      zoneWidth = zone.width;
      zoneHeight = zone.height;
    }
  });

  const ZONE_TYPES: Array<{ value: ConstraintZoneType; labelKey: string; color: string }> = [
    { value: 'forbidden', labelKey: 'zone.forbidden', color: '#ef4444' },
    { value: 'discouraged', labelKey: 'zone.discouraged', color: '#f59e0b' },
    { value: 'preferred', labelKey: 'zone.preferred', color: '#22c55e' },
    { value: 'no_new_ap', labelKey: 'zone.noNewAp', color: '#ef4444' },
    { value: 'no_ceiling_mount', labelKey: 'zone.noCeilingMount', color: '#a855f7' },
    { value: 'no_wall_mount', labelKey: 'zone.noWallMount', color: '#a855f7' },
    { value: 'no_move', labelKey: 'zone.noMove', color: '#a855f7' },
    { value: 'high_priority', labelKey: 'zone.highPriority', color: '#3b82f6' },
    { value: 'low_priority', labelKey: 'zone.lowPriority', color: '#9ca3af' },
  ];

  function handleTypeChange(event: Event): void {
    zoneType = (event.target as HTMLSelectElement).value as ConstraintZoneType;
    onUpdate?.(zone.id, { type: zoneType });
  }

  function handlePriorityChange(value: number): void {
    priority = value;
    onUpdate?.(zone.id, { weight: value });
  }

  function handleNotesChange(): void {
    onUpdate?.(zone.id, { notes: notes || undefined });
  }

  function handleSizeChange(): void {
    const w = Math.max(0.5, zoneWidth);
    const h = Math.max(0.5, zoneHeight);
    zoneWidth = w;
    zoneHeight = h;
    onUpdate?.(zone.id, { width: w, height: h });
  }

  /** Get the priority label from i18n keys */
  function getPriorityLabel(val: number): string {
    const key = `zone.priority${val}`;
    return t(key);
  }
</script>

<div class="zone-properties">
  <h3 class="panel-title">{t('zone.title')}</h3>

  <!-- Type -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('zone.type')}</span>
      <select class="prop-select" value={zoneType} onchange={handleTypeChange}>
        {#each ZONE_TYPES as zt (zt.value)}
          <option value={zt.value}>{t(zt.labelKey)}</option>
        {/each}
      </select>
    </div>
    <div class="type-indicator" style="background: {ZONE_TYPES.find(z => z.value === zoneType)?.color ?? '#808090'}"></div>
  </div>

  <!-- Priority (1-5) -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('zone.priority')}</span>
      <span class="priority-label">{getPriorityLabel(priority)}</span>
    </div>
    <div class="priority-buttons">
      {#each [1, 2, 3, 4, 5] as val (val)}
        <button
          class="priority-btn"
          class:active={priority >= val}
          onclick={() => handlePriorityChange(val)}
          title={getPriorityLabel(val)}
        >
          {val}
        </button>
      {/each}
    </div>
  </div>

  <!-- Size (editable) -->
  <div class="prop-section">
    <h4 class="section-title">{t('zone.size')}</h4>
    <div class="prop-row">
      <span class="prop-label">W</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input mono"
          bind:value={zoneWidth}
          onchange={handleSizeChange}
          min="0.5"
          step="0.5"
        />
        <span class="input-unit">m</span>
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">H</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input mono"
          bind:value={zoneHeight}
          onchange={handleSizeChange}
          min="0.5"
          step="0.5"
        />
        <span class="input-unit">m</span>
      </div>
    </div>
  </div>

  <!-- Position (read-only) -->
  <div class="prop-section">
    <h4 class="section-title">{t('zone.position')}</h4>
    <div class="prop-row">
      <span class="prop-label">X</span>
      <span class="prop-value mono">{zone.x.toFixed(2)} m</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">Y</span>
      <span class="prop-value mono">{zone.y.toFixed(2)} m</span>
    </div>
  </div>

  <!-- Notes -->
  <div class="prop-section">
    <span class="prop-label">{t('zone.notes')}</span>
    <textarea
      class="prop-textarea"
      bind:value={notes}
      onblur={handleNotesChange}
      rows="2"
    ></textarea>
  </div>

  <!-- Delete -->
  <div class="prop-section delete-section">
    {#if confirmingDelete}
      <p class="confirm-text">{t('zone.deleteConfirm')}</p>
      <div class="confirm-actions">
        <button class="btn-danger" onclick={() => { onDelete?.(zone.id); confirmingDelete = false; }}>
          {t('action.confirm')}
        </button>
        <button class="btn-cancel" onclick={() => { confirmingDelete = false; }}>
          {t('project.cancel')}
        </button>
      </div>
    {:else}
      <button class="btn-delete" onclick={() => { confirmingDelete = true; }}>
        {t('action.delete')}
      </button>
    {/if}
  </div>
</div>

<style>
  .zone-properties { padding: 4px 0; }
  .panel-title { margin: 0 0 12px; font-size: 0.8rem; font-weight: 600; color: #e0e0f0; text-transform: uppercase; letter-spacing: 0.05em; }
  .prop-section { padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .prop-section:last-child { border-bottom: none; }
  .section-title { margin: 0 0 4px; font-size: 0.7rem; font-weight: 600; color: #808090; text-transform: uppercase; letter-spacing: 0.04em; }
  .prop-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; gap: 8px; }
  .prop-label { font-size: 0.75rem; color: #a0a0b0; flex-shrink: 0; }
  .prop-value { font-size: 0.75rem; color: #e0e0f0; text-align: right; }
  .prop-value.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.7rem; }
  .type-indicator { height: 3px; border-radius: 2px; margin-top: 4px; }

  .prop-select { flex: 1; min-width: 0; padding: 4px 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; color: #e0e0f0; font-size: 0.75rem; cursor: pointer; }
  .prop-select:hover { border-color: rgba(255, 255, 255, 0.2); }
  .prop-select option { background: #1a1a2e; color: #e0e0f0; }

  .prop-textarea { width: 100%; padding: 4px 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; color: #e0e0f0; font-size: 0.7rem; resize: vertical; font-family: inherit; margin-top: 4px; }
  .prop-textarea:focus { outline: none; border-color: rgba(74, 108, 247, 0.5); }

  /* Priority buttons */
  .priority-label { font-size: 0.7rem; color: #a0a0b0; }
  .priority-buttons { display: flex; gap: 4px; margin-top: 4px; }
  .priority-btn {
    flex: 1;
    padding: 6px 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #808090;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .priority-btn:hover { background: rgba(74, 108, 247, 0.15); border-color: rgba(74, 108, 247, 0.3); }
  .priority-btn.active {
    background: rgba(74, 108, 247, 0.2);
    border-color: rgba(74, 108, 247, 0.4);
    color: #a0b4ff;
  }

  /* Editable size inputs */
  .input-group { display: flex; align-items: center; gap: 4px; }
  .prop-input {
    width: 60px;
    padding: 3px 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e0e0f0;
    font-size: 0.7rem;
    text-align: right;
  }
  .prop-input:focus { outline: none; border-color: rgba(74, 108, 247, 0.5); }
  .prop-input.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
  .input-unit { font-size: 0.65rem; color: #808090; }

  /* Hide number input spinners */
  .prop-input::-webkit-inner-spin-button,
  .prop-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .prop-input[type=number] { -moz-appearance: textfield; }

  .delete-section { padding-top: 12px; }
  .confirm-text { margin: 0 0 8px; font-size: 0.75rem; color: #f44336; }
  .confirm-actions { display: flex; gap: 6px; }
  .btn-delete { width: 100%; padding: 8px; background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); border-radius: 6px; color: #f44336; font-size: 0.75rem; cursor: pointer; transition: all 0.15s ease; }
  .btn-delete:hover { background: rgba(244, 67, 54, 0.2); border-color: rgba(244, 67, 54, 0.5); }
  .btn-danger { flex: 1; padding: 6px 12px; background: #f44336; border: none; border-radius: 4px; color: #ffffff; font-size: 0.75rem; cursor: pointer; }
  .btn-danger:hover { background: #d32f2f; }
  .btn-cancel { flex: 1; padding: 6px 12px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 4px; color: #a0a0b0; font-size: 0.75rem; cursor: pointer; }
  .btn-cancel:hover { background: rgba(255, 255, 255, 0.1); color: #e0e0f0; }
</style>
