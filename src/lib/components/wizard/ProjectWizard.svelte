<!--
  ProjectWizard.svelte - Main wizard container with step routing and navigation.

  Manages the step flow, renders the current step component,
  and provides prev/next/skip navigation buttons.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import WizardStepper from './WizardStepper.svelte';
  import StepBasics from './steps/StepBasics.svelte';
  import StepFloorplan from './steps/StepFloorplan.svelte';
  import StepCalibration from './steps/StepCalibration.svelte';
  import StepWalls from './steps/StepWalls.svelte';
  import StepAccessPoints from './steps/StepAccessPoints.svelte';
  import StepFinish from './steps/StepFinish.svelte';

  function handleStepClick(step: number): void {
    wizardStore.setStep(step);
  }
</script>

<div class="project-wizard">
  <WizardStepper
    currentStep={wizardStore.currentStep}
    canGoToStep={(step) => wizardStore.canGoToStep(step)}
    onStepClick={handleStepClick}
  />

  <div class="wizard-content">
    {#if wizardStore.currentStep === 0}
      <StepBasics />
    {:else if wizardStore.currentStep === 1}
      <StepFloorplan />
    {:else if wizardStore.currentStep === 2}
      <StepCalibration />
    {:else if wizardStore.currentStep === 3}
      <StepWalls />
    {:else if wizardStore.currentStep === 4}
      <StepAccessPoints />
    {:else if wizardStore.currentStep === 5}
      <StepFinish />
    {/if}
  </div>

  <!-- Navigation buttons (not shown on step 6 / finish) -->
  {#if wizardStore.currentStep < 5}
    <div class="wizard-nav">
      {#if wizardStore.currentStep > 0}
        <button class="nav-btn nav-prev" onclick={() => wizardStore.prevStep()}>
          <span class="nav-icon">&larr;</span>
          {t('wizard.prev')}
        </button>
      {:else}
        <div></div>
      {/if}

      <div class="nav-right">
        {#if wizardStore.canSkipCurrentStep()}
          <button class="nav-btn nav-skip" onclick={() => wizardStore.nextStep()}>
            {t('wizard.skip')}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .project-wizard {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary, #fafafe);
  }

  .wizard-content {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .wizard-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: var(--bg-primary, #ffffff);
    border-top: 1px solid var(--border, #e0e0e0);
  }

  .nav-right {
    display: flex;
    gap: 8px;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    font-family: inherit;
  }

  .nav-prev {
    background: transparent;
    color: var(--text-secondary, #4a4a6a);
    border-color: var(--border, #d0d0e0);
  }

  .nav-prev:hover {
    background: var(--bg-tertiary, #f0f0f5);
    border-color: var(--text-muted, #6a6a8a);
  }

  .nav-skip {
    background: transparent;
    color: var(--text-muted, #6a6a8a);
    border-color: var(--border, #d0d0e0);
  }

  .nav-skip:hover {
    background: var(--bg-tertiary, #f0f0f5);
    color: var(--text-secondary, #4a4a6a);
  }

  .nav-icon {
    font-size: 1rem;
  }
</style>
