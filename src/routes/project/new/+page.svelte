<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n';
  import Layout from '$lib/components/layout/Layout.svelte';
  import NewProjectDialog from '$lib/components/project/NewProjectDialog.svelte';
  import type { ProjectResponse } from '$lib/api/invoke';

  function handleCreated(project: ProjectResponse): void {
    goto(`/project/${project.id}/editor`);
  }

  function handleClose(): void {
    goto('/');
  }
</script>

<svelte:head>
  <title>{t('project.create')} - {t('app.title')}</title>
</svelte:head>

<Layout showSidebar={false} showEditorTools={false}>
  <NewProjectDialog
    onClose={handleClose}
    onCreated={handleCreated}
  />
</Layout>
