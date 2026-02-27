<!--
  Toolbar.svelte - Top toolbar with tool buttons and zoom controls.

  Provides tool selection (Select, Wall, AP, Measure) and zoom actions
  (zoom in, zoom out, fit to screen). Emits events when tools or zoom change.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { Snippet } from 'svelte';

  type EditorTool = 'select' | 'wall' | 'ap' | 'measure';

  interface ToolbarProps {
    activeTool?: EditorTool;
    zoomLevel?: number;
    showEditorTools?: boolean;
    onToolChange?: (tool: EditorTool) => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onFitToScreen?: () => void;
    onToggleGrid?: () => void;
    gridVisible?: boolean;
    children?: Snippet;
  }

  let {
    activeTool = 'select',
    zoomLevel = 100,
    showEditorTools = false,
    onToolChange,
    onZoomIn,
    onZoomOut,
    onFitToScreen,
    onToggleGrid,
    gridVisible = true,
    children,
  }: ToolbarProps = $props();

  const tools: Array<{ id: EditorTool; label: string; icon: string; shortcut: string }> = [
    { id: 'select', label: 'toolbar.select', icon: '⊹', shortcut: 'V' },
    { id: 'wall', label: 'toolbar.wall', icon: '▬', shortcut: 'W' },
    { id: 'ap', label: 'toolbar.ap', icon: '◉', shortcut: 'A' },
    { id: 'measure', label: 'toolbar.measure', icon: '⊞', shortcut: 'M' },
  ];

  function selectTool(tool: EditorTool): void {
    onToolChange?.(tool);
  }
</script>

<div class="toolbar">
  <div class="toolbar-section toolbar-left">
    <a href="/" class="toolbar-brand" title={t('app.title')}>
      <span class="brand-icon">📡</span>
      <span class="brand-text">WLAN-Optimizer</span>
    </a>
  </div>

  {#if showEditorTools}
    <div class="toolbar-section toolbar-center">
      <div class="tool-group">
        {#each tools as tool (tool.id)}
          <button
            class="tool-btn"
            class:active={activeTool === tool.id}
            onclick={() => selectTool(tool.id)}
            title="{t(tool.label)} ({tool.shortcut})"
          >
            <span class="tool-icon">{tool.icon}</span>
            <span class="tool-label">{t(tool.label)}</span>
          </button>
        {/each}
      </div>

      <div class="separator"></div>

      <div class="tool-group">
        <button class="tool-btn" onclick={onZoomOut} title={t('toolbar.zoomOut')}>
          <span class="tool-icon">−</span>
        </button>
        <span class="zoom-display">{Math.round(zoomLevel)}%</span>
        <button class="tool-btn" onclick={onZoomIn} title={t('toolbar.zoomIn')}>
          <span class="tool-icon">+</span>
        </button>
        <button class="tool-btn" onclick={onFitToScreen} title={t('toolbar.fitToScreen')}>
          <span class="tool-icon">⊡</span>
        </button>
      </div>

      <div class="separator"></div>

      <div class="tool-group">
        <button
          class="tool-btn"
          class:active={gridVisible}
          onclick={onToggleGrid}
          title={t('toolbar.toggleGrid')}
        >
          <span class="tool-icon">⊞</span>
          <span class="tool-label">{t('toolbar.grid')}</span>
        </button>
      </div>
    </div>
  {/if}

  <div class="toolbar-section toolbar-right">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    height: 48px;
    background: #ffffff;
    border-bottom: 1px solid #e0e0e0;
    padding: 0 12px;
    gap: 12px;
    flex-shrink: 0;
    z-index: 10;
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-left {
    flex-shrink: 0;
  }

  .toolbar-center {
    flex: 1;
    justify-content: center;
  }

  .toolbar-right {
    flex-shrink: 0;
    margin-left: auto;
  }

  .toolbar-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    color: #1a1a2e;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .brand-icon {
    font-size: 1.1rem;
  }

  .brand-text {
    white-space: nowrap;
  }

  .tool-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .separator {
    width: 1px;
    height: 28px;
    background: #e0e0e0;
    margin: 0 8px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    color: #4a4a6a;
    font-size: 0.8rem;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .tool-btn:hover {
    background: #f0f0f5;
    border-color: #d0d0e0;
  }

  .tool-btn.active {
    background: #e8ecff;
    border-color: #4a6cf7;
    color: #4a6cf7;
  }

  .tool-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .tool-label {
    font-size: 0.75rem;
  }

  .zoom-display {
    min-width: 48px;
    text-align: center;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: #4a4a6a;
    user-select: none;
  }
</style>
