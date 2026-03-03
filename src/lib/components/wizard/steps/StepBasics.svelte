<!--
  StepBasics.svelte - Step 1: Project name, description, and AP model selection.

  Creates the project on "Next" (new mode) or updates it (edit mode).
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { safeInvoke, type ApModelResponse } from '$lib/api/invoke';

  let name = $state(wizardStore.stepData.name);
  let description = $state(wizardStore.stepData.description);
  let apModelId = $state(wizardStore.stepData.apModelId ?? '');
  let apModels = $state<ApModelResponse[]>([]);
  let saving = $state(false);
  let errorMsg = $state<string | null>(null);

  // Load AP models
  $effect(() => {
    safeInvoke('list_ap_models', {} as Record<string, never>)
      .then((models) => { apModels = models; })
      .catch(() => { /* ignore */ });
  });

  async function handleNext(): Promise<void> {
    if (!name.trim()) return;
    saving = true;
    errorMsg = null;

    try {
      if (wizardStore.isEditMode && wizardStore.projectId) {
        // Update existing project
        await projectStore.renameProject(wizardStore.projectId, name.trim());
        // Update description via direct API call
        await safeInvoke('update_project', {
          params: { id: wizardStore.projectId, name: name.trim(), description: description.trim() || undefined },
        });
      } else {
        // Create new project
        const project = await projectStore.createProject(name.trim(), description.trim() || undefined);
        if (!project) {
          errorMsg = projectStore.error ?? 'Failed to create project';
          saving = false;
          return;
        }

        // Load project to get floor IDs
        await projectStore.loadProject(project.id);
        const floor = projectStore.activeFloor;
        if (!floor) {
          errorMsg = 'No floor created';
          saving = false;
          return;
        }

        wizardStore.setProjectId(project.id);
        wizardStore.setFloorId(floor.id);
      }

      wizardStore.updateStepData({
        name: name.trim(),
        description: description.trim(),
        apModelId: apModelId || null,
      });
      wizardStore.nextStep();
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="step-basics">
  <div class="step-card">
    <h2 class="step-title">{t('wizard.step1')}</h2>

    <div class="form-group">
      <label class="form-label" for="project-name">{t('project.name')} *</label>
      <input
        id="project-name"
        type="text"
        class="form-input"
        bind:value={name}
        placeholder={t('project.name')}
        autofocus
        onkeydown={(e) => { if (e.key === 'Enter') handleNext(); }}
      />
    </div>

    <div class="form-group">
      <label class="form-label" for="project-desc">{t('project.description')}</label>
      <textarea
        id="project-desc"
        class="form-textarea"
        bind:value={description}
        placeholder={t('project.description')}
        rows="3"
      ></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="ap-model">{t('wizard.apModel')}</label>
      <select
        id="ap-model"
        class="form-select"
        bind:value={apModelId}
      >
        <option value="">{t('wizard.selectApModel')}</option>
        {#each apModels as model (model.id)}
          <option value={model.id}>{model.manufacturer} {model.model}</option>
        {/each}
      </select>
    </div>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <button
      class="btn-next"
      onclick={handleNext}
      disabled={!name.trim() || saving}
    >
      {#if saving}
        {t('action.creating')}
      {:else}
        {t('wizard.next')} &rarr;
      {/if}
    </button>
  </div>
</div>

<style>
  .step-basics {
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

  .form-group {
    margin-bottom: 16px;
  }

  .form-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary, #4a4a6a);
    margin-bottom: 6px;
  }

  .form-input,
  .form-textarea,
  .form-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    transition: border-color 0.15s ease;
    font-family: inherit;
    box-sizing: border-box;
  }

  .form-input:focus,
  .form-textarea:focus,
  .form-select:focus {
    outline: none;
    border-color: var(--accent, #4a6cf7);
    box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
  }

  .form-textarea {
    resize: vertical;
    min-height: 60px;
  }

  .error-msg {
    color: #f44336;
    font-size: 0.8rem;
    margin: 8px 0;
  }

  .btn-next {
    width: 100%;
    margin-top: 8px;
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
  }

  .btn-next:hover:not(:disabled) {
    background: #3a5ce5;
  }

  .btn-next:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
