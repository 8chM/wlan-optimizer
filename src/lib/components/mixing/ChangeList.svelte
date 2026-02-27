<!--
  ChangeList.svelte - Table/list showing all parameter changes.

  Features:
  - AP name, parameter (localized), old value, new value, status
  - Compact, scrollable layout
  - Status indicators: pending (amber) / applied (green)
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { AccessPointResponse } from '$lib/api/invoke';
  import type { APChange } from '$lib/stores/mixingStore.svelte';

  // ─── Props ─────────────────────────────────────────────────────

  interface ChangeListProps {
    /** All current changes */
    changes: APChange[];
    /** Access points (for label lookup) */
    accessPoints: AccessPointResponse[];
  }

  let {
    changes,
    accessPoints,
  }: ChangeListProps = $props();

  // ─── Helpers ──────────────────────────────────────────────────

  /** Get AP label by ID */
  function getApLabel(apId: string): string {
    const ap = accessPoints.find((a) => a.id === apId);
    return ap?.label ?? 'AP';
  }

  /** Localize parameter name */
  function localizeParam(parameter: string): string {
    const paramMap: Record<string, string> = {
      tx_power_24ghz: `${t('mixing.txPower')} 2.4 GHz`,
      tx_power_5ghz: `${t('mixing.txPower')} 5 GHz`,
      channel_24ghz: `${t('mixing.channel')} 2.4 GHz`,
      channel_5ghz: `${t('mixing.channel')} 5 GHz`,
      channel_width: t('mixing.channelWidth'),
    };
    return paramMap[parameter] ?? parameter;
  }

  /** Format value with appropriate unit */
  function formatValue(parameter: string, value: string | null): string {
    if (value === null || value === '') return '-';
    if (parameter.startsWith('tx_power_')) return `${value} dBm`;
    if (parameter === 'channel_width') return `${value} MHz`;
    return value;
  }
</script>

<div class="change-list">
  <h3 class="section-title">{t('mixing.changeList')}</h3>

  {#if changes.length === 0}
    <p class="empty-text">{t('mixing.noChanges')}</p>
  {:else}
    <div class="change-table">
      <!-- Header -->
      <div class="table-header">
        <span class="col-ap">{t('toolbar.ap')}</span>
        <span class="col-param">{t('mixing.parameter')}</span>
        <span class="col-values">{t('mixing.oldValue')} / {t('mixing.newValue')}</span>
        <span class="col-status">{t('mixing.status')}</span>
      </div>

      <!-- Rows -->
      <div class="table-body">
        {#each changes as change (`${change.apId}::${change.parameter}`)}
          <div class="table-row" class:applied={change.applied}>
            <span class="col-ap">{getApLabel(change.apId)}</span>
            <span class="col-param">{localizeParam(change.parameter)}</span>
            <span class="col-values">
              <span class="old-val">{formatValue(change.parameter, change.oldValue)}</span>
              <span class="arrow">&rarr;</span>
              <span class="new-val">{formatValue(change.parameter, change.newValue)}</span>
            </span>
            <span class="col-status">
              {#if change.applied}
                <span class="status-badge applied">{t('mixing.applied')}</span>
              {:else}
                <span class="status-badge pending">{t('mixing.pending')}</span>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .change-list {
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

  .change-table {
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 50px 1fr 1fr 60px;
    gap: 4px;
    padding: 5px 6px;
    background: rgba(255, 255, 255, 0.04);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.6rem;
    font-weight: 600;
    color: #808090;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .table-body {
    max-height: 200px;
    overflow-y: auto;
  }

  .table-body::-webkit-scrollbar {
    width: 3px;
  }

  .table-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .table-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 50px 1fr 1fr 60px;
    gap: 4px;
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    font-size: 0.65rem;
    color: #a0a0b0;
    transition: background 0.15s ease;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .table-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .table-row.applied {
    background: rgba(34, 197, 94, 0.04);
  }

  .col-ap {
    font-weight: 600;
    color: #c0c0d0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-param {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-values {
    display: flex;
    align-items: center;
    gap: 3px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .old-val {
    color: #808090;
    text-decoration: line-through;
  }

  .arrow {
    color: #606070;
    font-size: 0.6rem;
  }

  .new-val {
    color: #fbbf24;
    font-weight: 600;
  }

  .col-status {
    text-align: right;
  }

  .status-badge {
    display: inline-block;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.6rem;
    font-weight: 600;
  }

  .status-badge.pending {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .status-badge.applied {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }
</style>
