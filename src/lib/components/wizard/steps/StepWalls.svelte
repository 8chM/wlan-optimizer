<!--
  StepWalls.svelte - Step 4: Draw walls, doors, and windows.

  Shows a simplified message directing users to draw walls.
  Walls are drawn on the canvas in the editor (full canvas integration
  would require duplicating the entire editor). Instead, this step
  provides a "Continue" button to proceed, or "Skip" if no walls needed yet.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { goto } from '$app/navigation';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';

  let wallCount = $derived(projectStore.activeFloor?.walls?.length ?? 0);

  function handleOpenEditor(): void {
    const projectId = wizardStore.projectId;
    if (projectId) {
      // Store wizard state so we can return
      localStorage.setItem('wlan-opt:wizard-return', projectId);
      goto(`/project/${projectId}/editor`);
    }
  }

  function handleNext(): void {
    wizardStore.updateStepData({ wallsDrawn: wallCount > 0 });
    wizardStore.nextStep();
  }
</script>

<div class="step-walls">
  <div class="step-card">
    <h2 class="step-title">{t('wizard.step4')}</h2>

    <div class="info-section">
      <div class="info-icon">▬</div>
      <p class="info-text">
        {t('editor.wallDrawHint')}
      </p>
    </div>

    {#if wallCount > 0}
      <div class="wall-count">
        <span class="count-badge">{wallCount}</span>
        <span>{t('wizard.wallCount')}</span>
      </div>
    {/if}

    <button class="btn-editor" onclick={handleOpenEditor}>
      {t('nav.editor')} &rarr;
    </button>

    <div class="nav-buttons">
      <button class="btn-next" onclick={handleNext}>
        {#if wallCount > 0}
          {t('wizard.next')} &rarr;
        {:else}
          {t('wizard.skip')}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .step-walls {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 40px 24px;
    min-height: 100%;
  }

  .step-card {
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 12px;
    padding: 32px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .step-title {
    margin: 0 0 24px;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .info-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    background: var(--bg-secondary, #fafafe);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 8px;
    text-align: center;
    margin-bottom: 16px;
  }

  .info-icon {
    font-size: 2rem;
    color: var(--accent, #4a6cf7);
  }

  .info-text {
    font-size: 0.85rem;
    color: var(--text-secondary, #4a4a6a);
    margin: 0;
    line-height: 1.5;
  }

  .wall-count {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(76, 175, 80, 0.08);
    border: 1px solid rgba(76, 175, 80, 0.2);
    border-radius: 6px;
    font-size: 0.85rem;
    color: #4caf50;
    margin-bottom: 16px;
  }

  .count-badge {
    font-weight: 700;
    font-size: 1rem;
  }

  .btn-editor {
    width: 100%;
    padding: 12px;
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: inherit;
    margin-bottom: 8px;
  }

  .btn-editor:hover {
    background: #3a5ce5;
  }

  .nav-buttons {
    margin-top: 8px;
  }

  .btn-next {
    width: 100%;
    padding: 10px;
    background: transparent;
    color: var(--text-muted, #6a6a8a);
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 8px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .btn-next:hover {
    background: var(--bg-tertiary, #f0f0f5);
    color: var(--text-secondary, #4a4a6a);
  }
</style>
