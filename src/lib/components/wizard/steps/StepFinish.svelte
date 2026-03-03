<!--
  StepFinish.svelte - Step 6: Summary and "Open Editor" button.

  Shows a summary of the project setup and navigates to the editor.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';

  let wallCount = $derived(projectStore.activeFloor?.walls?.length ?? 0);
  let apCount = $derived(projectStore.activeFloor?.access_points?.length ?? 0);

  function handleFinish(): void {
    const projectId = wizardStore.projectId;
    if (projectId) {
      // Mark wizard as completed for this project
      localStorage.setItem(`wlan-opt:wizard-done:${projectId}`, 'true');
      // Clean up wizard return state
      localStorage.removeItem('wlan-opt:wizard-return');
      wizardStore.reset();
      goto(`/project/${projectId}/editor`);
    }
  }
</script>

<div class="step-finish">
  <div class="step-card">
    <div class="finish-header">
      <span class="finish-icon">✓</span>
      <h2 class="step-title">{t('wizard.summary')}</h2>
    </div>

    <div class="summary-list">
      <div class="summary-row">
        <span class="summary-label">{t('project.name')}</span>
        <span class="summary-value">{wizardStore.stepData.name}</span>
      </div>

      {#if wizardStore.stepData.description}
        <div class="summary-row">
          <span class="summary-label">{t('project.description')}</span>
          <span class="summary-value">{wizardStore.stepData.description}</span>
        </div>
      {/if}

      <div class="summary-row">
        <span class="summary-label">{t('wizard.step2')}</span>
        <span class="summary-value">
          {wizardStore.stepData.hasFloorplan ? '✓' : '—'}
        </span>
      </div>

      <div class="summary-row">
        <span class="summary-label">{t('wizard.step3')}</span>
        <span class="summary-value">
          {wizardStore.stepData.scaleConfirmed ? '✓' : '—'}
        </span>
      </div>

      <div class="summary-row">
        <span class="summary-label">{t('wizard.wallCount')}</span>
        <span class="summary-value">{wallCount}</span>
      </div>

      <div class="summary-row">
        <span class="summary-label">{t('wizard.apCount')}</span>
        <span class="summary-value">{apCount}</span>
      </div>
    </div>

    <button class="btn-finish" onclick={handleFinish}>
      {t('wizard.finish')} &rarr;
    </button>
  </div>
</div>

<style>
  .step-finish {
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

  .finish-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .finish-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(76, 175, 80, 0.1);
    color: #4caf50;
    font-size: 1.2rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .summary-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 24px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border, #e0e0e0);
    gap: 12px;
  }

  .summary-row:last-child {
    border-bottom: none;
  }

  .summary-label {
    font-size: 0.85rem;
    color: var(--text-secondary, #4a4a6a);
  }

  .summary-value {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary, #1a1a2e);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .btn-finish {
    width: 100%;
    padding: 14px;
    background: #4caf50;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: inherit;
  }

  .btn-finish:hover {
    background: #43a047;
  }
</style>
