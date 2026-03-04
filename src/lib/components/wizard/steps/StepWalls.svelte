<!--
  StepWalls.svelte - Step 4: Draw walls, doors, and windows.

  Full embedded editor with all drawing tools, panels, heatmap, and undo/redo.
  Uses the shared Toolbar component and wizard PageContext (no AP placement).
  APs are visible read-only for context.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';
  import { undoStore, type EditorCommand } from '$lib/stores/undoStore.svelte';
  import { clipboardStore, type ClipboardWall } from '$lib/stores/clipboardStore.svelte';
  import { channelStore } from '$lib/stores/channelStore.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';

  import { FloorplanEditor } from '$lib/canvas';
  import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
  import GridOverlay from '$lib/canvas/GridOverlay.svelte';
  import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
  import WallDrawingLayer from '$lib/canvas/WallDrawingLayer.svelte';
  import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
  import { Line, Circle } from 'svelte-konva';
  import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
  import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
  import SavedMeasurements from '$lib/canvas/SavedMeasurements.svelte';
  import TextAnnotation from '$lib/canvas/TextAnnotation.svelte';
  import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
  import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
  import CrosshairCursor from '$lib/canvas/CrosshairCursor.svelte';
  import RoomDrawingLayer from '$lib/canvas/RoomDrawingLayer.svelte';
  import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';

  import Toolbar from '$lib/components/layout/Toolbar.svelte';
  import PropertiesPanel from '$lib/components/editor/PropertiesPanel.svelte';
  import MaterialPicker from '$lib/components/editor/MaterialPicker.svelte';
  import ContextMenu from '$lib/components/editor/ContextMenu.svelte';
  import EditorHeatmap from '$lib/components/editor/EditorHeatmap.svelte';
  import EditorHeatmapPanel from '$lib/components/editor/EditorHeatmapPanel.svelte';
  import CoverageStatsPanel from '$lib/components/editor/CoverageStatsPanel.svelte';
  import ChannelConflictOverlay from '$lib/components/editor/ChannelConflictOverlay.svelte';
  import ChannelMapPanel from '$lib/components/editor/ChannelMapPanel.svelte';
  import PlacementHintMarker from '$lib/components/editor/PlacementHintMarker.svelte';

  import { safeInvoke, type MaterialResponse, type SegmentInput } from '$lib/api/invoke';
  import { createWall, deleteWall, updateWall, type WallSegmentInput } from '$lib/api/wall';
  import { registerShortcuts } from '$lib/utils/keyboard';
  import { getRotatedBoundingBox, projectPointOnSegment, findNearestWallSegment } from '$lib/editor/editorUtils';
  import { calculateCoverageFromBins, estimateCoverageFromStats, type CoverageStats } from '$lib/heatmap/coverage-stats';
  import type { PlacementHint } from '$lib/heatmap';
  import type { Position } from '$lib/models/types';

  // ── Canvas state ──────────────────────────────────────────────
  let containerWidth = $state(0);
  let containerHeight = $state(0);
  let editorRef: FloorplanEditor | undefined = $state();
  let wallDrawingLayer: WallDrawingLayer | undefined = $state();
  let roomDrawingLayer: RoomDrawingLayer | undefined = $state();
  let canvasReady = $state(false);
  let mousePosition = $state<Position | null>(null);

  // Image state
  let imageUrl = $state<string | null>(null);
  let imageWidth = $state(0);
  let imageHeight = $state(0);

  // Materials
  let materials = $state<MaterialResponse[]>([]);

  // Measure tool
  let measureStart = $state<{ x: number; y: number } | null>(null);
  let measureEnd = $state<{ x: number; y: number } | null>(null);
  let savedMeasurements = $state<import('$lib/canvas/SavedMeasurements.svelte').SavedMeasurement[]>([]);
  let selectedMeasurementId = $state<string | null>(null);

  // Annotations
  let annotations = $state<AnnotationData[]>([]);
  let editingAnnotationId = $state<string | null>(null);
  let textInputPosition = $state<{ x: number; y: number } | null>(null);
  let textInputValue = $state('');

  // Context menu
  let contextMenuVisible = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

  // Door/Window 2-click placement
  let doorWindowStart = $state<{
    wallId: string;
    segIdx: number;
    t: number;
    x: number;
    y: number;
  } | null>(null);

  // ── Derived state ─────────────────────────────────────────────
  let floor = $derived(projectStore.activeFloor);
  let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
  let floorRotation = $derived(floor?.background_image_rotation ?? 0);
  let wallCount = $derived(floor?.walls?.length ?? 0);

  let canvasWidthM = $derived.by(() => {
    if (imageWidth > 0 && scalePxPerMeter > 0) {
      const { w } = getRotatedBoundingBox(imageWidth, imageHeight, floorRotation);
      return w / scalePxPerMeter;
    }
    return floor?.width_meters ?? 10;
  });

  let canvasHeightM = $derived.by(() => {
    if (imageHeight > 0 && scalePxPerMeter > 0) {
      const { h } = getRotatedBoundingBox(imageWidth, imageHeight, floorRotation);
      return h / scalePxPerMeter;
    }
    return floor?.height_meters ?? 10;
  });

  let wallMaterialId = $derived.by(() => {
    const tool = canvasStore.activeTool;
    if (tool === 'door') return 'mat-wood-door';
    if (tool === 'window') return 'mat-window';
    return canvasStore.selectedMaterialId ?? 'Q01';
  });

  let wallSnapTargets = $derived.by((): Position[] => {
    const walls = floor?.walls ?? [];
    const points: Position[] = [];
    for (const wall of walls) {
      for (const seg of wall.segments) {
        points.push(
          { x: seg.x1 * scalePxPerMeter, y: seg.y1 * scalePxPerMeter },
          { x: seg.x2 * scalePxPerMeter, y: seg.y2 * scalePxPerMeter },
        );
      }
    }
    return points;
  });

  // Floor bounds for heatmap
  let floorBounds = $derived.by(() => {
    const walls = floor?.walls ?? [];
    const aps = floor?.access_points ?? [];
    if (walls.length === 0 && aps.length === 0) {
      return { width: floor?.width_meters ?? 10, height: floor?.height_meters ?? 10, originX: 0, originY: 0 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      for (const seg of w.segments) {
        minX = Math.min(minX, seg.x1, seg.x2);
        minY = Math.min(minY, seg.y1, seg.y2);
        maxX = Math.max(maxX, seg.x1, seg.x2);
        maxY = Math.max(maxY, seg.y1, seg.y2);
      }
    }
    for (const ap of aps) {
      minX = Math.min(minX, ap.x); minY = Math.min(minY, ap.y);
      maxX = Math.max(maxX, ap.x); maxY = Math.max(maxY, ap.y);
    }
    const pad = 2;
    return {
      originX: Math.floor(minX) - pad,
      originY: Math.floor(minY) - pad,
      width: Math.ceil(maxX - Math.floor(minX)) + 2 * pad,
      height: Math.ceil(maxY - Math.floor(minY)) + 2 * pad,
    };
  });

  // Selection-based properties
  let selectedWalls = $derived.by(() => {
    const ids = canvasStore.selectedIds;
    if (ids.length === 0) return [];
    return (floor?.walls ?? []).filter(w => ids.includes(w.id));
  });

  let selectedWall = $derived.by(() => {
    const ids = canvasStore.selectedIds;
    if (ids.length !== 1) return null;
    return floor?.walls?.find((w) => w.id === ids[0]) ?? null;
  });

  let selectedAp = $derived.by(() => {
    const ids = canvasStore.selectedIds;
    if (ids.length !== 1) return null;
    return floor?.access_points?.find((ap) => ap.id === ids[0]) ?? null;
  });

  let showPropertiesPanel = $derived(selectedWalls.length > 0 || selectedWall !== null || selectedAp !== null);

  // Coverage stats
  let coverageStats = $derived.by((): CoverageStats | null => {
    const s = editorHeatmapStore.stats;
    if (!s) return null;
    if (s.coverageBins) {
      const total = s.coverageBins.excellent + s.coverageBins.good + s.coverageBins.fair + s.coverageBins.poor + s.coverageBins.none;
      return calculateCoverageFromBins(s.coverageBins, total);
    }
    return estimateCoverageFromStats(s.minRSSI, s.maxRSSI, s.avgRSSI);
  });

  let placementHints = $derived<PlacementHint[]>(editorHeatmapStore.stats?.placementHints ?? []);

  // Door/Window preview
  interface DoorWindowPreview {
    x1: number; y1: number; x2: number; y2: number;
    type: 'door' | 'window';
  }

  let doorWindowPreview = $derived.by((): DoorWindowPreview | null => {
    const dwStart = doorWindowStart;
    if (!dwStart || !mousePosition) return null;
    const tool = canvasStore.activeTool;
    if (tool !== 'door' && tool !== 'window') return null;

    const walls = floor?.walls ?? [];
    const wall = walls.find(w => w.id === dwStart.wallId);
    if (!wall) return null;

    const sorted = wall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
    const seg = sorted[dwStart.segIdx];
    if (!seg) return null;

    const mouseXM = mousePosition.x / scalePxPerMeter;
    const mouseYM = mousePosition.y / scalePxPerMeter;
    const proj = projectPointOnSegment(mouseXM, mouseYM, seg.x1, seg.y1, seg.x2, seg.y2);

    const tStart = Math.min(dwStart.t, proj.t);
    const tEnd = Math.max(dwStart.t, proj.t);
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;

    return {
      x1: (seg.x1 + dx * tStart) * scalePxPerMeter,
      y1: (seg.y1 + dy * tStart) * scalePxPerMeter,
      x2: (seg.x1 + dx * tEnd) * scalePxPerMeter,
      y2: (seg.y1 + dy * tEnd) * scalePxPerMeter,
      type: tool,
    };
  });

  // Cursor
  let canvasCursor = $derived.by(() => {
    if (canvasStore.spaceHeld) return 'grab';
    switch (canvasStore.activeTool) {
      case 'pan': return 'grab';
      case 'select': return 'default';
      case 'text': return 'text';
      default: return 'crosshair';
    }
  });

  // Measure distance
  let measuredDistance = $derived.by((): number | null => {
    if (!measureStart || !measureEnd) return null;
    const dx = measureEnd.x - measureStart.x;
    const dy = measureEnd.y - measureStart.y;
    return Math.sqrt(dx * dx + dy * dy) / scalePxPerMeter;
  });

  // ── Effects ───────────────────────────────────────────────────

  // Initialize canvas for wizard context (run once, no reactive tracking)
  $effect(() => {
    untrack(() => {
      canvasStore.reset();
      canvasStore.setPageContext('wizard');
    });
  });

  // Load image from localStorage
  $effect(() => {
    const floorId = wizardStore.floorId;
    if (!floorId) return;
    const stored = localStorage.getItem(`wlan-opt:floor-image:${floorId}`);
    if (stored) {
      imageUrl = stored;
      const img = new Image();
      img.onload = () => {
        imageWidth = img.naturalWidth;
        imageHeight = img.naturalHeight;
      };
      img.src = stored;
    }
  });

  // Auto-fit when canvas ready
  $effect(() => {
    if (containerWidth > 0 && containerHeight > 0 && editorRef && !canvasReady) {
      requestAnimationFrame(() => editorRef?.fitToScreen());
      canvasReady = true;
    }
  });

  // Load materials
  $effect(() => {
    loadMaterials();
  });

  // Load annotations from localStorage
  $effect(() => {
    const floorId = floor?.id;
    if (!floorId) return;
    const stored = localStorage.getItem(`wlan-opt:annotations:${floorId}`);
    if (stored) {
      try { annotations = JSON.parse(stored) as AnnotationData[]; } catch { /* ignore */ }
    } else {
      annotations = [];
    }
  });

  // Load saved measurements from localStorage
  $effect(() => {
    const floorId = floor?.id;
    if (!floorId) return;
    const stored = localStorage.getItem(`wlan-opt:measurements:${floorId}`);
    if (stored) {
      try { savedMeasurements = JSON.parse(stored); } catch { /* ignore */ }
    } else {
      savedMeasurements = [];
    }
    selectedMeasurementId = null;
  });

  // Load background offset from localStorage (set in StepCalibration drag)
  $effect(() => {
    const floorId = floor?.id;
    if (!floorId) return;
    const stored = localStorage.getItem(`wlan-opt:bg-offset:${floorId}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          canvasStore.setBackgroundOffset(data.x, data.y);
        }
      } catch { /* ignore */ }
    } else {
      canvasStore.setBackgroundOffset(0, 0);
    }
  });

  // Channel analysis
  $effect(() => {
    const aps = floor?.access_points ?? [];
    if (aps.length > 0) {
      channelStore.analyze(aps);
    }
  });

  // Reset door/window start on tool change
  $effect(() => {
    const tool = canvasStore.activeTool;
    if (tool !== 'door' && tool !== 'window') {
      doorWindowStart = null;
    }
  });

  // Reset measure on tool change
  $effect(() => {
    if (canvasStore.activeTool !== 'measure') {
      resetMeasure();
    }
  });

  // Enter key to pin measurement
  $effect(() => {
    function handleEnterPin(e: KeyboardEvent): void {
      if (e.key === 'Enter' && measureStart && measureEnd) {
        e.preventDefault();
        handlePinMeasurement();
      }
    }
    document.addEventListener('keydown', handleEnterPin);
    return () => document.removeEventListener('keydown', handleEnterPin);
  });

  // Keyboard shortcuts
  $effect(() => {
    const cleanup = registerShortcuts({
      undo: () => { undoStore.undo(); },
      redo: () => { undoStore.redo(); },
      delete: () => {
        if (selectedMeasurementId) { handleDeleteMeasurement(); return; }
        handleDeleteSelected();
      },
      save: () => { projectStore.saveCurrentProject(); },
      deselect: () => {
        if (doorWindowStart) { doorWindowStart = null; return; }
        if (selectedMeasurementId) { selectedMeasurementId = null; return; }
        resetMeasure();
        canvasStore.setTool('select');
        canvasStore.clearSelection();
      },
      wallTool: () => { canvasStore.setTool('wall'); },
      doorTool: () => { canvasStore.setTool('door'); },
      windowTool: () => { canvasStore.setTool('window'); },
      measureTool: () => { canvasStore.setTool('measure'); },
      textTool: () => { canvasStore.setTool('text'); },
      selectTool: () => { canvasStore.setTool('select'); },
      panTool: () => { canvasStore.setTool('pan'); },
      roomTool: () => { canvasStore.setTool('room'); },
      gridToggle: () => { canvasStore.toggleGrid(); },
      heatmapToggle: () => { editorHeatmapStore.toggleVisible(); },
      copy: handleCopy,
      cut: handleCut,
      paste: () => { handlePaste(); },
      duplicate: handleDuplicate,
      selectAll: handleSelectAll,
    });
    return cleanup;
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      editorHeatmapStore.reset();
      channelStore.reset();
    };
  });

  // ── Functions ─────────────────────────────────────────────────

  async function loadMaterials(): Promise<void> {
    try { materials = await safeInvoke('list_materials', {}); } catch { /* ignore */ }
  }

  function saveAnnotations(): void {
    const floorId = floor?.id;
    if (!floorId) return;
    localStorage.setItem(`wlan-opt:annotations:${floorId}`, JSON.stringify(annotations));
  }

  function saveMeasurementsToStorage(): void {
    const floorId = floor?.id;
    if (!floorId) return;
    localStorage.setItem(`wlan-opt:measurements:${floorId}`, JSON.stringify(savedMeasurements));
  }

  function handleBackgroundDragEnd(x: number, y: number): void {
    canvasStore.setBackgroundOffset(x, y);
    const floorId = floor?.id;
    if (floorId) {
      localStorage.setItem(`wlan-opt:bg-offset:${floorId}`, JSON.stringify({ x, y }));
    }
  }

  // ── Canvas interaction ────────────────────────────────────────

  function handleCanvasClick(canvasX: number, canvasY: number): void {
    const tool = canvasStore.activeTool;

    // Door/Window: try 2-click insertion first
    if ((tool === 'door' || tool === 'window') && floor?.walls) {
      const inserted = tryInsertDoorWindow(canvasX, canvasY, tool);
      if (inserted) return;
    }

    if ((tool === 'wall' || tool === 'door' || tool === 'window') && wallDrawingLayer) {
      wallDrawingLayer.handleClick({ x: canvasX, y: canvasY });
      return;
    }

    if (tool === 'room' && roomDrawingLayer) {
      roomDrawingLayer.handleClick({ x: canvasX, y: canvasY });
      return;
    }

    if (tool === 'text') {
      textInputPosition = { x: canvasX / scalePxPerMeter, y: canvasY / scalePxPerMeter };
      textInputValue = '';
      return;
    }

    if (tool === 'measure') {
      if (!measureStart) {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      } else if (!measureEnd) {
        measureEnd = { x: canvasX, y: canvasY };
      } else {
        measureStart = { x: canvasX, y: canvasY };
        measureEnd = null;
      }
      return;
    }

    if (tool === 'select') {
      if (!canvasStore.shiftHeld) {
        canvasStore.clearSelection();
      }
    }
  }

  function handleCanvasDblClick(canvasX: number, canvasY: number): void {
    const tool = canvasStore.activeTool;
    if ((tool === 'wall' || tool === 'door' || tool === 'window') && wallDrawingLayer) {
      wallDrawingLayer.handleDoubleClick({ x: canvasX, y: canvasY });
    }
    if (tool === 'room' && roomDrawingLayer) {
      roomDrawingLayer.handleDoubleClick({ x: canvasX, y: canvasY });
    }
  }

  function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
    mousePosition = { x: canvasX, y: canvasY };
    canvasStore.setMousePosition(canvasX / scalePxPerMeter, canvasY / scalePxPerMeter);
  }

  function handleItemSelect(id: string): void {
    if (canvasStore.activeTool === 'select') {
      canvasStore.selectItem(id, canvasStore.shiftHeld);
    }
  }

  // ── Wall operations (with undo) ───────────────────────────────

  async function handleWallUpdate(
    wallId: string,
    updates: { materialId?: string; thicknessCm?: number | null; attenuationOverride24ghz?: number | null; attenuationOverride5ghz?: number | null },
  ): Promise<void> {
    const wall = floor?.walls?.find((w) => w.id === wallId);
    const oldValues = {
      materialId: wall?.material_id,
      thicknessCm: wall?.thickness_cm,
      attenuationOverride24ghz: wall?.attenuation_override_24ghz,
      attenuationOverride5ghz: wall?.attenuation_override_5ghz,
    };
    const command: EditorCommand = {
      label: 'Update Wall',
      async execute() { await updateWall(wallId, updates); await projectStore.refreshFloorData(); projectStore.markDirty(); },
      async undo() { await updateWall(wallId, oldValues); await projectStore.refreshFloorData(); projectStore.markDirty(); },
    };
    try { await undoStore.execute(command); } catch (err) { console.error('[Wizard] Failed to update wall:', err); }
  }

  async function handleBulkWallUpdate(wallIds: string[], updates: { materialId?: string }): Promise<void> {
    for (const id of wallIds) { await handleWallUpdate(id, updates); }
  }

  async function handleWallSegmentsUpdate(wallId: string, segments: SegmentInput[]): Promise<void> {
    const wall = floor?.walls?.find((w) => w.id === wallId);
    const oldSegments: SegmentInput[] = (wall?.segments ?? []).map((s) => ({
      segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
    }));
    try {
      await updateWall(wallId, { segments });
      await projectStore.refreshFloorData();
      projectStore.markDirty();
      undoStore.pushExecuted({
        label: 'Move Wall Endpoint',
        async execute() { await updateWall(wallId, { segments }); await projectStore.refreshFloorData(); projectStore.markDirty(); },
        async undo() { await updateWall(wallId, { segments: oldSegments }); await projectStore.refreshFloorData(); projectStore.markDirty(); },
      });
    } catch (err) { console.error('[Wizard] Failed to update wall segments:', err); }
  }

  async function handleDeleteWall(wallId: string): Promise<void> {
    const wall = floor?.walls?.find((w) => w.id === wallId);
    if (!wall) return;
    const wallFloorId = wall.floor_id;
    const wallMaterial = wall.material_id;
    const wallSegments: WallSegmentInput[] = wall.segments.map((s) => ({
      segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
    }));
    const wallOverrides = { att24: wall.attenuation_override_24ghz, att5: wall.attenuation_override_5ghz, att6: wall.attenuation_override_6ghz };
    let currentWallId = wallId;
    const command: EditorCommand = {
      label: 'Delete Wall',
      async execute() { await deleteWall(currentWallId); canvasStore.clearSelection(); await projectStore.refreshFloorData(); projectStore.markDirty(); },
      async undo() {
        const result = await createWall(wallFloorId, wallMaterial, wallSegments);
        currentWallId = result.id;
        if (wallOverrides.att24 !== null || wallOverrides.att5 !== null || wallOverrides.att6 !== null) {
          await updateWall(currentWallId, { attenuationOverride24ghz: wallOverrides.att24, attenuationOverride5ghz: wallOverrides.att5, attenuationOverride6ghz: wallOverrides.att6 });
        }
        await projectStore.refreshFloorData(); projectStore.markDirty();
      },
    };
    try { await undoStore.execute(command); } catch (err) { console.error('[Wizard] Failed to delete wall:', err); }
  }

  async function handleWallCreated(wallId: string, wallFloorId: string, wallMaterial: string, segments: WallSegmentInput[]): Promise<void> {
    await projectStore.refreshFloorData();
    projectStore.markDirty();
    let currentWallId = wallId;
    undoStore.pushExecuted({
      label: 'Create Wall',
      async execute() { const result = await createWall(wallFloorId, wallMaterial, segments); currentWallId = result.id; await projectStore.refreshFloorData(); projectStore.markDirty(); },
      async undo() { await deleteWall(currentWallId); await projectStore.refreshFloorData(); projectStore.markDirty(); },
    });
  }

  async function handleRoomCreated(wallIds: string[], areaM2: number, centroid: Position): Promise<void> {
    await projectStore.refreshFloorData();
    projectStore.markDirty();
    const annotationId = crypto.randomUUID();
    const areaAnnotation: AnnotationData = {
      id: annotationId,
      x: centroid.x / scalePxPerMeter,
      y: centroid.y / scalePxPerMeter,
      text: `${areaM2.toFixed(1)} m\u00B2`,
      fontSize: 14,
    };
    annotations = [...annotations, areaAnnotation];
    saveAnnotations();
    const capturedIds = [...wallIds];
    const capturedAnnotationId = annotationId;
    undoStore.pushExecuted({
      label: `Create Room (${capturedIds.length} walls)`,
      async execute() { await projectStore.refreshFloorData(); },
      async undo() {
        for (const id of capturedIds) { try { await deleteWall(id); } catch { /* ignore */ } }
        annotations = annotations.filter(a => a.id !== capturedAnnotationId);
        saveAnnotations();
        await projectStore.refreshFloorData(); projectStore.markDirty();
      },
    });
  }

  // ── Delete selected ───────────────────────────────────────────

  async function handleDeleteSelected(): Promise<void> {
    const ids = canvasStore.selectedIds;
    if (ids.length === 0) return;

    if (ids.length === 1) {
      const id = ids[0]!;
      const wall = floor?.walls?.find((w) => w.id === id);
      if (wall) { await handleDeleteWall(id); return; }
      // Annotations
      const ann = annotations.find(a => a.id === id);
      if (ann) { handleDeleteAnnotation(id); canvasStore.clearSelection(); return; }
    }

    // Multi-selection: walls only (no AP deletion in wizard)
    interface CapturedWall { floorId: string; materialId: string; segments: WallSegmentInput[]; attOverride24: number | null; attOverride5: number | null; attOverride6: number | null; }
    const capturedWalls: { id: string; data: CapturedWall }[] = [];
    for (const id of ids) {
      const wall = floor?.walls?.find((w) => w.id === id);
      if (wall) {
        capturedWalls.push({
          id,
          data: {
            floorId: wall.floor_id, materialId: wall.material_id,
            segments: wall.segments.map((s) => ({ segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
            attOverride24: wall.attenuation_override_24ghz, attOverride5: wall.attenuation_override_5ghz, attOverride6: wall.attenuation_override_6ghz,
          },
        });
      }
    }
    if (capturedWalls.length === 0) return;

    let currentWallIds = capturedWalls.map((w) => w.id);
    const command: EditorCommand = {
      label: `Delete ${currentWallIds.length} Walls`,
      async execute() {
        for (const wallId of currentWallIds) { await deleteWall(wallId); }
        canvasStore.clearSelection(); await projectStore.refreshFloorData(); projectStore.markDirty();
      },
      async undo() {
        const newIds: string[] = [];
        for (const { data } of capturedWalls) {
          const result = await createWall(data.floorId, data.materialId, data.segments);
          if (data.attOverride24 !== null || data.attOverride5 !== null || data.attOverride6 !== null) {
            await updateWall(result.id, { attenuationOverride24ghz: data.attOverride24, attenuationOverride5ghz: data.attOverride5, attenuationOverride6ghz: data.attOverride6 });
          }
          newIds.push(result.id);
        }
        currentWallIds = newIds;
        await projectStore.refreshFloorData(); projectStore.markDirty();
      },
    };
    try { await undoStore.execute(command); } catch (err) { console.error('[Wizard] Failed to delete selected:', err); }
  }

  // ── Door/Window 2-click insertion ─────────────────────────────

  function tryInsertDoorWindow(canvasX: number, canvasY: number, tool: 'door' | 'window'): boolean {
    const clickXM = canvasX / scalePxPerMeter;
    const clickYM = canvasY / scalePxPerMeter;
    const maxDistM = 0.5;
    const minWidthM = tool === 'door' ? 0.3 : 0.2;
    const fallbackWidthM = tool === 'door' ? 0.9 : 1.2;

    if (!doorWindowStart) {
      const hit = findNearestWallSegment(floor?.walls ?? [], clickXM, clickYM, maxDistM);
      if (!hit) return false;
      doorWindowStart = { wallId: hit.wall.id, segIdx: hit.segIdx, t: hit.t, x: hit.projX, y: hit.projY };
      return true;
    }

    const dwStart = doorWindowStart;
    const walls = floor?.walls ?? [];
    const targetWall = walls.find(w => w.id === dwStart.wallId);
    if (!targetWall) { doorWindowStart = null; return false; }

    const sorted = targetWall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
    const seg = sorted[dwStart.segIdx];
    if (!seg) { doorWindowStart = null; return false; }

    const proj = projectPointOnSegment(clickXM, clickYM, seg.x1, seg.y1, seg.x2, seg.y2);
    if (proj.dist > maxDistM) {
      const hit = findNearestWallSegment(walls, clickXM, clickYM, maxDistM);
      if (hit) { doorWindowStart = { wallId: hit.wall.id, segIdx: hit.segIdx, t: hit.t, x: hit.projX, y: hit.projY }; return true; }
      doorWindowStart = null;
      return false;
    }

    let tStart = Math.min(dwStart.t, proj.t);
    let tEnd = Math.max(dwStart.t, proj.t);
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    const widthM = (tEnd - tStart) * segLen;

    if (widthM < minWidthM) {
      const midT = (dwStart.t + proj.t) / 2;
      const tHalf = (fallbackWidthM / 2) / segLen;
      tStart = midT - tHalf;
      tEnd = midT + tHalf;
      if (tStart < 0) { tEnd -= tStart; tStart = 0; }
      if (tEnd > 1) { tStart -= (tEnd - 1); tEnd = 1; }
      tStart = Math.max(0, tStart);
      tEnd = Math.min(1, tEnd);
    }

    executeDoorWindowSplit(targetWall, dwStart.segIdx, tStart, tEnd, tool);
    doorWindowStart = null;
    return true;
  }

  function executeDoorWindowSplit(
    targetWall: NonNullable<typeof floor>['walls'][number],
    segIdx: number, tStart: number, tEnd: number, tool: 'door' | 'window',
  ): void {
    const materialId = tool === 'door' ? 'mat-wood-door' : 'mat-window';
    const sorted = targetWall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
    const seg = sorted[segIdx]!;
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const splitStartX = seg.x1 + dx * tStart;
    const splitStartY = seg.y1 + dy * tStart;
    const splitEndX = seg.x1 + dx * tEnd;
    const splitEndY = seg.y1 + dy * tEnd;
    const floorId = targetWall.floor_id;
    const origMaterial = targetWall.material_id;
    const wallId = targetWall.id;

    (async () => {
      try {
        await deleteWall(wallId);
        const newWallIds: string[] = [];
        if (tStart > 0.01) {
          const result = await createWall(floorId, origMaterial, [{ segment_order: 0, x1: seg.x1, y1: seg.y1, x2: splitStartX, y2: splitStartY }]);
          newWallIds.push(result.id);
        }
        const doorResult = await createWall(floorId, materialId, [{ segment_order: 0, x1: splitStartX, y1: splitStartY, x2: splitEndX, y2: splitEndY }]);
        newWallIds.push(doorResult.id);
        if (tEnd < 0.99) {
          const result = await createWall(floorId, origMaterial, [{ segment_order: 0, x1: splitEndX, y1: splitEndY, x2: seg.x2, y2: seg.y2 }]);
          newWallIds.push(result.id);
        }
        await projectStore.refreshFloorData();
        projectStore.markDirty();
        const capturedNewIds = [...newWallIds];
        undoStore.pushExecuted({
          label: `Insert ${tool === 'door' ? 'Door' : 'Window'}`,
          async execute() { await projectStore.refreshFloorData(); },
          async undo() {
            for (const id of capturedNewIds) { try { await deleteWall(id); } catch { /* ignore */ } }
            await createWall(floorId, origMaterial, sorted.map(s => ({ segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })));
            await projectStore.refreshFloorData(); projectStore.markDirty();
          },
        });
      } catch (err) { console.error(`[Wizard] Failed to insert ${tool}:`, err); }
    })();
  }

  // ── Measure tool ──────────────────────────────────────────────

  function resetMeasure(): void { measureStart = null; measureEnd = null; }

  function handlePinMeasurement(): void {
    if (!measureStart || !measureEnd) return;
    const x1m = measureStart.x / scalePxPerMeter;
    const y1m = measureStart.y / scalePxPerMeter;
    const x2m = measureEnd.x / scalePxPerMeter;
    const y2m = measureEnd.y / scalePxPerMeter;
    const dist = Math.sqrt((x2m - x1m) ** 2 + (y2m - y1m) ** 2);
    savedMeasurements = [...savedMeasurements, { id: crypto.randomUUID(), x1: x1m, y1: y1m, x2: x2m, y2: y2m, distanceM: dist }];
    saveMeasurementsToStorage();
    resetMeasure();
  }

  function handleDeleteMeasurement(): void {
    if (!selectedMeasurementId) return;
    savedMeasurements = savedMeasurements.filter(m => m.id !== selectedMeasurementId);
    selectedMeasurementId = null;
    saveMeasurementsToStorage();
  }

  // ── Annotations ───────────────────────────────────────────────

  function confirmTextAnnotation(): void {
    if (!textInputPosition || !textInputValue.trim()) { textInputPosition = null; textInputValue = ''; return; }
    const newAnnotation: AnnotationData = { id: crypto.randomUUID(), x: textInputPosition.x, y: textInputPosition.y, text: textInputValue.trim(), fontSize: 14 };
    annotations = [...annotations, newAnnotation];
    saveAnnotations();
    textInputPosition = null;
    textInputValue = '';
  }

  function cancelTextAnnotation(): void { textInputPosition = null; textInputValue = ''; editingAnnotationId = null; }

  function handleAnnotationPositionChange(id: string, x: number, y: number): void {
    annotations = annotations.map((a) => a.id === id ? { ...a, x, y } : a);
    saveAnnotations();
  }

  function handleAnnotationEdit(id: string): void {
    editingAnnotationId = id;
    const ann = annotations.find((a) => a.id === id);
    if (ann) { textInputValue = ann.text; textInputPosition = { x: ann.x, y: ann.y }; }
  }

  function confirmEditAnnotation(): void {
    if (!editingAnnotationId || !textInputValue.trim()) { cancelTextAnnotation(); return; }
    annotations = annotations.map((a) => a.id === editingAnnotationId ? { ...a, text: textInputValue.trim() } : a);
    saveAnnotations();
    editingAnnotationId = null;
    textInputPosition = null;
    textInputValue = '';
  }

  function handleDeleteAnnotation(id: string): void {
    annotations = annotations.filter((a) => a.id !== id);
    saveAnnotations();
  }

  // ── Copy/Paste/Duplicate (walls only) ─────────────────────────

  function handleCopy(): void {
    const ids = canvasStore.selectedIds;
    if (ids.length === 0) return;
    const copiedWalls: ClipboardWall[] = [];
    for (const id of ids) {
      const wall = floor?.walls?.find((w) => w.id === id);
      if (wall) {
        copiedWalls.push({
          materialId: wall.material_id,
          segments: wall.segments.map((s) => ({ segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
          attOverride24: wall.attenuation_override_24ghz,
          attOverride5: wall.attenuation_override_5ghz,
          attOverride6: wall.attenuation_override_6ghz,
        });
      }
    }
    clipboardStore.copy(copiedWalls, []);
  }

  function handleCut(): void { handleCopy(); handleDeleteSelected(); }

  async function handlePaste(): Promise<void> {
    const clipboard = clipboardStore.paste();
    if (!clipboard || !floor) return;
    const offset = clipboardStore.pasteCount * 0.5;
    const floorId = floor.id;
    const createdWallIds: string[] = [];
    for (const w of clipboard.walls) {
      const offsetSegments = w.segments.map((s) => ({ segment_order: s.segment_order, x1: s.x1 + offset, y1: s.y1 + offset, x2: s.x2 + offset, y2: s.y2 + offset }));
      const result = await createWall(floorId, w.materialId, offsetSegments);
      if (w.attOverride24 !== null || w.attOverride5 !== null || w.attOverride6 !== null) {
        await updateWall(result.id, { attenuationOverride24ghz: w.attOverride24, attenuationOverride5ghz: w.attOverride5, attenuationOverride6ghz: w.attOverride6 });
      }
      createdWallIds.push(result.id);
    }
    await projectStore.refreshFloorData();
    projectStore.markDirty();
    canvasStore.clearSelection();
    for (const id of createdWallIds) { canvasStore.selectItem(id, true); }
    const capturedIds = [...createdWallIds];
    undoStore.pushExecuted({
      label: `Paste ${capturedIds.length} Walls`,
      async execute() { await projectStore.refreshFloorData(); },
      async undo() {
        for (const id of capturedIds) { try { await deleteWall(id); } catch { /* ignore */ } }
        canvasStore.clearSelection(); await projectStore.refreshFloorData(); projectStore.markDirty();
      },
    });
  }

  function handleDuplicate(): void { handleCopy(); handlePaste(); }

  function handleSelectAll(): void {
    if (!floor) return;
    canvasStore.clearSelection();
    for (const w of floor.walls ?? []) { canvasStore.selectItem(w.id, true); }
  }

  // ── Key handlers ──────────────────────────────────────────────

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') canvasStore.setShiftHeld(true);
    if (event.key === ' ' || event.code === 'Space') { event.preventDefault(); canvasStore.setSpaceHeld(true); }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') canvasStore.setShiftHeld(false);
    if (event.key === ' ' || event.code === 'Space') canvasStore.setSpaceHeld(false);
  }

  // ── PNG Export ─────────────────────────────────────────────────

  function handleExportPng(): void {
    const dataUrl = editorRef?.exportToDataURL(2);
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `floorplan-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── Wizard navigation ─────────────────────────────────────────

  function handleNext(): void {
    wizardStore.updateStepData({ wallsDrawn: wallCount > 0 });
    wizardStore.nextStep();
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<div class="step-walls">
  <!-- Toolbar -->
  <Toolbar
    activeTool={canvasStore.activeTool}
    zoomLevel={canvasStore.zoomPercent}
    toolbarConfig={canvasStore.toolbarConfig}
    onToolChange={(tool) => canvasStore.setTool(tool)}
    onZoomIn={() => canvasStore.zoomIn()}
    onZoomOut={() => canvasStore.zoomOut()}
    onZoomTo={(pct) => canvasStore.setScale(pct / 100)}
    onFitToScreen={() => editorRef?.fitToScreen()}
    onToggleGrid={() => canvasStore.toggleGrid()}
    onToggleSnap={() => canvasStore.toggleSnapToGrid()}
    onToggleBackground={() => canvasStore.toggleBackground()}
    backgroundOpacity={canvasStore.backgroundOpacity}
    onBackgroundOpacityChange={(v) => canvasStore.setBackgroundOpacity(v)}
    onUndo={() => undoStore.undo()}
    onRedo={() => undoStore.redo()}
    canUndo={undoStore.canUndo}
    canRedo={undoStore.canRedo}
    gridVisible={canvasStore.gridVisible}
    snapEnabled={canvasStore.snapToGridEnabled}
    backgroundVisible={canvasStore.backgroundVisible}
  />

  <!-- Canvas -->
  <div
    class="canvas-container"
    style:cursor={canvasCursor}
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    oncontextmenu={(e) => { e.preventDefault(); contextMenuX = e.clientX; contextMenuY = e.clientY; contextMenuVisible = true; }}
  >
    <!-- Headless heatmap renderer -->
    {#if floor}
      <EditorHeatmap
        accessPoints={floor.access_points ?? []}
        walls={floor.walls ?? []}
        bounds={floorBounds}
        {scalePxPerMeter}
        outputWidth={containerWidth}
        outputHeight={containerHeight}
      />
    {/if}

    {#if floor}
      <FloorplanEditor
        bind:this={editorRef}
        width={containerWidth}
        height={containerHeight}
        floorplanWidthM={canvasWidthM}
        floorplanHeightM={canvasHeightM}
        {scalePxPerMeter}
        draggable={canvasStore.activeTool === 'pan'}
        backgroundInteractive={canvasStore.activeTool === 'select' && canvasStore.backgroundVisible}
        onCanvasClick={handleCanvasClick}
        onCanvasDblClick={handleCanvasDblClick}
        onCanvasMouseMove={handleCanvasMouseMove}
      >
        {#snippet background()}
          {#if canvasStore.backgroundVisible && imageUrl}
            <BackgroundImage
              imageData={imageUrl}
              {scalePxPerMeter}
              rotation={floorRotation}
              opacity={canvasStore.backgroundOpacity}
              userOffsetX={canvasStore.backgroundOffsetX}
              userOffsetY={canvasStore.backgroundOffsetY}
              draggable={canvasStore.activeTool === 'select'}
              locked={true}
              onDragEnd={handleBackgroundDragEnd}
            />
          {/if}
          <GridOverlay
            gridSizeM={canvasStore.gridSize}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            stageOffsetX={canvasStore.offsetX}
            stageOffsetY={canvasStore.offsetY}
            viewportWidth={containerWidth}
            viewportHeight={containerHeight}
            visible={canvasStore.gridVisible}
          />
        {/snippet}

        {#snippet heatmap()}
          <HeatmapOverlay
            heatmapCanvas={editorHeatmapStore.canvas}
            bounds={floorBounds}
            {scalePxPerMeter}
            visible={editorHeatmapStore.visible && editorHeatmapStore.canvas !== null}
            opacity={editorHeatmapStore.opacity}
          />
        {/snippet}

        {#snippet ui()}
          <!-- Existing walls -->
          {#if floor.walls}
            {#each floor.walls as wall (wall.id)}
              <WallDrawingTool
                {wall}
                materialCategory={wall.material?.category ?? 'medium'}
                selected={canvasStore.isSelected(wall.id)}
                {scalePxPerMeter}
                stageScale={canvasStore.scale}
                editMode={canvasStore.activeTool === 'select'}
                interactive={canvasStore.activeTool === 'select'}
                onSelect={(id) => handleItemSelect(id)}
                onSegmentsUpdate={handleWallSegmentsUpdate}
              />
            {/each}
          {/if}

          <!-- Access points (read-only) -->
          {#if floor.access_points}
            {#each floor.access_points as ap (ap.id)}
              <AccessPointMarker
                accessPoint={ap}
                {scalePxPerMeter}
                draggable={false}
              />
            {/each}
          {/if}

          <!-- Wall drawing layer -->
          <WallDrawingLayer
            bind:this={wallDrawingLayer}
            active={canvasStore.activeTool === 'wall' || canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window'}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            snapTargets={wallSnapTargets}
            floorId={floor.id}
            materialId={wallMaterialId}
            {mousePosition}
            onWallCreated={handleWallCreated}
          />

          <!-- Room drawing layer -->
          <RoomDrawingLayer
            bind:this={roomDrawingLayer}
            active={canvasStore.activeTool === 'room'}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            snapTargets={wallSnapTargets}
            floorId={floor.id}
            materialId={wallMaterialId}
            {mousePosition}
            onRoomCreated={handleRoomCreated}
          />

          <!-- Text annotations -->
          {#each annotations as annotation (annotation.id)}
            <TextAnnotation
              {annotation}
              {scalePxPerMeter}
              selected={canvasStore.isSelected(annotation.id)}
              onSelect={(id) => handleItemSelect(id)}
              onPositionChange={handleAnnotationPositionChange}
              onEdit={handleAnnotationEdit}
            />
          {/each}

          <!-- Placement hints -->
          {#if editorHeatmapStore.visible && placementHints.length > 0}
            <PlacementHintMarker hints={placementHints} {scalePxPerMeter} />
          {/if}

          <!-- Measure layer -->
          {#if canvasStore.activeTool === 'measure' && measureStart}
            <MeasureLayer startPoint={measureStart} endPoint={measureEnd} {scalePxPerMeter} {mousePosition} />
          {/if}

          <!-- Saved measurements -->
          {#if savedMeasurements.length > 0}
            <SavedMeasurements
              measurements={savedMeasurements}
              {scalePxPerMeter}
              interactive={canvasStore.activeTool === 'select'}
              selectedId={selectedMeasurementId}
              onSelect={(id) => { selectedMeasurementId = id; canvasStore.clearSelection(); }}
            />
          {/if}

          <!-- Channel conflict overlay -->
          {#if channelStore.overlayVisible && channelStore.analysis}
            <ChannelConflictOverlay
              conflicts={channelStore.analysis.conflicts}
              accessPoints={floor.access_points ?? []}
              {scalePxPerMeter}
              visible={channelStore.overlayVisible}
            />
          {/if}

          <!-- Door/Window 2-click preview -->
          {#if doorWindowStart}
            <Circle
              x={doorWindowStart.x * scalePxPerMeter}
              y={doorWindowStart.y * scalePxPerMeter}
              radius={5}
              fill={canvasStore.activeTool === 'door' ? '#8B6914' : '#64B5F6'}
              stroke="#ffffff"
              strokeWidth={2}
              listening={false}
            />
            {#if doorWindowPreview}
              <Line
                points={[doorWindowPreview.x1, doorWindowPreview.y1, doorWindowPreview.x2, doorWindowPreview.y2]}
                stroke={doorWindowPreview.type === 'door' ? '#8B6914' : '#64B5F6'}
                strokeWidth={6}
                dash={doorWindowPreview.type === 'door' ? [6, 4] : [2, 3]}
                opacity={0.7}
                lineCap="butt"
                listening={false}
              />
            {/if}
          {/if}

          <!-- Crosshair cursor -->
          {#if mousePosition && canvasStore.activeTool !== 'pan' && canvasStore.activeTool !== 'select'}
            <CrosshairCursor x={mousePosition.x} y={mousePosition.y} />
          {/if}

          <!-- Ruler overlay -->
          <RulerOverlay
            widthPx={containerWidth}
            heightPx={containerHeight}
            {scalePxPerMeter}
            stageScale={canvasStore.scale}
            stageOffsetX={canvasStore.offsetX}
            stageOffsetY={canvasStore.offsetY}
          />
        {/snippet}
      </FloorplanEditor>

      <!-- Canvas scrollbars -->
      <CanvasScrollbars
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
        contentWidth={(floor.width_meters ?? 10) * scalePxPerMeter}
        contentHeight={(floor.height_meters ?? 10) * scalePxPerMeter}
        scale={canvasStore.scale}
        offsetX={canvasStore.offsetX}
        offsetY={canvasStore.offsetY}
        onOffsetChange={(x, y) => canvasStore.setOffset(x, y)}
      />

      <!-- Heatmap panel -->
      <EditorHeatmapPanel visible={editorHeatmapStore.visible} />

      <!-- Coverage stats -->
      {#if editorHeatmapStore.visible && coverageStats}
        <div class="coverage-floating-panel">
          <CoverageStatsPanel stats={coverageStats} />
        </div>
      {/if}

      <!-- Channel map panel -->
      <ChannelMapPanel
        analysis={channelStore.analysis}
        visible={channelStore.overlayVisible}
        onToggle={() => channelStore.toggleOverlay()}
      />

      <!-- Properties panel -->
      {#if showPropertiesPanel}
        <div class="properties-floating-panel">
          <PropertiesPanel
            {selectedWall}
            selectedAp={selectedAp}
            {selectedWalls}
            {materials}
            onWallUpdate={handleWallUpdate}
            onBulkWallUpdate={handleBulkWallUpdate}
            onDeleteWall={handleDeleteWall}
          />
        </div>
      {/if}

      <!-- Material picker -->
      {#if canvasStore.activeTool === 'wall' || canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window' || canvasStore.activeTool === 'room'}
        <div class="material-floating-panel">
          <MaterialPicker
            selectedMaterialId={canvasStore.selectedMaterialId}
            onSelect={(id) => canvasStore.setSelectedMaterial(id)}
            activeTool={canvasStore.activeTool}
          />
        </div>
      {/if}

      <!-- Context menu -->
      <ContextMenu
        visible={contextMenuVisible}
        x={contextMenuX}
        y={contextMenuY}
        hasWall={selectedWall !== null || selectedWalls.length > 0}
        hasAp={false}
        hasSelection={canvasStore.selectedIds.length > 0}
        hasClipboard={clipboardStore.hasData}
        onDelete={handleDeleteSelected}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={() => { handlePaste(); }}
        onDuplicate={handleDuplicate}
        onSelectAll={handleSelectAll}
        onClose={() => { contextMenuVisible = false; }}
      />

      <!-- Text annotation input -->
      {#if textInputPosition}
        <div class="text-annotation-input">
          <input
            type="text"
            class="annotation-input"
            bind:value={textInputValue}
            placeholder={t('editor.annotationPlaceholder')}
            autofocus
            onkeydown={(e) => {
              if (e.key === 'Enter') { if (editingAnnotationId) confirmEditAnnotation(); else confirmTextAnnotation(); }
              if (e.key === 'Escape') cancelTextAnnotation();
            }}
          />
          <div class="annotation-actions">
            <button class="btn-primary btn-sm" onclick={() => { if (editingAnnotationId) confirmEditAnnotation(); else confirmTextAnnotation(); }}>{t('action.confirm')}</button>
            <button class="btn-secondary btn-sm" onclick={cancelTextAnnotation}>{t('project.cancel')}</button>
          </div>
        </div>
      {/if}

      <!-- Measure result -->
      {#if canvasStore.activeTool === 'measure' && measuredDistance !== null}
        <div class="measure-result">
          {t('editor.measureDistance')}: {measuredDistance.toFixed(2)} m
          <button class="pin-btn" onclick={handlePinMeasurement} title={t('editor.saveMeasurement')}>📌</button>
        </div>
      {/if}

      <!-- Door/Window hint -->
      {#if canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window'}
        <div class="hint-bar">
          {doorWindowStart ? t('editor.doorWindowHint2') : t('editor.doorWindowHint1')}
          {#if doorWindowStart}
            <button class="btn-cancel-small" onclick={() => { doorWindowStart = null; }}>{t('project.cancel')}</button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Bottom bar -->
  <div class="bottom-bar">
    {#if wallCount > 0}
      <div class="wall-badge">
        <span class="badge-count">{wallCount}</span>
        <span class="badge-label">{t('wizard.wallCount')}</span>
      </div>
    {/if}
    <button class="btn-next" onclick={handleNext}>
      {#if wallCount > 0}
        {t('wizard.next')} &rarr;
      {:else}
        {t('wizard.skip')}
      {/if}
    </button>
  </div>
</div>

<style>
  .step-walls {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .canvas-container {
    flex: 1;
    min-height: 300px;
    overflow: hidden;
    background: var(--canvas-bg, #e8e8f0);
    position: relative;
  }

  .bottom-bar {
    flex-shrink: 0;
    padding: 12px 20px;
    background: var(--bg-primary, #ffffff);
    border-top: 1px solid var(--border, #e0e0e0);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .wall-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(76, 175, 80, 0.1);
    border-radius: 12px;
    font-size: 0.78rem;
    color: #4caf50;
    font-weight: 500;
  }

  .badge-count { font-weight: 700; font-size: 0.85rem; }
  .badge-label { font-weight: 400; }

  .btn-next {
    width: 100%;
    max-width: 500px;
    padding: 12px;
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: inherit;
  }

  .btn-next:hover { background: #3a5ce5; }

  /* Floating panels */
  .properties-floating-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 240px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    max-height: 60vh;
    overflow-y: auto;
  }

  .coverage-floating-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 200px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .material-floating-panel {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  /* Overlays */
  .text-annotation-input {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-primary, #ffffff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .annotation-input {
    padding: 8px 10px;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    font-size: 0.9rem;
    color: var(--text-primary, #1a1a2e);
    background: var(--bg-secondary, #fafafe);
    font-family: inherit;
    width: 200px;
  }

  .annotation-input:focus {
    outline: none;
    border-color: var(--accent, #4a6cf7);
    box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
  }

  .annotation-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .btn-primary {
    padding: 6px 14px;
    background: var(--accent, #4a6cf7);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .btn-primary:hover { background: #3a5ce5; }

  .btn-secondary {
    padding: 6px 14px;
    background: transparent;
    border: 1px solid var(--border, #d0d0e0);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-muted, #6a6a8a);
    cursor: pointer;
    font-family: inherit;
  }

  .btn-secondary:hover { background: var(--bg-tertiary, #f0f0f5); }

  .btn-sm { padding: 4px 10px; font-size: 0.75rem; }

  .measure-result {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(26, 26, 46, 0.92);
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    backdrop-filter: blur(8px);
  }

  .pin-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 2px;
  }

  .hint-bar {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(26, 26, 46, 0.85);
    color: #ffffff;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 0.8rem;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    backdrop-filter: blur(8px);
  }

  .btn-cancel-small {
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    color: #ffffff;
    font-size: 0.75rem;
    cursor: pointer;
    font-family: inherit;
  }

  .btn-cancel-small:hover { background: rgba(255, 255, 255, 0.25); }
</style>
