<!--
  PointInspectorOverlay.svelte - Debug overlay showing RF details at a point.

  Triggered by Alt+Click on the canvas. Shows per-AP breakdown of:
  2D/3D distance, path loss, wall hits with material types, mounting sector,
  downlink/uplink RSSI, best/second-best AP analysis.
  Transient: no persistent state.
-->
<script lang="ts">
  import type { PointDebugResult, PerApDebug } from '$lib/heatmap/point-inspector';
  import type { HitGroup } from '$lib/heatmap/spatial-grid';

  interface PointInspectorOverlayProps {
    /** Debug result to display, or null to hide */
    result: PointDebugResult | null;
    /** Callback to close the overlay */
    onClose?: () => void;
    /** Callback when user clicks an AP row to select it for hit-trace */
    onSelectAp?: (apId: string) => void;
  }

  let { result, onClose, onSelectAp }: PointInspectorOverlayProps = $props();

  /** Currently expanded AP ID for segment hit details */
  let expandedApId = $state<string | null>(null);

  /** Currently expanded group index within an AP detail view */
  let expandedGroupIdx = $state<number | null>(null);

  function rssiColor(rssi: number): string {
    if (rssi >= -45) return '#4caf50';
    if (rssi >= -60) return '#8bc34a';
    if (rssi >= -70) return '#ff9800';
    if (rssi >= -80) return '#f44336';
    return '#9e9e9e';
  }

  function sectorLabel(sector: string): string {
    switch (sector) {
      case 'ceiling': return 'Ceil';
      case 'front': return 'Front';
      case 'side': return 'Side';
      case 'back': return 'Back';
      default: return sector;
    }
  }

  function sectorColor(sector: string): string {
    switch (sector) {
      case 'ceiling': return '#64b5f6';
      case 'front': return '#4caf50';
      case 'side': return '#ff9800';
      case 'back': return '#f44336';
      default: return '#808090';
    }
  }

  function toggleExpand(apId: string) {
    expandedApId = expandedApId === apId ? null : apId;
    onSelectAp?.(apId);
  }

  function hitCategoryString(counts: Record<string, number>): string {
    return Object.entries(counts)
      .map(([k, v]) => `${v}x ${k}`)
      .join(', ');
  }

  function actionBadgeColor(action: string): string {
    switch (action) {
      case 'same_barrier_merged': return '#ffeb3b';
      case 'opening_replaced_wall': return '#4caf50';
      default: return '#808090';
    }
  }

  function actionBadgeLabel(action: string): string {
    switch (action) {
      case 'kept': return 'kept';
      case 'same_barrier_merged': return 'merged';
      case 'opening_replaced_wall': return 'opening';
      default: return action;
    }
  }

  function groupSummaryLine(groups: HitGroup[], rawHitCount: number): string {
    const merged = groups.filter(g => g.action === 'same_barrier_merged').length;
    const replaced = groups.filter(g => g.action === 'opening_replaced_wall').length;
    const parts: string[] = [];
    if (merged > 0) parts.push(`${merged} merged`);
    if (replaced > 0) parts.push(`${replaced} opening replaced`);
    const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    return `${rawHitCount} raw hits \u2192 ${groups.length} groups${suffix}`;
  }

  function toggleGroupExpand(idx: number) {
    expandedGroupIdx = expandedGroupIdx === idx ? null : idx;
  }

  // Reset expanded AP and group when result changes
  $effect(() => {
    if (result) {
      expandedApId = null;
      expandedGroupIdx = null;
    }
  });

  // Reset expanded group when a different AP is expanded
  $effect(() => {
    expandedApId;
    expandedGroupIdx = null;
  });
</script>

{#if result}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="inspector-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="inspector-panel" onclick={(e) => e.stopPropagation()}>
      <div class="inspector-header">
        <span class="inspector-title">Point Inspector</span>
        <span class="inspector-coords">({result.pointX}, {result.pointY}) m</span>
        <span class="inspector-band">{result.band}</span>
        <button class="close-btn" onclick={onClose}>&#x2715;</button>
      </div>

      <div class="inspector-summary">
        <div class="summary-row">
          <span class="summary-label">Effective RSSI:</span>
          <span class="summary-value" style="color: {rssiColor(result.effectiveRssi)}">
            {result.effectiveRssi} dBm
          </span>
          <span class="summary-label">Best:</span>
          <span class="summary-value-small">{result.bestApId || '-'}</span>
        </div>
        {#if result.secondBestApId}
          <div class="summary-row">
            <span class="summary-label">2nd best:</span>
            <span class="summary-value-small">{result.secondBestApId}</span>
            <span class="summary-label">Delta:</span>
            <span class="summary-value-small">{result.secondBestDelta} dB</span>
          </div>
        {/if}
      </div>

      {#if result.perAp.length > 0}
        <table class="inspector-table">
          <thead>
            <tr>
              <th class="th-left">AP</th>
              <th>2D</th>
              <th>3D</th>
              <th>PL</th>
              <th>Walls</th>
              <th>WL</th>
              <th>Mount</th>
              <th>MtdB</th>
              <th>DL</th>
              <th>UL</th>
              <th>Eff</th>
            </tr>
          </thead>
          <tbody>
            {#each result.perAp as ap (ap.apId)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <tr
                class:best={ap.isBest}
                class:expandable={ap.hitGroups.length > 0 || ap.segmentHits.length > 0}
                onclick={() => toggleExpand(ap.apId)}
              >
                <td class="ap-id">{ap.apLabel}</td>
                <td>{ap.distance2D}m</td>
                <td>{ap.distance3D}m</td>
                <td>{ap.pathLossDb}</td>
                <td>{ap.wallsHit}{#if ap.rawHitCount > ap.wallsHit} <span class="raw-count">({ap.rawHitCount} raw)</span>{/if}</td>
                <td>{ap.wallLossDb}</td>
                <td>
                  <span class="sector-badge" style="color: {sectorColor(ap.mountingSector)}">
                    {sectorLabel(ap.mountingSector)}
                  </span>
                </td>
                <td>{ap.mountingFactorDb}</td>
                <td>{ap.downlinkRssi}</td>
                <td>{ap.uplinkRssi}</td>
                <td style="color: {rssiColor(ap.effectiveRssi)}; font-weight: 600;">
                  {ap.effectiveRssi}
                </td>
              </tr>

              {#if expandedApId === ap.apId}
                <tr class="detail-row">
                  <td colspan="11">
                    <div class="detail-content">
                      <div class="detail-section">
                        <span class="detail-label">Mounting:</span>
                        <span>{ap.mountingType} / {ap.mountingSector}</span>
                        {#if ap.mountingSector !== 'ceiling'}
                          <span class="detail-dim">(angle diff: {ap.mountingAngleDiff}&deg;)</span>
                        {/if}
                      </div>

                      {#if ap.hitGroups.length > 0}
                        <div class="detail-section">
                          <span class="detail-dim">{groupSummaryLine(ap.hitGroups, ap.rawHitCount)}</span>
                        </div>

                        <div class="group-list">
                          {#each ap.hitGroups as group, gIdx}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div class="group-row" onclick={() => toggleGroupExpand(gIdx)}>
                              <span class="seg-col seg-num">{group.index + 1}</span>
                              <span
                                class="group-action-badge"
                                style="background: {actionBadgeColor(group.action)};"
                              >{actionBadgeLabel(group.action)}</span>
                              <span class="seg-col seg-mat">{group.representative.materialLabel}</span>
                              <span class="seg-col seg-atten">{group.appliedLossDb} dB</span>
                              <span class="seg-col seg-hit detail-dim">{group.reason}</span>
                            </div>
                            {#if expandedGroupIdx === gIdx}
                              <div class="group-raw-hits">
                                <div class="segment-header">
                                  <span class="seg-col seg-num">#</span>
                                  <span class="seg-col seg-mat">Material</span>
                                  <span class="seg-col seg-atten">dB</span>
                                  <span class="seg-col seg-scale">Scale</span>
                                  <span class="seg-col seg-hit">Hit at</span>
                                </div>
                                {#each group.rawHits as hit, hIdx}
                                  <div class="segment-row">
                                    <span class="seg-col seg-num">{hIdx + 1}</span>
                                    <span class="seg-col seg-mat">{hit.materialLabel}</span>
                                    <span class="seg-col seg-atten">{hit.attenuationDb}</span>
                                    <span class="seg-col seg-scale">{hit.thicknessScale}x</span>
                                    <span class="seg-col seg-hit">({hit.hitX}, {hit.hitY})</span>
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          {/each}
                        </div>
                      {:else}
                        <div class="detail-section">
                          <span class="detail-dim">No wall hits (line of sight)</span>
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="no-aps">No active APs</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .inspector-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .inspector-panel {
    background: #1a1a2e;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 12px;
    min-width: 520px;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .inspector-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .inspector-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: #e0e0f0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .inspector-coords {
    font-size: 0.75rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .inspector-band {
    font-size: 0.65rem;
    color: #808090;
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .close-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: #808090;
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0f0;
  }

  .inspector-summary {
    margin-bottom: 10px;
  }

  .summary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .summary-label {
    font-size: 0.7rem;
    color: #a0a0b0;
  }

  .summary-value {
    font-size: 0.9rem;
    font-weight: 700;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .summary-value-small {
    font-size: 0.75rem;
    font-weight: 600;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .inspector-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.65rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .inspector-table th {
    text-align: right;
    color: #808090;
    font-weight: 600;
    padding: 3px 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.6rem;
    text-transform: uppercase;
  }

  .th-left {
    text-align: left !important;
  }

  .inspector-table td {
    text-align: right;
    color: #c0c0d0;
    padding: 3px 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .inspector-table td.ap-id {
    text-align: left;
    color: #a0a0f0;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.6rem;
  }

  .inspector-table tr.best {
    background: rgba(74, 108, 247, 0.08);
  }

  .inspector-table tr.expandable {
    cursor: pointer;
  }

  .inspector-table tr.expandable:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .sector-badge {
    font-size: 0.6rem;
    font-weight: 600;
  }

  .detail-row td {
    padding: 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .detail-content {
    padding: 6px 8px 8px;
    background: rgba(0, 0, 0, 0.15);
    font-size: 0.62rem;
    color: #a0a0b0;
  }

  .detail-section {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 3px;
  }

  .detail-label {
    color: #808090;
    font-weight: 600;
    min-width: 65px;
  }

  .detail-dim {
    color: #606070;
    font-style: italic;
  }

  .segment-list {
    margin-top: 4px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    overflow: hidden;
  }

  .segment-header {
    display: flex;
    background: rgba(255, 255, 255, 0.04);
    padding: 2px 4px;
    font-weight: 600;
    color: #707080;
    text-transform: uppercase;
    font-size: 0.55rem;
  }

  .segment-row {
    display: flex;
    padding: 1px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.03);
  }

  .segment-row:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }

  .seg-col {
    flex-shrink: 0;
  }

  .seg-num { width: 20px; text-align: center; }
  .seg-mat { width: 100px; }
  .seg-atten { width: 40px; text-align: right; }
  .seg-scale { width: 45px; text-align: right; }
  .seg-hit { flex: 1; text-align: right; color: #707080; }

  .raw-count {
    color: #808090;
    font-size: 0.55rem;
  }

  .group-list {
    margin-top: 4px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    overflow: hidden;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.03);
    cursor: pointer;
  }

  .group-row:first-child {
    border-top: none;
  }

  .group-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .group-action-badge {
    font-size: 0.5rem;
    font-weight: 700;
    color: #000;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .group-raw-hits {
    margin: 0 0 2px 20px;
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.1);
  }

  .no-aps {
    color: #808090;
    font-size: 0.75rem;
    text-align: center;
    margin: 12px 0;
  }
</style>
