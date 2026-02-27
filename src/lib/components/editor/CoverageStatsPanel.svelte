<!--
  CoverageStatsPanel.svelte - Mini bar chart showing signal quality distribution.

  Displays coverage percentage and a color-coded bar for each quality tier.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { CoverageStats } from '$lib/heatmap/coverage-stats';

  interface CoverageStatsPanelProps {
    stats: CoverageStats | null;
  }

  let { stats }: CoverageStatsPanelProps = $props();

  const TIER_COLORS: Record<string, string> = {
    excellent: '#22c55e',
    good: '#84cc16',
    fair: '#f59e0b',
    poor: '#f97316',
    none: '#ef4444',
  };

  type TierKey = 'excellent' | 'good' | 'fair' | 'poor' | 'none';

  const TIERS: Array<{ key: TierKey; labelKey: string }> = [
    { key: 'excellent', labelKey: 'signal.excellent' },
    { key: 'good', labelKey: 'signal.good' },
    { key: 'fair', labelKey: 'signal.fair' },
    { key: 'poor', labelKey: 'signal.poor' },
    { key: 'none', labelKey: 'signal.none' },
  ];
</script>

{#if stats}
  <div class="coverage-panel">
    <div class="coverage-header">
      <span class="label">{t('heatmap.coverage')}</span>
      <span class="coverage-value">{stats.coveragePercent.toFixed(0)}%</span>
    </div>

    <!-- Stacked bar -->
    <div class="stacked-bar">
      {#each TIERS as tier (tier.key)}
        {#if stats.percentages[tier.key] > 0}
          <div
            class="bar-segment"
            style="width: {stats.percentages[tier.key]}%; background: {TIER_COLORS[tier.key]}"
            title="{t(tier.labelKey)}: {stats.percentages[tier.key].toFixed(1)}%"
          ></div>
        {/if}
      {/each}
    </div>

    <!-- Legend rows -->
    <div class="coverage-rows">
      {#each TIERS as tier (tier.key)}
        <div class="coverage-row">
          <span class="tier-dot" style="background: {TIER_COLORS[tier.key]}"></span>
          <span class="tier-label">{t(tier.labelKey)}</span>
          <span class="tier-pct">{stats.percentages[tier.key].toFixed(1)}%</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .coverage-panel {
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .coverage-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .label {
    font-size: 0.7rem;
    font-weight: 500;
    color: #808090;
  }

  .coverage-value {
    font-size: 0.85rem;
    font-weight: 700;
    color: #a5b4fc;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .stacked-bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
    margin-bottom: 8px;
  }

  .bar-segment {
    height: 100%;
    transition: width 0.3s ease;
  }

  .coverage-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .coverage-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tier-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tier-label {
    flex: 1;
    font-size: 0.65rem;
    color: #a0a0b0;
  }

  .tier-pct {
    font-size: 0.65rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
    min-width: 36px;
    text-align: right;
  }
</style>
