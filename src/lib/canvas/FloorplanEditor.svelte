<!--
  FloorplanEditor.svelte - Main canvas component for the floorplan editor.

  Uses svelte-konva with 3 Konva layers:
  - Background: non-interactive floorplan image + grid
  - Heatmap: non-interactive heatmap overlay
  - UI: interactive elements (walls, APs, measurement points)

  Supports zoom/pan via mouse wheel (pointer-relative) and drag.
  Scale is clamped between MIN_SCALE and MAX_SCALE.
-->
<script lang="ts">
import { canvasStore } from '$lib/stores/canvasStore.svelte';
import type Konva from 'konva';
import type { Snippet } from 'svelte';
import { Stage, Layer } from 'svelte-konva';
import type { KonvaDragTransformEvent, KonvaMouseEvent, KonvaWheelEvent } from 'svelte-konva';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_FACTOR = 1.05;

// Props using Svelte 5 runes
interface FloorplanEditorProps {
  /** Container width in pixels */
  width?: number;
  /** Container height in pixels */
  height?: number;
  /** Floorplan width in meters (for fitToScreen) */
  floorplanWidthM?: number;
  /** Floorplan height in meters (for fitToScreen) */
  floorplanHeightM?: number;
  /** Scale in pixels per meter */
  scalePxPerMeter?: number;
  /** Whether panning via drag is enabled */
  draggable?: boolean;
  /** Whether the background layer should be interactive (for background image dragging) */
  backgroundInteractive?: boolean;
  /** Snippet for background layer content */
  background?: Snippet;
  /** Snippet for heatmap layer content */
  heatmap?: Snippet;
  /** Snippet for UI layer content */
  ui?: Snippet;
  /** Callback when canvas is clicked (for wall/AP placement) */
  onCanvasClick?: (canvasX: number, canvasY: number) => void;
  /** Callback when canvas is double-clicked */
  onCanvasDblClick?: (canvasX: number, canvasY: number) => void;
  /** Callback when mouse moves on canvas */
  onCanvasMouseMove?: (canvasX: number, canvasY: number) => void;
  /** Callback when pointer is pressed on canvas (left button, not panning) */
  onCanvasPointerDown?: (canvasX: number, canvasY: number) => void;
  /** Callback when pointer is released on canvas (not panning) */
  onCanvasPointerUp?: (canvasX: number, canvasY: number) => void;
}

let {
  width = $bindable(800),
  height = $bindable(600),
  floorplanWidthM = 10,
  floorplanHeightM = 10,
  scalePxPerMeter = 50,
  draggable = true,
  backgroundInteractive = false,
  background,
  heatmap,
  ui,
  onCanvasClick,
  onCanvasDblClick,
  onCanvasMouseMove,
  onCanvasPointerDown,
  onCanvasPointerUp,
}: FloorplanEditorProps = $props();

// We obtain the stage reference from the first event that fires
let stageNode: Konva.Stage | null = null;

// Middle-mouse / space-drag panning state
let isPanning = $state(false);
let panStartPointer = $state({ x: 0, y: 0 });
let panStartOffset = $state({ x: 0, y: 0 });

function captureStageRef(event: { target: Konva.Node }): void {
  if (!stageNode) {
    stageNode = event.target.getStage();
  }
}

/**
 * Convert screen pointer coordinates to canvas (content) coordinates.
 */
function pointerToCanvas(stage: Konva.Stage): { x: number; y: number } | null {
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  const scale = canvasStore.scale;
  return {
    x: (pointer.x - canvasStore.offsetX) / scale,
    y: (pointer.y - canvasStore.offsetY) / scale,
  };
}

/**
 * Handles mouse wheel events for pointer-relative zoom.
 */
export function handleWheel(event: KonvaWheelEvent): void {
  event.evt.preventDefault();
  captureStageRef(event);

  const stage = stageNode;
  if (!stage) return;

  const oldScale = canvasStore.scale;
  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  const direction = event.evt.deltaY > 0 ? -1 : 1;
  const newScale = clampScale(direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR);

  const mousePointTo = {
    x: (pointer.x - canvasStore.offsetX) / oldScale,
    y: (pointer.y - canvasStore.offsetY) / oldScale,
  };

  canvasStore.setScale(newScale);
  canvasStore.setOffset(
    pointer.x - mousePointTo.x * newScale,
    pointer.y - mousePointTo.y * newScale,
  );
}

/**
 * Fits the floorplan to fill the visible stage area with some padding.
 */
export function fitToScreen(padding = 40): void {
  const effectiveWidth = floorplanWidthM * scalePxPerMeter;
  const effectiveHeight = floorplanHeightM * scalePxPerMeter;

  if (effectiveWidth <= 0 || effectiveHeight <= 0) return;

  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  const scaleX = availableWidth / effectiveWidth;
  const scaleY = availableHeight / effectiveHeight;
  const newScale = clampScale(Math.min(scaleX, scaleY));

  const scaledWidth = effectiveWidth * newScale;
  const scaledHeight = effectiveHeight * newScale;

  canvasStore.setScale(newScale);
  canvasStore.setOffset((width - scaledWidth) / 2, (height - scaledHeight) / 2);
}

/**
 * Zooms to a specific scale level, centered on the stage.
 */
export function zoomTo(targetScale: number): void {
  const newScale = clampScale(targetScale);
  const centerX = width / 2;
  const centerY = height / 2;

  const mousePointTo = {
    x: (centerX - canvasStore.offsetX) / canvasStore.scale,
    y: (centerY - canvasStore.offsetY) / canvasStore.scale,
  };

  canvasStore.setScale(newScale);
  canvasStore.setOffset(centerX - mousePointTo.x * newScale, centerY - mousePointTo.y * newScale);
}

export function getScale(): number {
  return canvasStore.scale;
}

export function getPosition(): { x: number; y: number } {
  return { x: canvasStore.offsetX, y: canvasStore.offsetY };
}

/**
 * Exports the current canvas content as a data URL (PNG).
 */
export function exportToDataURL(pixelRatio = 2): string | null {
  if (!stageNode) return null;
  return stageNode.toDataURL({ pixelRatio, mimeType: 'image/png' });
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function handleDragEnd(event: KonvaDragTransformEvent): void {
  captureStageRef(event);
  const target = event.target;
  const stage = target.getStage();
  if (target === stage) {
    canvasStore.setOffset(target.x(), target.y());
  }
}

/**
 * Start panning on middle-mouse-button or when space is held.
 */
function handleStageMouseDown(event: KonvaMouseEvent): void {
  captureStageRef(event);
  const evt = event.evt;
  // Middle mouse button (button=1) or space key held → start pan
  if (evt.button === 1 || canvasStore.spaceHeld) {
    evt.preventDefault();
    isPanning = true;
    panStartPointer = { x: evt.clientX, y: evt.clientY };
    panStartOffset = { x: canvasStore.offsetX, y: canvasStore.offsetY };
  } else if (evt.button === 0 && onCanvasPointerDown) {
    const stage = stageNode;
    if (stage) {
      const pos = pointerToCanvas(stage);
      if (pos) onCanvasPointerDown(pos.x, pos.y);
    }
  }
}

function handleStageMouseUp(event: KonvaMouseEvent): void {
  if (isPanning) {
    isPanning = false;
    event.evt.preventDefault();
  } else if (onCanvasPointerUp) {
    captureStageRef(event);
    const stage = stageNode;
    if (stage) {
      const pos = pointerToCanvas(stage);
      if (pos) onCanvasPointerUp(pos.x, pos.y);
    }
  }
}

function handleStageClick(event: KonvaMouseEvent): void {
  captureStageRef(event);
  // Suppress click after a pan gesture or middle-button click
  if (event.evt.button === 1) return;
  // Interactive shapes set cancelBubble = true in their onclick handlers,
  // so this event only reaches here for clicks on empty space or
  // non-listening shapes (e.g. walls/APs in drawing mode).
  const stage = stageNode;
  if (!stage) return;
  const pos = pointerToCanvas(stage);
  if (pos) onCanvasClick?.(pos.x, pos.y);
}

function handleStageDblClick(event: KonvaMouseEvent): void {
  captureStageRef(event);
  if (event.target !== event.target.getStage()) return;
  const stage = stageNode;
  if (!stage) return;
  const pos = pointerToCanvas(stage);
  if (pos) onCanvasDblClick?.(pos.x, pos.y);
}

function handleStageMouseMove(event: KonvaMouseEvent): void {
  captureStageRef(event);

  // If panning via middle-mouse or space+drag, update offset
  if (isPanning) {
    const evt = event.evt;
    const dx = evt.clientX - panStartPointer.x;
    const dy = evt.clientY - panStartPointer.y;
    canvasStore.setOffset(panStartOffset.x + dx, panStartOffset.y + dy);
    // Also update the Konva stage position directly to stay in sync
    if (stageNode) {
      stageNode.position({ x: panStartOffset.x + dx, y: panStartOffset.y + dy });
    }
    return;
  }

  const stage = stageNode;
  if (!stage) return;
  const pos = pointerToCanvas(stage);
  if (pos) onCanvasMouseMove?.(pos.x, pos.y);
}
</script>

<Stage
  width={width}
  height={height}
  scaleX={canvasStore.scale}
  scaleY={canvasStore.scale}
  x={canvasStore.offsetX}
  y={canvasStore.offsetY}
  {draggable}
  onwheel={handleWheel}
  ondragend={handleDragEnd}
  onmousedown={handleStageMouseDown}
  onmouseup={handleStageMouseUp}
  onclick={handleStageClick}
  ondblclick={handleStageDblClick}
  onmousemove={handleStageMouseMove}
>
  <!-- Background layer: floorplan image + grid (interactive only when background dragging) -->
  <Layer listening={backgroundInteractive}>
    {#if background}
      {@render background()}
    {/if}
  </Layer>

  <!-- Heatmap layer: signal overlay (non-interactive) -->
  <Layer listening={false}>
    {#if heatmap}
      {@render heatmap()}
    {/if}
  </Layer>

  <!-- UI layer: interactive elements (walls, APs, measurement points) -->
  <Layer>
    {#if ui}
      {@render ui()}
    {/if}
  </Layer>
</Stage>
