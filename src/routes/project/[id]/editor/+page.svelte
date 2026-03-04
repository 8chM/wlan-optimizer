<!--
  Editor page - Main canvas workspace with FloorplanEditor.

  Binds container dimensions for responsive canvas sizing.
  Integrates the FloorplanEditor with tool state from canvasStore.
  Features: Undo/Redo, Live Heatmap, Wall Drawing, AP Placement,
  Floor Plan Upload, Properties Panel, Coverage Stats, Placement Hints.
-->
<script lang="ts">
import { createAccessPoint, deleteAccessPoint, updateAccessPoint } from '$lib/api/accessPoint';
import { safeInvoke, type MaterialResponse, type SegmentInput } from '$lib/api/invoke';
import { createWall, deleteWall, updateWall, type WallSegmentInput } from '$lib/api/wall';
import { Line, Circle } from 'svelte-konva';
import { FloorplanEditor } from '$lib/canvas';
import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
import GridOverlay from '$lib/canvas/GridOverlay.svelte';
import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
import SavedMeasurements from '$lib/canvas/SavedMeasurements.svelte';
import TextAnnotation from '$lib/canvas/TextAnnotation.svelte';
import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
import CanvasScrollbars from '$lib/canvas/CanvasScrollbars.svelte';
import CrosshairCursor from '$lib/canvas/CrosshairCursor.svelte';
import ScaleReferenceLine from '$lib/canvas/ScaleReferenceLine.svelte';
import RoomDrawingLayer from '$lib/canvas/RoomDrawingLayer.svelte';
import RulerOverlay from '$lib/canvas/RulerOverlay.svelte';
import WallDrawingLayer from '$lib/canvas/WallDrawingLayer.svelte';
import ShortcutHelp from '$lib/components/common/ShortcutHelp.svelte';
import APLibraryPanel from '$lib/components/editor/APLibraryPanel.svelte';
import ChannelConflictOverlay from '$lib/components/editor/ChannelConflictOverlay.svelte';
import ChannelMapPanel from '$lib/components/editor/ChannelMapPanel.svelte';
import CoverageStatsPanel from '$lib/components/editor/CoverageStatsPanel.svelte';
import EditorHeatmap from '$lib/components/editor/EditorHeatmap.svelte';
import EditorHeatmapPanel from '$lib/components/editor/EditorHeatmapPanel.svelte';
import MaterialPicker from '$lib/components/editor/MaterialPicker.svelte';
import PlacementHintMarker from '$lib/components/editor/PlacementHintMarker.svelte';
import ContextMenu from '$lib/components/editor/ContextMenu.svelte';
import PropertiesPanel from '$lib/components/editor/PropertiesPanel.svelte';
import {
  type CoverageStats,
  calculateCoverageFromBins,
  estimateCoverageFromStats,
} from '$lib/heatmap/coverage-stats';
import type { PlacementHint } from '$lib/heatmap';
import { t } from '$lib/i18n';
import type { Position } from '$lib/models/types';
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import { channelStore } from '$lib/stores/channelStore.svelte';
import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
import { projectStore } from '$lib/stores/projectStore.svelte';
import { undoStore, type EditorCommand } from '$lib/stores/undoStore.svelte';
import { clipboardStore, type ClipboardWall, type ClipboardAp } from '$lib/stores/clipboardStore.svelte';
import { registerShortcuts } from '$lib/utils/keyboard';
import { projectPointOnSegment, findNearestWallSegment } from '$lib/editor/editorUtils';
import PointInspectorOverlay from '$lib/components/editor/PointInspectorOverlay.svelte';
import { inspectPoint, type PointDebugResult } from '$lib/heatmap/point-inspector';
import { convertApsToConfig, convertWallsToData } from '$lib/heatmap/convert';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import { recommendationStore } from '$lib/stores/recommendationStore.svelte';
import CandidateLocationMarker from '$lib/canvas/CandidateLocationMarker.svelte';
import ConstraintZoneRect from '$lib/canvas/ConstraintZoneRect.svelte';
import type { CandidateLocation, ConstraintZone, APCapabilities } from '$lib/recommendations/types';
import { DEFAULT_AP_CAPABILITIES } from '$lib/recommendations/types';

let containerWidth = $state(800);
let containerHeight = $state(600);
let shortcutHelpOpen = $state(false);
let mousePosition = $state<Position | null>(null);
let floorImageDataUrl = $state<string | null>(null);
let materials = $state<MaterialResponse[]>([]);
let measureStart = $state<{ x: number; y: number } | null>(null);
let measureEnd = $state<{ x: number; y: number } | null>(null);
let savedMeasurements = $state<import('$lib/canvas/SavedMeasurements.svelte').SavedMeasurement[]>([]);
let selectedMeasurementId = $state<string | null>(null);
let annotations = $state<AnnotationData[]>([]);
let editingAnnotationId = $state<string | null>(null);
let textInputPosition = $state<{ x: number; y: number } | null>(null);
let textInputValue = $state('');
// Persistent scale reference line (stays visible after calibration, persisted in localStorage)
let confirmedScalePoints = $state<Array<{ x: number; y: number }>>([]);
let confirmedScaleDistanceM = $state<number | null>(null);
let roomDrawingLayer: RoomDrawingLayer | undefined = $state();
let contextMenuVisible = $state(false);
let contextMenuX = $state(0);
let contextMenuY = $state(0);
let editorRef: FloorplanEditor | undefined = $state();

// Door/Window 2-click placement state
let doorWindowStart = $state<{
  wallId: string;
  segIdx: number;
  t: number;
  x: number;
  y: number;
} | null>(null);

// Point Inspector state (Alt+Click debug overlay)
let pointInspectorResult = $state<PointDebugResult | null>(null);
let altKeyHeld = $state(false);
/** AP ID selected in Point Inspector for hit-trace visualization */
let hitTraceApId = $state<string | null>(null);

// ── Candidate / Zone / Capabilities state ──────────────────────
let candidates = $state<CandidateLocation[]>([]);
let constraintZones = $state<ConstraintZone[]>([]);
let apCapabilities = $state<Map<string, APCapabilities>>(new Map());
// Lock background image when wizard has been completed for this project
let backgroundLocked = $state(false);

$effect(() => {
  const pid = projectStore.currentProject?.id;
  if (pid) {
    backgroundLocked = localStorage.getItem(`wlan-opt:wizard-done:${pid}`) === 'true';
  }
});

// Set page context for toolbar filtering
$effect(() => {
  canvasStore.setPageContext('editor');
});

// Cursor per tool (space held = grab for panning)
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

let floor = $derived(projectStore.activeFloor);
let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
let floorRotation = $derived(floor?.background_image_rotation ?? 0);

// ── Floor bounds for heatmap (dynamic from wall/AP bounding box) ──
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

// ── Default material for wall/door/window drawing ─────────────
let wallMaterialId = $derived.by(() => {
  const tool = canvasStore.activeTool;
  if (tool === 'door') return 'mat-wood-door';
  if (tool === 'window') return 'mat-window';
  return canvasStore.selectedMaterialId ?? 'Q01';
});

// ── Snap targets from existing walls ──────────────────────────
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

// ── Door/Window 2-click preview ─────────────────────────────
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

  // Project current mouse onto the same segment
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

// ── Hit-trace data for Point Inspector visualization ─────────
interface HitTraceData {
  apX: number; apY: number;
  pointX: number; pointY: number;
  groups: Array<{
    x: number; y: number;
    materialLabel: string;
    color: string;
    action: string;
    appliedLossDb: number;
    rawCount: number;
  }>;
}

/** Map material label to color for hit-trace markers */
function getMaterialHitColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('door') || l.includes('tür') || l.includes('tuer')) return '#4caf50';
  if (l.includes('window') || l.includes('fenster') || l.includes('glass')) return '#2196f3';
  if (l.includes('drywall') || l.includes('gips') || l.includes('plasterboard')) return '#ffeb3b';
  if (l.includes('brick') || l.includes('concrete') || l.includes('beton') || l.includes('ziegel')) return '#ff4444';
  if (l.includes('wood') || l.includes('holz')) return '#ff9800';
  return '#ff9800'; // orange fallback
}

let hitTraceData = $derived.by((): HitTraceData | null => {
  if (!pointInspectorResult || !hitTraceApId) return null;
  const apDebug = pointInspectorResult.perAp.find((a) => a.apId === hitTraceApId);
  if (!apDebug) return null;
  // Find AP position from floor data
  const apResp = floor?.access_points?.find((ap) => ap.id === hitTraceApId);
  if (!apResp) return null;
  return {
    apX: apResp.x * scalePxPerMeter,
    apY: apResp.y * scalePxPerMeter,
    pointX: pointInspectorResult.pointX * scalePxPerMeter,
    pointY: pointInspectorResult.pointY * scalePxPerMeter,
    groups: apDebug.hitGroups.map((g) => ({
      x: g.representative.hitX * scalePxPerMeter,
      y: g.representative.hitY * scalePxPerMeter,
      materialLabel: g.representative.materialLabel,
      color: getMaterialHitColor(g.representative.materialLabel),
      action: g.action,
      appliedLossDb: g.appliedLossDb,
      rawCount: g.rawHits.length,
    })),
  };
});

// ── Selection-based properties panel ──────────────────────────
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

// ── Placement hints (computed by heatmap worker, delivered via stats) ──
let placementHints = $derived<PlacementHint[]>(editorHeatmapStore.stats?.placementHints ?? []);

// ── Channel analysis (re-run when APs change) ──────────────
$effect(() => {
  const aps = floor?.access_points ?? [];
  if (aps.length > 0) {
    channelStore.analyze(aps);
  }
});

// ── Load candidates/zones/capabilities from localStorage ──────
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

// Sync to recommendationStore when candidates/zones/capabilities change
$effect(() => {
  recommendationStore.setCandidates(candidates);
});
$effect(() => {
  recommendationStore.setConstraintZones(constraintZones);
});
$effect(() => {
  recommendationStore.setAPCapabilities([...apCapabilities.values()]);
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

// ── Load annotations from localStorage ────────────────────────
$effect(() => {
  const floorId = floor?.id;
  if (!floorId) return;
  const stored = localStorage.getItem(`wlan-opt:annotations:${floorId}`);
  if (stored) {
    try {
      annotations = JSON.parse(stored) as AnnotationData[];
    } catch { /* ignore */ }
  } else {
    annotations = [];
  }
});

function saveAnnotations(): void {
  const floorId = floor?.id;
  if (!floorId) return;
  localStorage.setItem(`wlan-opt:annotations:${floorId}`, JSON.stringify(annotations));
}

// ── Load saved measurements from localStorage ─────────────
$effect(() => {
  const floorId = floor?.id;
  if (!floorId) return;
  const stored = localStorage.getItem(`wlan-opt:measurements:${floorId}`);
  if (stored) {
    try {
      savedMeasurements = JSON.parse(stored);
    } catch { /* ignore */ }
  } else {
    savedMeasurements = [];
  }
  selectedMeasurementId = null;
});

function saveMeasurementsToStorage(): void {
  const floorId = floor?.id;
  if (!floorId) return;
  localStorage.setItem(`wlan-opt:measurements:${floorId}`, JSON.stringify(savedMeasurements));
}

// ── Restore scale reference from localStorage ──────────────
$effect(() => {
  const floorId = floor?.id;
  if (!floorId) return;
  const stored = localStorage.getItem(`wlan-opt:scale-ref:${floorId}`);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (data.points?.length === 2 && typeof data.distanceM === 'number') {
        confirmedScalePoints = data.points;
        confirmedScaleDistanceM = data.distanceM;
      }
    } catch { /* ignore */ }
  }
});

// ── Background image offset persistence ──────────────────────
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

function handleBackgroundDragEnd(x: number, y: number): void {
  canvasStore.setBackgroundOffset(x, y);
  const floorId = floor?.id;
  if (floorId) {
    localStorage.setItem(`wlan-opt:bg-offset:${floorId}`, JSON.stringify({ x, y }));
  }
}

// ── Load floor image on mount ─────────────────────────────────
$effect(() => {
  const floorId = floor?.id;
  if (!floorId) return;
  loadFloorImage(floorId);
});

async function loadFloorImage(floorId: string): Promise<void> {
  try {
    const result = await safeInvoke('get_floor_image', { floor_id: floorId });
    let dataUrl: string | null = null;
    if (result?.background_image && result.background_image_format) {
      const bytes = new Uint8Array(result.background_image);
      const blob = new Blob([bytes], { type: `image/${result.background_image_format}` });
      dataUrl = URL.createObjectURL(blob);
    } else {
      // Check localStorage for browser-mode image
      const stored = localStorage.getItem(`wlan-opt:floor-image:${floorId}`);
      if (stored) {
        dataUrl = stored;
      }
    }
    if (dataUrl) {
      floorImageDataUrl = dataUrl;
    }
  } catch {
    // No image available
  }
}

// ── Load materials on mount ──────────────────────────────────
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

// ── Bulk wall update ─────────────────────────────────────────
async function handleBulkWallUpdate(wallIds: string[], updates: { materialId?: string }): Promise<void> {
  for (const id of wallIds) {
    await handleWallUpdate(id, updates);
  }
}

// ── PropertiesPanel callbacks ─────────────────────────────────

async function handleWallUpdate(
  wallId: string,
  updates: {
    materialId?: string;
    thicknessCm?: number | null;
    attenuationOverride24ghz?: number | null;
    attenuationOverride5ghz?: number | null;
  },
): Promise<void> {
  // Capture old wall properties for undo
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
  // Capture old segments before updating for undo support
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

    // Push undo command (move already happened)
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
  // Capture wall data before deletion for undo
  const wall = floor?.walls?.find((w) => w.id === wallId);
  if (!wall) return;
  const wallFloorId = wall.floor_id;
  const wallMaterial = wall.material_id;
  const wallSegments: WallSegmentInput[] = wall.segments.map((s) => ({
    segment_order: s.segment_order,
    x1: s.x1,
    y1: s.y1,
    x2: s.x2,
    y2: s.y2,
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
      // Restore attenuation overrides if any were set
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
  // Capture old AP properties for undo
  const ap = floor?.access_points?.find((a) => a.id === apId);
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  if (updates.label !== undefined) {
    oldValues.label = ap?.label;
    newValues.label = updates.label;
  }
  if (updates.txPower24ghzDbm !== undefined) {
    oldValues.tx_power_24ghz_dbm = ap?.tx_power_24ghz_dbm;
    newValues.tx_power_24ghz_dbm = updates.txPower24ghzDbm;
  }
  if (updates.txPower5ghzDbm !== undefined) {
    oldValues.tx_power_5ghz_dbm = ap?.tx_power_5ghz_dbm;
    newValues.tx_power_5ghz_dbm = updates.txPower5ghzDbm;
  }
  if (updates.enabled !== undefined) {
    oldValues.enabled = ap?.enabled;
    newValues.enabled = updates.enabled;
  }
  if (updates.height_m !== undefined) {
    oldValues.height_m = ap?.height_m;
    newValues.height_m = updates.height_m;
  }
  if (updates.mounting !== undefined) {
    oldValues.mounting = ap?.mounting;
    newValues.mounting = updates.mounting;
  }
  if (updates.channel_24ghz !== undefined) {
    oldValues.channel_24ghz = ap?.channel_24ghz;
    newValues.channel_24ghz = updates.channel_24ghz;
  }
  if (updates.channel_5ghz !== undefined) {
    oldValues.channel_5ghz = ap?.channel_5ghz;
    newValues.channel_5ghz = updates.channel_5ghz;
  }
  if (updates.channel_width !== undefined) {
    oldValues.channel_width = ap?.channel_width;
    newValues.channel_width = updates.channel_width;
  }
  if (updates.orientation_deg !== undefined) {
    oldValues.orientation_deg = ap?.orientation_deg;
    newValues.orientation_deg = updates.orientation_deg;
  }

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
  // Capture AP data before deletion for undo
  const ap = floor?.access_points?.find((a) => a.id === apId);
  if (!ap) return;
  const apData = {
    floorId: ap.floor_id,
    x: ap.x,
    y: ap.y,
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
      const result = await createAccessPoint(
        apData.floorId,
        apData.x,
        apData.y,
        apData.apModelId,
        apData.label,
      );
      currentApId = result.id;
      // Restore AP properties
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

// ── Measure tool state ────────────────────────────────────────

let measuredDistance = $derived.by((): number | null => {
  if (!measureStart || !measureEnd) return null;
  const dx = measureEnd.x - measureStart.x;
  const dy = measureEnd.y - measureStart.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  return pixelDist / scalePxPerMeter;
});

function resetMeasure(): void {
  measureStart = null;
  measureEnd = null;
}

function handlePinMeasurement(): void {
  if (!measureStart || !measureEnd) return;
  const x1m = measureStart.x / scalePxPerMeter;
  const y1m = measureStart.y / scalePxPerMeter;
  const x2m = measureEnd.x / scalePxPerMeter;
  const y2m = measureEnd.y / scalePxPerMeter;
  const dist = Math.sqrt((x2m - x1m) ** 2 + (y2m - y1m) ** 2);
  savedMeasurements = [...savedMeasurements, {
    id: crypto.randomUUID(),
    x1: x1m, y1: y1m, x2: x2m, y2: y2m,
    distanceM: dist,
  }];
  saveMeasurementsToStorage();
  resetMeasure();
}

function handleDeleteMeasurement(): void {
  if (!selectedMeasurementId) return;
  savedMeasurements = savedMeasurements.filter(m => m.id !== selectedMeasurementId);
  selectedMeasurementId = null;
  saveMeasurementsToStorage();
}

// ── Candidate/Zone handlers ────────────────────────────────────

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

// ── Reset measure on tool change ──────────────────────────────
$effect(() => {
  if (canvasStore.activeTool !== 'measure') {
    resetMeasure();
  }
});

// ── Enter key to pin measurement ─────────────────────────────
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

// ── Alt key tracking for Point Inspector ────────────────────
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

// ── Reset door/window start on tool change ──────────────────
$effect(() => {
  const tool = canvasStore.activeTool;
  if (tool !== 'door' && tool !== 'window') {
    doorWindowStart = null;
  }
});

// ── Keyboard Shortcuts ────────────────────────────────────────
$effect(() => {
  const cleanup = registerShortcuts({
    undo: () => {
      undoStore.undo();
    },
    redo: () => {
      undoStore.redo();
    },
    delete: () => {
      if (selectedMeasurementId) {
        handleDeleteMeasurement();
        return;
      }
      handleDeleteSelected();
    },
    save: () => {
      projectStore.saveCurrentProject();
    },
    deselect: () => {
      if (doorWindowStart) {
        doorWindowStart = null;
        return;
      }
      if (selectedMeasurementId) {
        selectedMeasurementId = null;
        return;
      }
      resetMeasure();
      canvasStore.setTool('select');
      canvasStore.clearSelection();
    },
    wallTool: () => {
      canvasStore.setTool('wall');
    },
    doorTool: () => {
      canvasStore.setTool('door');
    },
    windowTool: () => {
      canvasStore.setTool('window');
    },
    apTool: () => {
      canvasStore.setTool('ap');
    },
    measureTool: () => {
      canvasStore.setTool('measure');
    },
    textTool: () => {
      canvasStore.setTool('text');
    },
    selectTool: () => {
      canvasStore.setTool('select');
    },
    panTool: () => {
      canvasStore.setTool('pan');
    },
    roomTool: () => {
      canvasStore.setTool('room');
    },
    candidateTool: () => {
      canvasStore.setTool('candidate');
    },
    zoneTool: () => {
      canvasStore.setTool('zone');
    },
    gridToggle: () => {
      canvasStore.toggleGrid();
    },
    heatmapToggle: () => {
      editorHeatmapStore.toggleVisible();
    },
    copy: handleCopy,
    cut: handleCut,
    paste: () => { handlePaste(); },
    duplicate: handleDuplicate,
    selectAll: handleSelectAll,
    shortcutHelp: () => {
      shortcutHelpOpen = !shortcutHelpOpen;
    },
  });

  return cleanup;
});

// ── Cleanup on unmount ────────────────────────────────────────
$effect(() => {
  return () => {
    editorHeatmapStore.reset();
    channelStore.reset();
    if (floorImageDataUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(floorImageDataUrl);
    }
  };
});

// ── Door/Window insertion on existing walls ───────────────────

/** Execute the wall split to insert a door/window between tStart and tEnd on a wall segment. */
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

      // Segment 1: before the opening (if long enough)
      if (tStart > 0.01) {
        const result = await createWall(floorId, origMaterial, [
          { segment_order: 0, x1: seg.x1, y1: seg.y1, x2: splitStartX, y2: splitStartY },
        ]);
        newWallIds.push(result.id);
      }

      // Segment 2: the door/window opening
      const doorResult = await createWall(floorId, materialId, [
        { segment_order: 0, x1: splitStartX, y1: splitStartY, x2: splitEndX, y2: splitEndY },
      ]);
      newWallIds.push(doorResult.id);

      // Segment 3: after the opening (if long enough)
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

/**
 * 2-click door/window placement on existing walls.
 * Click 1: set start point on nearest wall.
 * Click 2: set end point on same wall → split.
 * If clicks are too close (< min width), fall back to fixed width.
 */
function tryInsertDoorWindow(canvasX: number, canvasY: number, tool: 'door' | 'window'): boolean {
  const clickXM = canvasX / scalePxPerMeter;
  const clickYM = canvasY / scalePxPerMeter;
  const maxDistM = 0.5;
  const minWidthM = tool === 'door' ? 0.3 : 0.2;
  const fallbackWidthM = tool === 'door' ? 0.9 : 1.2;

  // ── First click: set start point ──
  if (!doorWindowStart) {
    const hit = findNearestWallSegment(floor?.walls ?? [], clickXM, clickYM, maxDistM);
    if (!hit) return false;

    doorWindowStart = {
      wallId: hit.wall.id,
      segIdx: hit.segIdx,
      t: hit.t,
      x: hit.projX,
      y: hit.projY,
    };
    return true;
  }

  // ── Second click: set end point and split ──
  const dwStart = doorWindowStart;
  const walls = floor?.walls ?? [];
  const targetWall = walls.find(w => w.id === dwStart.wallId);
  if (!targetWall) {
    doorWindowStart = null;
    return false;
  }

  const sorted = targetWall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
  const seg = sorted[dwStart.segIdx];
  if (!seg) {
    doorWindowStart = null;
    return false;
  }

  // Project the second click onto the same wall segment
  const proj = projectPointOnSegment(clickXM, clickYM, seg.x1, seg.y1, seg.x2, seg.y2);

  // Check if second click is on the same wall (close enough)
  if (proj.dist > maxDistM) {
    // Clicked too far from the wall - try a different wall as new start
    const hit = findNearestWallSegment(floor?.walls ?? [], clickXM, clickYM, maxDistM);
    if (hit) {
      doorWindowStart = {
        wallId: hit.wall.id,
        segIdx: hit.segIdx,
        t: hit.t,
        x: hit.projX,
        y: hit.projY,
      };
      return true;
    }
    doorWindowStart = null;
    return false;
  }

  let tStart = Math.min(dwStart.t, proj.t);
  let tEnd = Math.max(dwStart.t, proj.t);

  // Calculate actual width in meters
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const segLen = Math.sqrt(dx * dx + dy * dy);
  const widthM = (tEnd - tStart) * segLen;

  // Fallback: if clicks are too close, use fixed width centered on midpoint
  if (widthM < minWidthM) {
    const midT = (dwStart.t + proj.t) / 2;
    const halfWidth = fallbackWidthM / 2;
    const tHalf = halfWidth / segLen;
    tStart = midT - tHalf;
    tEnd = midT + tHalf;

    // Clamp to segment bounds
    if (tStart < 0) { tEnd -= tStart; tStart = 0; }
    if (tEnd > 1) { tStart -= (tEnd - 1); tEnd = 1; }
    tStart = Math.max(0, tStart);
    tEnd = Math.min(1, tEnd);
  }

  executeDoorWindowSplit(targetWall, dwStart.segIdx, tStart, tEnd, tool);
  doorWindowStart = null;
  return true;
}

// ── PNG Export ────────────────────────────────────────────────

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

// ── Canvas interaction handlers ───────────────────────────────

let wallDrawingLayer: WallDrawingLayer | undefined = $state();

function handleCanvasClick(canvasX: number, canvasY: number): void {
  // Alt+Click: Point Inspector debug overlay
  if (altKeyHeld && floor && editorHeatmapStore.visible) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    const band = editorHeatmapStore.band;
    const aps = convertApsToConfig(floor.access_points ?? [], band);
    const walls = convertWallsToData(floor.walls ?? [], band);
    pointInspectorResult = inspectPoint(
      xMeters, yMeters, aps, walls, floorBounds, band,
      editorHeatmapStore.calibratedN,
      editorHeatmapStore.receiverGainDbi,
    );
    return;
  }

  const tool = canvasStore.activeTool;

  // Door/Window tool: try to insert on an existing wall first
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

  if (tool === 'ap' && floor) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    placeAccessPoint(xMeters, yMeters);
    return;
  }

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

  if (tool === 'zone' && floor) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    // 1-click placement: center a 2×2m zone on click position
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

  if (tool === 'text') {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    textInputPosition = { x: xMeters, y: yMeters };
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
      // Reset and start new measurement
      measureStart = { x: canvasX, y: canvasY };
      measureEnd = null;
    }
    return;
  }

  if (tool === 'select') {
    // Only clear selection if not Shift-clicking (Shift = additive selection)
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

// ── Annotation management ─────────────────────────────────────

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
  annotations = [...annotations, newAnnotation];
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
  annotations = annotations.map((a) => a.id === id ? { ...a, x, y } : a);
  saveAnnotations();
}

function handleAnnotationEdit(id: string): void {
  editingAnnotationId = id;
  const ann = annotations.find((a) => a.id === id);
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
  annotations = annotations.map((a) =>
    a.id === editingAnnotationId ? { ...a, text: textInputValue.trim() } : a,
  );
  saveAnnotations();
  editingAnnotationId = null;
  textInputPosition = null;
  textInputValue = '';
}

function handleDeleteAnnotation(id: string): void {
  annotations = annotations.filter((a) => a.id !== id);
  saveAnnotations();
}

/**
 * Handle item selection. Only allow selection when in select mode.
 * In drawing modes, clicking on items should not interfere with drawing.
 */
function handleItemSelect(id: string): void {
  if (canvasStore.activeTool === 'select') {
    canvasStore.selectItem(id, canvasStore.shiftHeld);
  }
}

// Track modifier keys for snapping and panning + arrow key movement + Ctrl+A
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Shift') canvasStore.setShiftHeld(true);
  if (event.key === ' ' || event.code === 'Space') {
    event.preventDefault();
    canvasStore.setSpaceHeld(true);
  }

  // Ctrl+A / Cmd+A: select all elements
  if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
    event.preventDefault();
    const allIds: string[] = [];
    for (const w of floor?.walls ?? []) allIds.push(w.id);
    for (const ap of floor?.access_points ?? []) allIds.push(ap.id);
    for (const ann of annotations) allIds.push(ann.id);
    for (const id of allIds) {
      canvasStore.selectItem(id, true);
    }
    return;
  }

  // Arrow keys: move selected APs and annotations
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const ids = canvasStore.selectedIds;
    if (ids.length === 0) return;

    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01; // meters
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowUp') dy = -step;
    if (event.key === 'ArrowDown') dy = step;
    if (event.key === 'ArrowLeft') dx = -step;
    if (event.key === 'ArrowRight') dx = step;

    for (const id of ids) {
      const ap = floor?.access_points?.find(a => a.id === id);
      if (ap) {
        handleApPositionChange(id, ap.x + dx, ap.y + dy);
        continue;
      }
      const ann = annotations.find(a => a.id === id);
      if (ann) {
        handleAnnotationPositionChange(id, ann.x + dx, ann.y + dy);
      }
    }
  }
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Shift') canvasStore.setShiftHeld(false);
  if (event.key === ' ' || event.code === 'Space') {
    canvasStore.setSpaceHeld(false);
  }
}

// ── AP placement (with undo support) ──────────────────────────

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

// ── AP drag position update (with undo support) ──────────────

async function handleApPositionChange(apId: string, x: number, y: number): Promise<void> {
  // Capture old position before updating
  const ap = floor?.access_points?.find((a) => a.id === apId);
  const oldX = ap?.x ?? x;
  const oldY = ap?.y ?? y;

  try {
    await updateAccessPoint(apId, { x, y });
    await projectStore.refreshFloorData();
    projectStore.markDirty();

    // Push undo command (move already happened)
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

// ── Copy/Paste/Duplicate ──────────────────────────────────────

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

  const offset = clipboardStore.pasteCount * 0.5; // meters
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

  // Select pasted items
  canvasStore.clearSelection();
  for (const id of [...createdWallIds, ...createdApIds]) {
    canvasStore.selectItem(id, true);
  }

  // Undo support
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

// ── Wall/AP deletion ──────────────────────────────────────────

async function handleDeleteSelected(): Promise<void> {
  const ids = canvasStore.selectedIds;
  if (ids.length === 0) return;

  // For single selection, delegate to the typed delete handlers for proper undo
  if (ids.length === 1) {
    const id = ids[0]!;
    const wall = floor?.walls?.find((w) => w.id === id);
    if (wall) {
      await handleDeleteWall(id);
      return;
    }
    const ap = floor?.access_points?.find((a) => a.id === id);
    if (ap) {
      await handleDeleteAp(id);
      return;
    }
    // Candidate or Zone: local-only, no undo needed
    if (candidates.find(c => c.id === id)) {
      handleCandidateDelete(id);
      return;
    }
    if (constraintZones.find(z => z.id === id)) {
      handleZoneDelete(id);
      return;
    }
  }

  // Multi-selection: capture all items for undo, then delete all at once
  interface CapturedWall {
    floorId: string;
    materialId: string;
    segments: WallSegmentInput[];
    attOverride24: number | null;
    attOverride5: number | null;
    attOverride6: number | null;
  }
  interface CapturedAp {
    floorId: string;
    x: number;
    y: number;
    apModelId?: string;
    label?: string;
    height_m: number;
    mounting: string;
    tx_power_24ghz_dbm?: number;
    tx_power_5ghz_dbm?: number;
    channel_24ghz?: number;
    channel_5ghz?: number;
    channel_width: string;
    enabled: boolean;
  }

  const capturedWalls: { id: string; data: CapturedWall }[] = [];
  const capturedAps: { id: string; data: CapturedAp }[] = [];

  for (const id of ids) {
    const wall = floor?.walls?.find((w) => w.id === id);
    if (wall) {
      capturedWalls.push({
        id,
        data: {
          floorId: wall.floor_id,
          materialId: wall.material_id,
          segments: wall.segments.map((s) => ({
            segment_order: s.segment_order,
            x1: s.x1,
            y1: s.y1,
            x2: s.x2,
            y2: s.y2,
          })),
          attOverride24: wall.attenuation_override_24ghz,
          attOverride5: wall.attenuation_override_5ghz,
          attOverride6: wall.attenuation_override_6ghz,
        },
      });
      continue;
    }
    const ap = floor?.access_points?.find((a) => a.id === id);
    if (ap) {
      capturedAps.push({
        id,
        data: {
          floorId: ap.floor_id,
          x: ap.x,
          y: ap.y,
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
        },
      });
    }
  }

  // Track current IDs for redo (IDs change on re-creation)
  let currentWallIds = capturedWalls.map((w) => w.id);
  let currentApIds = capturedAps.map((a) => a.id);

  const command: EditorCommand = {
    label: `Delete ${ids.length} Items`,
    async execute() {
      for (const wallId of currentWallIds) {
        await deleteWall(wallId);
      }
      for (const apId of currentApIds) {
        await deleteAccessPoint(apId);
      }
      canvasStore.clearSelection();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
    async undo() {
      const newWallIds: string[] = [];
      for (const { data } of capturedWalls) {
        const result = await createWall(data.floorId, data.materialId, data.segments);
        if (data.attOverride24 !== null || data.attOverride5 !== null || data.attOverride6 !== null) {
          await updateWall(result.id, {
            attenuationOverride24ghz: data.attOverride24,
            attenuationOverride5ghz: data.attOverride5,
            attenuationOverride6ghz: data.attOverride6,
          });
        }
        newWallIds.push(result.id);
      }
      currentWallIds = newWallIds;

      const newApIds: string[] = [];
      for (const { data } of capturedAps) {
        const result = await createAccessPoint(
          data.floorId,
          data.x,
          data.y,
          data.apModelId,
          data.label,
        );
        await updateAccessPoint(result.id, {
          height_m: data.height_m,
          mounting: data.mounting,
          tx_power_24ghz_dbm: data.tx_power_24ghz_dbm,
          tx_power_5ghz_dbm: data.tx_power_5ghz_dbm,
          channel_24ghz: data.channel_24ghz,
          channel_5ghz: data.channel_5ghz,
          channel_width: data.channel_width,
          enabled: data.enabled,
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

// ── Wall creation callback (with undo support) ───────────────

async function handleWallCreated(
  wallId: string,
  wallFloorId: string,
  wallMaterial: string,
  segments: WallSegmentInput[],
): Promise<void> {
  await projectStore.refreshFloorData();
  projectStore.markDirty();

  // Push undo command (wall was already created by WallDrawingLayer)
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

// ── Room creation callback (with undo support) ───────────────

async function handleRoomCreated(wallIds: string[], areaM2: number, centroid: Position): Promise<void> {
  await projectStore.refreshFloorData();
  projectStore.markDirty();

  // Auto-create text annotation with room area at centroid
  const roomNumber = annotations.filter(a => a.text.includes('m\u00B2')).length + 1;
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

  // Push undo command for all walls + annotation created by the room
  const capturedIds = [...wallIds];
  const capturedAnnotationId = annotationId;
  undoStore.pushExecuted({
    label: `Create Room (${capturedIds.length} walls)`,
    async execute() {
      await projectStore.refreshFloorData();
    },
    async undo() {
      for (const id of capturedIds) {
        try {
          await deleteWall(id);
        } catch { /* wall may already be deleted */ }
      }
      // Remove the area annotation too
      annotations = annotations.filter(a => a.id !== capturedAnnotationId);
      saveAnnotations();
      await projectStore.refreshFloorData();
      projectStore.markDirty();
    },
  });
}

</script>

<svelte:head>
  <title>{t('nav.editor')} - {t('app.title')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Headless live heatmap renderer -->
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

<div
  class="editor-container"
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
  style:cursor={canvasCursor}
  oncontextmenu={(e) => {
    e.preventDefault();
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuVisible = true;
  }}
>
  {#if floor}
    <FloorplanEditor
      bind:this={editorRef}
      width={containerWidth}
      height={containerHeight}
      floorplanWidthM={floor.width_meters ?? 10}
      floorplanHeightM={floor.height_meters ?? 10}
      {scalePxPerMeter}
      draggable={canvasStore.activeTool === 'pan'}
      backgroundInteractive={canvasStore.activeTool === 'select' && canvasStore.backgroundVisible}
      onCanvasClick={handleCanvasClick}
      onCanvasDblClick={handleCanvasDblClick}
      onCanvasMouseMove={handleCanvasMouseMove}
    >
      {#snippet background()}
        {#if canvasStore.backgroundVisible}
          <BackgroundImage
            imageData={floorImageDataUrl}
            {scalePxPerMeter}
            rotation={floorRotation}
            opacity={canvasStore.backgroundOpacity}
            userOffsetX={canvasStore.backgroundOffsetX}
            userOffsetY={canvasStore.backgroundOffsetY}
            draggable={canvasStore.activeTool === 'select'}
            locked={backgroundLocked}
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

        {#if floor.access_points}
          {#each floor.access_points as ap (ap.id)}
            <AccessPointMarker
              accessPoint={ap}
              selected={canvasStore.isSelected(ap.id)}
              {scalePxPerMeter}
              draggable={canvasStore.activeTool === 'select'}
              onSelect={(id) => handleItemSelect(id)}
              onPositionChange={handleApPositionChange}
            />
          {/each}
        {/if}

        <!-- Wall drawing layer (active when wall/door/window tool is selected) -->
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

        <!-- Room drawing layer (closed polygon → multiple walls) -->
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

        <!-- Text annotations (room labels) -->
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

        <!-- Candidate location markers -->
        {#each candidates as cand (cand.id)}
          <CandidateLocationMarker
            candidate={cand}
            selected={canvasStore.isSelected(cand.id)}
            {scalePxPerMeter}
            draggable={canvasStore.activeTool === 'select'}
            interactive={canvasStore.activeTool === 'select'}
            onSelect={(id) => handleItemSelect(id)}
            onPositionChange={handleCandidatePositionChange}
            onDelete={handleCandidateDelete}
          />
        {/each}

        <!-- Constraint zone rectangles -->
        {#each constraintZones as zone (zone.id)}
          <ConstraintZoneRect
            {zone}
            selected={canvasStore.isSelected(zone.id)}
            {scalePxPerMeter}
            interactive={canvasStore.activeTool === 'select'}
            onSelect={(id) => handleItemSelect(id)}
            onPositionChange={handleZonePositionChange}
            onResize={(id, x, y, w, h) => {
              constraintZones = constraintZones.map(z => z.id === id ? { ...z, x, y, width: w, height: h } : z);
              saveZones();
            }}
            onDelete={handleZoneDelete}
          />
        {/each}

        <!-- (Zone uses 1-click placement, no start marker needed) -->

        <!-- Placement hint markers (visible when heatmap is active) -->
        {#if editorHeatmapStore.visible && placementHints.length > 0}
          <PlacementHintMarker
            hints={placementHints}
            {scalePxPerMeter}
          />
        {/if}

        <!-- Measure tool layer -->
        {#if canvasStore.activeTool === 'measure' && measureStart}
          <MeasureLayer
            startPoint={measureStart}
            endPoint={measureEnd}
            {scalePxPerMeter}
            {mousePosition}
          />
        {/if}

        <!-- Saved/pinned measurements -->
        {#if savedMeasurements.length > 0}
          <SavedMeasurements
            measurements={savedMeasurements}
            {scalePxPerMeter}
            interactive={canvasStore.activeTool === 'select'}
            selectedId={selectedMeasurementId}
            onSelect={(id) => { selectedMeasurementId = id; canvasStore.clearSelection(); }}
          />
        {/if}

        <!-- Channel conflict overlay lines -->
        {#if channelStore.overlayVisible && channelStore.analysis}
          <ChannelConflictOverlay
            conflicts={channelStore.analysis.conflicts}
            accessPoints={floor.access_points ?? []}
            {scalePxPerMeter}
            visible={channelStore.overlayVisible}
          />
        {/if}

        <!-- Persistent scale reference line (visible after calibration) -->
        {#if confirmedScalePoints.length === 2 && confirmedScaleDistanceM !== null}
          <ScaleReferenceLine
            points={confirmedScalePoints}
            distanceM={confirmedScaleDistanceM}
          />
        {/if}

        <!-- Door/Window 2-click preview -->
        {#if doorWindowStart}
          <!-- Start point marker -->
          <Circle
            x={doorWindowStart.x * scalePxPerMeter}
            y={doorWindowStart.y * scalePxPerMeter}
            radius={5}
            fill={canvasStore.activeTool === 'door' ? '#8B6914' : '#64B5F6'}
            stroke="#ffffff"
            strokeWidth={2}
            listening={false}
          />
          <!-- Preview line from start to current mouse position -->
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

        <!-- Hit-trace visualization (Point Inspector ray from AP to point) -->
        {#if hitTraceData}
          <Line
            points={[hitTraceData.apX, hitTraceData.apY, hitTraceData.pointX, hitTraceData.pointY]}
            stroke="rgba(255, 255, 100, 0.5)"
            strokeWidth={2}
            dash={[6, 3]}
            listening={false}
          />
          {#each hitTraceData.groups as group}
            {#if group.action === 'same_barrier_merged'}
              <Circle
                x={group.x}
                y={group.y}
                radius={8}
                fill="transparent"
                stroke="#ffeb3b"
                strokeWidth={1.5}
                listening={false}
              />
            {:else if group.action === 'opening_replaced_wall'}
              <Circle
                x={group.x}
                y={group.y}
                radius={8}
                fill="transparent"
                stroke="#4caf50"
                strokeWidth={1.5}
                listening={false}
              />
            {/if}
            <Circle
              x={group.x}
              y={group.y}
              radius={5}
              fill={group.color}
              stroke="#ffffff"
              strokeWidth={1.5}
              listening={false}
            />
          {/each}
          <!-- AP end marker -->
          <Circle
            x={hitTraceData.apX}
            y={hitTraceData.apY}
            radius={5}
            fill="#4caf50"
            stroke="#ffffff"
            strokeWidth={2}
            listening={false}
          />
          <!-- Point end marker -->
          <Circle
            x={hitTraceData.pointX}
            y={hitTraceData.pointY}
            radius={5}
            fill="#2196f3"
            stroke="#ffffff"
            strokeWidth={2}
            listening={false}
          />
        {/if}

        <!-- Crosshair cursor (always visible when mouse is on canvas, except pan/select) -->
        {#if mousePosition && canvasStore.activeTool !== 'pan' && canvasStore.activeTool !== 'select'}
          <CrosshairCursor x={mousePosition.x} y={mousePosition.y} />
        {/if}

        <!-- Ruler overlay (always visible, rendered last so it's on top) -->
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

    <!-- Canvas scrollbars overlay -->
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

    <!-- Export PNG button -->
    {#if floorImageDataUrl}
      <div class="floorplan-actions">
        <button class="replace-btn" onclick={handleExportPng} title={t('editor.exportPng')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="m21 15-5-5L5 21"/>
          </svg>
          PNG
        </button>
      </div>
    {/if}

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

    <!-- Measure tool result display -->
    {#if canvasStore.activeTool === 'measure' && measuredDistance !== null}
      <div class="measure-result">
        {t('editor.measureDistance')}: {measuredDistance.toFixed(2)} m
        <button
          class="pin-btn"
          onclick={handlePinMeasurement}
          title={t('editor.saveMeasurement')}
        >📌</button>
      </div>
    {/if}

    <!-- Door/Window 2-click hint -->
    {#if canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window'}
      <div class="scale-hint-bar">
        {doorWindowStart ? t('editor.doorWindowHint2') : t('editor.doorWindowHint1')}
        {#if doorWindowStart}
          <button class="btn-cancel-small" onclick={() => { doorWindowStart = null; }}>{t('project.cancel')}</button>
        {/if}
      </div>
    {/if}

    <!-- Zone placement hint -->
    {#if canvasStore.activeTool === 'zone'}
      <div class="scale-hint-bar">
        {t('editor.zoneHint1')}
      </div>
    {/if}

    <!-- Floating Heatmap Controls Panel -->
    <EditorHeatmapPanel visible={editorHeatmapStore.visible} />

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

    <!-- Material Picker (visible when wall/door/window tool is active) -->
    {#if canvasStore.activeTool === 'wall' || canvasStore.activeTool === 'door' || canvasStore.activeTool === 'window' || canvasStore.activeTool === 'room'}
      <div class="material-floating-panel">
        <MaterialPicker
          selectedMaterialId={canvasStore.selectedMaterialId}
          onSelect={(id) => canvasStore.setSelectedMaterial(id)}
          activeTool={canvasStore.activeTool}
        />
      </div>
    {/if}

    <!-- AP Library Panel (visible when AP tool is active) -->
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
  {:else}
    <div class="empty-canvas">
      <p>{t('editor.noFloorplan')}</p>
    </div>
  {/if}
</div>

<ShortcutHelp bind:open={shortcutHelpOpen} />

<!-- Point Inspector Debug Overlay (Alt+Click) -->
<PointInspectorOverlay
  result={pointInspectorResult}
  onClose={() => { pointInspectorResult = null; hitTraceApId = null; }}
  onSelectAp={(apId) => { hitTraceApId = apId; }}
/>

<style>
  .editor-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--canvas-bg, #e8e8f0);
    position: relative;
  }

  .empty-canvas {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-muted, #6a6a8a);
    font-size: 1rem;
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

  .floorplan-actions {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: flex;
    gap: 6px;
    z-index: 10;
  }

  .replace-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(26, 26, 46, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #a0a0b0;
    font-size: 0.75rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(4px);
  }

  .replace-btn:hover {
    background: rgba(26, 26, 46, 0.95);
    color: #e0e0f0;
    border-color: rgba(74, 108, 247, 0.4);
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

  .measure-result {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 16px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(74, 108, 247, 0.3);
    border-radius: 6px;
    color: #e0e0f0;
    font-size: 0.85rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    backdrop-filter: blur(8px);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pin-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0 2px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .pin-btn:hover {
    opacity: 1;
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
