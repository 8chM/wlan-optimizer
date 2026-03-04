<!--
  OptimierungHeader.svelte - Score display, Analyze button, sub-score bars, profile selector.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { AnalysisResult, ExpertProfile } from '$lib/recommendations/types';

  interface OptimierungHeaderProps {
    result: AnalysisResult | null;
    loading: boolean;
    profile: ExpertProfile;
    onAnalyze: () => void;
    onProfileChange: (profile: ExpertProfile) => void;
  }

  let { result, loading, profile, onAnalyze, onProfileChange }: OptimierungHeaderProps = $props();

  const PROFILES: Array<{ value: ExpertProfile; labelKey: string }> = [
    { value: 'conservative', labelKey: 'rec.profileConservative' },
    { value: 'balanced', labelKey: 'rec.profileBalanced' },
    { value: 'aggressive', labelKey: 'rec.profileAggressive' },
  ];

  function scoreColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#84cc16';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  }
</script>

<div class="opt-header">
  {#if result}
    <!-- Score display -->
    <div class="score-section">
      <span class="score-big" style="color: {scoreColor(result.overallScore)}">
        {Math.round(result.overallScore)}
      </span>
      <span class="score-label">/ 100</span>
    </div>

    <!-- Sub-scores -->
    <div class="sub-scores">
      {#each [
        { key: 'rec.coverage', val: result.coverageScore, color: '#22c55e' },
        { key: 'rec.overlap', val: result.overlapPenalty, color: '#f59e0b' },
        { key: 'rec.conflicts', val: result.conflictPenalty, color: '#ef4444' },
        { key: 'rec.roaming', val: result.roamingScore, color: '#3b82f6' },
      ] as sub}
        <div class="sub-row">
          <span class="sub-label">{t(sub.key)}</span>
          <div class="sub-bar">
            <div class="sub-fill" style="width: {Math.min(100, sub.val)}%; background: {sub.color}"></div>
          </div>
          <span class="sub-val">{Math.round(sub.val)}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Analyze button -->
  <button class="analyze-btn" onclick={onAnalyze} disabled={loading}>
    {#if loading}
      {t('opt.analyzing')}
    {:else if result}
      {t('opt.reanalyze')}
    {:else}
      {t('opt.analyzeSetup')}
    {/if}
  </button>

  <!-- Profile selector -->
  <div class="profile-row">
    <span class="profile-label">{t('opt.profileLabel')}</span>
    <div class="profile-btns">
      {#each PROFILES as p (p.value)}
        <button
          class="profile-btn"
          class:active={profile === p.value}
          onclick={() => onProfileChange(p.value)}
        >
          {t(p.labelKey)}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .opt-header {
    padding: 8px 0;
  }

  .score-section {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 8px;
  }

  .score-big {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .score-label {
    font-size: 0.8rem;
    color: #808090;
  }

  .sub-scores {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
  }

  .sub-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sub-label {
    font-size: 0.7rem;
    color: #808090;
    width: 64px;
    flex-shrink: 0;
  }

  .sub-bar {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .sub-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .sub-val {
    font-size: 0.65rem;
    color: #808090;
    width: 24px;
    text-align: right;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .analyze-btn {
    width: 100%;
    padding: 8px;
    background: #6366f1;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease;
    margin-bottom: 8px;
  }

  .analyze-btn:hover:not(:disabled) {
    background: #4f46e5;
  }

  .analyze-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .profile-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .profile-label {
    font-size: 0.7rem;
    color: #808090;
    flex-shrink: 0;
  }

  .profile-btns {
    display: flex;
    gap: 2px;
    flex: 1;
  }

  .profile-btn {
    flex: 1;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: #808090;
    font-size: 0.65rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .profile-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #c0c0d0;
  }

  .profile-btn.active {
    background: rgba(99, 102, 241, 0.2);
    border-color: rgba(99, 102, 241, 0.4);
    color: #a5b4fc;
  }
</style>
