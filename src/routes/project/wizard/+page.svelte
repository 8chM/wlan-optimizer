<!--
  New project wizard page.
  Initializes the wizard store for a new project and renders ProjectWizard.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import ProjectWizard from '$lib/components/wizard/ProjectWizard.svelte';

  // Initialize wizard for new project
  $effect(() => {
    wizardStore.initNew();
  });
</script>

<svelte:head>
  <title>{t('wizard.title')} - {t('app.title')}</title>
</svelte:head>

<div class="wizard-page">
  <ProjectWizard />
</div>

<style>
  .wizard-page {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
