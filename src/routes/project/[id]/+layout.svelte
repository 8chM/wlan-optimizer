<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<!-- Project layout: sidebar + main content area -->
<!-- TODO: Implement project navigation in Phase 8b -->
<div class="project-layout">
  {@render children()}
</div>

<style>
  .project-layout {
    display: flex;
    height: 100vh;
    width: 100vw;
  }
</style>
