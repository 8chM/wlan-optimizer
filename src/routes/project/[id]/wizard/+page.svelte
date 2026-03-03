<!--
  Edit existing project wizard page.
  Loads project data and initializes the wizard in edit mode.
-->
<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import ProjectWizard from '$lib/components/wizard/ProjectWizard.svelte';

  let projectId = $derived($page.params.id);
  let loading = $state(true);

  // Load project and initialize wizard in edit mode
  $effect(() => {
    const id = projectId;
    if (!id) return;

    (async () => {
      loading = true;
      await projectStore.loadProject(id);
      const project = projectStore.currentProject;
      const floor = projectStore.activeFloor;

      if (project && floor) {
        const hasImage = !!(floor.background_image_rotation !== undefined || localStorage.getItem(`wlan-opt:floor-image:${floor.id}`));
        const hasScale = (floor.scale_px_per_meter ?? 50) !== 50;

        wizardStore.initEdit(id, floor.id, {
          name: project.name,
          description: project.description ?? '',
          hasFloorplan: hasImage,
          scaleConfirmed: hasScale,
          wallsDrawn: (floor.walls?.length ?? 0) > 0,
          apsPlaced: (floor.access_points?.length ?? 0) > 0,
        });
      }
      loading = false;
    })();
  });
</script>

<svelte:head>
  <title>{t('wizard.editProject')} - {t('app.title')}</title>
</svelte:head>

<div class="wizard-page">
  {#if loading}
    <div class="loading-state">
      <p>{t('action.creating')}</p>
    </div>
  {:else}
    <ProjectWizard />
  {/if}
</div>

<style>
  .wizard-page {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted, #6a6a8a);
  }
</style>
