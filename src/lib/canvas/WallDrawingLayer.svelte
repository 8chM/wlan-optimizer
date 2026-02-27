<!--
  WallDrawingLayer.svelte - Interactive wall drawing overlay.

  Handles click-by-click wall creation:
  - First click = start point
  - Subsequent clicks = intermediate points
  - Double-click = finish wall
  - ESC = cancel drawing
  - Snap to existing wall endpoints (10px threshold in screen coords)
  - Preview line from last point to current mouse position
-->
<script lang="ts">
  import { Line, Circle, Group } from 'svelte-konva';
  import type { Position } from '$lib/models/types';
  import { snapToPoint } from '$lib/utils/geometry';
  import { createWall, type WallSegmentInput } from '$lib/api/wall';

  interface WallDrawingLayerProps {
    /** Whether drawing mode is active */
    active: boolean;
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Stage scale (zoom level) for correct snap threshold */
    stageScale?: number;
    /** Existing wall endpoints for snapping (in canvas px) */
    snapTargets?: Position[];
    /** Floor ID for saving the wall */
    floorId: string;
    /** Material ID for the wall being drawn */
    materialId: string;
    /** Current mouse position (canvas coords, pixels) */
    mousePosition?: Position | null;
    /** Callback after wall creation */
    onWallCreated?: () => void;
    /** Callback on cancel */
    onCancel?: () => void;
  }

  let {
    active = false,
    scalePxPerMeter = 50,
    stageScale = 1,
    snapTargets = [],
    floorId,
    materialId,
    mousePosition = null,
    onWallCreated,
    onCancel,
  }: WallDrawingLayerProps = $props();

  const SNAP_THRESHOLD_SCREEN_PX = 10;

  let drawingPoints = $state<Position[]>([]);
  let isDrawing = $state(false);

  // Snap threshold adjusted for zoom level
  let snapThresholdCanvas = $derived(SNAP_THRESHOLD_SCREEN_PX / stageScale);

  // Flat array of points for the preview polyline
  let previewLinePoints = $derived(computePreviewPoints());

  // Preview point for snap indication
  let snappedMouse = $derived(computeSnappedMouse());

  function computePreviewPoints(): number[] {
    if (!isDrawing || drawingPoints.length === 0) return [];

    const pts: number[] = [];
    for (const p of drawingPoints) {
      pts.push(p.x, p.y);
    }

    // Add current mouse position for preview
    if (mousePosition) {
      const snap = snapToPoint(mousePosition, snapTargets, snapThresholdCanvas);
      pts.push(snap.snapped.x, snap.snapped.y);
    }

    return pts;
  }

  function computeSnappedMouse(): { position: Position; isSnapped: boolean } | null {
    if (!isDrawing || !mousePosition) return null;
    const result = snapToPoint(mousePosition, snapTargets, snapThresholdCanvas);
    return { position: result.snapped, isSnapped: result.didSnap };
  }

  export function handleClick(canvasPosition: Position): void {
    if (!active) return;

    const snap = snapToPoint(canvasPosition, snapTargets, snapThresholdCanvas);
    const point = snap.snapped;

    if (!isDrawing) {
      // Start new wall
      isDrawing = true;
      drawingPoints = [point];
    } else {
      // Add intermediate point
      drawingPoints = [...drawingPoints, point];
    }
  }

  export function handleDoubleClick(canvasPosition: Position): void {
    if (!active || !isDrawing || drawingPoints.length < 1) return;

    const snap = snapToPoint(canvasPosition, snapTargets, snapThresholdCanvas);
    const lastPoint = drawingPoints[drawingPoints.length - 1]!;

    // Avoid adding a duplicate point if the double-click position
    // matches the last point already added by the preceding click event
    let finalPoints: Position[];
    if (lastPoint.x === snap.snapped.x && lastPoint.y === snap.snapped.y) {
      finalPoints = [...drawingPoints];
    } else {
      finalPoints = [...drawingPoints, snap.snapped];
    }

    // Create wall from points
    finishWall(finalPoints);
  }

  export function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isDrawing) {
      cancelDrawing();
    }
  }

  function cancelDrawing(): void {
    isDrawing = false;
    drawingPoints = [];
    onCancel?.();
  }

  async function finishWall(points: Position[]): Promise<void> {
    if (points.length < 2) {
      cancelDrawing();
      return;
    }

    // Convert points to segments (in meters, snake_case keys for Rust serde)
    const segments: WallSegmentInput[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const startPoint = points[i]!;
      const endPoint = points[i + 1]!;
      segments.push({
        segment_order: i,
        x1: startPoint.x / scalePxPerMeter,
        y1: startPoint.y / scalePxPerMeter,
        x2: endPoint.x / scalePxPerMeter,
        y2: endPoint.y / scalePxPerMeter,
      });
    }

    try {
      await createWall(floorId, materialId, segments);
      onWallCreated?.();
    } catch (err) {
      console.error('[WallDrawingLayer] Failed to create wall:', err);
    }

    // Reset drawing state
    isDrawing = false;
    drawingPoints = [];
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if active && isDrawing}
  <Group>
    <!-- Preview polyline (dashed) -->
    {#if previewLinePoints.length >= 4}
      <Line
        points={previewLinePoints}
        stroke="#4a6cf7"
        strokeWidth={2}
        dash={[6, 3]}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    {/if}

    <!-- Placed points -->
    {#each drawingPoints as point, i (i)}
      <Circle
        x={point.x}
        y={point.y}
        radius={4}
        fill={i === 0 ? '#4a6cf7' : '#6a8cf7'}
        stroke="#ffffff"
        strokeWidth={2}
        listening={false}
      />
    {/each}

    <!-- Snap indicator on mouse -->
    {#if snappedMouse}
      <Circle
        x={snappedMouse.position.x}
        y={snappedMouse.position.y}
        radius={snappedMouse.isSnapped ? 8 : 4}
        fill={snappedMouse.isSnapped ? 'rgba(74, 108, 247, 0.3)' : 'transparent'}
        stroke={snappedMouse.isSnapped ? '#4a6cf7' : '#8a8aaa'}
        strokeWidth={2}
        dash={snappedMouse.isSnapped ? [] : [4, 2]}
        listening={false}
      />
    {/if}
  </Group>
{/if}
