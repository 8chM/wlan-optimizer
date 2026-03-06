<!--
  Editor page - Sidebar-only: floating panels + editor logic.

  Canvas rendering is handled by the persistent WorkspaceCanvas in the layout.
  This page registers click/dblclick handlers and editor callbacks,
  syncs candidates/zones/capabilities to workspaceStore, and renders
  floating panels (Properties, MaterialPicker, APLibrary, ContextMenu, etc.).
-->
<script lang="ts">
import { createAccessPoint, deleteAccessPoint, updateAccessPoint } from '$lib/api/accessPoint';
import { safeInvoke, type MaterialResponse, type SegmentInput } from '$lib/api/invoke';
import { createWall, deleteWall, updateWall, type WallSegmentInput } from '$lib/api/wall';
import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
import ShortcutHelp from '$lib/components/common/ShortcutHelp.svelte';
import APLibraryPanel from '$lib/components/editor/APLibraryPanel.svelte';
import ChannelMapPanel from '$lib/components/editor/ChannelMapPanel.svelte';
import CoverageStatsPanel from '$lib/components/editor/CoverageStatsPanel.svelte';
import MaterialPicker from '$lib/components/editor/MaterialPicker.svelte';
import ContextMenu from '$lib/components/editor/ContextMenu.svelte';
import PropertiesPanel from '$lib/components/editor/PropertiesPanel.svelte';
import PointInspectorOverlay from '$lib/components/editor/PointInspectorOverlay.svelte';
import {
  type CoverageStats,
  calculateCoverageFromBins,
  estimateCoverageFromStats,
} from '$lib/heatmap/coverage-stats';
import { t } from '$lib/i18n';
import type { Position } from '$lib/models/types';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import { channelStore } from '$lib/stores/channelStore.svelte';
import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { undoStore, type EditorCommand } from '$lib/stores/undoStore.svelte';
import { clipboardStore, type ClipboardWall, type ClipboardAp } from '$lib/stores/clipboardStore.svelte';
import { workspaceStore } from '$lib/stores/workspaceStore.svelte';
import { registerShortcuts } from '$lib/utils/keyboard';
import { projectPointOnSegment, findNearestWallSegment } from '$lib/editor/editorUtils';
import { inspectPoint } from '$lib/heatmap/point-inspector';
import { convertApsToConfig, convertWallsToData } from '$lib/heatmap/convert';
import { recommendationStore } from '$lib/stores/recommendationStore.svelte';
import type { CandidateLocation, ConstraintZone, APCapabilities } from '$lib/recommendations/types';

// ─── Local State ──────────────────────────────────────────────

let shortcutHelpOpen = $state(false);
let materials = $state<MaterialResponse[]>([]);
let editingAnnotationId = $state<string | null>(null);
let textInputPosition = $state<{ x: number; y: number } | null>(null);
let textInputValue = $state('');
let contextMenuVisible = $state(false);
let contextMenuX = $state(0);
let contextMenuY = $state(0);
let altKeyHeld = $state(false);

// ── Candidate / Zone / Capabilities state ──────────────────────
let candidates = $state<CandidateLocation[]>([]);
let constraintZones = $state<ConstraintZone[]>([]);
let apCapabilities = $state<Map<string, APCapabilities>>(new Map());

// ─── Derived State ────────────────────────────────────────────

let floor = $derived(projectStore.activeFloor);
let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);

// Floor bounds for point inspector
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

// Cursor per tool
let canvasCursor = $derived.by(() => {
  if (canvasStore.spaceHeld) return 'grab';
  switch (canvasStore.activeTool) {
    case 'pan': return 'grab';
    case 'select': return 'default';
    case 'ap': return 'cell';
    case 'candidate': return 'cell';
    case 'zone': return 'crosshair';
    case 'text': return 'text';
    default: return 'crosshair';
  }
});

// ─── Selection-based properties panel ──────────────────────────

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

let selectedCandidate = $derived.by(() => {
  const ids = canvasStore.selectedIds;
  if (ids.length !== 1) return null;
  return candidates.find(c => c.id === ids[0]) ?? null;
});

let selectedZone = $derived.by(() => {
  const ids = canvasStore.selectedIds;
  if (ids.length !== 1) return null;
  return constraintZones.find(z => z.id === ids[0]) ?? null;
});

let selectedApCapabilities = $derived.by(() => {
  if (!selectedAp) return null;
  return apCapabilities.get(selectedAp.id) ?? null;
});

let showPropertiesPanel = $derived(
  selectedWalls.length > 0 || selectedWall !== null || selectedAp !== null ||
  selectedCandidate !== null || selectedZone !== null
);

// ── Coverage stats from heatmap ───────────────────────────────
let coverageStats = $derived.by((): CoverageStats | null => {
  const s = editorHeatmapStore.stats;
  if (!s) return null;
  if (s.coverageBins) {
    const total =
      s.coverageBins.excellent +
      s.coverageBins.good +
      s.coverageBins.fair +
      s.coverageBins.poor +
      s.coverageBins.none;
    return calculateCoverageFromBins(s.coverageBins, total);
  }
  return estimateCoverageFromStats(s.minRSSI, s.maxRSSI, s.avgRSSI);
});

// ─── Set Page Context ─────────────────────────────────────────

$effect(() => {
  canvasStore.setPageContext('editor');
});

// ─── Cursor Override ──────────────────────────────────────────

$effect(() => {
  workspaceStore.setCursorOverride(canvasCursor);
  return () => workspaceStore.setCursorOverride(null);
});

// ─── Register Click Handlers ──────────────────────────────────

$effect(() => {
  workspaceStore.registerHandlers({
    onClick: handleCanvasClick,
    onDblClick: handleCanvasDblClick,
  });

  return () => {
    workspaceStore.unregisterHandlers();
  };
});

// ─── Register Editor Callbacks ────────────────────────────────

$effect(() => {
  workspaceStore.registerEditorCallbacks({
    onItemSelect: handleItemSelect,
    onApPositionChange: handleApPositionChange,
    onAnnotationPositionChange: handleAnnotationPositionChange,
    onAnnotationEdit: handleAnnotationEdit,
    onWallSegmentsUpdate: handleWallSegmentsUpdate,
    onWallCreated: handleWallCreated,
    onRoomCreated: handleRoomCreated,
    onCandidatePositionChange: handleCandidatePositionChange,
    onCandidateDelete: handleCandidateDelete,
    onZonePositionChange: handleZonePositionChange,
    onZoneResize: (id, x, y, w, h) => {
      constraintZones = constraintZones.map(z => z.id === id ? { ...z, x, y, width: w, height: h } : z);
      saveZones();
    },
    onZoneDelete: handleZoneDelete,
    onBackgroundDragEnd: handleBackgroundDragEnd,
  });

  return () => {
    workspaceStore.unregisterEditorCallbacks();
  };
});

// ─── Sync candidates/zones to workspaceStore ──────────────────

$effect(() => {
  workspaceStore.setCandidates(candidates);
});
$effect(() => {
  workspaceStore.setConstraintZones(constraintZones);
});

// ─── Sync to recommendationStore ──────────────────────────────

$effect(() => {
  recommendationStore.setCandidates(candidates);
});
$effect(() => {
  recommendationStore.setConstraintZones(constraintZones);
});
$effect(() => {
  recommendationStore.setAPCapabilities([...apCapabilities.values()]);
});

// ─── Channel analysis (re-run when APs change) ───────────────

$effect(() => {
  const aps = floor?.access_points ?? [];
  if (aps.length > 0) {
    channelStore.analyze(aps);
  }
});

// ─── Load candidates/zones/capabilities from localStorage ─────

$effect(() => {
  const floorId = floor?.id;
  if (!floorId) return;
  try {
    const stored = localStorage.getItem(`wlan-opt:candidates:${floorId}`);
    candidates = stored ? JSON.parse(stored) : [];
  } catch { candidates = []; }
  try {
    const stored = localStorage.getItem(`wlan-opt:zones:${floorId}`);
    constraintZones = stored ? JSON.parse(stored) : [];
  } catch { constraintZones = []; }
  try {
    const stored = localStorage.getItem(`wlan-opt:capabilities:${floorId}`);
    if (stored) {
      const arr: APCapabilities[] = JSON.parse(stored);
      const map = new Map<string, APCapabilities>();
      for (const c of arr) map.set(c.apId, c);
      apCapabilities = map;
    } else {
      apCapabilities = new Map();
    }
  } catch { apCapabilities = new Map(); }
});

function saveCandidates(): void {
  const floorId = floor?.id;
  if (!floorId) return;
  localStorage.setItem(`wlan-opt:candidates:${floorId}`, JSON.stringify(candidates));
}

function saveZones(): void {
  const floorId = floor?.id;
  if (!floorId) return;
  localStorage.setItem(`wlan-opt:zones:${floorId}`, JSON.stringify(constraintZones));
}

function saveCapabilities(): void {
  const floorId = floor?.id;
  if (!floorId) return;
  localStorage.setItem(`wlan-opt:capabilities:${floorId}`, JSON.stringify([...apCapabilities.values()]));
}

// ─── Load materials on mount ──────────────────────────────────

$effect(() => {
  loadMaterials();
});

async function loadMaterials(): Promise<void> {
  try {
    materials = await safeInvoke('list_materials', {});
  } catch {
    // Materials will remain empty
  }
}

// ─── Background offset persistence ───────────────────────────

function handleBackgroundDragEnd(x: number, y: number): void {
  canvasStore.setBackgroundOffset(x, y);
  const floorId = floor?.id;
  if (floorId) {
    localStorage.setItem(`wlan-opt:bg-offset:${floorId}`, JSON.stringify({ x, y }));
  }
}

// ─── Annotation management ────────────────────────────────────

function saveAnnotations(): void {
  const floorId = floor?.id;
  if (!floorId) return;
  localStorage.setItem(`wlan-opt:annotations:${floorId}`, JSON.stringify(workspaceStore.annotations));
}

function confirmTextAnnotation(): void {
  if (!textInputPosition || !textInputValue.trim()) {
    textInputPosition = null;
    textInputValue = '';
    return;
  }
  const newAnnotation: AnnotationData = {
    id: crypto.randomUUID(),
    x: textInputPosition.x,
    y: textInputPosition.y,
    text: textInputValue.trim(),
    fontSize: 14,
  };
  workspaceStore.setAnnotations([...workspaceStore.annotations, newAnnotation]);
  saveAnnotations();
  textInputPosition = null;
  textInputValue = '';
}

function cancelTextAnnotation(): void {
  textInputPosition = null;
  textInputValue = '';
  editingAnnotationId = null;
}

function handleAnnotationPositionChange(id: string, x: number, y: number): void {
  workspaceStore.setAnnotations(
    workspaceStore.annotations.map((a) => a.id === id ? { ...a, x, y } : a),
  );
  saveAnnotations();
}

function handleAnnotationEdit(id: string): void {
  editingAnnotationId = id;
  const ann = workspaceStore.annotations.find((a) => a.id === id);
  if (ann) {
    textInputValue = ann.text;
    textInputPosition = { x: ann.x, y: ann.y };
  }
}

function confirmEditAnnotation(): void {
  if (!editingAnnotationId || !textInputValue.trim()) {
    cancelTextAnnotation();
    return;
  }
  workspaceStore.setAnnotations(
    workspaceStore.annotations.map((a) =>
      a.id === editingAnnotationId ? { ...a, text: textInputValue.trim() } : a,
    ),
  );
  saveAnnotations();
  editingAnnotationId = null;
  textInputPosition = null;
  textInputValue = '';
}

function handleDeleteAnnotation(id: string): void {
  workspaceStore.setAnnotations(workspaceStore.annotations.filter((a) => a.id !== id));
  saveAnnotations();
}

// ─── Item selection ───────────────────────────────────────────

function handleItemSelect(id: string): void {
  if (canvasStore.activeTool === 'select') {
    canvasStore.selectItem(id, canvasStore.shiftHeld);
  }
}

// ─── Door/Window 2-click placement ────────────────────────────

// Reset door/window start on tool change
$effect(() => {
  const tool = canvasStore.activeTool;
  if (tool !== 'door' && tool !== 'window') {
    workspaceStore.setDoorWindowStart(null);
  }
});

function executeDoorWindowSplit(
  targetWall: NonNullable<typeof floor>['walls'][number],
  segIdx: number,
  tStart: number,
  tEnd: number,
  tool: 'door' | 'window',
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
        const result = await createWall(floorId, origMaterial, [
          { segment_order: 0, x1: seg.x1, y1: seg.y1, x2: splitStartX, y2: splitStartY },
        ]);
        newWallIds.push(result.id);
      }

      const doorResult = await createWall(floorId, materialId, [
        { segment_order: 0, x1: splitStartX, y1: splitStartY, x2: splitEndX, y2: splitEndY },
      ]);
      newWallIds.push(doorResult.id);

      if (tEnd < 0.99) {
        const result = await createWall(floorId, origMaterial, [
          { segment_order: 0, x1: splitEndX, y1: splitEndY, x2: seg.x2, y2: seg.y2 },
        ]);
        newWallIds.push(result.id);
      }

      await projectStore.refreshFloorData();
      projectStore.markDirty();

      const capturedNewIds = [...newWallIds];
      undoStore.pushExecuted({
        label: `Insert ${tool === 'door' ? 'Door' : 'Window'}`,
        async execute() {
          await projectStore.refreshFloorData();
        },
        async undo() {
          for (const id of capturedNewIds) {
            try { await deleteWall(id); } catch { /* may already be deleted */ }
          }
          await createWall(floorId, origMaterial, sorted.map(s => ({
            segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
          })));
          await projectStore.refreshFloorData();
          projectStore.markDirty();
        },
      });
    } catch (err) {
      console.error(`[Editor] Failed to insert ${tool}:`, err);
    }
  })();
}

function tryInsertDoorWindow(canvasX: number, canvasY: number, tool: 'door' | 'window'): boolean {
  const clickXM = canvasX / scalePxPerMeter;
  const clickYM = canvasY / scalePxPerMeter;
  const maxDistM = 0.5;
  const minWidthM = tool === 'door' ? 0.3 : 0.2;
  const fallbackWidthM = tool === 'door' ? 0.9 : 1.2;

  const doorWindowStart = workspaceStore.doorWindowStart;

  // First click: set start point
  if (!doorWindowStart) {
    const hit = findNearestWallSegment(floor?.walls ?? [], clickXM, clickYM, maxDistM);
    if (!hit) return false;

    workspaceStore.setDoorWindowStart({
      wallId: hit.wall.id,
      segIdx: hit.segIdx,
      t: hit.t,
      x: hit.projX,
      y: hit.projY,
    });
    return true;
  }

  // Second click: set end point and split
  const dwStart = doorWindowStart;
  const walls = floor?.walls ?? [];
  const targetWall = walls.find(w => w.id === dwStart.wallId);
  if (!targetWall) {
    workspaceStore.setDoorWindowStart(null);
    return false;
  }

  const sorted = targetWall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
  const seg = sorted[dwStart.segIdx];
  if (!seg) {
    workspaceStore.setDoorWindowStart(null);
    return false;
  }

  const proj = projectPointOnSegment(clickXM, clickYM, seg.x1, seg.y1, seg.x2, seg.y2);

  if (proj.dist > maxDistM) {
    const hit = findNearestWallSegment(floor?.walls ?? [], clickXM, clickYM, maxDistM);
    if (hit) {
      workspaceStore.setDoorWindowStart({
        wallId: hit.wall.id,
        segIdx: hit.segIdx,
        t: hit.t,
        x: hit.projX,
        y: hit.projY,
      });
      return true;
    }
    workspaceStore.setDoorWindowStart(null);
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
    const halfWidth = fallbackWidthM / 2;
    const tHalf = halfWidth / segLen;
    tStart = midT - tHalf;
    tEnd = midT + tHalf;

    if (tStart < 0) { tEnd -= tStart; tStart = 0; }
    if (tEnd > 1) { tStart -= (tEnd - 1); tEnd = 1; }
    tStart = Math.max(0, tStart);
    tEnd = Math.min(1, tEnd);
  }

  executeDoorWindowSplit(targetWall, dwStart.segIdx, tStart, tEnd, tool);
  workspaceStore.setDoorWindowStart(null);
  return true;
}

// ─── Canvas Click Handler ─────────────────────────────────────

function handleCanvasClick(canvasX: number, canvasY: number): void {
  // Alt+Click: Point Inspector debug overlay
  if (altKeyHeld && floor && editorHeatmapStore.visible) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    const band = editorHeatmapStore.band;
    const aps = convertApsToConfig(floor.access_points ?? [], band);
    const walls = convertWallsToData(floor.walls ?? [], band);
    const result = inspectPoint(
      xMeters, yMeters, aps, walls, floorBounds, band,
      editorHeatmapStore.calibratedN,
      editorHeatmapStore.receiverGainDbi,
    );
    workspaceStore.setPointInspectorResult(result);
    return;
  }

  const tool = canvasStore.activeTool;

  // Door/Window tool
  if ((tool === 'door' || tool === 'window') && floor?.walls) {
    const inserted = tryInsertDoorWindow(canvasX, canvasY, tool);
    if (inserted) return;
  }

  // Wall/Door/Window drawing via layer API
  if ((tool === 'wall' || tool === 'door' || tool === 'window') && workspaceStore.wallLayerApi) {
    workspaceStore.wallLayerApi.handleClick({ x: canvasX, y: canvasY });
    return;
  }

  // Room drawing via layer API
  if (tool === 'room' && workspaceStore.roomLayerApi) {
    workspaceStore.roomLayerApi.handleClick({ x: canvasX, y: canvasY });
    return;
  }

  // AP placement
  if (tool === 'ap' && floor) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    placeAccessPoint(xMeters, yMeters);
    return;
  }

  // Candidate placement
  if (tool === 'candidate' && floor) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    const newCandidate: CandidateLocation = {
      id: `cand-${crypto.randomUUID().slice(0, 8)}`,
      label: `${t('candidate.title')} ${candidates.length + 1}`,
      x: xMeters,
      y: yMeters,
      hasLan: false,
      hasPoe: false,
      hasPower: true,
      mountingOptions: ['ceiling'],
      preferred: false,
      forbidden: false,
    };
    candidates = [...candidates, newCandidate];
    saveCandidates();
    canvasStore.clearSelection();
    canvasStore.selectItem(newCandidate.id, false);
    return;
  }

  // Zone placement
  if (tool === 'zone' && floor) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    const zoneSize = 2.0;
    const half = zoneSize / 2;
    const newZone: ConstraintZone = {
      id: `zone-${crypto.randomUUID().slice(0, 8)}`,
      type: 'preferred',
      x: Math.max(0, xMeters - half),
      y: Math.max(0, yMeters - half),
      width: zoneSize,
      height: zoneSize,
      weight: 3,
    };
    constraintZones = [...constraintZones, newZone];
    saveZones();
    canvasStore.clearSelection();
    canvasStore.selectItem(newZone.id, false);
    return;
  }

  // Text tool
  if (tool === 'text') {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    textInputPosition = { x: xMeters, y: yMeters };
    textInputValue = '';
    return;
  }

  // Select tool — clear selection on empty click
  if (tool === 'select') {
    if (!canvasStore.shiftHeld) {
      canvasStore.clearSelection();
    }
  }
}

function handleCanvasDblClick(canvasX: number, canvasY: number): void {
  const tool = canvasStore.activeTool;
  if ((tool === 'wall' || tool === 'door' || tool === 'window') && workspaceStore.wallLayerApi) {
    workspaceStore.wallLayerApi.handleDoubleClick({ x: canvasX, y: canvasY });
  }
  if (tool === 'room' && workspaceStore.roomLayerApi) {
    workspaceStore.roomLayerApi.handleDoubleClick({ x: canvasX, y: canvasY });
  }
}

// ─── Wall CRUD (with undo) ────────────────────────────────────

async function handleBulkWallUpdate(wallIds: string[], updates: { materialId?: string }): Promise<void> {
  for (const id of wallIds) {
    await handleWallUpdate(id, updates);
  }
}

async function handleWallUpdate(
  wallId: string,
  updates: {
    materialId?: string;
    thicknessCm?: number | null;
    attenuationOverride24ghz?: number | null;
    attenuationOverride5ghz?: number | null;
  },
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
    async execute() {
      await updateWall(wallId, updates);
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      await updateWall(wallId, oldValues);
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  };

  try {
    await undoStore.execute(command);
  } catch (err) {
    console.error('[Editor] Failed to update wall:', err);
  }
}

async function handleWallSegmentsUpdate(wallId: string, segments: SegmentInput[]): Promise<void> {
  const wall = floor?.walls?.find((w) => w.id === wallId);
  const oldSegments: SegmentInput[] = (wall?.segments ?? []).map((s) => ({
    segment_order: s.segment_order,
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
  }));

  try {
    await updateWall(wallId, { segments });
    await projectStore.refreshFloorData();
    projectStore.markDirty();

    undoStore.pushExecuted({
      label: 'Move Wall Endpoint',
      async execute() {
        await updateWall(wallId, { segments });
        await projectStore.refreshFloorData();
        projectStore.markDirty();
      },
      async undo() {
        await updateWall(wallId, { segments: oldSegments });
        await projectStore.refreshFloorData();
        projectStore.markDirty();
      },
    });
  } catch (err) {
    console.error('[Editor] Failed to update wall segments:', err);
  }
}

async function handleDeleteWall(wallId: string): Promise<void> {
  const wall = floor?.walls?.find((w) => w.id === wallId);
  if (!wall) return;
  const wallFloorId = wall.floor_id;
  const wallMaterial = wall.material_id;
  const wallSegments: WallSegmentInput[] = wall.segments.map((s) => ({
    segment_order: s.segment_order,
    x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
  }));
  const wallOverrides = {
    att24: wall.attenuation_override_24ghz,
    att5: wall.attenuation_override_5ghz,
    att6: wall.attenuation_override_6ghz,
  };

  let currentWallId = wallId;

  const command: EditorCommand = {
    label: 'Delete Wall',
    async execute() {
      await deleteWall(currentWallId);
      canvasStore.clearSelection();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      const result = await createWall(wallFloorId, wallMaterial, wallSegments);
      currentWallId = result.id;
      if (wallOverrides.att24 !== null || wallOverrides.att5 !== null || wallOverrides.att6 !== null) {
        await updateWall(currentWallId, {
          attenuationOverride24ghz: wallOverrides.att24,
          attenuationOverride5ghz: wallOverrides.att5,
          attenuationOverride6ghz: wallOverrides.att6,
        });
      }
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  };

  try {
    await undoStore.execute(command);
  } catch (err) {
    console.error('[Editor] Failed to delete wall:', err);
  }
}

// ─── AP CRUD (with undo) ─────────────────────────────────────

async function handleApUpdate(
  apId: string,
  updates: {
    label?: string;
    txPower24ghzDbm?: number;
    txPower5ghzDbm?: number;
    enabled?: boolean;
    height_m?: number;
    mounting?: string;
    channel_24ghz?: number;
    channel_5ghz?: number;
    channel_width?: string;
    orientation_deg?: number;
  },
): Promise<void> {
  const ap = floor?.access_points?.find((a) => a.id === apId);
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  if (updates.label !== undefined) { oldValues.label = ap?.label; newValues.label = updates.label; }
  if (updates.txPower24ghzDbm !== undefined) { oldValues.tx_power_24ghz_dbm = ap?.tx_power_24ghz_dbm; newValues.tx_power_24ghz_dbm = updates.txPower24ghzDbm; }
  if (updates.txPower5ghzDbm !== undefined) { oldValues.tx_power_5ghz_dbm = ap?.tx_power_5ghz_dbm; newValues.tx_power_5ghz_dbm = updates.txPower5ghzDbm; }
  if (updates.enabled !== undefined) { oldValues.enabled = ap?.enabled; newValues.enabled = updates.enabled; }
  if (updates.height_m !== undefined) { oldValues.height_m = ap?.height_m; newValues.height_m = updates.height_m; }
  if (updates.mounting !== undefined) { oldValues.mounting = ap?.mounting; newValues.mounting = updates.mounting; }
  if (updates.channel_24ghz !== undefined) { oldValues.channel_24ghz = ap?.channel_24ghz; newValues.channel_24ghz = updates.channel_24ghz; }
  if (updates.channel_5ghz !== undefined) { oldValues.channel_5ghz = ap?.channel_5ghz; newValues.channel_5ghz = updates.channel_5ghz; }
  if (updates.channel_width !== undefined) { oldValues.channel_width = ap?.channel_width; newValues.channel_width = updates.channel_width; }
  if (updates.orientation_deg !== undefined) { oldValues.orientation_deg = ap?.orientation_deg; newValues.orientation_deg = updates.orientation_deg; }

  const command: EditorCommand = {
    label: 'Update AP',
    async execute() {
      await updateAccessPoint(apId, newValues);
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      await updateAccessPoint(apId, oldValues);
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  };

  try {
    await undoStore.execute(command);
  } catch (err) {
    console.error('[Editor] Failed to update AP:', err);
  }
}

async function handleDeleteAp(apId: string): Promise<void> {
  const ap = floor?.access_points?.find((a) => a.id === apId);
  if (!ap) return;
  const apData = {
    floorId: ap.floor_id,
    x: ap.x, y: ap.y,
    apModelId: ap.ap_model_id ?? undefined,
    label: ap.label ?? undefined,
    height_m: ap.height_m,
    mounting: ap.mounting,
    tx_power_24ghz_dbm: ap.tx_power_24ghz_dbm ?? undefined,
    tx_power_5ghz_dbm: ap.tx_power_5ghz_dbm ?? undefined,
    channel_24ghz: ap.channel_24ghz ?? undefined,
    channel_5ghz: ap.channel_5ghz ?? undefined,
    channel_width: ap.channel_width,
    enabled: ap.enabled,
  };

  let currentApId = apId;

  const command: EditorCommand = {
    label: 'Delete AP',
    async execute() {
      await deleteAccessPoint(currentApId);
      canvasStore.clearSelection();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      const result = await createAccessPoint(apData.floorId, apData.x, apData.y, apData.apModelId, apData.label);
      currentApId = result.id;
      await updateAccessPoint(currentApId, {
        height_m: apData.height_m,
        mounting: apData.mounting,
        tx_power_24ghz_dbm: apData.tx_power_24ghz_dbm,
        tx_power_5ghz_dbm: apData.tx_power_5ghz_dbm,
        channel_24ghz: apData.channel_24ghz,
        channel_5ghz: apData.channel_5ghz,
        channel_width: apData.channel_width,
        enabled: apData.enabled,
      });
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  };

  try {
    await undoStore.execute(command);
  } catch (err) {
    console.error('[Editor] Failed to delete AP:', err);
  }
}

async function placeAccessPoint(x: number, y: number): Promise<void> {
  if (!floor) return;
  const apFloorId = floor.id;
  const apLabel = `AP ${(floor.access_points?.length ?? 0) + 1}`;
  const apModelId = canvasStore.selectedApModelId ?? undefined;
  let currentApId = '';

  const command: EditorCommand = {
    label: 'Place AP',
    async execute() {
      const result = await createAccessPoint(apFloorId, x, y, apModelId, apLabel);
      currentApId = result.id;
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      await deleteAccessPoint(currentApId);
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  };

  try {
    await undoStore.execute(command);
  } catch (err) {
    console.error('[Editor] Failed to place AP:', err);
  }
}

async function handleApPositionChange(apId: string, x: number, y: number): Promise<void> {
  const ap = floor?.access_points?.find((a) => a.id === apId);
  const oldX = ap?.x ?? x;
  const oldY = ap?.y ?? y;

  try {
    await updateAccessPoint(apId, { x, y });
    await projectStore.refreshFloorData();
    projectStore.markDirty();

    undoStore.pushExecuted({
      label: 'Move AP',
      async execute() {
        await updateAccessPoint(apId, { x, y });
        await projectStore.refreshFloorData();
        projectStore.markDirty();
      },
      async undo() {
        await updateAccessPoint(apId, { x: oldX, y: oldY });
        await projectStore.refreshFloorData();
        projectStore.markDirty();
      },
    });
  } catch (err) {
    console.error('[Editor] Failed to update AP position:', err);
  }
}

// ─── Candidate/Zone handlers ──────────────────────────────────

function handleCandidateUpdate(id: string, updates: Partial<CandidateLocation>): void {
  candidates = candidates.map(c => c.id === id ? { ...c, ...updates } : c);
  saveCandidates();
}

function handleCandidateDelete(id: string): void {
  candidates = candidates.filter(c => c.id !== id);
  canvasStore.clearSelection();
  saveCandidates();
}

function handleCandidatePositionChange(id: string, x: number, y: number): void {
  candidates = candidates.map(c => c.id === id ? { ...c, x, y } : c);
  saveCandidates();
}

function handleZoneUpdate(id: string, updates: Partial<ConstraintZone>): void {
  constraintZones = constraintZones.map(z => z.id === id ? { ...z, ...updates } : z);
  saveZones();
}

function handleZoneDelete(id: string): void {
  constraintZones = constraintZones.filter(z => z.id !== id);
  canvasStore.clearSelection();
  saveZones();
}

function handleZonePositionChange(id: string, x: number, y: number): void {
  constraintZones = constraintZones.map(z => z.id === id ? { ...z, x, y } : z);
  saveZones();
}

function handleCapabilitiesChange(apId: string, caps: APCapabilities): void {
  const newMap = new Map(apCapabilities);
  newMap.set(apId, caps);
  apCapabilities = newMap;
  saveCapabilities();
}

// ─── Wall/Room creation callbacks (with undo) ─────────────────

async function handleWallCreated(
  wallId: string,
  wallFloorId: string,
  wallMaterial: string,
  segments: WallSegmentInput[],
): Promise<void> {
  await projectStore.refreshFloorData();
  projectStore.markDirty();

  let currentWallId = wallId;
  undoStore.pushExecuted({
    label: 'Create Wall',
    async execute() {
      const result = await createWall(wallFloorId, wallMaterial, segments);
      currentWallId = result.id;
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      await deleteWall(currentWallId);
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  });
}

async function handleRoomCreated(wallIds: string[], areaM2: number, centroid: Position): Promise<void> {
  await projectStore.refreshFloorData();
  projectStore.markDirty();

  const roomNumber = workspaceStore.annotations.filter(a => a.text.includes('m\u00B2')).length + 1;
  const annotationId = crypto.randomUUID();
  const areaAnnotation: AnnotationData = {
    id: annotationId,
    x: centroid.x / scalePxPerMeter,
    y: centroid.y / scalePxPerMeter,
    text: `${areaM2.toFixed(1)} m\u00B2`,
    fontSize: 14,
  };
  workspaceStore.setAnnotations([...workspaceStore.annotations, areaAnnotation]);
  saveAnnotations();

  const capturedIds = [...wallIds];
  const capturedAnnotationId = annotationId;
  undoStore.pushExecuted({
    label: `Create Room (${capturedIds.length} walls)`,
    async execute() {
      await projectStore.refreshFloorData();
    },
    async undo() {
      for (const id of capturedIds) {
        try { await deleteWall(id); } catch { /* wall may already be deleted */ }
      }
      workspaceStore.setAnnotations(workspaceStore.annotations.filter(a => a.id !== capturedAnnotationId));
      saveAnnotations();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  });
}

// ─── Copy/Paste/Duplicate ─────────────────────────────────────

function handleCopy(): void {
  const ids = canvasStore.selectedIds;
  if (ids.length === 0) return;

  const copiedWalls: ClipboardWall[] = [];
  const copiedAps: ClipboardAp[] = [];

  for (const id of ids) {
    const wall = floor?.walls?.find((w) => w.id === id);
    if (wall) {
      copiedWalls.push({
        materialId: wall.material_id,
        segments: wall.segments.map((s) => ({
          segment_order: s.segment_order,
          x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
        })),
        attOverride24: wall.attenuation_override_24ghz,
        attOverride5: wall.attenuation_override_5ghz,
        attOverride6: wall.attenuation_override_6ghz,
      });
      continue;
    }
    const ap = floor?.access_points?.find((a) => a.id === id);
    if (ap) {
      copiedAps.push({
        apModelId: ap.ap_model_id ?? null,
        label: ap.label ?? null,
        x: ap.x, y: ap.y,
        height_m: ap.height_m,
        mounting: ap.mounting,
        tx_power_24ghz_dbm: ap.tx_power_24ghz_dbm,
        tx_power_5ghz_dbm: ap.tx_power_5ghz_dbm,
        channel_24ghz: ap.channel_24ghz,
        channel_5ghz: ap.channel_5ghz,
        channel_width: ap.channel_width,
        enabled: ap.enabled,
        orientation_deg: ap.orientation_deg ?? 0,
      });
    }
  }

  clipboardStore.copy(copiedWalls, copiedAps);
}

function handleCut(): void {
  handleCopy();
  handleDeleteSelected();
}

async function handlePaste(): Promise<void> {
  const clipboard = clipboardStore.paste();
  if (!clipboard || !floor) return;

  const offset = clipboardStore.pasteCount * 0.5;
  const floorId = floor.id;
  const createdWallIds: string[] = [];
  const createdApIds: string[] = [];

  for (const w of clipboard.walls) {
    const offsetSegments = w.segments.map((s) => ({
      segment_order: s.segment_order,
      x1: s.x1 + offset, y1: s.y1 + offset,
      x2: s.x2 + offset, y2: s.y2 + offset,
    }));
    const result = await createWall(floorId, w.materialId, offsetSegments);
    if (w.attOverride24 !== null || w.attOverride5 !== null || w.attOverride6 !== null) {
      await updateWall(result.id, {
        attenuationOverride24ghz: w.attOverride24,
        attenuationOverride5ghz: w.attOverride5,
        attenuationOverride6ghz: w.attOverride6,
      });
    }
    createdWallIds.push(result.id);
  }

  for (const a of clipboard.aps) {
    const result = await createAccessPoint(
      floorId, a.x + offset, a.y + offset,
      a.apModelId ?? undefined, a.label ?? undefined,
    );
    await updateAccessPoint(result.id, {
      height_m: a.height_m,
      mounting: a.mounting,
      tx_power_24ghz_dbm: a.tx_power_24ghz_dbm ?? undefined,
      tx_power_5ghz_dbm: a.tx_power_5ghz_dbm ?? undefined,
      channel_24ghz: a.channel_24ghz ?? undefined,
      channel_5ghz: a.channel_5ghz ?? undefined,
      channel_width: a.channel_width,
      enabled: a.enabled,
    });
    createdApIds.push(result.id);
  }

  await projectStore.refreshFloorData();
  projectStore.markDirty();

  canvasStore.clearSelection();
  for (const id of [...createdWallIds, ...createdApIds]) {
    canvasStore.selectItem(id, true);
  }

  const capturedWallIds = [...createdWallIds];
  const capturedApIds = [...createdApIds];
  undoStore.pushExecuted({
    label: `Paste ${capturedWallIds.length + capturedApIds.length} Items`,
    async execute() {
      await projectStore.refreshFloorData();
    },
    async undo() {
      for (const id of capturedWallIds) {
        try { await deleteWall(id); } catch { /* ignore */ }
      }
      for (const id of capturedApIds) {
        try { await deleteAccessPoint(id); } catch { /* ignore */ }
      }
      canvasStore.clearSelection();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  });
}

function handleDuplicate(): void {
  handleCopy();
  handlePaste();
}

function handleSelectAll(): void {
  if (!floor) return;
  canvasStore.clearSelection();
  for (const w of floor.walls ?? []) {
    canvasStore.selectItem(w.id, true);
  }
  for (const a of floor.access_points ?? []) {
    canvasStore.selectItem(a.id, true);
  }
}

// ─── Delete selected ──────────────────────────────────────────

async function handleDeleteSelected(): Promise<void> {
  const ids = canvasStore.selectedIds;
  if (ids.length === 0) return;

  if (ids.length === 1) {
    const id = ids[0]!;
    const wall = floor?.walls?.find((w) => w.id === id);
    if (wall) { await handleDeleteWall(id); return; }
    const ap = floor?.access_points?.find((a) => a.id === id);
    if (ap) { await handleDeleteAp(id); return; }
    if (candidates.find(c => c.id === id)) { handleCandidateDelete(id); return; }
    if (constraintZones.find(z => z.id === id)) { handleZoneDelete(id); return; }
  }

  interface CapturedWall {
    floorId: string; materialId: string; segments: WallSegmentInput[];
    attOverride24: number | null; attOverride5: number | null; attOverride6: number | null;
  }
  interface CapturedAp {
    floorId: string; x: number; y: number; apModelId?: string; label?: string;
    height_m: number; mounting: string; tx_power_24ghz_dbm?: number; tx_power_5ghz_dbm?: number;
    channel_24ghz?: number; channel_5ghz?: number; channel_width: string; enabled: boolean;
  }

  const capturedWalls: { id: string; data: CapturedWall }[] = [];
  const capturedAps: { id: string; data: CapturedAp }[] = [];

  for (const id of ids) {
    const wall = floor?.walls?.find((w) => w.id === id);
    if (wall) {
      capturedWalls.push({
        id, data: {
          floorId: wall.floor_id, materialId: wall.material_id,
          segments: wall.segments.map((s) => ({ segment_order: s.segment_order, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
          attOverride24: wall.attenuation_override_24ghz, attOverride5: wall.attenuation_override_5ghz, attOverride6: wall.attenuation_override_6ghz,
        },
      });
      continue;
    }
    const ap = floor?.access_points?.find((a) => a.id === id);
    if (ap) {
      capturedAps.push({
        id, data: {
          floorId: ap.floor_id, x: ap.x, y: ap.y, apModelId: ap.ap_model_id ?? undefined, label: ap.label ?? undefined,
          height_m: ap.height_m, mounting: ap.mounting, tx_power_24ghz_dbm: ap.tx_power_24ghz_dbm ?? undefined,
          tx_power_5ghz_dbm: ap.tx_power_5ghz_dbm ?? undefined, channel_24ghz: ap.channel_24ghz ?? undefined,
          channel_5ghz: ap.channel_5ghz ?? undefined, channel_width: ap.channel_width, enabled: ap.enabled,
        },
      });
    }
  }

  let currentWallIds = capturedWalls.map((w) => w.id);
  let currentApIds = capturedAps.map((a) => a.id);

  const command: EditorCommand = {
    label: `Delete ${ids.length} Items`,
    async execute() {
      for (const wallId of currentWallIds) { await deleteWall(wallId); }
      for (const apId of currentApIds) { await deleteAccessPoint(apId); }
      canvasStore.clearSelection();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      const newWallIds: string[] = [];
      for (const { data } of capturedWalls) {
        const result = await createWall(data.floorId, data.materialId, data.segments);
        if (data.attOverride24 !== null || data.attOverride5 !== null || data.attOverride6 !== null) {
          await updateWall(result.id, { attenuationOverride24ghz: data.attOverride24, attenuationOverride5ghz: data.attOverride5, attenuationOverride6ghz: data.attOverride6 });
        }
        newWallIds.push(result.id);
      }
      currentWallIds = newWallIds;

      const newApIds: string[] = [];
      for (const { data } of capturedAps) {
        const result = await createAccessPoint(data.floorId, data.x, data.y, data.apModelId, data.label);
        await updateAccessPoint(result.id, {
          height_m: data.height_m, mounting: data.mounting,
          tx_power_24ghz_dbm: data.tx_power_24ghz_dbm, tx_power_5ghz_dbm: data.tx_power_5ghz_dbm,
          channel_24ghz: data.channel_24ghz, channel_5ghz: data.channel_5ghz,
          channel_width: data.channel_width, enabled: data.enabled,
        });
        newApIds.push(result.id);
      }
      currentApIds = newApIds;

      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  };

  try {
    await undoStore.execute(command);
  } catch (err) {
    console.error('[Editor] Failed to delete selected items:', err);
  }
}

// ─── Alt key tracking for Point Inspector ────────────────────

$effect(() => {
  function handleKeyDown(e: KeyboardEvent): void { if (e.key === 'Alt') altKeyHeld = true; }
  function handleKeyUp(e: KeyboardEvent): void { if (e.key === 'Alt') altKeyHeld = false; }
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
});

// ─── Arrow key movement ──────────────────────────────────────

$effect(() => {
  function handleArrowKeys(event: KeyboardEvent): void {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const ids = canvasStore.selectedIds;
    if (ids.length === 0) return;

    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    let dx = 0, dy = 0;
    if (event.key === 'ArrowUp') dy = -step;
    if (event.key === 'ArrowDown') dy = step;
    if (event.key === 'ArrowLeft') dx = -step;
    if (event.key === 'ArrowRight') dx = step;

    for (const id of ids) {
      const ap = floor?.access_points?.find(a => a.id === id);
      if (ap) { handleApPositionChange(id, ap.x + dx, ap.y + dy); continue; }
      const ann = workspaceStore.annotations.find(a => a.id === id);
      if (ann) { handleAnnotationPositionChange(id, ann.x + dx, ann.y + dy); }
    }
  }
  window.addEventListener('keydown', handleArrowKeys);
  return () => window.removeEventListener('keydown', handleArrowKeys);
});

// ─── Keyboard Shortcuts ───────────────────────────────────────

$effect(() => {
  const cleanup = registerShortcuts({
    undo: () => { undoStore.undo(); },
    redo: () => { undoStore.redo(); },
    delete: () => {
      handleDeleteSelected();
    },
    save: () => { projectStore.saveCurrentProject(); },
    deselect: () => {
      if (workspaceStore.doorWindowStart) {
        workspaceStore.setDoorWindowStart(null);
        return;
      }
      canvasStore.setTool('select');
      canvasStore.clearSelection();
    },
    wallTool: () => { canvasStore.setTool('wall'); },
    doorTool: () => { canvasStore.setTool('door'); },
    windowTool: () => { canvasStore.setTool('window'); },
    apTool: () => { canvasStore.setTool('ap'); },
    textTool: () => { canvasStore.setTool('text'); },
    roomTool: () => { canvasStore.setTool('room'); },
    candidateTool: () => { canvasStore.setTool('candidate'); },
    zoneTool: () => { canvasStore.setTool('zone'); },
    heatmapToggle: () => { editorHeatmapStore.toggleVisible(); },
    copy: handleCopy,
    cut: handleCut,
    paste: () => { handlePaste(); },
    duplicate: handleDuplicate,
    selectAll: handleSelectAll,
    shortcutHelp: () => { shortcutHelpOpen = !shortcutHelpOpen; },
  });

  return cleanup;
});

// ─── Cleanup on unmount ───────────────────────────────────────

$effect(() => {
  return () => {
    // Don't reset editorHeatmapStore — EditorHeatmap is persistent in WorkspaceCanvas
    // But clear signal probe state so it doesn't persist across pages
    editorHeatmapStore.setProbeActive(false);
    channelStore.reset();
    workspaceStore.unregisterEditorCallbacks();
    workspaceStore.setCursorOverride(null);
    workspaceStore.setCandidates([]);
    workspaceStore.setConstraintZones([]);
    workspaceStore.setDoorWindowStart(null);
    workspaceStore.setPointInspectorResult(null);
    workspaceStore.setHitTraceApId(null);
  };
});

</script>

<svelte:head>
  <title>{t('nav.editor')} - {t('app.title')}</title>
</svelte:head>

<!-- Context menu handler on window (captures right-clicks on the canvas area) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svelte:window oncontextmenu={(e) => {
  const target = e.target as HTMLElement;
  if (target.closest('.workspace-canvas') || target.closest('.editor-overlays')) {
    e.preventDefault();
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuVisible = true;
  }
}} />

<!-- Floating editor overlays (positioned over the canvas) -->
<div class="editor-overlays">
  <!-- Text annotation input -->
  {#if textInputPosition}
    <div class="text-annotation-input" style="left: 50%; top: 50%; transform: translate(-50%, -50%);">
      <input
        type="text"
        class="annotation-input"
        bind:value={textInputValue}
        placeholder={t('editor.annotationPlaceholder')}
        autofocus
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            if (editingAnnotationId) confirmEditAnnotation();
            else confirmTextAnnotation();
          }
          if (e.key === 'Escape') cancelTextAnnotation();
        }}
      />
      <div class="annotation-actions">
        <button class="btn-primary btn-sm" onclick={() => {
          if (editingAnnotationId) confirmEditAnnotation();
          else confirmTextAnnotation();
        }}>{t('action.confirm')}</button>
        <button class="btn-secondary btn-sm" onclick={cancelTextAnnotation}>{t('project.cancel')}</button>
      </div>
    </div>
  {/if}

  <!-- Door/Window 2-click hint -->
  {#if canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window'}
    <div class="scale-hint-bar">
      {workspaceStore.doorWindowStart ? t('editor.doorWindowHint2') : t('editor.doorWindowHint1')}
      {#if workspaceStore.doorWindowStart}
        <button class="btn-cancel-small" onclick={() => { workspaceStore.setDoorWindowStart(null); }}>{t('project.cancel')}</button>
      {/if}
    </div>
  {/if}

  <!-- Zone placement hint -->
  {#if canvasStore.activeTool === 'zone'}
    <div class="scale-hint-bar">
      {t('editor.zoneHint1')}
    </div>
  {/if}

  <!-- Coverage Stats Panel (visible when heatmap is active) -->
  {#if editorHeatmapStore.visible && coverageStats}
    <div class="coverage-floating-panel">
      <CoverageStatsPanel stats={coverageStats} />
    </div>
  {/if}

  <!-- Channel Map Panel -->
  <ChannelMapPanel
    analysis={channelStore.analysis}
    visible={channelStore.overlayVisible}
    onToggle={() => channelStore.toggleOverlay()}
  />

  <!-- Floating Properties Panel -->
  {#if showPropertiesPanel}
    <div class="properties-floating-panel">
      <PropertiesPanel
        {selectedWall}
        {selectedAp}
        {selectedWalls}
        {materials}
        {selectedCandidate}
        {selectedZone}
        apCapabilities={selectedApCapabilities}
        onWallUpdate={handleWallUpdate}
        onBulkWallUpdate={handleBulkWallUpdate}
        onDeleteWall={handleDeleteWall}
        onApUpdate={handleApUpdate}
        onDeleteAp={handleDeleteAp}
        onCandidateUpdate={handleCandidateUpdate}
        onDeleteCandidate={handleCandidateDelete}
        onZoneUpdate={handleZoneUpdate}
        onDeleteZone={handleZoneDelete}
        onCapabilitiesChange={handleCapabilitiesChange}
      />
    </div>
  {/if}

  <!-- Material Picker -->
  {#if canvasStore.activeTool === 'wall' || canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window' || canvasStore.activeTool === 'room'}
    <div class="material-floating-panel">
      <MaterialPicker
        selectedMaterialId={canvasStore.selectedMaterialId}
        onSelect={(id) => canvasStore.setSelectedMaterial(id)}
        activeTool={canvasStore.activeTool}
      />
    </div>
  {/if}

  <!-- AP Library Panel -->
  {#if canvasStore.activeTool === 'ap'}
    <div class="ap-library-floating-panel">
      <APLibraryPanel
        selectedModelId={canvasStore.selectedApModelId}
        onSelectModel={(modelId) => canvasStore.setSelectedApModel(modelId)}
      />
    </div>
  {/if}

  <!-- Context Menu -->
  <ContextMenu
    visible={contextMenuVisible}
    x={contextMenuX}
    y={contextMenuY}
    hasWall={selectedWall !== null || selectedWalls.length > 0}
    hasAp={selectedAp !== null}
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
</div>

<ShortcutHelp bind:open={shortcutHelpOpen} />

<!-- Point Inspector Debug Overlay (Alt+Click) -->
<PointInspectorOverlay
  result={workspaceStore.pointInspectorResult}
  onClose={() => { workspaceStore.setPointInspectorResult(null); workspaceStore.setHitTraceApId(null); }}
  onSelectAp={(apId) => { workspaceStore.setHitTraceApId(apId); }}
/>

<style>
  .editor-overlays {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 15;
  }

  .editor-overlays > :global(*) {
    pointer-events: auto;
  }

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
    bottom: 240px;
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

  .ap-library-floating-panel {
    position: absolute;
    bottom: 12px;
    left: 12px;
    width: 260px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    max-height: 50vh;
    overflow-y: auto;
  }

  .btn-primary {
    flex: 1;
    padding: 8px 16px;
    background: #4a6cf7;
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-primary:hover {
    background: #3a5ce7;
  }

  .btn-secondary {
    flex: 1;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: var(--text-secondary, #a0a0b0);
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary, #e0e0f0);
  }

  .scale-hint-bar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: rgba(74, 108, 247, 0.15);
    border: 1px solid rgba(74, 108, 247, 0.3);
    border-radius: 8px;
    color: #4a6cf7;
    font-size: 0.8rem;
    backdrop-filter: blur(8px);
    z-index: 20;
  }

  .btn-cancel-small {
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    color: #a0a0b0;
    font-size: 0.7rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel-small:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #e0e0f0;
  }

  .text-annotation-input {
    position: absolute;
    z-index: 50;
    background: rgba(26, 26, 46, 0.95);
    border: 1px solid rgba(74, 108, 247, 0.4);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .annotation-input {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #e0e0f0;
    font-size: 0.9rem;
    font-family: inherit;
    min-width: 200px;
  }

  .annotation-input:focus {
    outline: none;
    border-color: rgba(74, 108, 247, 0.5);
  }

  .annotation-actions {
    display: flex;
    gap: 6px;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 0.75rem;
  }
</style>
