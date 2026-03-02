/**
 * Canvas Store - Svelte 5 Runes-based store for canvas/editor state.
 *
 * Manages scale, offset, active tool, selection, and grid settings
 * for the FloorplanEditor canvas.
 */

// ─── Types ──────────────────────────────────────────────────────

export type EditorTool = 'select' | 'wall' | 'ap' | 'measure';

export interface CanvasState {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly activeTool: EditorTool;
  readonly selectedIds: string[];
  readonly gridVisible: boolean;
  readonly gridSize: number;
  readonly selectedMaterialId: string | null;
  readonly sidebarCollapsed: boolean;
}

// ─── Store ──────────────────────────────────────────────────────

function createCanvasStore() {
  let scale = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let activeTool = $state<EditorTool>('select');
  let selectedIds = $state<string[]>([]);
  let gridVisible = $state(true);
  let gridSize = $state(1); // meters
  let selectedMaterialId = $state<string | null>(null);
  let sidebarCollapsed = $state(false);
  let settingScale = $state(false);

  return {
    // ── Getters ─────────────────────────────────────────────
    get scale() { return scale; },
    get offsetX() { return offsetX; },
    get offsetY() { return offsetY; },
    get activeTool() { return activeTool; },
    get selectedIds() { return selectedIds; },
    get gridVisible() { return gridVisible; },
    get gridSize() { return gridSize; },
    get selectedMaterialId() { return selectedMaterialId; },
    get sidebarCollapsed() { return sidebarCollapsed; },
    get settingScale() { return settingScale; },

    get zoomPercent(): number {
      return scale * 100;
    },

    // ── Actions ─────────────────────────────────────────────

    setTool(tool: EditorTool): void {
      activeTool = tool;
      // Clear selection when switching tools
      if (tool !== 'select') {
        selectedIds = [];
      }
    },

    setScale(newScale: number): void {
      scale = Math.min(10, Math.max(0.1, newScale));
    },

    setOffset(x: number, y: number): void {
      offsetX = x;
      offsetY = y;
    },

    selectItem(id: string, addToSelection = false): void {
      if (addToSelection) {
        if (selectedIds.includes(id)) {
          selectedIds = selectedIds.filter((sid) => sid !== id);
        } else {
          selectedIds = [...selectedIds, id];
        }
      } else {
        selectedIds = [id];
      }
    },

    clearSelection(): void {
      selectedIds = [];
    },

    isSelected(id: string): boolean {
      return selectedIds.includes(id);
    },

    toggleGrid(): void {
      gridVisible = !gridVisible;
    },

    setGridSize(size: number): void {
      if (size > 0) {
        gridSize = size;
      }
    },

    setSelectedMaterial(materialId: string | null): void {
      selectedMaterialId = materialId;
    },

    setSettingScale(v: boolean): void {
      settingScale = v;
    },

    toggleSidebar(): void {
      sidebarCollapsed = !sidebarCollapsed;
    },

    setSidebarCollapsed(v: boolean): void {
      sidebarCollapsed = v;
    },

    zoomIn(): void {
      scale = Math.min(10, scale * 1.2);
    },

    zoomOut(): void {
      scale = Math.max(0.1, scale / 1.2);
    },

    reset(): void {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      activeTool = 'select';
      selectedIds = [];
      gridVisible = true;
      gridSize = 1;
      selectedMaterialId = null;
      sidebarCollapsed = false;
      settingScale = false;
    },
  };
}

/** Singleton canvas store instance */
export const canvasStore = createCanvasStore();
