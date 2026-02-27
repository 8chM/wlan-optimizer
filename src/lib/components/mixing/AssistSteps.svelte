<!--
  AssistSteps.svelte - Step-by-step instructions from the optimization plan.

  Features:
  - Each step with checkbox to mark as completed
  - Step number, title, instruction text (locale-aware)
  - "All steps completed" message when done
  - Suggest Run 2 (post-optimization measurement) when all applied
-->
<script lang="ts">
  import { t, getLocale } from '$lib/i18n';
  import type { OptimizationStepResponse, AccessPointResponse } from '$lib/api/invoke';

  // ─── Props ─────────────────────────────────────────────────────

  interface AssistStepsProps {
    /** Optimization steps from the plan */
    steps: OptimizationStepResponse[];
    /** Access points (for label lookup) */
    accessPoints: AccessPointResponse[];
    /** Callback when a step checkbox is toggled */
    onToggleStep?: (stepId: string, applied: boolean) => void;
  }

  let {
    steps,
    accessPoints,
    onToggleStep,
  }: AssistStepsProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  let sortedSteps = $derived(
    [...steps].sort((a, b) => a.step_order - b.step_order),
  );

  let allCompleted = $derived(
    steps.length > 0 && steps.every((s) => s.applied),
  );

  let completedCount = $derived(
    steps.filter((s) => s.applied).length,
  );

  // ─── Helpers ──────────────────────────────────────────────────

  /** Get AP label by ID */
  function getApLabel(apId: string): string {
    const ap = accessPoints.find((a) => a.id === apId);
    return ap?.label ?? 'AP';
  }

  /** Get locale-aware description for a step */
  function getDescription(step: OptimizationStepResponse): string {
    const locale = getLocale();
    if (locale === 'de' && step.description_de) {
      return step.description_de;
    }
    if (step.description_en) {
      return step.description_en;
    }
    // Fallback: generate from parameter/value
    return `${step.parameter}: ${step.old_value ?? '-'} → ${step.new_value ?? '-'}`;
  }

  // ─── Handlers ─────────────────────────────────────────────────

  function handleToggle(stepId: string, currentApplied: boolean): void {
    onToggleStep?.(stepId, !currentApplied);
  }
</script>

<div class="assist-steps">
  <h3 class="section-title">{t('mixing.assistSteps')}</h3>

  {#if steps.length === 0}
    <p class="empty-text">{t('mixing.noChanges')}</p>
  {:else}
    <!-- Progress indicator -->
    <div class="progress-bar">
      <div class="progress-fill" style="width: {(completedCount / steps.length) * 100}%"></div>
    </div>
    <span class="progress-label">{completedCount} / {steps.length} {t('mixing.stepCompleted')}</span>

    <!-- Steps list -->
    <div class="steps-list">
      {#each sortedSteps as step (step.id)}
        <div class="step-item" class:completed={step.applied}>
          <label class="step-checkbox">
            <input
              type="checkbox"
              checked={step.applied}
              onchange={() => handleToggle(step.id, step.applied)}
            />
          </label>
          <div class="step-content">
            <div class="step-header">
              <span class="step-number">{step.step_order}</span>
              <span class="step-ap">{getApLabel(step.access_point_id)}</span>
            </div>
            <p class="step-description">{getDescription(step)}</p>
          </div>
        </div>
      {/each}
    </div>

    <!-- All completed message -->
    {#if allCompleted}
      <div class="completed-banner">
        <span class="completed-text">{t('mixing.allStepsCompleted')}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .assist-steps {
    padding: 4px 0;
  }

  .section-title {
    margin: 0 0 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .empty-text {
    margin: 0;
    font-size: 0.7rem;
    color: #808090;
    font-style: italic;
    padding: 6px 0;
  }

  /* ─── Progress Bar ───────────────────────────────────────────── */

  .progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(to right, #6366f1, #22c55e);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-label {
    display: block;
    font-size: 0.65rem;
    color: #808090;
    margin-bottom: 8px;
  }

  /* ─── Steps List ─────────────────────────────────────────────── */

  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 300px;
    overflow-y: auto;
  }

  .steps-list::-webkit-scrollbar {
    width: 3px;
  }

  .steps-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .steps-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
  }

  .step-item {
    display: flex;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 5px;
    transition: all 0.15s ease;
  }

  .step-item.completed {
    background: rgba(34, 197, 94, 0.04);
    border-color: rgba(34, 197, 94, 0.15);
  }

  .step-checkbox {
    display: flex;
    align-items: flex-start;
    padding-top: 1px;
    cursor: pointer;
  }

  .step-checkbox input[type='checkbox'] {
    accent-color: #22c55e;
    cursor: pointer;
    width: 14px;
    height: 14px;
  }

  .step-content {
    flex: 1;
    min-width: 0;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }

  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
    font-size: 0.6rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-item.completed .step-number {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }

  .step-ap {
    font-size: 0.7rem;
    font-weight: 600;
    color: #c0c0d0;
  }

  .step-description {
    margin: 0;
    font-size: 0.7rem;
    color: #a0a0b0;
    line-height: 1.3;
  }

  .step-item.completed .step-description {
    color: #808090;
    text-decoration: line-through;
    text-decoration-color: rgba(128, 128, 144, 0.4);
  }

  /* ─── Completed Banner ───────────────────────────────────────── */

  .completed-banner {
    margin-top: 8px;
    padding: 8px 10px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 5px;
  }

  .completed-text {
    font-size: 0.7rem;
    color: #86efac;
    line-height: 1.4;
  }
</style>
