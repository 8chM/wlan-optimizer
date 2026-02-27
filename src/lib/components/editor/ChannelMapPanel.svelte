<!--
  ChannelMapPanel.svelte - Panel showing channel assignment table and conflict details.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ChannelAnalysisResult } from '$lib/heatmap/channel-analysis';

  interface ChannelMapPanelProps {
    analysis: ChannelAnalysisResult | null;
    visible?: boolean;
    onToggle?: () => void;
  }

  let { analysis, visible = false, onToggle }: ChannelMapPanelProps = $props();

  const SEVERITY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#f97316',
    low: '#f59e0b',
  };
</script>

{#if visible && analysis}
  <div class="channel-panel">
    <div class="panel-header">
      <h3 class="panel-title">{t('channel.title')}</h3>
      <button class="close-btn" onclick={onToggle}>&times;</button>
    </div>

    <!-- Conflict summary -->
    {#if analysis.conflicts.length === 0}
      <div class="no-conflicts">
        <span class="check-icon">&#10003;</span>
        <span>{t('channel.noConflicts')}</span>
      </div>
    {:else}
      <div class="conflict-count">
        {analysis.conflicts.length} {t('channel.conflictsFound')}
      </div>
    {/if}

    <!-- AP channel table -->
    <div class="ap-table">
      {#each analysis.apSummaries as ap (ap.apId)}
        <div class="ap-row" class:has-conflicts={ap.totalConflicts > 0}>
          <span class="ap-label">{ap.label}</span>
          <span class="ap-channel">CH {ap.channel}</span>
          {#if ap.totalConflicts > 0}
            <span class="conflict-badge" style="background: {SEVERITY_COLORS[ap.worstSeverity]}">
              {ap.totalConflicts}
            </span>
          {:else}
            <span class="ok-badge">OK</span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Conflict details -->
    {#if analysis.conflicts.length > 0}
      <div class="conflict-list">
        {#each analysis.conflicts.slice(0, 5) as conflict (conflict.ap1Id + conflict.ap2Id)}
          <div class="conflict-item">
            <div class="conflict-header">
              <span
                class="conflict-type"
                style="color: {conflict.type === 'co-channel' ? '#ef4444' : '#f97316'}"
              >
                {conflict.type === 'co-channel' ? t('channel.coChannel') : t('channel.adjacent')}
              </span>
              <span class="conflict-score">{(conflict.score * 100).toFixed(0)}%</span>
            </div>
            <div class="conflict-detail">
              CH {conflict.channel1} ↔ CH {conflict.channel2} ({conflict.distanceM.toFixed(1)}m)
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .channel-panel {
    position: absolute;
    bottom: 12px;
    left: 12px;
    width: 220px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    max-height: 50vh;
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .panel-title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .close-btn {
    background: none;
    border: none;
    color: #808090;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .close-btn:hover {
    color: #e0e0f0;
  }

  .no-conflicts {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 6px;
    font-size: 0.75rem;
    color: #4ade80;
    margin-bottom: 8px;
  }

  .check-icon {
    font-weight: bold;
  }

  .conflict-count {
    font-size: 0.75rem;
    color: #f97316;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .ap-table {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 8px;
  }

  .ap-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 4px;
    font-size: 0.7rem;
  }

  .ap-row.has-conflicts {
    border-left: 2px solid #f97316;
  }

  .ap-label {
    flex: 1;
    color: #c0c0d0;
    font-weight: 500;
  }

  .ap-channel {
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.65rem;
  }

  .conflict-badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.6rem;
    font-weight: 700;
    color: #fff;
    min-width: 18px;
    text-align: center;
  }

  .ok-badge {
    font-size: 0.6rem;
    font-weight: 600;
    color: #4ade80;
  }

  .conflict-list {
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .conflict-item {
    padding: 4px 0;
  }

  .conflict-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .conflict-type {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .conflict-score {
    font-size: 0.65rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .conflict-detail {
    font-size: 0.65rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
</style>
