/**
 * Workspace Store - Communication bridge between child pages and the persistent WorkspaceCanvas.
 *
 * Pages register click handlers, cursor overrides, and editor-specific callbacks.
 * WorkspaceCanvas reads these to dispatch events and render mode-specific content.
 */

import type { AnnotationData } from '$lib/canvas/TextAnnotation.svelte';
import type { SavedMeasurement } from '$lib/canvas/SavedMeasurements.svelte';
import type { Position } from '$lib/models/types';
import type { SegmentInput } from '$lib/api/invoke';
import type { WallSegmentInput } from '$lib/api/wall';
import type { CandidateLocation, ConstraintZone, APCapabilities } from '$lib/recommendations/types';
import type { PointDebugResult } from '$lib/heatmap/point-inspector';

// ─── Editor Canvas Callbacks (set by editor page, used by EditorCanvasLayers) ───

export interface EditorCanvasCallbacks {
  onItemSelect?: (id: string) => void;
  onApPositionChange?: (id: string, x: number, y: number) => void;
  onAnnotationPositionChange?: (id: string, x: number, y: number) => void;
  onAnnotationEdit?: (id: string) => void;
  onWallSegmentsUpdate?: (wallId: string, segments: SegmentInput[]) => void;
  onWallCreated?: (wallId: string, floorId: string, material: string, segments: WallSegmentInput[]) => void;
  onRoomCreated?: (wallIds: string[], areaM2: number, centroid: Position) => void;
  onCandidatePositionChange?: (id: string, x: number, y: number) => void;
  onCandidateDelete?: (id: string) => void;
  onZonePositionChange?: (id: string, x: number, y: number) => void;
  onZoneResize?: (id: string, x: number, y: number, w: number, h: number) => void;
  onZoneDelete?: (id: string) => void;
  onBackgroundDragEnd?: (x: number, y: number) => void;
}

// ─── Drawing Layer API (set by EditorCanvasLayers, used by editor page click handler) ───

export interface DrawingLayerApi {
  handleClick: (pos: { x: number; y: number }) => void;
  handleDoubleClick: (pos: { x: number; y: number }) => void;
}

// ─── Store ──────────────────────────────────────────────────────

function createWorkspaceStore() {
  // Click-Handler-Registrierung (von Child-Pages gesetzt)
  let clickHandler = $state<((x: number, y: number) => void) | null>(null);
  let dblClickHandler = $state<((x: number, y: number) => void) | null>(null);

  // Cursor-Override (Editor hat tool-abhaengige Cursor)
  let cursorOverride = $state<string | null>(null);

  // Mixing-Mode: Forecast-Canvas + AP-Preview-Overrides
  let forecastCanvas = $state<HTMLCanvasElement | null>(null);
  let forecastActive = $state(false);
  let displayApOverrides = $state<Map<string, Record<string, unknown>>>(new Map());

  // Shared canvas data (loaded by WorkspaceCanvas, editable by editor page)
  let annotations = $state<AnnotationData[]>([]);
  let savedMeasurements = $state<SavedMeasurement[]>([]);
  let mousePosition = $state<Position | null>(null);

  // Editor-specific callbacks (registered by editor page, read by EditorCanvasLayers)
  let editorCallbacks = $state<EditorCanvasCallbacks | null>(null);

  // Drawing layer APIs (set by EditorCanvasLayers, used by editor page click handler)
  let wallLayerApi = $state<DrawingLayerApi | null>(null);
  let roomLayerApi = $state<DrawingLayerApi | null>(null);

  // Editor-specific canvas state (set by editor page, read by EditorCanvasLayers)
  let candidates = $state<CandidateLocation[]>([]);
  let constraintZones = $state<ConstraintZone[]>([]);
  let apCapabilities = $state<Map<string, APCapabilities>>(new Map());
  let backgroundLocked = $state(false);

  // Scale reference (loaded by WorkspaceCanvas, read-only display)
  let confirmedScalePoints = $state<Array<{ x: number; y: number }>>([]);
  let confirmedScaleDistanceM = $state<number | null>(null);

  // Editor-specific cross-boundary state (set by editor page, read by EditorCanvasLayers)
  let doorWindowStart = $state<{
    wallId: string;
    segIdx: number;
    t: number;
    x: number;
    y: number;
  } | null>(null);

  // Point Inspector state (set by editor page, read by EditorCanvasLayers for hit-trace)
  let pointInspectorResult = $state<PointDebugResult | null>(null);
  let hitTraceApId = $state<string | null>(null);

  return {
    // ── Getters ─────────────────────────────────────────────
    get clickHandler() { return clickHandler; },
    get dblClickHandler() { return dblClickHandler; },
    get cursorOverride() { return cursorOverride; },
    get forecastCanvas() { return forecastCanvas; },
    get forecastActive() { return forecastActive; },
    get displayApOverrides() { return displayApOverrides; },
    get annotations() { return annotations; },
    get savedMeasurements() { return savedMeasurements; },
    get mousePosition() { return mousePosition; },
    get editorCallbacks() { return editorCallbacks; },
    get wallLayerApi() { return wallLayerApi; },
    get roomLayerApi() { return roomLayerApi; },
    get candidates() { return candidates; },
    get constraintZones() { return constraintZones; },
    get apCapabilities() { return apCapabilities; },
    get backgroundLocked() { return backgroundLocked; },
    get confirmedScalePoints() { return confirmedScalePoints; },
    get confirmedScaleDistanceM() { return confirmedScaleDistanceM; },
    get doorWindowStart() { return doorWindowStart; },
    get pointInspectorResult() { return pointInspectorResult; },
    get hitTraceApId() { return hitTraceApId; },

    // ── Actions ─────────────────────────────────────────────

    registerHandlers(h: {
      onClick?: (x: number, y: number) => void;
      onDblClick?: (x: number, y: number) => void;
    }): void {
      clickHandler = h.onClick ?? null;
      dblClickHandler = h.onDblClick ?? null;
    },

    unregisterHandlers(): void {
      clickHandler = null;
      dblClickHandler = null;
    },

    setCursorOverride(c: string | null): void { cursorOverride = c; },
    setForecastCanvas(c: HTMLCanvasElement | null): void { forecastCanvas = c; },
    setForecastActive(v: boolean): void { forecastActive = v; },
    setDisplayApOverrides(m: Map<string, Record<string, unknown>>): void { displayApOverrides = m; },

    setAnnotations(a: AnnotationData[]): void { annotations = a; },
    setSavedMeasurements(m: SavedMeasurement[]): void { savedMeasurements = m; },
    setMousePosition(p: Position | null): void { mousePosition = p; },

    registerEditorCallbacks(cbs: EditorCanvasCallbacks): void { editorCallbacks = cbs; },
    unregisterEditorCallbacks(): void { editorCallbacks = null; },

    setWallLayerApi(api: DrawingLayerApi | null): void { wallLayerApi = api; },
    setRoomLayerApi(api: DrawingLayerApi | null): void { roomLayerApi = api; },

    setCandidates(c: CandidateLocation[]): void { candidates = c; },
    setConstraintZones(z: ConstraintZone[]): void { constraintZones = z; },
    setApCapabilities(m: Map<string, APCapabilities>): void { apCapabilities = m; },
    setBackgroundLocked(v: boolean): void { backgroundLocked = v; },

    setConfirmedScale(points: Array<{ x: number; y: number }>, distanceM: number | null): void {
      confirmedScalePoints = points;
      confirmedScaleDistanceM = distanceM;
    },

    setDoorWindowStart(s: typeof doorWindowStart): void { doorWindowStart = s; },
    setPointInspectorResult(r: PointDebugResult | null): void { pointInspectorResult = r; },
    setHitTraceApId(id: string | null): void { hitTraceApId = id; },

    reset(): void {
      clickHandler = null;
      dblClickHandler = null;
      cursorOverride = null;
      forecastCanvas = null;
      forecastActive = false;
      displayApOverrides = new Map();
      annotations = [];
      savedMeasurements = [];
      mousePosition = null;
      editorCallbacks = null;
      wallLayerApi = null;
      roomLayerApi = null;
      candidates = [];
      constraintZones = [];
      apCapabilities = new Map();
      backgroundLocked = false;
      confirmedScalePoints = [];
      confirmedScaleDistanceM = null;
      doorWindowStart = null;
      pointInspectorResult = null;
      hitTraceApId = null;
    },
  };
}

/** Singleton workspace store instance */
export const workspaceStore = createWorkspaceStore();
