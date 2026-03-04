<!--
  RecommendationStep.svelte - Single recommendation as a numbered wizard step.

  Displays: step number, effort badge, title, description, action buttons.
  States: pending, applied, skipped, blocked.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Recommendation, RejectionReason, EffortLevel } from '$lib/recommendations/types';
  import { EFFORT_LEVELS } from '$lib/recommendations/types';
  import type { StepState } from '$lib/stores/optimierungStore.svelte';

  interface RecommendationStepProps {
    rec: Recommendation;
    stepNumber: number;
    stepState: StepState;
    onApply: (rec: Recommendation) => void;
    onSkip: (rec: Recommendation) => void;
    onReject: (rec: Recommendation, reason: RejectionReason) => void;
    onSelect: (rec: Recommendation) => void;
    onPreview?: (rec: Recommendation) => void;
    previewActive?: boolean;
  }

  let { rec, stepNumber, stepState, onApply, onSkip, onReject, onSelect, onPreview, previewActive = false }: RecommendationStepProps = $props();

  let rejectOpen = $state(false);

  function interpolate(text: string, params: Record<string, string | number>): string {
    let result = text;
    for (const [key, value] of Object.entries(params)) {
      result = result.replaceAll(`{${key}}`, String(value));
    }
    return result;
  }

  const EFFORT_SHORT_KEYS: Record<EffortLevel, string> = {
    config: 'opt.effortConfig',
    minor_physical: 'opt.effortMinor',
    major_physical: 'opt.effortMajor',
    infrastructure: 'opt.effortInfra',
  };

  const EFFORT_COLORS: Record<EffortLevel, string> = {
    config: '#22c55e',
    minor_physical: '#f59e0b',
    major_physical: '#f97316',
    infrastructure: '#ef4444',
  };

  const SEVERITY_COLORS: Record<string, string> = {
    critical: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  const REJECTION_OPTIONS: Array<{ reason: RejectionReason; labelKey: string }> = [
    { reason: 'no_lan', labelKey: 'rec.rejectNoLan' },
    { reason: 'no_poe', labelKey: 'rec.rejectNoPoe' },
    { reason: 'mounting_not_possible', labelKey: 'rec.rejectMounting' },
    { reason: 'position_forbidden', labelKey: 'rec.rejectPosition' },
    { reason: 'ap_cannot_move', labelKey: 'rec.rejectNoMove' },
    { reason: 'ap_cannot_rotate', labelKey: 'rec.rejectNoRotate' },
    { reason: 'not_desired', labelKey: 'rec.rejectOther' },
  ];

  let effortLevel = $derived<EffortLevel>(EFFORT_LEVELS[rec.type] ?? 'config');
  let isBlocked = $derived((rec.blockedByConstraints?.length ?? 0) > 0);
  let isDone = $derived(stepState === 'applied' || stepState === 'skipped');
  let isConfigType = $derived(rec.type === 'change_channel' || rec.type === 'adjust_tx_power' || rec.type === 'disable_ap');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="step"
  class:done={isDone}
  class:blocked={isBlocked}
  onclick={() => onSelect(rec)}
>
  <!-- Step number circle -->
  <div class="step-number" style="border-color: {SEVERITY_COLORS[rec.severity] ?? '#3b82f6'}">
    {#if stepState === 'applied'}
      <span class="check-icon">&#x2713;</span>
    {:else}
      {stepNumber}
    {/if}
  </div>

  <!-- Content -->
  <div class="step-content">
    <div class="step-top">
      <span class="step-title">{interpolate(t(rec.titleKey), rec.titleParams)}</span>
      <span class="effort-badge" style="background: {EFFORT_COLORS[effortLevel]}20; color: {EFFORT_COLORS[effortLevel]}; border-color: {EFFORT_COLORS[effortLevel]}40">
        {t(EFFORT_SHORT_KEYS[effortLevel])}
      </span>
    </div>

    <p class="step-desc">{interpolate(t(rec.reasonKey), rec.reasonParams)}</p>

    {#if isBlocked}
      <p class="blocked-reason">{rec.blockedByConstraints?.[0] ?? ''}</p>
    {:else if stepState === 'applied'}
      <span class="state-label applied">{t('opt.applied')}</span>
    {:else if stepState === 'skipped'}
      <span class="state-label skipped">{t('opt.skipped')}</span>
    {:else}
      <!-- Action buttons -->
      <div class="step-actions">
        {#if rec.suggestedChange?.apId && onPreview}
          <button class="action-btn preview" disabled={previewActive} onclick={(e) => { e.stopPropagation(); onPreview(rec); }}>
            {t('opt.preview')}
          </button>
        {/if}
        {#if isConfigType}
          <button class="action-btn apply" disabled={previewActive} onclick={(e) => { e.stopPropagation(); onApply(rec); }}>
            {t('opt.apply')}
          </button>
        {:else}
          <button class="action-btn instruction" disabled={previewActive} onclick={(e) => { e.stopPropagation(); onApply(rec); }}>
            {t('opt.instructionOnly')}
          </button>
        {/if}
        <button class="action-btn skip" disabled={previewActive} onclick={(e) => { e.stopPropagation(); onSkip(rec); }}>
          {t('opt.skip')}
        </button>
        <button class="action-btn reject" disabled={previewActive} onclick={(e) => { e.stopPropagation(); rejectOpen = !rejectOpen; }}>
          {t('rec.rejectBtn')}
        </button>
      </div>

      {#if rejectOpen}
        <div class="reject-dropdown">
          {#each REJECTION_OPTIONS as opt (opt.reason)}
            <button class="reject-option" onclick={(e) => { e.stopPropagation(); onReject(rec, opt.reason); rejectOpen = false; }}>
              {t(opt.labelKey)}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .step {
    display: flex;
    gap: 10px;
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .step:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .step.done {
    opacity: 0.5;
  }

  .step.blocked {
    opacity: 0.4;
    border-left: 2px dashed #808090;
  }

  .step-number {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: #c0c0d0;
  }

  .check-icon {
    color: #22c55e;
    font-size: 0.85rem;
  }

  .step-content {
    flex: 1;
    min-width: 0;
  }

  .step-top {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }

  .step-title {
    font-size: 0.78rem;
    font-weight: 500;
    color: #e0e0f0;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .effort-badge {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.6rem;
    font-weight: 600;
    border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .step-desc {
    margin: 0;
    font-size: 0.7rem;
    color: #808090;
    line-height: 1.3;
  }

  .blocked-reason {
    margin: 4px 0 0;
    font-size: 0.65rem;
    color: #f59e0b;
    font-style: italic;
  }

  .state-label {
    display: inline-block;
    margin-top: 4px;
    font-size: 0.65rem;
    font-weight: 500;
  }

  .state-label.applied {
    color: #22c55e;
  }

  .state-label.skipped {
    color: #808090;
  }

  .step-actions {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid;
    transition: all 0.15s ease;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-btn.preview {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
  }

  .action-btn.preview:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
  }

  .action-btn.apply {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }

  .action-btn.apply:hover {
    background: rgba(34, 197, 94, 0.25);
  }

  .action-btn.instruction {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
  }

  .action-btn.instruction:hover {
    background: rgba(99, 102, 241, 0.25);
  }

  .action-btn.skip {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: #808090;
  }

  .action-btn.skip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #c0c0d0;
  }

  .action-btn.reject {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .action-btn.reject:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .reject-dropdown {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 4px;
    padding: 4px;
    background: #1e1e38;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
  }

  .reject-option {
    padding: 4px 8px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: #c0c0d0;
    font-size: 0.65rem;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .reject-option:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
</style>
