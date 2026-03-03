<!--
  /project/new redirects to the project wizard.
-->
<script lang="ts">
  import { goto } from '$app/navigation';

  // Redirect to wizard
  $effect(() => {
    goto('/project/wizard', { replaceState: true });
  });
</script>
