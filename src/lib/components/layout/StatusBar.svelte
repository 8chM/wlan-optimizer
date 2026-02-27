<!--
  StatusBar.svelte - Bottom status bar with mouse coordinates, zoom level, save status.

  Displays contextual information about the current canvas state.
-->
<script lang="ts">
  import { t } from '$lib/i18n';

  interface StatusBarProps {
    mouseX?: number | null;
    mouseY?: number | null;
    zoomLevel?: number;
    saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
    activeTool?: string;
    gridSize?: number;
  }

  let {
    mouseX = null,
    mouseY = null,
    zoomLevel = 100,
    saveStatus = 'saved',
    activeTool = 'select',
    gridSize = 1,
  }: StatusBarProps = $props();

  let saveStatusText = $derived(
    saveStatus === 'saved'
      ? t('status.saved')
      : saveStatus === 'saving'
        ? t('status.saving')
        : saveStatus === 'unsaved'
          ? t('status.unsaved')
          : t('status.error')
  );

  let saveStatusClass = $derived(
    saveStatus === 'saved'
      ? 'status-saved'
      : saveStatus === 'unsaved'
        ? 'status-unsaved'
        : saveStatus === 'error'
          ? 'status-error'
          : 'status-saving'
  );

  let coordsDisplay = $derived(
    mouseX !== null && mouseY !== null
      ? `X: ${mouseX.toFixed(2)}m  Y: ${mouseY.toFixed(2)}m`
      : 'X: --  Y: --'
  );
</script>

<footer class="status-bar">
  <div class="status-section status-left">
    <span class="status-item coords">{coordsDisplay}</span>
    <span class="status-divider">|</span>
    <span class="status-item">{t('status.grid')}: {gridSize}m</span>
  </div>

  <div class="status-section status-center">
    <span class="status-item tool-indicator">{t(`toolbar.${activeTool}`)}</span>
  </div>

  <div class="status-section status-right">
    <span class="status-item">{t('status.zoom')}: {Math.round(zoomLevel)}%</span>
    <span class="status-divider">|</span>
    <span class="status-item {saveStatusClass}">
      <span class="save-dot"></span>
      {saveStatusText}
    </span>
  </div>
</footer>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    background: #f5f5fa;
    border-top: 1px solid #e0e0e0;
    padding: 0 12px;
    font-size: 0.72rem;
    color: #6a6a8a;
    flex-shrink: 0;
    z-index: 10;
    user-select: none;
  }

  .status-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-left {
    flex: 1;
  }

  .status-center {
    flex-shrink: 0;
  }

  .status-right {
    flex: 1;
    justify-content: flex-end;
  }

  .status-item {
    white-space: nowrap;
  }

  .status-divider {
    color: #d0d0e0;
  }

  .coords {
    font-variant-numeric: tabular-nums;
    font-family: 'SF Mono', 'Fira Code', monospace;
    letter-spacing: -0.02em;
  }

  .tool-indicator {
    font-weight: 500;
    color: #4a6cf7;
  }

  .save-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }

  .status-saved .save-dot {
    background: #4caf50;
  }

  .status-unsaved .save-dot {
    background: #ff9800;
  }

  .status-saving .save-dot {
    background: #2196f3;
    animation: pulse 1s infinite;
  }

  .status-error .save-dot {
    background: #f44336;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
