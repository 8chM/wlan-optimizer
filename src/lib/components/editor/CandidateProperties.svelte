<!--
  CandidateProperties.svelte - Properties panel for a selected candidate location.

  Shows label, infrastructure toggles, mounting options, preferred/forbidden,
  notes, and delete with confirmation.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { CandidateLocation } from '$lib/recommendations/types';

  interface CandidatePropertiesProps {
    candidate: CandidateLocation;
    onUpdate?: (id: string, updates: Partial<CandidateLocation>) => void;
    onDelete?: (id: string) => void;
  }

  let {
    candidate,
    onUpdate,
    onDelete,
  }: CandidatePropertiesProps = $props();

  let confirmingDelete = $state(false);
  let labelValue = $state('');
  let hasLan = $state(false);
  let hasPoe = $state(false);
  let hasPower = $state(false);
  let preferred = $state(false);
  let forbidden = $state(false);
  let mountWall = $state(false);
  let mountCeiling = $state(false);
  let notes = $state('');
  let maxCableDistance = $state(0);

  let lastSyncedId = $state('');
  $effect(() => {
    if (candidate.id !== lastSyncedId) {
      lastSyncedId = candidate.id;
      labelValue = candidate.label;
      hasLan = candidate.hasLan;
      hasPoe = candidate.hasPoe;
      hasPower = candidate.hasPower;
      preferred = candidate.preferred;
      forbidden = candidate.forbidden;
      mountWall = candidate.mountingOptions.includes('wall');
      mountCeiling = candidate.mountingOptions.includes('ceiling');
      notes = candidate.notes ?? '';
      maxCableDistance = candidate.maxCableDistanceMeters ?? 0;
    }
  });

  function emitUpdate(updates: Partial<CandidateLocation>): void {
    onUpdate?.(candidate.id, updates);
  }

  function handleLabelChange(): void {
    emitUpdate({ label: labelValue });
  }

  function toggleLan(): void {
    hasLan = !hasLan;
    emitUpdate({ hasLan });
  }

  function togglePoe(): void {
    hasPoe = !hasPoe;
    emitUpdate({ hasPoe });
  }

  function togglePower(): void {
    hasPower = !hasPower;
    emitUpdate({ hasPower });
  }

  function togglePreferred(): void {
    preferred = !preferred;
    if (preferred) forbidden = false;
    emitUpdate({ preferred, forbidden });
  }

  function toggleForbidden(): void {
    forbidden = !forbidden;
    if (forbidden) preferred = false;
    emitUpdate({ forbidden, preferred });
  }

  function toggleMountWall(): void {
    mountWall = !mountWall;
    const opts: ('wall' | 'ceiling')[] = [];
    if (mountWall) opts.push('wall');
    if (mountCeiling) opts.push('ceiling');
    emitUpdate({ mountingOptions: opts });
  }

  function toggleMountCeiling(): void {
    mountCeiling = !mountCeiling;
    const opts: ('wall' | 'ceiling')[] = [];
    if (mountWall) opts.push('wall');
    if (mountCeiling) opts.push('ceiling');
    emitUpdate({ mountingOptions: opts });
  }

  function handleNotesChange(): void {
    emitUpdate({ notes: notes || undefined });
  }

  function handleCableDistChange(): void {
    emitUpdate({ maxCableDistanceMeters: maxCableDistance > 0 ? maxCableDistance : undefined });
  }
</script>

<div class="candidate-properties">
  <h3 class="panel-title">{t('candidate.title')}</h3>

  <!-- Label -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('candidate.label')}</span>
      <input
        type="text"
        class="prop-input text-input"
        bind:value={labelValue}
        onblur={handleLabelChange}
        placeholder="C1"
      />
    </div>
  </div>

  <!-- Infrastructure -->
  <div class="prop-section">
    <h4 class="section-title">Infrastructure</h4>
    <div class="prop-row">
      <span class="prop-label">{t('candidate.hasLan')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={hasLan} onchange={toggleLan} />
        <span class="toggle-switch"></span>
      </label>
    </div>
    <div class="prop-row">
      <span class="prop-label">{t('candidate.hasPoe')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={hasPoe} onchange={togglePoe} />
        <span class="toggle-switch"></span>
      </label>
    </div>
    <div class="prop-row">
      <span class="prop-label">{t('candidate.hasPower')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={hasPower} onchange={togglePower} />
        <span class="toggle-switch"></span>
      </label>
    </div>
  </div>

  <!-- Mounting options -->
  <div class="prop-section">
    <h4 class="section-title">Mounting</h4>
    <div class="prop-row">
      <span class="prop-label">{t('candidate.mountingWall')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={mountWall} onchange={toggleMountWall} />
        <span class="toggle-switch"></span>
      </label>
    </div>
    <div class="prop-row">
      <span class="prop-label">{t('candidate.mountingCeiling')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={mountCeiling} onchange={toggleMountCeiling} />
        <span class="toggle-switch"></span>
      </label>
    </div>
  </div>

  <!-- Preferred / Forbidden -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('candidate.preferred')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={preferred} onchange={togglePreferred} />
        <span class="toggle-switch toggle-green"></span>
      </label>
    </div>
    <div class="prop-row">
      <span class="prop-label">{t('candidate.forbidden')}</span>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-input" checked={forbidden} onchange={toggleForbidden} />
        <span class="toggle-switch toggle-red"></span>
      </label>
    </div>
  </div>

  <!-- Cable distance -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">{t('candidate.maxCableDistance')}</span>
      <div class="input-group">
        <input
          type="number"
          class="prop-input"
          bind:value={maxCableDistance}
          onblur={handleCableDistChange}
          min="0"
          max="100"
          step="1"
        />
        <span class="input-suffix">m</span>
      </div>
    </div>
  </div>

  <!-- Notes -->
  <div class="prop-section">
    <span class="prop-label">{t('candidate.notes')}</span>
    <textarea
      class="prop-textarea"
      bind:value={notes}
      onblur={handleNotesChange}
      rows="2"
    ></textarea>
  </div>

  <!-- Position (read-only) -->
  <div class="prop-section">
    <div class="prop-row">
      <span class="prop-label">X</span>
      <span class="prop-value mono">{candidate.x.toFixed(2)} m</span>
    </div>
    <div class="prop-row">
      <span class="prop-label">Y</span>
      <span class="prop-value mono">{candidate.y.toFixed(2)} m</span>
    </div>
  </div>

  <!-- Delete -->
  <div class="prop-section delete-section">
    {#if confirmingDelete}
      <p class="confirm-text">{t('candidate.deleteConfirm')}</p>
      <div class="confirm-actions">
        <button class="btn-danger" onclick={() => { onDelete?.(candidate.id); confirmingDelete = false; }}>
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
  .candidate-properties { padding: 4px 0; }
  .panel-title { margin: 0 0 12px; font-size: 0.8rem; font-weight: 600; color: #e0e0f0; text-transform: uppercase; letter-spacing: 0.05em; }
  .prop-section { padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .prop-section:last-child { border-bottom: none; }
  .section-title { margin: 0 0 8px; font-size: 0.7rem; font-weight: 600; color: #808090; text-transform: uppercase; letter-spacing: 0.04em; }
  .prop-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; gap: 8px; }
  .prop-label { font-size: 0.75rem; color: #a0a0b0; flex-shrink: 0; }
  .prop-value { font-size: 0.75rem; color: #e0e0f0; text-align: right; }
  .prop-value.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.7rem; }
  .prop-input { padding: 4px 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; color: #e0e0f0; font-size: 0.75rem; }
  .prop-input:focus { outline: none; border-color: rgba(74, 108, 247, 0.5); }
  .text-input { flex: 1; min-width: 0; }
  .input-group { display: flex; align-items: center; gap: 4px; }
  .input-suffix { font-size: 0.65rem; color: #6a6a8a; font-family: 'SF Mono', 'Fira Code', monospace; }
  .prop-textarea { width: 100%; padding: 4px 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; color: #e0e0f0; font-size: 0.7rem; resize: vertical; font-family: inherit; margin-top: 4px; }
  .prop-textarea:focus { outline: none; border-color: rgba(74, 108, 247, 0.5); }

  .toggle-label { position: relative; display: inline-block; cursor: pointer; }
  .toggle-input { opacity: 0; width: 0; height: 0; position: absolute; }
  .toggle-switch { display: block; width: 36px; height: 20px; background: rgba(255, 255, 255, 0.12); border-radius: 10px; transition: background 0.2s ease; position: relative; }
  .toggle-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #808090; border-radius: 50%; transition: transform 0.2s ease, background 0.2s ease; }
  .toggle-input:checked + .toggle-switch { background: rgba(74, 108, 247, 0.3); }
  .toggle-input:checked + .toggle-switch::after { transform: translateX(16px); background: #4a6cf7; }
  .toggle-input:checked + .toggle-green { background: rgba(34, 197, 94, 0.3); }
  .toggle-input:checked + .toggle-green::after { background: #22c55e; }
  .toggle-input:checked + .toggle-red { background: rgba(239, 68, 68, 0.3); }
  .toggle-input:checked + .toggle-red::after { background: #ef4444; }

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
