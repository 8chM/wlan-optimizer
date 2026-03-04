<!--
  WallProperties.svelte - Properties panel for a selected wall.

  Displays wall info (material, length), allows material change,
  attenuation overrides, and wall deletion with confirmation.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { getLocale } from '$lib/i18n';
  import type { WallResponse, MaterialResponse } from '$lib/api/invoke';

  interface WallPropertiesProps {
    /** The selected wall */
    wall: WallResponse;
    /** Available materials for the dropdown */
    materials: MaterialResponse[];
    /** Callback when wall is updated */
    onUpdate?: (wallId: string, updates: {
      materialId?: string;
      thicknessCm?: number | null;
      attenuationOverride24ghz?: number | null;
      attenuationOverride5ghz?: number | null;
    }) => void;
    /** Callback when wall is deleted */
    onDelete?: (wallId: string) => void;
  }

  let {
    wall,
    materials,
    onUpdate,
    onDelete,
  }: WallPropertiesProps = $props();

  let confirmingDelete = $state(false);
  let thicknessInput = $state<string>('');
  let att24Input = $state<string>('');
  let att5Input = $state<string>('');
  let thicknessDebounce: ReturnType<typeof setTimeout>;
  let att24Debounce: ReturnType<typeof setTimeout>;
  let att5Debounce: ReturnType<typeof setTimeout>;

  // Initialize inputs from wall data
  $effect(() => {
    thicknessInput = wall.thickness_cm !== null && wall.thickness_cm !== undefined
      ? String(wall.thickness_cm)
      : '';
    att24Input = wall.attenuation_override_24ghz !== null
      ? String(wall.attenuation_override_24ghz)
      : '';
    att5Input = wall.attenuation_override_5ghz !== null
      ? String(wall.attenuation_override_5ghz)
      : '';
  });

  /** Calculate the total wall length from all segments */
  let totalLength = $derived.by(() => {
    let length = 0;
    for (const seg of wall.segments) {
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  });

  /** Find the current material for this wall */
  let currentMaterial = $derived(
    materials.find((m) => m.id === wall.material_id) ?? null
  );

  /** Detect door/window type for label display */
  let isDoor = $derived(
    wall.material_id === 'mat-wood-door' ||
    wall.material_id === 'mat-metal-door' ||
    wall.material_id === 'mat-glass-door'
  );
  let isWindow = $derived(wall.material_id === 'mat-window');
  let typeLabel = $derived(
    isDoor ? t('toolbar.door')
    : isWindow ? t('toolbar.window')
    : null
  );

  function materialDisplayName(mat: MaterialResponse): string {
    const locale = getLocale();
    return locale === 'de' ? mat.name_de : mat.name_en;
  }

  /** Effective thickness: per-wall override or material default */
  let effectiveThickness = $derived(
    wall.thickness_cm ?? currentMaterial?.default_thickness_cm ?? null
  );

  function handleMaterialChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    onUpdate?.(wall.id, { materialId: select.value });
  }

  function commitThickness(): void {
    clearTimeout(thicknessDebounce);
    const val = thicknessInput.trim();
    if (val === '') {
      onUpdate?.(wall.id, { thicknessCm: null });
      return;
    }
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    onUpdate?.(wall.id, { thicknessCm: num });
  }

  function handleThicknessInput(): void {
    clearTimeout(thicknessDebounce);
    thicknessDebounce = setTimeout(() => commitThickness(), 300);
  }

  function commitAtt24(): void {
    clearTimeout(att24Debounce);
    const val = att24Input.trim();
    const num = val === '' ? null : parseFloat(val);
    if (val !== '' && (isNaN(num!) || num! < 0)) return;
    onUpdate?.(wall.id, { attenuationOverride24ghz: num });
  }

  function handleAtt24Input(): void {
    clearTimeout(att24Debounce);
    att24Debounce = setTimeout(() => commitAtt24(), 300);
  }

  function commitAtt5(): void {
    clearTimeout(att5Debounce);
    const val = att5Input.trim();
    const num = val === '' ? null : parseFloat(val);
    if (val !== '' && (isNaN(num!) || num! < 0)) return;
    onUpdate?.(wall.id, { attenuationOverride5ghz: num });
  }

  function handleAtt5Input(): void {
    clearTimeout(att5Debounce);
    att5Debounce = setTimeout(() => commitAtt5(), 300);
  }

  function handleDeleteClick(): void {
    confirmingDelete = true;
  }

  function handleConfirmDelete(): void {
    onDelete?.(wall.id);
    confirmingDelete = false;
  }

  function handleCancelDelete(): void {
    confirmingDelete = false;
  }
</script>

<div class="wall-properties">
  <h3 class="panel-title">{t('editor.properties')}</h3>

  <!-- Wall Info -->
  <div class="prop-section">
    {#if typeLabel}
      <div class="prop-row type-label-row">
        <span class="type-dot" style="background: {isDoor ? '#8B6914' : '#64B5F6'}"></span>
        <span class="type-label">{typeLabel}</span>
      </div>
    {/if}
    <div class="prop-row">
      <span class="prop-label">{t('label.material')}</span>
      <select
        class="prop-select"
        value={wall.material_id}
        onchange={handleMaterialChange}
      >
        {#each materials.filter((m) => !m.is_floor) as mat (mat.id)}
          <option value={mat.id}>{materialDisplayName(mat)}</option>
        {/each}
      </select>
    </div>

    <div class="prop-row">
      <span class="prop-label">{t('properties.wallLength')}</span>
      <span class="prop-value">{totalLength.toFixed(2)} m</span>
    </div>

    <!-- Editable wall thickness -->
    <div class="prop-row">
      <span class="prop-label">{t('label.thickness')}</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input"
          bind:value={thicknessInput}
          oninput={handleThicknessInput}
          onblur={commitThickness}
          placeholder={currentMaterial?.default_thickness_cm ? String(currentMaterial.default_thickness_cm) : '-'}
          min="0.5"
          max="100"
          step="0.5"
        />
        <span class="input-suffix">cm</span>
      </div>
    </div>

    {#if currentMaterial}
      <div class="prop-row info">
        <span class="prop-label">{t('material.attenuation')}</span>
        <span class="prop-value mono">
          {currentMaterial.attenuation_24ghz_db} / {currentMaterial.attenuation_5ghz_db} dB
        </span>
      </div>
    {/if}
  </div>

  <!-- Attenuation overrides -->
  <div class="prop-section">
    <h4 class="section-title">{t('properties.attenuationOverride')}</h4>

    <div class="prop-row">
      <span class="prop-label">2.4 GHz</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input"
          bind:value={att24Input}
          oninput={handleAtt24Input}
          onblur={commitAtt24}
          placeholder={currentMaterial ? String(currentMaterial.attenuation_24ghz_db) : '-'}
          min="0"
          step="0.5"
        />
        <span class="input-suffix">dB</span>
      </div>
    </div>

    <div class="prop-row">
      <span class="prop-label">5 GHz</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input"
          bind:value={att5Input}
          oninput={handleAtt5Input}
          onblur={commitAtt5}
          placeholder={currentMaterial ? String(currentMaterial.attenuation_5ghz_db) : '-'}
          min="0"
          step="0.5"
        />
        <span class="input-suffix">dB</span>
      </div>
    </div>
  </div>

  <!-- Delete -->
  <div class="prop-section delete-section">
    {#if confirmingDelete}
      <p class="confirm-text">{t('properties.deleteConfirmWall')}</p>
      <div class="confirm-actions">
        <button class="btn-danger" onclick={handleConfirmDelete}>
          {t('action.confirm')}
        </button>
        <button class="btn-cancel" onclick={handleCancelDelete}>
          {t('project.cancel')}
        </button>
      </div>
    {:else}
      <button class="btn-delete" onclick={handleDeleteClick}>
        {t('editor.deleteWall')}
      </button>
    {/if}
  </div>
</div>

<style>
  .wall-properties {
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

  .prop-row.info {
    opacity: 0.7;
  }

  .type-label-row {
    justify-content: flex-start;
    gap: 8px;
    padding-bottom: 6px;
    margin-bottom: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .type-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .type-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
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

  .prop-input {
    width: 70px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    color: #e0e0f0;
    font-size: 0.75rem;
    text-align: right;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .prop-input:focus {
    outline: none;
    border-color: rgba(74, 108, 247, 0.5);
  }

  .prop-input::placeholder {
    color: #5a5a7a;
  }

  .input-suffix {
    font-size: 0.65rem;
    color: #6a6a8a;
    font-family: 'SF Mono', 'Fira Code', monospace;
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
