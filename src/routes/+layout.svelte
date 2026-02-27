<script lang="ts">
  import type { Snippet } from 'svelte';
  import ToastContainer from '$lib/components/common/ToastContainer.svelte';
  import OnboardingDialog from '$lib/components/common/OnboardingDialog.svelte';
  import { themeStore } from '$lib/stores/themeStore.svelte';
  import '$lib/styles/theme.css';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // Initialize theme on mount
  $effect(() => {
    themeStore.initTheme();
  });
</script>

{@render children()}
<ToastContainer />
<OnboardingDialog />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    color: #1a1a2e;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }
</style>
