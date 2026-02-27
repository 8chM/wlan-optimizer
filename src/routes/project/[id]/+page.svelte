<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  // Redirect to editor view by default
  $effect(() => {
    const projectId = $page.params.id;
    if (projectId) {
      goto(`/project/${projectId}/editor`, { replaceState: true });
    }
  });
</script>
