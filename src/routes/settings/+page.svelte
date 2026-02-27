<script lang="ts">
  import { t } from '$lib/i18n';
  import Layout from '$lib/components/layout/Layout.svelte';
</script>

<Layout showSidebar={false} showEditorTools={false}>
  <div class="settings-page">
    <h2>{t('nav.settings')}</h2>
    <p>Application settings will be implemented in Phase 8f.</p>
  </div>
</Layout>

<style>
  .settings-page {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
    color: #4a4a6a;
  }

  h2 {
    margin: 0 0 1rem;
    color: #1a1a2e;
  }
</style>
