<script lang="ts">
import { page } from '$app/stores';
import Layout from '$lib/components/layout/Layout.svelte';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import { projectStore } from '$lib/stores/projectStore.svelte';
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

function handleToolChange(tool: 'select' | 'wall' | 'ap' | 'measure'): void {
  canvasStore.setTool(tool);
}

function handleZoomIn(): void {
  canvasStore.zoomIn();
}

function handleZoomOut(): void {
  canvasStore.zoomOut();
}

function handleFitToScreen(): void {
  canvasStore.reset();
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
  showEditorTools={true}
  {projectId}
  activeTool={canvasStore.activeTool}
  zoomLevel={canvasStore.zoomPercent}
  gridVisible={canvasStore.gridVisible}
  gridSize={canvasStore.gridSize}
  saveStatus={projectStore.isDirty ? 'unsaved' : 'saved'}
  settingScale={canvasStore.settingScale}
  onToolChange={handleToolChange}
  onZoomIn={handleZoomIn}
  onZoomOut={handleZoomOut}
  onFitToScreen={handleFitToScreen}
  onToggleGrid={handleToggleGrid}
  onSetScale={handleSetScale}
>
  {@render children()}
</Layout>
