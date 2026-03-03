<!--
  WizardStepper.svelte - Horizontal step indicator for the project wizard.

  Shows a progress bar with clickable step circles and labels.
  Allows jumping back to previous steps but not forward past completion.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { WIZARD_STEPS } from '$lib/stores/wizardStore.svelte';

  interface WizardStepperProps {
    currentStep: number;
    canGoToStep: (step: number) => boolean;
    onStepClick?: (step: number) => void;
  }

  let {
    currentStep,
    canGoToStep,
    onStepClick,
  }: WizardStepperProps = $props();
</script>

<div class="wizard-stepper">
  <div class="stepper-track">
    {#each WIZARD_STEPS as step, i (step.key)}
      {@const isActive = i === currentStep}
      {@const isCompleted = i < currentStep}
      {@const isClickable = canGoToStep(i)}
      <div class="step-item" class:active={isActive} class:completed={isCompleted}>
        {#if i > 0}
          <div class="step-connector" class:filled={isCompleted}></div>
        {/if}
        <button
          class="step-circle"
          class:active={isActive}
          class:completed={isCompleted}
          disabled={!isClickable}
          onclick={() => isClickable && onStepClick?.(i)}
          title={t(step.labelKey)}
        >
          {#if isCompleted}
            <span class="step-check">✓</span>
          {:else}
            <span class="step-number">{i + 1}</span>
          {/if}
        </button>
        <span class="step-label" class:active={isActive} class:completed={isCompleted}>
          {t(step.labelKey)}
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .wizard-stepper {
    padding: 16px 24px;
    background: var(--bg-primary, #ffffff);
    border-bottom: 1px solid var(--border, #e0e0e0);
  }

  .stepper-track {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 0;
    max-width: 700px;
    margin: 0 auto;
  }

  .step-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .step-connector {
    position: absolute;
    top: 16px;
    right: 50%;
    width: 100%;
    height: 2px;
    background: var(--border, #d0d0e0);
    z-index: 0;
  }

  .step-connector.filled {
    background: var(--accent, #4a6cf7);
  }

  .step-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid var(--border, #d0d0e0);
    background: var(--bg-primary, #ffffff);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted, #6a6a8a);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    z-index: 1;
    font-family: inherit;
    padding: 0;
  }

  .step-circle:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .step-circle.active {
    border-color: var(--accent, #4a6cf7);
    background: var(--accent, #4a6cf7);
    color: #ffffff;
  }

  .step-circle.completed {
    border-color: var(--accent, #4a6cf7);
    background: var(--accent, #4a6cf7);
    color: #ffffff;
  }

  .step-circle:not(:disabled):hover {
    border-color: var(--accent, #4a6cf7);
    transform: scale(1.1);
  }

  .step-check {
    font-size: 0.85rem;
  }

  .step-number {
    font-variant-numeric: tabular-nums;
  }

  .step-label {
    margin-top: 6px;
    font-size: 0.7rem;
    color: var(--text-muted, #6a6a8a);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .step-label.active {
    color: var(--accent, #4a6cf7);
    font-weight: 600;
  }

  .step-label.completed {
    color: var(--text-secondary, #4a4a6a);
  }
</style>
