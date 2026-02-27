<script lang="ts">
  import { goto } from '$app/navigation';
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

<Layout showSidebar={false} showEditorTools={false}>
  <NewProjectDialog
    onClose={handleClose}
    onCreated={handleCreated}
  />
</Layout>
