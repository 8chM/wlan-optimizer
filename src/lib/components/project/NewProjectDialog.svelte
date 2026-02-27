<!--
  NewProjectDialog.svelte - Modal dialog for creating a new project.

  Captures project name and optional description.
  Calls projectStore.createProject() and emits onCreated on success.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { ProjectResponse } from '$lib/api/invoke';

  interface NewProjectDialogProps {
    onClose: () => void;
    onCreated: (project: ProjectResponse) => void;
  }

  let { onClose, onCreated }: NewProjectDialogProps = $props();

  let name = $state('');
  let description = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);

  let isValid = $derived(name.trim().length > 0);

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    isSubmitting = true;
    errorMessage = null;

    const project = await projectStore.createProject(
      name.trim(),
      description.trim() || undefined,
    );

    isSubmitting = false;

    if (project) {
      onCreated(project);
    } else {
      errorMessage = projectStore.error;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="dialog-overlay" onclick={handleBackdropClick}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={t('project.newProject')}>
    <header class="dialog-header">
      <h2>{t('project.newProject')}</h2>
      <button class="close-btn" onclick={onClose} aria-label={t('action.close')}>x</button>
    </header>

    <form onsubmit={handleSubmit}>
      <div class="form-group">
        <label for="project-name">{t('project.name')}</label>
        <input
          id="project-name"
          type="text"
          bind:value={name}
          placeholder={t('project.name')}
          autofocus
          required
        />
      </div>

      <div class="form-group">
        <label for="project-desc">{t('project.description')}</label>
        <textarea
          id="project-desc"
          bind:value={description}
          placeholder={t('project.description')}
          rows="3"
        ></textarea>
      </div>

      {#if errorMessage}
        <div class="error-banner">
          {errorMessage}
        </div>
      {/if}

      <div class="dialog-actions">
        <button type="button" class="btn-secondary" onclick={onClose}>
          {t('project.cancel')}
        </button>
        <button type="submit" class="btn-primary" disabled={!isValid || isSubmitting}>
          {#if isSubmitting}
            {t('action.creating')}
          {:else}
            {t('project.create')}
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: #ffffff;
    border-radius: 12px;
    width: 90%;
    max-width: 460px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #e8e8f0;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: #1a1a2e;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #6a6a8a;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .close-btn:hover {
    background: #f0f0f5;
  }

  form {
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: #4a4a6a;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d0d0e0;
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: inherit;
    color: #1a1a2e;
    background: #fafafe;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    resize: vertical;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #4a6cf7;
    box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.12);
  }

  .error-banner {
    padding: 8px 12px;
    background: #fde8e8;
    color: #d32f2f;
    border-radius: 6px;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1rem;
  }

  .btn-primary {
    padding: 10px 20px;
    background: #4a6cf7;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: background 0.15s ease;
  }

  .btn-primary:hover {
    background: #3a5ce7;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: 10px 20px;
    background: #f0f0f5;
    color: #4a4a6a;
    border: 1px solid #d0d0e0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .btn-secondary:hover {
    background: #e8e8f0;
  }
</style>
