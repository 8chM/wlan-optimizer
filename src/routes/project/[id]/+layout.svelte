<script lang="ts">
import { page } from '$app/stores';
import Layout from '$lib/components/layout/Layout.svelte';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import type { EditorTool } from '$lib/stores/canvasStore.svelte';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { undoStore } from '$lib/stores/undoStore.svelte';
import type { Snippet } from 'svelte';

interface Props {
  children: Snippet;
}

let { children }: Props = $props();

let projectId = $derived($page.params.id);

// Load project data when the route changes
$effect(() => {
  if (projectId) {
    projectStore.loadProject(projectId);
  }
});

function handleToolChange(tool: EditorTool): void {
  canvasStore.setTool(tool);
}

function handleZoomIn(): void {
  canvasStore.zoomIn();
}

function handleZoomOut(): void {
  canvasStore.zoomOut();
}

function handleFitToScreen(): void {
  canvasStore.resetView();
}

function handleToggleGrid(): void {
  canvasStore.toggleGrid();
}

function handleSetScale(): void {
  canvasStore.setSettingScale(!canvasStore.settingScale);
}
</script>

<Layout
  showSidebar={true}
  toolbarConfig={canvasStore.toolbarConfig}
  {projectId}
  activeTool={canvasStore.activeTool}
  zoomLevel={canvasStore.zoomPercent}
  gridVisible={canvasStore.gridVisible}
  gridSize={canvasStore.gridSize}
  saveStatus={projectStore.isDirty ? 'unsaved' : 'saved'}
  mouseX={canvasStore.mouseXMeters}
  mouseY={canvasStore.mouseYMeters}
  settingScale={canvasStore.settingScale}
  canUndo={undoStore.canUndo}
  canRedo={undoStore.canRedo}
  onUndo={() => undoStore.undo()}
  onRedo={() => undoStore.redo()}
  onToolChange={handleToolChange}
  onZoomIn={handleZoomIn}
  onZoomOut={handleZoomOut}
  onFitToScreen={handleFitToScreen}
  onToggleGrid={handleToggleGrid}
  onToggleSnap={() => canvasStore.toggleSnapToGrid()}
  snapEnabled={canvasStore.snapToGridEnabled}
  onToggleBackground={() => canvasStore.toggleBackground()}
  backgroundVisible={canvasStore.backgroundVisible}
  backgroundOpacity={canvasStore.backgroundOpacity}
  onBackgroundOpacityChange={(v) => canvasStore.setBackgroundOpacity(v)}
  onSetScale={handleSetScale}
>
  {@render children()}
</Layout>
