<!--
  Editor page - Main canvas workspace with FloorplanEditor.

  Binds container dimensions for responsive canvas sizing.
  Integrates the FloorplanEditor with tool state from canvasStore.
  Features: Undo/Redo, Live Heatmap, Wall Drawing, AP Placement,
  Floor Plan Upload, Properties Panel, Coverage Stats, Placement Hints.
-->
<script lang="ts">
import { createAccessPoint, deleteAccessPoint, updateAccessPoint } from '$lib/api/accessPoint';
import { importFloorImage, setFloorScale, setFloorRotation } from '$lib/api/floor';
import { safeInvoke, type MaterialResponse, type SegmentInput } from '$lib/api/invoke';
import { createWall, deleteWall, updateWall, type WallSegmentInput } from '$lib/api/wall';
import { FloorplanEditor } from '$lib/canvas';
import BackgroundImage from '$lib/canvas/BackgroundImage.svelte';
import GridOverlay from '$lib/canvas/GridOverlay.svelte';
import HeatmapOverlay from '$lib/canvas/HeatmapOverlay.svelte';
import ScaleIndicator from '$lib/canvas/ScaleIndicator.svelte';
import WallDrawingTool from '$lib/canvas/WallDrawingTool.svelte';
import AccessPointMarker from '$lib/canvas/AccessPointMarker.svelte';
import MeasureLayer from '$lib/canvas/MeasureLayer.svelte';
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
import { registerShortcuts } from '$lib/utils/keyboard';

let containerWidth = $state(800);
let containerHeight = $state(600);
let shortcutHelpOpen = $state(false);
let mousePosition = $state<Position | null>(null);
let floorImageDataUrl = $state<string | null>(null);
let fileInput: HTMLInputElement | undefined = $state();
let materials = $state<MaterialResponse[]>([]);
let scalePoints = $state<Array<{ x: number; y: number }>>([]);
let scaleDialogOpen = $state(false);
let scaleDistanceInput = $state('');
let scalePixelDistance = $state(0);
let measureStart = $state<{ x: number; y: number } | null>(null);
let measureEnd = $state<{ x: number; y: number } | null>(null);

let settingScale = $derived(canvasStore.settingScale);

let floor = $derived(projectStore.activeFloor);
let scalePxPerMeter = $derived(floor?.scale_px_per_meter ?? 50);
let floorRotation = $derived(floor?.background_image_rotation ?? 0);

// ── Floor bounds for heatmap ──────────────────────────────────
let floorBounds = $derived({
  width: floor?.width_meters ?? 10,
  height: floor?.height_meters ?? 10,
});

// ── Default material for wall drawing ─────────────────────────
let wallMaterialId = $derived(canvasStore.selectedMaterialId ?? 'mat-drywall');

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

// ── Selection-based properties panel ──────────────────────────
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

let showPropertiesPanel = $derived(selectedWall !== null || selectedAp !== null);

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

// ── Load floor image on mount ─────────────────────────────────
$effect(() => {
  const floorId = floor?.id;
  if (!floorId) return;
  loadFloorImage(floorId);
});

async function loadFloorImage(floorId: string): Promise<void> {
  try {
    const result = await safeInvoke('get_floor_image', { floor_id: floorId });
    if (result?.background_image && result.background_image_format) {
      const bytes = new Uint8Array(result.background_image);
      const blob = new Blob([bytes], { type: `image/${result.background_image_format}` });
      floorImageDataUrl = URL.createObjectURL(blob);
    } else {
      // Check localStorage for browser-mode image
      const stored = localStorage.getItem(`wlan-opt:floor-image:${floorId}`);
      if (stored) {
        floorImageDataUrl = stored;
      }
    }
  } catch {
    // No image available
  }
}

// ── Load materials on mount ──────────────────────────────────
$effect(() => {
  loadMaterials();
});

// ── Reset scale points when entering scale mode ──────────────
$effect(() => {
  if (settingScale) {
    scalePoints = [];
    scaleDialogOpen = false;
    scaleDistanceInput = '';
  }
});

async function loadMaterials(): Promise<void> {
  try {
    materials = await safeInvoke('list_materials', {});
  } catch {
    // Materials will remain empty
  }
}

// ── PropertiesPanel callbacks ─────────────────────────────────

async function handleWallUpdate(
  wallId: string,
  updates: {
    materialId?: string;
    attenuationOverride24ghz?: number | null;
    attenuationOverride5ghz?: number | null;
  },
): Promise<void> {
  // Capture old wall properties for undo
  const wall = floor?.walls?.find((w) => w.id === wallId);
  const oldValues = {
    materialId: wall?.material_id,
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
  try {
    await updateWall(wallId, { segments });
    await projectStore.refreshFloorData();
    projectStore.markDirty();
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
  },
): Promise<void> {
  try {
    await updateAccessPoint(apId, {
      label: updates.label,
      tx_power_24ghz_dbm: updates.txPower24ghzDbm,
      tx_power_5ghz_dbm: updates.txPower5ghzDbm,
      enabled: updates.enabled,
      height_m: updates.height_m,
      mounting: updates.mounting,
      channel_24ghz: updates.channel_24ghz,
      channel_5ghz: updates.channel_5ghz,
      channel_width: updates.channel_width,
    });
    await projectStore.refreshFloorData();
    projectStore.markDirty();
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

// ── Scale setting ────────────────────────────────────────────

function cancelScaleSetting(): void {
  canvasStore.setSettingScale(false);
  scalePoints = [];
  scaleDialogOpen = false;
  scaleDistanceInput = '';
}

async function confirmScale(): Promise<void> {
  const distance = parseFloat(scaleDistanceInput);
  if (!floor || isNaN(distance) || distance <= 0 || scalePixelDistance <= 0) return;

  const newPxPerMeter = scalePixelDistance / distance;
  // Estimate floor dimensions from image or use defaults
  const widthM = (containerWidth / canvasStore.scale) / newPxPerMeter;
  const heightM = (containerHeight / canvasStore.scale) / newPxPerMeter;

  try {
    await setFloorScale(floor.id, newPxPerMeter, widthM, heightM);
    await projectStore.refreshFloorData();
    projectStore.markDirty();
  } catch (err) {
    console.error('[Editor] Failed to set scale:', err);
  }

  cancelScaleSetting();
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

// ── Reset measure on tool change ──────────────────────────────
$effect(() => {
  if (canvasStore.activeTool !== 'measure') {
    resetMeasure();
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
      handleDeleteSelected();
    },
    save: () => {
      projectStore.saveCurrentProject();
    },
    deselect: () => {
      if (settingScale) {
        cancelScaleSetting();
        return;
      }
      resetMeasure();
      canvasStore.setTool('select');
      canvasStore.clearSelection();
    },
    wallTool: () => {
      canvasStore.setTool('wall');
    },
    apTool: () => {
      canvasStore.setTool('ap');
    },
    measureTool: () => {
      canvasStore.setTool('measure');
    },
    selectTool: () => {
      canvasStore.setTool('select');
    },
    gridToggle: () => {
      canvasStore.toggleGrid();
    },
    heatmapToggle: () => {
      editorHeatmapStore.toggleVisible();
    },
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

// ── Canvas interaction handlers ───────────────────────────────

let wallDrawingLayer: WallDrawingLayer | undefined = $state();

function handleCanvasClick(canvasX: number, canvasY: number): void {
  const tool = canvasStore.activeTool;

  // Scale-setting mode intercepts clicks
  if (settingScale) {
    if (scalePoints.length < 2) {
      scalePoints = [...scalePoints, { x: canvasX, y: canvasY }];
      if (scalePoints.length === 2) {
        const dx = scalePoints[1]!.x - scalePoints[0]!.x;
        const dy = scalePoints[1]!.y - scalePoints[0]!.y;
        scalePixelDistance = Math.sqrt(dx * dx + dy * dy);
        scaleDialogOpen = true;
      }
    }
    return;
  }

  if (tool === 'wall' && wallDrawingLayer) {
    wallDrawingLayer.handleClick({ x: canvasX, y: canvasY });
    return;
  }

  if (tool === 'ap' && floor) {
    const xMeters = canvasX / scalePxPerMeter;
    const yMeters = canvasY / scalePxPerMeter;
    placeAccessPoint(xMeters, yMeters);
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
    canvasStore.clearSelection();
  }
}

function handleCanvasDblClick(canvasX: number, canvasY: number): void {
  if (canvasStore.activeTool === 'wall' && wallDrawingLayer) {
    wallDrawingLayer.handleDoubleClick({ x: canvasX, y: canvasY });
  }
}

function handleCanvasMouseMove(canvasX: number, canvasY: number): void {
  mousePosition = { x: canvasX, y: canvasY };
  canvasStore.setMousePosition(canvasX / scalePxPerMeter, canvasY / scalePxPerMeter);
}

// ── AP placement (with undo support) ──────────────────────────

async function placeAccessPoint(x: number, y: number): Promise<void> {
  if (!floor) return;
  const apFloorId = floor.id;
  const apLabel = `AP ${(floor.access_points?.length ?? 0) + 1}`;
  let currentApId = '';

  const command: EditorCommand = {
    label: 'Place AP',
    async execute() {
      const result = await createAccessPoint(apFloorId, x, y, undefined, apLabel);
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
  }

  // Multi-selection: delete all without undo (rare case)
  for (const id of ids) {
    try {
      const wall = floor?.walls?.find((w) => w.id === id);
      if (wall) {
        await deleteWall(id);
        continue;
      }
      const ap = floor?.access_points?.find((a) => a.id === id);
      if (ap) {
        await deleteAccessPoint(id);
      }
    } catch (err) {
      console.error('[Editor] Delete failed:', err);
    }
  }

  canvasStore.clearSelection();
  await projectStore.refreshFloorData();
  projectStore.markDirty();
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

// ── Floor plan image upload ───────────────────────────────────

function handleUploadClick(): void {
  fileInput?.click();
}

async function handleRotateFloorplan(): Promise<void> {
  if (!floor) return;
  const newRotation = ((floorRotation + 90) % 360);
  try {
    await setFloorRotation(floor.id, newRotation);
    await projectStore.refreshFloorData();
    projectStore.markDirty();
  } catch (err) {
    console.error('[Editor] Failed to rotate floor plan:', err);
  }
}

async function handleFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !floor) return;

  const format = file.type.replace('image/', '');

  try {
    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));

    // Send to backend
    await importFloorImage(floor.id, bytes, format);

    // Create data URL for display
    const dataUrl = URL.createObjectURL(file);
    if (floorImageDataUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(floorImageDataUrl);
    }
    floorImageDataUrl = dataUrl;

    // Also store in localStorage for browser-mode persistence
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        localStorage.setItem(`wlan-opt:floor-image:${floor!.id}`, reader.result);
      }
    };
    reader.readAsDataURL(file);

    projectStore.markDirty();
  } catch (err) {
    console.error('[Editor] Failed to import floor image:', err);
  }

  // Reset input so same file can be re-selected
  target.value = '';
}
</script>

<svelte:head>
  <title>{t('nav.editor')} - {t('app.title')}</title>
</svelte:head>

<!-- Hidden file input for floor plan upload -->
<input
  bind:this={fileInput}
  type="file"
  accept="image/png,image/jpeg,image/webp"
  onchange={handleFileSelected}
  style="display: none"
/>

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

<div class="editor-container" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
  {#if floor}
    <FloorplanEditor
      width={containerWidth}
      height={containerHeight}
      floorplanWidthM={floor.width_meters ?? 10}
      floorplanHeightM={floor.height_meters ?? 10}
      {scalePxPerMeter}
      draggable={canvasStore.activeTool === 'select'}
      onCanvasClick={handleCanvasClick}
      onCanvasDblClick={handleCanvasDblClick}
      onCanvasMouseMove={handleCanvasMouseMove}
    >
      {#snippet background()}
        <BackgroundImage
          imageData={floorImageDataUrl}
          {scalePxPerMeter}
          rotation={floorRotation}
        />
        <GridOverlay
          widthPx={(floor.width_meters ?? 10) * scalePxPerMeter}
          heightPx={(floor.height_meters ?? 10) * scalePxPerMeter}
          gridSizeM={canvasStore.gridSize}
          {scalePxPerMeter}
          visible={canvasStore.gridVisible}
        />
        <ScaleIndicator
          {scalePxPerMeter}
          stageScale={canvasStore.scale}
          {settingScale}
          {scalePoints}
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
              selected={canvasStore.isSelected(wall.id)}
              {scalePxPerMeter}
              editMode={canvasStore.activeTool === 'select'}
              onSelect={(id) => canvasStore.selectItem(id)}
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
              onSelect={(id) => canvasStore.selectItem(id)}
              onPositionChange={handleApPositionChange}
            />
          {/each}
        {/if}

        <!-- Wall drawing layer (active when wall tool is selected) -->
        <WallDrawingLayer
          bind:this={wallDrawingLayer}
          active={canvasStore.activeTool === 'wall'}
          {scalePxPerMeter}
          stageScale={canvasStore.scale}
          snapTargets={wallSnapTargets}
          floorId={floor.id}
          materialId={wallMaterialId}
          {mousePosition}
          onWallCreated={handleWallCreated}
        />

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
      {/snippet}
    </FloorplanEditor>

    <!-- Floor plan upload/replace button -->
    {#if !floorImageDataUrl}
      <button class="upload-btn" onclick={handleUploadClick}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {t('editor.uploadFloorplan')}
      </button>
    {:else}
      <div class="floorplan-actions">
        <button class="replace-btn" onclick={handleUploadClick} title={t('editor.replaceFloorplan')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {t('editor.replaceFloorplan')}
        </button>
        <button class="replace-btn" onclick={handleRotateFloorplan} title={t('editor.rotateFloorplan')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6"/>
            <path d="M21.34 15.57a10 10 0 1 1-.57-8.38L21.5 8"/>
          </svg>
          {t('editor.rotateFloorplan')}
        </button>
      </div>
    {/if}

    <!-- Scale setting dialog -->
    {#if scaleDialogOpen}
      <div class="scale-dialog-overlay">
        <div class="scale-dialog">
          <h3>{t('editor.setScale')}</h3>
          <p class="scale-hint">{t('editor.enterDistance')}</p>
          <div class="scale-input-row">
            <input
              type="number"
              class="scale-input"
              bind:value={scaleDistanceInput}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              autofocus
            />
            <span class="scale-unit">m</span>
          </div>
          <div class="scale-actions">
            <button class="btn-primary" onclick={confirmScale}>{t('editor.setScale')}</button>
            <button class="btn-secondary" onclick={cancelScaleSetting}>{t('project.cancel')}</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Measure tool result display -->
    {#if canvasStore.activeTool === 'measure' && measuredDistance !== null}
      <div class="measure-result">
        {t('editor.measureDistance')}: {measuredDistance.toFixed(2)} m
      </div>
    {/if}

    <!-- Scale setting hint -->
    {#if settingScale && !scaleDialogOpen}
      <div class="scale-hint-bar">
        {t('editor.scaleHint')}
        <button class="btn-cancel-small" onclick={cancelScaleSetting}>{t('project.cancel')}</button>
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
          {materials}
          onWallUpdate={handleWallUpdate}
          onDeleteWall={handleDeleteWall}
          onApUpdate={handleApUpdate}
          onDeleteAp={handleDeleteAp}
        />
      </div>
    {/if}

    <!-- Material Picker (visible when wall tool is active) -->
    {#if canvasStore.activeTool === 'wall'}
      <div class="material-floating-panel">
        <MaterialPicker />
      </div>
    {/if}
  {:else}
    <div class="empty-canvas">
      <p>{t('editor.noFloorplan')}</p>
    </div>
  {/if}
</div>

<ShortcutHelp bind:open={shortcutHelpOpen} />

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

  .upload-btn {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: rgba(74, 108, 247, 0.15);
    border: 2px dashed rgba(74, 108, 247, 0.4);
    border-radius: 12px;
    color: #4a6cf7;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 10;
  }

  .upload-btn:hover {
    background: rgba(74, 108, 247, 0.25);
    border-color: rgba(74, 108, 247, 0.6);
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

  .scale-dialog-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .scale-dialog {
    background: var(--bg-primary, #1a1a2e);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    padding: 24px;
    width: 280px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .scale-dialog h3 {
    margin: 0 0 8px;
    font-size: 1rem;
    color: var(--text-primary, #e0e0f0);
  }

  .scale-hint {
    margin: 0 0 16px;
    font-size: 0.8rem;
    color: var(--text-secondary, #a0a0b0);
  }

  .scale-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }

  .scale-input {
    flex: 1;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: var(--text-primary, #e0e0f0);
    font-size: 1rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .scale-input:focus {
    outline: none;
    border-color: rgba(74, 108, 247, 0.5);
  }

  .scale-unit {
    font-size: 0.9rem;
    color: var(--text-secondary, #a0a0b0);
    font-weight: 600;
  }

  .scale-actions {
    display: flex;
    gap: 8px;
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
</style>
