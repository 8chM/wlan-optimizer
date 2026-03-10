<!--
  RecommendationWizard.svelte - Step-by-step recommendation wizard.

  Displays: progress bar, scrollable step list, empty/initial states.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { AnalysisResult, Recommendation, RejectionReason } from '$lib/recommendations/types';
  import type { StepState, ApplyVerification } from '$lib/stores/optimierungStore.svelte';
  import RecommendationStep from './RecommendationStep.svelte';

  interface RecommendationWizardProps {
    result: AnalysisResult | null;
    stepStates: Map<string, StepState>;
    verifications?: Map<string, ApplyVerification>;
    stale?: boolean;
    onApply: (rec: Recommendation) => void;
    onSkip: (rec: Recommendation) => void;
    onReject: (rec: Recommendation, reason: RejectionReason) => void;
    onSelect: (rec: Recommendation) => void;
    onPreview?: (rec: Recommendation) => void;
    onReanalyze?: () => void;
    previewActive?: boolean;
  }

  let { result, stepStates, verifications, stale = false, onApply, onSkip, onReject, onSelect, onPreview, onReanalyze, previewActive = false }: RecommendationWizardProps = $props();

  function interpolate(text: string, params: Record<string, string | number>): string {
    let r = text;
    for (const [key, value] of Object.entries(params)) {
      r = r.replaceAll(`{${key}}`, String(value));
    }
    return r;
  }

  let recs = $derived(result?.recommendations ?? []);
  let total = $derived(recs.length);

  let completed = $derived.by(() => {
    let n = 0;
    for (const rec of recs) {
      const s = stepStates.get(rec.id);
      if (s === 'applied' || s === 'skipped') n++;
    }
    return n;
  });

  let progressPct = $derived(total > 0 ? (completed / total) * 100 : 0);
  let allDone = $derived(total > 0 && completed === total);
</script>

<div class="wizard">
  {#if !result}
    <!-- Initial state: not yet analyzed -->
    <div class="wizard-empty">
      <p class="empty-text">{t('opt.analyzeFirst')}</p>
    </div>
  {:else if recs.length === 0}
    <!-- No recommendations -->
    <div class="wizard-empty">
      <p class="empty-text">{t('opt.noRecommendations')}</p>
    </div>
  {:else}
    <!-- Progress bar -->
    <div class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progressPct}%"></div>
      </div>
      <span class="progress-text">
        {interpolate(t('opt.stepProgress'), { completed, total })}
      </span>
    </div>

    {#if allDone}
      <div class="all-done">
        <span class="done-icon">&#x2713;</span>
        <span class="done-text">{t('opt.allDone')}</span>
      </div>
    {/if}

    {#if stale}
      <div class="stale-banner">
        <span class="stale-icon">&#x26A0;</span>
        <span class="stale-text">{t('opt.staleHint')}</span>
        {#if onReanalyze}
          <button class="stale-btn" onclick={onReanalyze}>{t('opt.validateWithMeasurement')}</button>
        {/if}
      </div>
    {/if}

    <!-- Step list -->
    <div class="step-list">
      {#each recs as rec, i (rec.id)}
        <RecommendationStep
          {rec}
          stepNumber={i + 1}
          stepState={stepStates.get(rec.id) ?? 'pending'}
          verification={verifications?.get(rec.id)}
          {onApply}
          {onSkip}
          {onReject}
          {onSelect}
          {onPreview}
          {previewActive}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .wizard {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .wizard-empty {
    padding: 24px 12px;
    text-align: center;
  }

  .empty-text {
    margin: 0;
    font-size: 0.8rem;
    color: #808090;
    line-height: 1.4;
  }

  .progress-section {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #6366f1;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-text {
    flex-shrink: 0;
    font-size: 0.65rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .all-done {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 6px;
    margin: 0 8px;
  }

  .done-icon {
    color: #22c55e;
    font-size: 1rem;
  }

  .done-text {
    color: #22c55e;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .step-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    max-height: calc(100vh - 400px);
  }

  .step-list::-webkit-scrollbar {
    width: 4px;
  }

  .step-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .step-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
  }

  .stale-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    margin: 0 8px 4px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: 6px;
  }

  .stale-icon {
    font-size: 0.85rem;
    color: #f59e0b;
    flex-shrink: 0;
  }

  .stale-text {
    font-size: 0.7rem;
    color: #f59e0b;
    line-height: 1.3;
  }

  .stale-btn {
    margin-top: 4px;
    padding: 3px 8px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 4px;
    color: #f59e0b;
    font-size: 0.65rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .stale-btn:hover {
    background: rgba(245, 158, 11, 0.25);
  }
</style>
