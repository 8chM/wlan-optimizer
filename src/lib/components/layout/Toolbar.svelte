<!--
  Toolbar.svelte - Top toolbar with tool buttons and zoom controls.

  Provides tool selection (Select, Wall, AP, Measure) and zoom actions
  (zoom in, zoom out, fit to screen). Emits events when tools or zoom change.
-->
<script lang="ts">
import { t } from '$lib/i18n';
import { themeStore } from '$lib/stores/themeStore.svelte';
import type { Snippet } from 'svelte';

type EditorTool = 'select' | 'wall' | 'door' | 'window' | 'ap' | 'measure' | 'text';

interface ToolbarProps {
  activeTool?: EditorTool;
  zoomLevel?: number;
  showEditorTools?: boolean;
  onToolChange?: (tool: EditorTool) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitToScreen?: () => void;
  onToggleGrid?: () => void;
  onSetScale?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  gridVisible?: boolean;
  settingScale?: boolean;
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
  onSetScale,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  gridVisible = true,
  settingScale = false,
  children,
}: ToolbarProps = $props();

const tools: Array<{ id: EditorTool; label: string; icon: string; shortcut: string }> = [
  { id: 'select', label: 'toolbar.select', icon: '\u22B9', shortcut: 'S' },
  { id: 'wall', label: 'toolbar.wall', icon: '\u25AC', shortcut: 'W' },
  { id: 'door', label: 'toolbar.door', icon: '\uD83D\uDEAA', shortcut: 'D' },
  { id: 'window', label: 'toolbar.window', icon: '\u25A1', shortcut: 'F' },
  { id: 'ap', label: 'toolbar.ap', icon: '\u25C9', shortcut: 'A' },
  { id: 'measure', label: 'toolbar.measure', icon: '\u229E', shortcut: 'M' },
  { id: 'text', label: 'toolbar.text', icon: 'T', shortcut: 'T' },
];

function selectTool(tool: EditorTool): void {
  onToolChange?.(tool);
}

const themeIcons: Record<string, string> = {
  light: '\u2600',
  dark: '\uD83C\uDF19',
  system: '\uD83D\uDCBB',
};

let themeIcon = $derived(themeIcons[themeStore.theme] ?? '\u2600');
let themeLabel = $derived(
  themeStore.theme === 'light'
    ? t('settings.themeLight')
    : themeStore.theme === 'dark'
      ? t('settings.themeDark')
      : t('settings.themeSystem'),
);
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
          onclick={onUndo}
          disabled={!canUndo}
          title="{t('action.undo')} (\u2318Z)"
        >
          <span class="tool-icon">\u21A9</span>
        </button>
        <button
          class="tool-btn"
          onclick={onRedo}
          disabled={!canRedo}
          title="{t('action.redo')} (\u21E7\u2318Z)"
        >
          <span class="tool-icon">\u21AA</span>
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
        <button
          class="tool-btn"
          class:active={settingScale}
          onclick={onSetScale}
          title={t('toolbar.setScale')}
        >
          <span class="tool-icon">↔</span>
          <span class="tool-label">{t('toolbar.setScale')}</span>
        </button>
      </div>
    </div>
  {/if}

  <div class="toolbar-section toolbar-right">
    <button
      class="tool-btn theme-toggle"
      onclick={() => themeStore.toggleTheme()}
      title="{t('settings.theme')}: {themeLabel}"
    >
      <span class="tool-icon">{themeIcon}</span>
    </button>
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
    background: var(--bg-primary, #ffffff);
    border-bottom: 1px solid var(--border, #e0e0e0);
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
    color: var(--text-primary, #1a1a2e);
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
    background: var(--border, #e0e0e0);
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
    color: var(--text-secondary, #4a4a6a);
    font-size: 0.8rem;
    transition: all 0.15s ease;
    white-space: nowrap;
    font-family: inherit;
  }

  .tool-btn:hover {
    background: var(--bg-tertiary, #f0f0f5);
    border-color: var(--border, #d0d0e0);
  }

  .tool-btn.active {
    background: var(--accent-light, #e8ecff);
    border-color: var(--accent, #4a6cf7);
    color: var(--accent, #4a6cf7);
  }

  .tool-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .tool-btn:disabled:hover {
    background: transparent;
    border-color: transparent;
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
    color: var(--text-secondary, #4a4a6a);
    user-select: none;
  }
</style>
