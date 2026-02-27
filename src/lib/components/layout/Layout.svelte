<!--
  Layout.svelte - Main application layout with Grid structure.

  Grid areas:
  - toolbar (top)
  - sidebar (left)
  - main (center)
  - statusbar (bottom)
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Toolbar from './Toolbar.svelte';
  import Sidebar from './Sidebar.svelte';
  import StatusBar from './StatusBar.svelte';

  type EditorTool = 'select' | 'wall' | 'ap' | 'measure';

  interface LayoutProps {
    children: Snippet;
    sidebarContent?: Snippet;
    toolbarExtra?: Snippet;
    /** Show sidebar navigation */
    showSidebar?: boolean;
    /** Show editor tools in toolbar */
    showEditorTools?: boolean;
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
  }

  let {
    children,
    sidebarContent,
    toolbarExtra,
    showSidebar = false,
    showEditorTools = false,
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
  }: LayoutProps = $props();

  let sidebarCollapsed = $state(false);
</script>

<div class="app-layout" class:no-sidebar={!showSidebar} class:sidebar-collapsed={sidebarCollapsed}>
  <div class="layout-toolbar">
    <Toolbar
      {activeTool}
      {zoomLevel}
      {showEditorTools}
      {gridVisible}
      {onToolChange}
      {onZoomIn}
      {onZoomOut}
      {onFitToScreen}
      {onToggleGrid}
    >
      {#if toolbarExtra}
        {@render toolbarExtra()}
      {/if}
    </Toolbar>
  </div>

  {#if showSidebar}
    <div class="layout-sidebar">
      <Sidebar bind:collapsed={sidebarCollapsed} {projectId}>
        {#if sidebarContent}
          {@render sidebarContent()}
        {/if}
      </Sidebar>
    </div>
  {/if}

  <main class="layout-main">
    {@render children()}
  </main>

  {#if showEditorTools}
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
    background: #fafafe;
  }

  .app-layout.no-sidebar {
    grid-template-columns: 1fr;
    grid-template-areas:
      'toolbar'
      'main'
      'statusbar';
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
    color: #1a1a2e;
    -webkit-font-smoothing: antialiased;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(a) {
    color: inherit;
  }
</style>
