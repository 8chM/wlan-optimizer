<!--
  RecommendationPanel.svelte - Floating panel showing analysis score and recommendations.

  Displays:
  - Overall score with sub-score bars
  - Profile selector (Conservative / Balanced / Aggressive)
  - Grouped recommendations by severity
  - Feasibility, effort, and benefit indicators
  - Expandable detail sections with before/after coverage bars
  - Blocked recommendations with constraint reasons
  - Rejection workflow buttons
  - Click to highlight affected zones on the map
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { recommendationStore } from '$lib/stores/recommendationStore.svelte';
  import type {
    Recommendation,
    RecommendationSeverity,
    ExpertProfile,
    RejectionReason,
    EffortLevel,
  } from '$lib/recommendations/types';
  import { EFFORT_LEVELS, RECOMMENDATION_CATEGORIES } from '$lib/recommendations/types';

  interface RecommendationPanelProps {
    visible: boolean;
    hasHeatmap: boolean;
    onAnalyze: () => void;
    onPreview?: (rec: Recommendation) => void;
    onApply?: () => void;
    onCancelPreview?: () => void;
    onSendToMixing?: (rec: Recommendation) => void;
  }

  let { visible, hasHeatmap, onAnalyze, onPreview, onApply, onCancelPreview, onSendToMixing }: RecommendationPanelProps = $props();

  /** Interpolate {param} placeholders in a translated string */
  function interpolate(text: string, params: Record<string, string | number>): string {
    let result = text;
    for (const [key, value] of Object.entries(params)) {
      result = result.replaceAll(`{${key}}`, String(value));
    }
    return result;
  }

  const PROFILES: Array<{ value: ExpertProfile; labelKey: string }> = [
    { value: 'conservative', labelKey: 'rec.profileConservative' },
    { value: 'balanced', labelKey: 'rec.profileBalanced' },
    { value: 'aggressive', labelKey: 'rec.profileAggressive' },
  ];

  const SEVERITY_ORDER: RecommendationSeverity[] = ['critical', 'warning', 'info'];
  const SEVERITY_KEYS: Record<RecommendationSeverity, string> = {
    critical: 'rec.severityCritical',
    warning: 'rec.severityWarning',
    info: 'rec.severityInfo',
  };
  const SEVERITY_COLORS: Record<RecommendationSeverity, string> = {
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

  let expandedRecId = $state<string | null>(null);
  let rejectingRecId = $state<string | null>(null);

  let grouped = $derived.by(() => {
    const recs = recommendationStore.result?.recommendations ?? [];
    const groups: Record<RecommendationSeverity, Recommendation[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    for (const rec of recs) {
      groups[rec.severity].push(rec);
    }
    return groups;
  });

  function handleRecClick(rec: Recommendation) {
    if (recommendationStore.selectedRecommendationId === rec.id) {
      recommendationStore.selectRecommendation(null);
    } else {
      recommendationStore.selectRecommendation(rec.id);
    }
  }

  function toggleExpand(recId: string) {
    expandedRecId = expandedRecId === recId ? null : recId;
  }

  function handleReject(recId: string, reason: RejectionReason) {
    recommendationStore.rejectAndRecompute(recId, reason);
    rejectingRecId = null;
  }

  function scoreColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#84cc16';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  }

  function feasibilityColor(score: number | undefined): string {
    if (score === undefined) return '#808090';
    if (score >= 70) return '#22c55e';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  }

  function isBlocked(rec: Recommendation): boolean {
    return (rec.blockedByConstraints?.length ?? 0) > 0;
  }

  const EFFORT_COLORS: Record<EffortLevel, string> = {
    config: '#22c55e',
    minor_physical: '#f59e0b',
    major_physical: '#f97316',
    infrastructure: '#ef4444',
  };

  const EFFORT_LABEL_KEYS: Record<EffortLevel, string> = {
    config: 'rec.effortConfig',
    minor_physical: 'rec.effortMinorPhysical',
    major_physical: 'rec.effortMajorPhysical',
    infrastructure: 'rec.effortInfrastructure',
  };

  function getEffortLevel(rec: Recommendation): EffortLevel {
    return EFFORT_LEVELS[rec.type] ?? 'config';
  }

  function isSendToMixingEligible(rec: Recommendation): boolean {
    return RECOMMENDATION_CATEGORIES[rec.type] === 'actionable_config'
      && !isBlocked(rec) && !!rec.suggestedChange?.apId;
  }

  function isRejectableType(rec: Recommendation): boolean {
    const cat = RECOMMENDATION_CATEGORIES[rec.type];
    return cat === 'instructional' || cat === 'actionable_create';
  }

  function hasPreviewSupport(rec: Recommendation): boolean {
    return !!rec.suggestedChange?.apId && !isBlocked(rec);
  }

  let alternativesExpandedId = $state<string | null>(null);
</script>

{#if visible}
  <div class="rec-panel">
    <div class="rec-header">
      <span class="rec-title">{t('rec.panelTitle')}</span>
    </div>

    {#if !hasHeatmap}
      <div class="rec-empty">{t('rec.noHeatmap')}</div>
    {:else if recommendationStore.result}
      {@const result = recommendationStore.result}

      <!-- Overall score -->
      <div class="score-row">
        <span class="score-label">{t('rec.score')}</span>
        <span class="score-value" style="color: {scoreColor(result.overallScore)}">
          {Math.round(result.overallScore)}/100
        </span>
      </div>

      <!-- Sub-scores -->
      <div class="sub-scores">
        <div class="sub-score">
          <span class="sub-label">{t('rec.coverage')}</span>
          <div class="sub-bar">
            <div class="sub-fill" style="width: {Math.min(100, result.coverageScore)}%; background: #22c55e"></div>
          </div>
          <span class="sub-val">{Math.round(result.coverageScore)}%</span>
        </div>
        <div class="sub-score">
          <span class="sub-label">{t('rec.overlap')}</span>
          <div class="sub-bar">
            <div class="sub-fill" style="width: {Math.min(100, result.overlapPenalty)}%; background: #f59e0b"></div>
          </div>
          <span class="sub-val">{Math.round(result.overlapPenalty)}%</span>
        </div>
        <div class="sub-score">
          <span class="sub-label">{t('rec.conflicts')}</span>
          <div class="sub-bar">
            <div class="sub-fill" style="width: {Math.min(100, result.conflictPenalty)}%; background: #ef4444"></div>
          </div>
          <span class="sub-val">{Math.round(result.conflictPenalty)}%</span>
        </div>
        <div class="sub-score">
          <span class="sub-label">{t('rec.roaming')}</span>
          <div class="sub-bar">
            <div class="sub-fill" style="width: {Math.min(100, result.roamingScore)}%; background: #3b82f6"></div>
          </div>
          <span class="sub-val">{Math.round(result.roamingScore)}%</span>
        </div>
      </div>

      <!-- Profile selector -->
      <div class="profile-row">
        <span class="profile-label">{t('rec.profile')}</span>
        <div class="profile-buttons">
          {#each PROFILES as p (p.value)}
            <button
              class="profile-btn"
              class:active={recommendationStore.profile === p.value}
              onclick={() => { recommendationStore.setProfile(p.value); onAnalyze(); }}
            >
              {t(p.labelKey)}
            </button>
          {/each}
        </div>
      </div>

      <!-- Recommendations grouped by severity -->
      {#if result.recommendations.length === 0}
        <div class="rec-empty">{t('rec.noRecommendations')}</div>
      {:else}
        <div class="rec-list">
          {#each SEVERITY_ORDER as severity (severity)}
            {#if grouped[severity].length > 0}
              <div class="severity-group">
                <div class="severity-header" style="color: {SEVERITY_COLORS[severity]}">
                  {t(SEVERITY_KEYS[severity])} ({grouped[severity].length})
                </div>
                {#each grouped[severity] as rec (rec.id)}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="rec-card"
                    class:selected={recommendationStore.selectedRecommendationId === rec.id}
                    class:blocked={isBlocked(rec)}
                    class:previewing={recommendationStore.previewingRecId === rec.id}
                    onclick={() => handleRecClick(rec)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRecClick(rec); }}
                    role="button"
                    tabindex="0"
                  >
                    <div class="rec-card-header">
                      <span class="rec-severity-dot" style="background: {SEVERITY_COLORS[rec.severity]}"></span>
                      <span class="rec-card-title">
                        {interpolate(t(rec.titleKey), rec.titleParams)}
                      </span>
                      <span class="effort-badge" style="color: {EFFORT_COLORS[getEffortLevel(rec)]}; border-color: {EFFORT_COLORS[getEffortLevel(rec)]}30">
                        {t(EFFORT_LABEL_KEYS[getEffortLevel(rec)])}
                      </span>
                    </div>
                    <div class="rec-card-reason">
                      {interpolate(t(rec.reasonKey), rec.reasonParams)}
                    </div>

                    <!-- Feasibility indicators -->
                    {#if rec.feasibilityScore !== undefined}
                      <div class="feasibility-row">
                        <span class="feas-badge" style="color: {feasibilityColor(rec.feasibilityScore)}">
                          {t('rec.feasibility')}: {Math.round(rec.feasibilityScore)}%
                        </span>
                        {#if rec.effortScore !== undefined}
                          <span class="feas-badge effort">
                            {t('rec.effort')}: {Math.round(rec.effortScore)}%
                          </span>
                        {/if}
                        {#if rec.infrastructureRequired}
                          <span class="feas-badge infra">{t('rec.infraNeeded')}</span>
                        {/if}
                      </div>
                    {/if}

                    <!-- Blocked indicator -->
                    {#if isBlocked(rec)}
                      <div class="blocked-info">
                        <span class="blocked-label">{t('rec.blocked')}</span>
                        {#each rec.blockedByConstraints ?? [] as reason}
                          <span class="blocked-reason">{reason}</span>
                        {/each}
                      </div>
                    {/if}

                    <!-- Distance to ideal -->
                    {#if rec.distanceToIdeal !== undefined && rec.distanceToIdeal > 0.5}
                      <div class="dist-info">
                        {interpolate(t('rec.distToIdeal'), { distance: Math.round(rec.distanceToIdeal * 10) / 10 })}
                      </div>
                    {/if}

                    {#if rec.simulatedDelta}
                      <div class="rec-delta">
                        <span class="delta-score">
                          {Math.round(rec.simulatedDelta.scoreBefore)} &rarr;
                          {Math.round(rec.simulatedDelta.scoreAfter)}
                        </span>
                        <span
                          class="delta-pct"
                          class:positive={rec.simulatedDelta.changePercent > 0}
                          class:negative={rec.simulatedDelta.changePercent < 0}
                        >
                          ({rec.simulatedDelta.changePercent > 0 ? '+' : ''}{Math.round(rec.simulatedDelta.changePercent)}%)
                        </span>
                      </div>
                    {/if}

                    <!-- Expandable details -->
                    {#if rec.simulatedDelta}
                      <button
                        class="details-toggle"
                        onclick={(e: MouseEvent) => { e.stopPropagation(); toggleExpand(rec.id); }}
                      >
                        {expandedRecId === rec.id ? '▾' : '▸'} {t('rec.details')}
                      </button>

                      {#if expandedRecId === rec.id}
                        <div class="details-content">
                          <div class="detail-row">
                            <span class="detail-label">{t('rec.before')}</span>
                            <div class="coverage-mini-bar">
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageBefore.excellent}%; background: #22c55e" title="Excellent"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageBefore.good}%; background: #84cc16" title="Good"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageBefore.fair}%; background: #f59e0b" title="Fair"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageBefore.poor}%; background: #f97316" title="Poor"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageBefore.none}%; background: #ef4444" title="None"></div>
                            </div>
                          </div>
                          <div class="detail-row">
                            <span class="detail-label">{t('rec.after')}</span>
                            <div class="coverage-mini-bar">
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageAfter.excellent}%; background: #22c55e" title="Excellent"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageAfter.good}%; background: #84cc16" title="Good"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageAfter.fair}%; background: #f59e0b" title="Fair"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageAfter.poor}%; background: #f97316" title="Poor"></div>
                              <div class="mini-seg" style="width: {rec.simulatedDelta.coverageAfter.none}%; background: #ef4444" title="None"></div>
                            </div>
                          </div>
                        </div>
                      {/if}
                    {/if}

                    <!-- Action buttons: Preview / Apply -->
                    {#if hasPreviewSupport(rec)}
                      <div class="action-row">
                        {#if recommendationStore.previewingRecId === rec.id}
                          <button
                            class="action-btn cancel-btn"
                            onclick={(e: MouseEvent) => { e.stopPropagation(); onCancelPreview?.(); }}
                          >
                            {t('rec.cancelPreview')}
                          </button>
                          <button
                            class="action-btn apply-btn"
                            onclick={(e: MouseEvent) => { e.stopPropagation(); onApply?.(); }}
                          >
                            {t('rec.apply')}
                          </button>
                        {:else}
                          <button
                            class="action-btn preview-btn"
                            disabled={recommendationStore.isPreviewActive}
                            onclick={(e: MouseEvent) => { e.stopPropagation(); onPreview?.(rec); }}
                          >
                            {t('rec.preview')}
                          </button>
                        {/if}
                      </div>
                    {/if}

                    <!-- Send to Mixing (actionable_config only) -->
                    {#if isSendToMixingEligible(rec)}
                      <button
                        class="mixing-btn"
                        onclick={(e: MouseEvent) => { e.stopPropagation(); onSendToMixing?.(rec); }}
                      >
                        {t('rec.sendToMixing')}
                      </button>
                    {/if}

                    <!-- Alternatives section -->
                    {#if rec.alternativeRecommendations && rec.alternativeRecommendations.length > 0}
                      <button
                        class="details-toggle"
                        onclick={(e: MouseEvent) => {
                          e.stopPropagation();
                          alternativesExpandedId = alternativesExpandedId === rec.id ? null : rec.id;
                        }}
                      >
                        {alternativesExpandedId === rec.id ? '\u25BE' : '\u25B8'} {t('rec.alternativesLabel')} ({rec.alternativeRecommendations.length})
                      </button>
                      {#if alternativesExpandedId === rec.id}
                        <div class="alternatives-list">
                          {#each rec.alternativeRecommendations as alt (alt.id)}
                            {@const altEffort = getEffortLevel(alt)}
                            <div class="alt-card">
                              <span class="alt-title">
                                {interpolate(t(alt.titleKey), alt.titleParams)}
                              </span>
                              <div class="alt-meta">
                                <span class="effort-badge" style="color: {EFFORT_COLORS[altEffort]}; border-color: {EFFORT_COLORS[altEffort]}30">
                                  {t(EFFORT_LABEL_KEYS[altEffort])}
                                </span>
                                {#if alt.recommendationScore}
                                  <span class="alt-score">{Math.round(alt.recommendationScore)}</span>
                                {/if}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    {/if}

                    <!-- Rejection button (instructional + actionable_create only) -->
                    {#if !isBlocked(rec) && isRejectableType(rec)}
                      <button
                        class="reject-toggle"
                        onclick={(e: MouseEvent) => {
                          e.stopPropagation();
                          rejectingRecId = rejectingRecId === rec.id ? null : rec.id;
                        }}
                      >
                        {t('rec.rejectBtn')}
                      </button>

                      {#if rejectingRecId === rec.id}
                        <div class="reject-options">
                          {#each REJECTION_OPTIONS as opt (opt.reason)}
                            <button
                              class="reject-option"
                              onclick={(e: MouseEvent) => {
                                e.stopPropagation();
                                handleReject(rec.id, opt.reason);
                              }}
                            >
                              {t(opt.labelKey)}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      <!-- Re-analyze button -->
      <button class="analyze-btn" onclick={onAnalyze} disabled={recommendationStore.loading}>
        {recommendationStore.loading ? t('rec.analyzing') : t('rec.reanalyze')}
      </button>
    {:else}
      {#if recommendationStore.loading}
        <div class="rec-empty">{t('rec.analyzing')}</div>
      {:else}
        <div class="rec-empty">{t('rec.noAnalysis')}</div>
        <button class="analyze-btn" onclick={onAnalyze}>
          {t('rec.analyze')}
        </button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .rec-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 280px;
    max-height: calc(100vh - 180px);
    overflow-y: auto;
    background: rgba(26, 26, 46, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .rec-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .rec-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .rec-empty {
    font-size: 0.65rem;
    color: #808090;
    text-align: center;
    padding: 12px 0;
  }

  /* ── Score ─────────────────────────────────────────── */

  .score-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .score-label {
    font-size: 0.7rem;
    color: #808090;
    font-weight: 500;
  }

  .score-value {
    font-size: 1rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* ── Sub-scores ────────────────────────────────────── */

  .sub-scores {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .sub-score {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sub-label {
    font-size: 0.6rem;
    color: #808090;
    width: 55px;
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
    font-size: 0.6rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    width: 28px;
    text-align: right;
  }

  /* ── Profile selector ──────────────────────────────── */

  .profile-row {
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .profile-label {
    display: block;
    font-size: 0.65rem;
    color: #808090;
    margin-bottom: 4px;
    font-weight: 500;
  }

  .profile-buttons {
    display: flex;
    gap: 4px;
  }

  .profile-btn {
    flex: 1;
    padding: 3px 4px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: #a0a0b0;
    font-size: 0.6rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .profile-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #c0c0d0;
  }

  .profile-btn.active {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.4);
    color: #e0e0f0;
    font-weight: 600;
  }

  /* ── Recommendations list ──────────────────────────── */

  .rec-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }

  .severity-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .severity-header {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 2px 0;
  }

  .rec-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    color: inherit;
    width: 100%;
  }

  .rec-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .rec-card.selected {
    background: rgba(74, 108, 247, 0.1);
    border-color: rgba(74, 108, 247, 0.3);
  }

  .rec-card.blocked {
    opacity: 0.55;
    border-style: dashed;
  }

  .rec-card-header {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .rec-severity-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .rec-card-title {
    font-size: 0.65rem;
    font-weight: 600;
    color: #e0e0f0;
  }

  .rec-card-reason {
    font-size: 0.6rem;
    color: #808090;
    line-height: 1.3;
  }

  /* ── Feasibility row ─────────────────────────────── */

  .feasibility-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .feas-badge {
    font-size: 0.55rem;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
  }

  .feas-badge.effort {
    color: #c0c0d0;
  }

  .feas-badge.infra {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  /* ── Blocked info ────────────────────────────────── */

  .blocked-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px 5px;
    background: rgba(239, 68, 68, 0.08);
    border-radius: 4px;
    margin-top: 2px;
  }

  .blocked-label {
    font-size: 0.6rem;
    font-weight: 600;
    color: #ef4444;
  }

  .blocked-reason {
    font-size: 0.55rem;
    color: #808090;
  }

  /* ── Distance info ───────────────────────────────── */

  .dist-info {
    font-size: 0.55rem;
    color: #808090;
    font-style: italic;
  }

  .rec-delta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .delta-score {
    color: #a0a0b0;
  }

  .delta-pct {
    font-weight: 600;
  }

  .delta-pct.positive {
    color: #22c55e;
  }

  .delta-pct.negative {
    color: #ef4444;
  }

  /* ── Details toggle ────────────────────────────────── */

  .details-toggle {
    background: none;
    border: none;
    color: #808090;
    font-size: 0.6rem;
    cursor: pointer;
    padding: 2px 0;
    text-align: left;
  }

  .details-toggle:hover {
    color: #c0c0d0;
  }

  .details-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
  }

  .detail-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .detail-label {
    font-size: 0.55rem;
    color: #808090;
    width: 36px;
    flex-shrink: 0;
  }

  .coverage-mini-bar {
    flex: 1;
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
  }

  .mini-seg {
    height: 100%;
    transition: width 0.3s ease;
  }

  /* ── Rejection ─────────────────────────────────────── */

  .reject-toggle {
    background: none;
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 3px;
    color: #808090;
    font-size: 0.55rem;
    cursor: pointer;
    padding: 2px 6px;
    text-align: center;
    margin-top: 2px;
    transition: all 0.15s ease;
  }

  .reject-toggle:hover {
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.05);
  }

  .reject-options {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 4px 0;
  }

  .reject-option {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 3px;
    color: #c0c0d0;
    font-size: 0.55rem;
    cursor: pointer;
    padding: 2px 5px;
    transition: all 0.15s ease;
  }

  .reject-option:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
    color: #e0e0f0;
  }

  /* ── Analyze button ────────────────────────────────── */

  .analyze-btn {
    width: 100%;
    padding: 6px;
    background: rgba(74, 108, 247, 0.15);
    border: 1px solid rgba(74, 108, 247, 0.3);
    border-radius: 5px;
    color: #a5b4fc;
    font-size: 0.65rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .analyze-btn:hover:not(:disabled) {
    background: rgba(74, 108, 247, 0.25);
    border-color: rgba(74, 108, 247, 0.5);
  }

  .analyze-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Send to Mixing button ───────────────────────── */

  .mixing-btn {
    width: 100%;
    padding: 3px 6px;
    background: rgba(139, 92, 246, 0.08);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 3px;
    color: #a78bfa;
    font-size: 0.55rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
    margin-top: 2px;
  }

  .mixing-btn:hover {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.4);
    color: #c4b5fd;
  }

  /* ── Effort badge ──────────────────────────────────── */

  .effort-badge {
    font-size: 0.5rem;
    padding: 1px 4px;
    border: 1px solid;
    border-radius: 3px;
    white-space: nowrap;
    margin-left: auto;
    flex-shrink: 0;
  }

  /* ── Action buttons ────────────────────────────────── */

  .action-row {
    display: flex;
    gap: 4px;
    margin-top: 3px;
  }

  .action-btn {
    flex: 1;
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 0.55rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }

  .preview-btn {
    background: rgba(74, 108, 247, 0.1);
    border: 1px solid rgba(74, 108, 247, 0.3);
    color: #a5b4fc;
  }

  .preview-btn:hover:not(:disabled) {
    background: rgba(74, 108, 247, 0.2);
    border-color: rgba(74, 108, 247, 0.5);
  }

  .preview-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .apply-btn {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }

  .apply-btn:hover {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.5);
  }

  .cancel-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #a0a0b0;
  }

  .cancel-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #e0e0f0;
  }

  /* ── Previewing state ──────────────────────────────── */

  .rec-card.previewing {
    border-color: rgba(245, 158, 11, 0.5);
    animation: preview-card-pulse 2s ease-in-out infinite;
  }

  @keyframes preview-card-pulse {
    0%, 100% { border-color: rgba(245, 158, 11, 0.5); }
    50% { border-color: rgba(245, 158, 11, 0.9); }
  }

  /* ── Alternatives ──────────────────────────────────── */

  .alternatives-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0;
  }

  .alt-card {
    padding: 3px 5px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 4px;
  }

  .alt-title {
    font-size: 0.55rem;
    color: #a0a0b0;
    display: block;
  }

  .alt-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
  }

  .alt-score {
    font-size: 0.5rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #808090;
  }
</style>
