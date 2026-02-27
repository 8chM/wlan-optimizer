<script lang="ts">
  import { t } from '$lib/i18n';
  import Layout from '$lib/components/layout/Layout.svelte';
  import ProjectList from '$lib/components/project/ProjectList.svelte';
</script>

<svelte:head>
  <title>{t('nav.projects')} - {t('app.title')}</title>
</svelte:head>

<Layout showSidebar={false} showEditorTools={false}>
  <ProjectList />
</Layout>
