<!--
  ProjectList.svelte - Displays all projects with create/delete actions.

  Shows a grid of project cards. Each card links to the project editor.
  Includes a "New Project" button to open the creation dialog.
-->
<script lang="ts">
import { goto } from '$app/navigation';
import type { ProjectResponse } from '$lib/api/invoke';
import { t } from '$lib/i18n';
import { projectStore } from '$lib/stores/projectStore.svelte';
import NewProjectDialog from './NewProjectDialog.svelte';

let showNewDialog = $state(false);
let deleteConfirmId = $state<string | null>(null);

// Load projects on mount
$effect(() => {
  projectStore.loadProjects();
});

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

async function handleDelete(id: string): Promise<void> {
  await projectStore.deleteProject(id);
  deleteConfirmId = null;
}

function handleProjectCreated(project: ProjectResponse): void {
  showNewDialog = false;
  // Navigate to new project using SvelteKit client-side routing
  goto(`/project/${project.id}/editor`);
}
</script>

<div class="project-list-page">
  <header class="page-header">
    <div class="header-content">
      <h1>{t('app.title')}</h1>
      <p class="subtitle">{t('app.description')}</p>
    </div>
    <button class="btn-primary" onclick={() => (showNewDialog = true)}>
      + {t('project.newProject')}
    </button>
  </header>

  {#if projectStore.isLoading}
    <div class="loading">
      <div class="spinner"></div>
    </div>
  {:else if projectStore.error}
    <div class="error-message">
      <p>{projectStore.error}</p>
      <button class="btn-secondary" onclick={() => projectStore.loadProjects()}>
        {t('action.retry')}
      </button>
    </div>
  {:else if projectStore.projects.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📡</div>
      <p>{t('project.noProjects')}</p>
      <button class="btn-primary" onclick={() => (showNewDialog = true)}>
        + {t('project.newProject')}
      </button>
    </div>
  {:else}
    <div class="project-grid">
      {#each projectStore.projects as project (project.id)}
        <div class="project-card">
          <div class="card-header">
            <h3 class="project-name">{project.name}</h3>
            <div class="card-actions">
              {#if deleteConfirmId === project.id}
                <button class="btn-danger-sm" onclick={() => handleDelete(project.id)}>
                  {t('action.confirm')}
                </button>
                <button class="btn-ghost-sm" onclick={() => (deleteConfirmId = null)}>
                  {t('project.cancel')}
                </button>
              {:else}
                <button
                  class="btn-ghost-sm btn-delete"
                  onclick={() => (deleteConfirmId = project.id)}
                  title={t('project.delete')}
                >
                  x
                </button>
              {/if}
            </div>
          </div>

          {#if project.description}
            <p class="project-description">{project.description}</p>
          {/if}

          <div class="card-meta">
            <span>{t('project.created')}: {formatDate(project.created_at)}</span>
            <span>{t('project.lastModified')}: {formatDate(project.updated_at)}</span>
          </div>

          <a href="/project/{project.id}/editor" class="btn-open">
            {t('project.open')} →
          </a>
        </div>
      {/each}
    </div>
  {/if}

  {#if showNewDialog}
    <NewProjectDialog
      onClose={() => (showNewDialog = false)}
      onCreated={handleProjectCreated}
    />
  {/if}
</div>

<style>
  .project-list-page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem 2rem 4rem;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 2rem;
    gap: 1rem;
  }

  .header-content h1 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--text-primary, #1a1a2e);
  }

  .subtitle {
    margin: 0.25rem 0 0;
    color: var(--text-muted, #6a6a8a);
    font-size: 0.9rem;
  }

  .btn-primary {
    padding: 10px 20px;
    background: var(--accent, #4a6cf7);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    font-family: inherit;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .btn-primary:hover {
    background: var(--accent-hover, #3a5ce7);
  }

  .btn-secondary {
    padding: 8px 16px;
    background: var(--bg-tertiary, #f0f0f5);
    color: var(--text-secondary, #4a4a6a);
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-family: inherit;
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary, #e8e8f0);
  }

  .loading {
    display: flex;
    justify-content: center;
    padding: 4rem 0;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e0e0e0;
    border-top-color: #4a6cf7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-message {
    text-align: center;
    padding: 2rem;
    color: #d32f2f;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-muted, #6a6a8a);
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .empty-state p {
    margin-bottom: 1.5rem;
    font-size: 1rem;
  }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .project-card {
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border-light, #e8e8f0);
    border-radius: 10px;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }

  .project-card:hover {
    border-color: var(--border, #c8c8e0);
    box-shadow: var(--shadow-md, 0 2px 12px rgba(0, 0, 0, 0.06));
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .project-name {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
  }

  .card-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-ghost-sm {
    padding: 4px 8px;
    background: transparent;
    border: none;
    color: #6a6a8a;
    cursor: pointer;
    font-size: 0.75rem;
    border-radius: 4px;
  }

  .btn-ghost-sm:hover {
    background: #f0f0f5;
  }

  .btn-delete:hover {
    color: #d32f2f;
    background: #fde8e8;
  }

  .btn-danger-sm {
    padding: 4px 8px;
    background: #d32f2f;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .project-description {
    margin: 0.5rem 0 0;
    color: var(--text-muted, #6a6a8a);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 0.75rem;
    font-size: 0.72rem;
    color: var(--text-muted, #9a9ab0);
  }

  .btn-open {
    display: inline-block;
    margin-top: 1rem;
    padding: 8px 16px;
    background: var(--accent-light, #f0f0ff);
    color: var(--accent, #4a6cf7);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    text-align: center;
    transition: background 0.15s ease;
  }

  .btn-open:hover {
    background: var(--accent-light, #e0e0ff);
    filter: brightness(0.95);
  }
</style>
