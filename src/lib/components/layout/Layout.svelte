<!--
  Layout.svelte - Main application layout with Grid structure.

  Grid areas:
  - toolbar (top)
  - sidebar (left)
  - main (center)
  - statusbar (bottom)
-->
<script lang="ts">
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import type { EditorTool } from '$lib/stores/canvasStore.svelte';
import type { ToolbarConfig } from '$lib/config/toolsets';
import type { Snippet } from 'svelte';
import Toolbar from './Toolbar.svelte';
import Sidebar from './Sidebar.svelte';
import StatusBar from './StatusBar.svelte';

interface LayoutProps {
  children: Snippet;
  sidebarContent?: Snippet;
  toolbarExtra?: Snippet;
  /** Show sidebar navigation */
  showSidebar?: boolean;
  /** Show editor tools in toolbar */
  showEditorTools?: boolean;
  /** Toolbar configuration (overrides showEditorTools) */
  toolbarConfig?: ToolbarConfig | null;
  /** Current project ID for sidebar navigation */
  projectId?: string;
  /** Active editor tool */
  activeTool?: EditorTool;
  /** Zoom level in percent */
  zoomLevel?: number;
  /** Mouse position in meters */
  mouseX?: number | null;
  mouseY?: number | null;
  /** Save status */
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
  /** Grid configuration */
  gridVisible?: boolean;
  gridSize?: number;
  /** Callbacks */
  onToolChange?: (tool: EditorTool) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
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
  snapEnabled?: boolean;
  backgroundVisible?: boolean;
  settingScale?: boolean;
}

let {
  children,
  sidebarContent,
  toolbarExtra,
  showSidebar = false,
  showEditorTools = false,
  toolbarConfig = null,
  projectId = '',
  activeTool = 'select',
  zoomLevel = 100,
  mouseX = null,
  mouseY = null,
  saveStatus = 'saved',
  gridVisible = true,
  gridSize = 1,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onToggleGrid,
  onToggleSnap,
  onToggleBackground,
  onSetScale,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  snapEnabled = false,
  backgroundVisible = true,
  backgroundOpacity = 0.5,
  onBackgroundOpacityChange,
  settingScale = false,
}: LayoutProps = $props();

let sidebarCollapsed = $derived(canvasStore.sidebarCollapsed);
</script>

<div class="app-layout" class:no-sidebar={!showSidebar} class:sidebar-collapsed={sidebarCollapsed}>
  <div class="layout-toolbar">
    <Toolbar
      {activeTool}
      {zoomLevel}
      {showEditorTools}
      {toolbarConfig}
      {gridVisible}
      {settingScale}
      {onToolChange}
      {onZoomIn}
      {onZoomOut}
      {onFitToScreen}
      {onToggleGrid}
      {onToggleSnap}
      {onToggleBackground}
      {backgroundOpacity}
      {onBackgroundOpacityChange}
      {snapEnabled}
      {backgroundVisible}
      {onSetScale}
      {onUndo}
      {onRedo}
      {canUndo}
      {canRedo}
    >
      {#if toolbarExtra}
        {@render toolbarExtra()}
      {/if}
    </Toolbar>
  </div>

  {#if showSidebar}
    <div class="layout-sidebar">
      <Sidebar {projectId}>
        {#if sidebarContent}
          {@render sidebarContent()}
        {/if}
      </Sidebar>
    </div>
  {/if}

  <main class="layout-main">
    {@render children()}
  </main>

  {#if showEditorTools || (toolbarConfig !== null && toolbarConfig.allowedTools.length > 0)}
    <div class="layout-statusbar">
      <StatusBar
        {mouseX}
        {mouseY}
        {zoomLevel}
        {saveStatus}
        {activeTool}
        {gridSize}
      />
    </div>
  {/if}
</div>

<style>
  .app-layout {
    display: grid;
    grid-template-rows: 48px 1fr 28px;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'toolbar toolbar'
      'sidebar main'
      'statusbar statusbar';
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg-secondary, #fafafe);
  }

  .app-layout.no-sidebar {
    grid-template-columns: 1fr;
    grid-template-areas:
      'toolbar'
      'main'
      'statusbar';
  }

  .app-layout.sidebar-collapsed {
    grid-template-columns: 0px 1fr;
  }

  .app-layout.sidebar-collapsed .layout-sidebar {
    overflow: hidden;
    width: 0;
  }

  .layout-toolbar {
    grid-area: toolbar;
  }

  .layout-sidebar {
    grid-area: sidebar;
  }

  .layout-main {
    grid-area: main;
    overflow: hidden;
    position: relative;
  }

  .layout-statusbar {
    grid-area: statusbar;
  }

  /* Global reset styles */
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    color: var(--text-primary, #1a1a2e);
    -webkit-font-smoothing: antialiased;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(a) {
    color: inherit;
  }
</style>
