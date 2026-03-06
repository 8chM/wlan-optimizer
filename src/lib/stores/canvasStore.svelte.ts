/**
 * Canvas Store - Svelte 5 Runes-based store for canvas/editor state.
 *
 * Manages scale, offset, active tool, selection, and grid settings
 * for the FloorplanEditor canvas.
 */

import { TOOLSETS, type PageContext, type ToolbarConfig } from '$lib/config/toolsets';

// ─── Types ──────────────────────────────────────────────────────

export type EditorTool = 'select' | 'pan' | 'wall' | 'door' | 'window' | 'ap' | 'measure' | 'text' | 'room' | 'candidate' | 'zone';

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
  let selectedApModelId = $state<string | null>(null);
  let settingScale = $state(false);
  let mouseXMeters = $state<number | null>(null);
  let mouseYMeters = $state<number | null>(null);
  let snapToGridEnabled = $state(false);
  let shiftHeld = $state(false);
  let spaceHeld = $state(false);
  let backgroundVisible = $state(true);
  let backgroundOpacity = $state(0.3);
  let backgroundOffsetX = $state(0);
  let backgroundOffsetY = $state(0);
  let pageContext = $state<PageContext>('editor');
  /** Floor dimensions for fit-to-screen (set by each page on load) */
  let floorWidthM = $state(0);
  let floorHeightM = $state(0);
  let floorScalePxPerM = $state(50);
  let containerW = $state(800);
  let containerH = $state(600);

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
    get selectedApModelId() { return selectedApModelId; },
    get sidebarCollapsed() { return sidebarCollapsed; },
    get settingScale() { return settingScale; },
    get mouseXMeters() { return mouseXMeters; },
    get mouseYMeters() { return mouseYMeters; },
    get snapToGridEnabled() { return snapToGridEnabled; },
    get shiftHeld() { return shiftHeld; },
    get spaceHeld() { return spaceHeld; },
    get backgroundVisible() { return backgroundVisible; },
    get backgroundOpacity() { return backgroundOpacity; },
    get backgroundOffsetX() { return backgroundOffsetX; },
    get backgroundOffsetY() { return backgroundOffsetY; },
    get pageContext() { return pageContext; },

    get floorWidthM() { return floorWidthM; },
    get floorHeightM() { return floorHeightM; },
    get floorScalePxPerM() { return floorScalePxPerM; },
    get containerW() { return containerW; },
    get containerH() { return containerH; },

    get toolbarConfig(): ToolbarConfig {
      return TOOLSETS[pageContext];
    },

    get zoomPercent(): number {
      return scale * 100;
    },

    // ── Actions ─────────────────────────────────────────────

    setPageContext(ctx: PageContext): void {
      pageContext = ctx;
      // Reset to select if current tool is not allowed on the new page
      const allowed = TOOLSETS[ctx].allowedTools;
      if (allowed.length > 0 && !allowed.includes(activeTool)) {
        activeTool = 'select';
        selectedIds = [];
      }
    },

    setTool(tool: EditorTool): void {
      // Validate against allowed tools for the current page context
      const allowed = TOOLSETS[pageContext].allowedTools;
      if (allowed.length > 0 && !allowed.includes(tool)) return;
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

    setSelectedApModel(modelId: string | null): void {
      selectedApModelId = modelId;
    },

    setSettingScale(v: boolean): void {
      settingScale = v;
    },

    setMousePosition(xM: number | null, yM: number | null): void {
      mouseXMeters = xM;
      mouseYMeters = yM;
    },

    toggleSnapToGrid(): void {
      snapToGridEnabled = !snapToGridEnabled;
    },

    setShiftHeld(v: boolean): void {
      shiftHeld = v;
    },

    setSpaceHeld(v: boolean): void {
      spaceHeld = v;
    },

    toggleBackground(): void {
      backgroundVisible = !backgroundVisible;
    },

    setBackgroundOpacity(v: number): void {
      backgroundOpacity = Math.min(1, Math.max(0, v));
    },

    /** Update floor dimensions for fit-to-screen (called by each page) */
    setFloorDimensions(wM: number, hM: number, pxPerM: number): void {
      floorWidthM = wM;
      floorHeightM = hM;
      floorScalePxPerM = pxPerM;
    },

    setContainerSize(w: number, h: number): void {
      containerW = w;
      containerH = h;
    },

    setBackgroundOffset(x: number, y: number): void {
      backgroundOffsetX = x;
      backgroundOffsetY = y;
    },

    toggleSidebar(): void {
      sidebarCollapsed = !sidebarCollapsed;
    },

    setSidebarCollapsed(v: boolean): void {
      sidebarCollapsed = v;
    },

    /** Reset only the view (scale + offset) without clearing tool/selection/grid state */
    resetView(): void {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
    },

    /**
     * Fit the floorplan content into the visible viewport with padding.
     * Works on all pages (editor, mixing, measure) since it uses canvasStore state.
     */
    fitToScreen(
      floorplanWidthM: number,
      floorplanHeightM: number,
      scalePxPerMeter: number,
      containerWidth: number,
      containerHeight: number,
      padding = 40,
    ): void {
      const effectiveWidth = floorplanWidthM * scalePxPerMeter;
      const effectiveHeight = floorplanHeightM * scalePxPerMeter;
      if (effectiveWidth <= 0 || effectiveHeight <= 0) return;

      const availableWidth = containerWidth - padding * 2;
      const availableHeight = containerHeight - padding * 2;

      const scaleX = availableWidth / effectiveWidth;
      const scaleY = availableHeight / effectiveHeight;
      const newScale = Math.min(10, Math.max(0.1, Math.min(scaleX, scaleY)));

      const scaledWidth = effectiveWidth * newScale;
      const scaledHeight = effectiveHeight * newScale;

      scale = newScale;
      offsetX = (containerWidth - scaledWidth) / 2;
      offsetY = (containerHeight - scaledHeight) / 2;
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
      selectedApModelId = null;
      sidebarCollapsed = false;
      settingScale = false;
      mouseXMeters = null;
      mouseYMeters = null;
      snapToGridEnabled = false;
      shiftHeld = false;
      spaceHeld = false;
      backgroundVisible = true;
      backgroundOpacity = 0.3;
      backgroundOffsetX = 0;
      backgroundOffsetY = 0;
    },
  };
}

/** Singleton canvas store instance */
export const canvasStore = createCanvasStore();
