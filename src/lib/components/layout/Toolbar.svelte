<!--
  Toolbar.svelte - Top toolbar with tool buttons and zoom controls.

  Provides tool selection (Select, Wall, AP, Measure) and zoom actions
  (zoom in, zoom out, fit to screen). Emits events when tools or zoom change.
-->
<script lang="ts">
import { t } from '$lib/i18n';
import { themeStore } from '$lib/stores/themeStore.svelte';
import type { EditorTool } from '$lib/stores/canvasStore.svelte';
import type { ToolbarConfig } from '$lib/config/toolsets';
import type { Snippet } from 'svelte';

interface ToolbarProps {
  activeTool?: EditorTool;
  zoomLevel?: number;
  showEditorTools?: boolean;
  toolbarConfig?: ToolbarConfig | null;
  onToolChange?: (tool: EditorTool) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomTo?: (percent: number) => void;
  onFitToScreen?: () => void;
  onToggleGrid?: () => void;
  onToggleSnap?: () => void;
  onToggleBackground?: () => void;
  backgroundOpacity?: number;
  onBackgroundOpacityChange?: (v: number) => void;
  onSetScale?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  gridVisible?: boolean;
  snapEnabled?: boolean;
  backgroundVisible?: boolean;
  settingScale?: boolean;
  children?: Snippet;
}

let {
  activeTool = 'select',
  zoomLevel = 100,
  showEditorTools = false,
  toolbarConfig = null,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onZoomTo,
  onFitToScreen,
  onToggleGrid,
  onToggleSnap,
  onToggleBackground,
  onSetScale,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  gridVisible = true,
  snapEnabled = false,
  backgroundVisible = true,
  backgroundOpacity = 0.5,
  onBackgroundOpacityChange,
  settingScale = false,
  children,
}: ToolbarProps = $props();

const allTools: Array<{ id: EditorTool; label: string; icon: string; shortcut: string }> = [
  { id: 'select', label: 'toolbar.select', icon: '\u22B9', shortcut: 'V' },
  { id: 'pan', label: 'toolbar.pan', icon: '\u270B', shortcut: 'H' },
  { id: 'wall', label: 'toolbar.wall', icon: '\u25AC', shortcut: 'W' },
  { id: 'room', label: 'toolbar.room', icon: '\u2B1C', shortcut: 'R' },
  { id: 'door', label: 'toolbar.door', icon: '\uD83D\uDEAA', shortcut: 'D' },
  { id: 'window', label: 'toolbar.window', icon: '\u25A1', shortcut: 'F' },
  { id: 'ap', label: 'toolbar.ap', icon: '\u25C9', shortcut: 'A' },
  { id: 'measure', label: 'toolbar.measure', icon: '\u229E', shortcut: 'M' },
  { id: 'text', label: 'toolbar.text', icon: 'T', shortcut: 'T' },
];

// Filter tools based on toolbarConfig (if provided), else show all when showEditorTools is true
let visibleTools = $derived.by(() => {
  if (toolbarConfig) {
    const allowed = toolbarConfig.allowedTools;
    return allTools.filter(t => allowed.includes(t.id));
  }
  return allTools;
});

let showUndoRedo = $derived(toolbarConfig ? toolbarConfig.showUndoRedo : true);
let showSnap = $derived(toolbarConfig ? toolbarConfig.showSnapToggle : true);
let showScale = $derived(toolbarConfig ? toolbarConfig.showScaleCalibration : true);
let showBgOpacity = $derived(toolbarConfig ? toolbarConfig.showBackgroundOpacity : true);
let hasTools = $derived(showEditorTools || (toolbarConfig !== null && visibleTools.length > 0));

function selectTool(tool: EditorTool): void {
  onToolChange?.(tool);
}

const themeIcons: Record<string, string> = {
  light: '\u2600',
  dark: '\uD83C\uDF19',
  system: '\uD83D\uDCBB',
};

let isEditingZoom = $state(false);
let zoomEditValue = $state('');

function handleZoomSlider(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value);
  onZoomTo?.(val);
}

function startZoomEdit(): void {
  isEditingZoom = true;
  zoomEditValue = String(Math.round(zoomLevel));
}

function commitZoomEdit(): void {
  const parsed = parseInt(zoomEditValue, 10);
  if (!isNaN(parsed) && parsed >= 10 && parsed <= 500) {
    onZoomTo?.(parsed);
  }
  isEditingZoom = false;
}

function cancelZoomEdit(): void {
  isEditingZoom = false;
}

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
      <span class="brand-text">{t('app.title')}</span>
    </a>
  </div>

  {#if hasTools}
    <div class="toolbar-section toolbar-center">
      {#if visibleTools.length > 0}
        <div class="tool-group">
          {#each visibleTools as tool (tool.id)}
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
      {/if}

      <div class="tool-group zoom-group">
        <button class="tool-btn" onclick={onZoomOut} title={t('toolbar.zoomOut')}>
          <span class="tool-icon">−</span>
        </button>
        <input
          type="range"
          class="zoom-slider"
          min="10"
          max="500"
          step="5"
          value={Math.round(zoomLevel)}
          oninput={handleZoomSlider}
          title={t('toolbar.zoomIn')}
        />
        {#if isEditingZoom}
          <input
            type="text"
            class="zoom-input"
            bind:value={zoomEditValue}
            onblur={commitZoomEdit}
            onkeydown={(e) => { if (e.key === 'Enter') commitZoomEdit(); if (e.key === 'Escape') cancelZoomEdit(); }}
            onfocus={(e) => (e.target as HTMLInputElement).select()}
            autofocus
          />
        {:else}
          <button
            class="zoom-display-btn"
            onclick={startZoomEdit}
            title={t('toolbar.zoomIn')}
          >{Math.round(zoomLevel)}%</button>
        {/if}
        <button class="tool-btn" onclick={onZoomIn} title={t('toolbar.zoomIn')}>
          <span class="tool-icon">+</span>
        </button>
        <button class="tool-btn" onclick={onFitToScreen} title={t('toolbar.fitToScreen')}>
          <span class="tool-icon">⊡</span>
        </button>
      </div>

      {#if showUndoRedo}
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
      {/if}

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
        {#if showSnap}
          <button
            class="tool-btn"
            class:active={snapEnabled}
            onclick={onToggleSnap}
            title={t('toolbar.toggleSnap')}
          >
            <span class="tool-icon">⊹</span>
            <span class="tool-label">{t('toolbar.snap')}</span>
          </button>
        {/if}
        <button
          class="tool-btn"
          class:active={backgroundVisible}
          onclick={onToggleBackground}
          title={t('toolbar.toggleBackground')}
        >
          <span class="tool-icon">🖼</span>
        </button>
        {#if showBgOpacity && backgroundVisible}
          <input
            type="range"
            class="opacity-slider"
            min="0"
            max="100"
            value={Math.round(backgroundOpacity * 100)}
            oninput={(e) => onBackgroundOpacityChange?.(Number((e.target as HTMLInputElement).value) / 100)}
            title={t('toolbar.backgroundOpacity')}
          />
        {/if}
        {#if showScale}
          <button
            class="tool-btn"
            class:active={settingScale}
            onclick={onSetScale}
            title={t('toolbar.setScale')}
          >
            <span class="tool-icon">↔</span>
            <span class="tool-label">{t('toolbar.setScale')}</span>
          </button>
        {/if}
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

  .opacity-slider {
    width: 60px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--border, #d0d0e0);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    margin: 0 4px;
  }

  .opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: var(--accent, #4a6cf7);
    border-radius: 50%;
    cursor: pointer;
  }

  .opacity-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: var(--accent, #4a6cf7);
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .zoom-group {
    gap: 4px;
  }

  .zoom-slider {
    width: 80px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--border, #d0d0e0);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    margin: 0 2px;
  }

  .zoom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: var(--accent, #4a6cf7);
    border-radius: 50%;
    cursor: pointer;
  }

  .zoom-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: var(--accent, #4a6cf7);
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .zoom-display-btn {
    min-width: 48px;
    text-align: center;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary, #4a4a6a);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px 4px;
    font-family: inherit;
  }

  .zoom-display-btn:hover {
    background: var(--bg-tertiary, #f0f0f5);
    border-color: var(--border, #d0d0e0);
  }

  .zoom-input {
    width: 48px;
    text-align: center;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    border: 1px solid var(--accent, #4a6cf7);
    border-radius: 4px;
    padding: 2px 4px;
    outline: none;
    font-family: inherit;
  }
</style>
