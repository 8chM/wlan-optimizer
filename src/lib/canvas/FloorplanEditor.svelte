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
  import { Stage, Layer } from 'svelte-konva';
  import type Konva from 'konva';
  import type { KonvaWheelEvent, KonvaDragTransformEvent } from 'svelte-konva';
  import type { Snippet } from 'svelte';

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
    /** Snippet for background layer content */
    background?: Snippet;
    /** Snippet for heatmap layer content */
    heatmap?: Snippet;
    /** Snippet for UI layer content */
    ui?: Snippet;
  }

  let {
    width = $bindable(800),
    height = $bindable(600),
    floorplanWidthM = 10,
    floorplanHeightM = 10,
    scalePxPerMeter = 50,
    draggable = true,
    background,
    heatmap,
    ui,
  }: FloorplanEditorProps = $props();

  // Reactive stage configuration
  let stageScale = $state(1);
  let stageX = $state(0);
  let stageY = $state(0);

  // We obtain the stage reference from the first event that fires
  let stageNode: Konva.Stage | null = null;

  function captureStageRef(event: { target: Konva.Node }): void {
    if (!stageNode) {
      stageNode = event.target.getStage();
    }
  }

  /**
   * Handles mouse wheel events for pointer-relative zoom.
   * Zooms toward the current pointer position so that the point
   * under the cursor stays fixed on screen.
   */
  export function handleWheel(event: KonvaWheelEvent): void {
    event.evt.preventDefault();
    captureStageRef(event);

    const stage = stageNode;
    if (!stage) return;

    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Determine zoom direction
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const newScale = clampScale(
      direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR
    );

    // Calculate new position to keep pointer fixed
    const mousePointTo = {
      x: (pointer.x - stageX) / oldScale,
      y: (pointer.y - stageY) / oldScale,
    };

    stageScale = newScale;
    stageX = pointer.x - mousePointTo.x * newScale;
    stageY = pointer.y - mousePointTo.y * newScale;
  }

  /**
   * Fits the floorplan to fill the visible stage area with some padding.
   * Keeps aspect ratio and centers the result.
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

    // Center the floorplan
    const scaledWidth = effectiveWidth * newScale;
    const scaledHeight = effectiveHeight * newScale;

    stageScale = newScale;
    stageX = (width - scaledWidth) / 2;
    stageY = (height - scaledHeight) / 2;
  }

  /**
   * Zooms to a specific scale level, centered on the stage.
   */
  export function zoomTo(targetScale: number): void {
    const newScale = clampScale(targetScale);
    const centerX = width / 2;
    const centerY = height / 2;

    const mousePointTo = {
      x: (centerX - stageX) / stageScale,
      y: (centerY - stageY) / stageScale,
    };

    stageScale = newScale;
    stageX = centerX - mousePointTo.x * newScale;
    stageY = centerY - mousePointTo.y * newScale;
  }

  /**
   * Returns the current scale level (useful for LOD decisions).
   */
  export function getScale(): number {
    return stageScale;
  }

  /**
   * Returns the current viewport position.
   */
  export function getPosition(): { x: number; y: number } {
    return { x: stageX, y: stageY };
  }

  /**
   * Clamps a scale value between MIN_SCALE and MAX_SCALE.
   */
  function clampScale(value: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  /**
   * Handles drag end events to update position state.
   */
  function handleDragEnd(event: KonvaDragTransformEvent): void {
    captureStageRef(event);
    const target = event.target;
    // Only update if it's the stage that was dragged (not a child node)
    const stage = target.getStage();
    if (target === stage) {
      stageX = target.x();
      stageY = target.y();
    }
  }
</script>

<Stage
  width={width}
  height={height}
  scaleX={stageScale}
  scaleY={stageScale}
  x={stageX}
  y={stageY}
  {draggable}
  onwheel={handleWheel}
  ondragend={handleDragEnd}
>
  <!-- Background layer: floorplan image + grid (non-interactive) -->
  <Layer listening={false}>
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
