<!--
  WallDrawingLayer.svelte - Interactive wall drawing overlay.

  Handles click-by-click wall creation:
  - First click = start point
  - Subsequent clicks = intermediate points
  - Double-click = finish wall
  - ESC = cancel drawing
  - Snap to existing wall endpoints (10px threshold in screen coords)
  - Grid snapping (when enabled)
  - Angle snapping to 45-degree increments (hold Shift)
  - Preview line from last point to current mouse position
  - Live length display on current segment
  - Total accumulated length display
-->
<script lang="ts">
  import { Line, Circle, Group, Text, Rect } from 'svelte-konva';
  import type { Position } from '$lib/models/types';
  import { snapToPoint, snapToGrid, snapToAngle } from '$lib/utils/geometry';
  import { createWall, type WallSegmentInput } from '$lib/api/wall';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';

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
    /** Callback after wall creation (receives created wall ID, floor, material, segments for undo) */
    onWallCreated?: (wallId: string, floorId: string, materialId: string, segments: WallSegmentInput[]) => void;
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

  // Grid size in canvas pixels
  let gridSizePx = $derived(canvasStore.gridSize * scalePxPerMeter);

  /**
   * Apply the full snap chain to a mouse position:
   * 1. Shift held → angle snap
   * 2. Grid snap enabled → grid snap
   * 3. Endpoint snap (highest priority if in range)
   */
  function applySnaps(rawPos: Position): { snapped: Position; didSnapEndpoint: boolean } {
    let pos = { ...rawPos };

    // Angle snap (Shift held + have an origin point)
    if (canvasStore.shiftHeld && drawingPoints.length > 0) {
      const origin = drawingPoints[drawingPoints.length - 1]!;
      pos = snapToAngle(origin, pos, 45);
    }

    // Grid snap
    if (canvasStore.snapToGridEnabled && gridSizePx > 0) {
      pos = snapToGrid(pos, gridSizePx);
    }

    // Endpoint snap (has highest priority)
    const epSnap = snapToPoint(pos, snapTargets, snapThresholdCanvas);
    if (epSnap.didSnap) {
      return { snapped: epSnap.snapped, didSnapEndpoint: true };
    }

    return { snapped: pos, didSnapEndpoint: false };
  }

  // Compute the snapped mouse position for preview
  let snappedMouseResult = $derived.by(() => {
    if (!isDrawing || !mousePosition) return null;
    return applySnaps(mousePosition);
  });

  // Flat array of points for the preview polyline
  let previewLinePoints = $derived.by((): number[] => {
    if (!isDrawing || drawingPoints.length === 0) return [];

    const pts: number[] = [];
    for (const p of drawingPoints) {
      pts.push(p.x, p.y);
    }

    if (snappedMouseResult) {
      pts.push(snappedMouseResult.snapped.x, snappedMouseResult.snapped.y);
    }

    return pts;
  });

  // Current segment length in meters
  let previewLengthM = $derived.by((): number | null => {
    if (!isDrawing || drawingPoints.length === 0 || !snappedMouseResult) return null;
    const last = drawingPoints[drawingPoints.length - 1]!;
    const target = snappedMouseResult.snapped;
    const dx = target.x - last.x;
    const dy = target.y - last.y;
    return Math.sqrt(dx * dx + dy * dy) / scalePxPerMeter;
  });

  // Label position and angle for the length display
  let previewLabelConfig = $derived.by(() => {
    if (!isDrawing || drawingPoints.length === 0 || !snappedMouseResult) return null;
    const last = drawingPoints[drawingPoints.length - 1]!;
    const target = snappedMouseResult.snapped;
    const mx = (last.x + target.x) / 2;
    const my = (last.y + target.y) / 2;
    // Offset perpendicular to the line
    const dx = target.x - last.x;
    const dy = target.y - last.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return null;
    const nx = -dy / len;
    const ny = dx / len;
    return { x: mx + nx * 14, y: my + ny * 14 - 10 };
  });

  // Total accumulated length of placed segments in meters
  let totalLengthM = $derived.by((): number => {
    let total = 0;
    for (let i = 1; i < drawingPoints.length; i++) {
      const prev = drawingPoints[i - 1]!;
      const curr = drawingPoints[i]!;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total / scalePxPerMeter;
  });

  // Angle display for the current segment
  let previewAngleDeg = $derived.by((): number | null => {
    if (!isDrawing || drawingPoints.length === 0 || !snappedMouseResult) return null;
    const last = drawingPoints[drawingPoints.length - 1]!;
    const target = snappedMouseResult.snapped;
    const dx = target.x - last.x;
    const dy = target.y - last.y;
    if (Math.sqrt(dx * dx + dy * dy) < 1) return null;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return ((angle % 360) + 360) % 360;
  });

  export function handleClick(canvasPosition: Position): void {
    if (!active) return;

    const { snapped } = applySnaps(canvasPosition);

    if (!isDrawing) {
      isDrawing = true;
      drawingPoints = [snapped];
    } else {
      drawingPoints = [...drawingPoints, snapped];
    }
  }

  export function handleDoubleClick(canvasPosition: Position): void {
    if (!active || !isDrawing || drawingPoints.length < 1) return;

    const { snapped } = applySnaps(canvasPosition);
    const lastPoint = drawingPoints[drawingPoints.length - 1]!;

    let finalPoints: Position[];
    if (lastPoint.x === snapped.x && lastPoint.y === snapped.y) {
      finalPoints = [...drawingPoints];
    } else {
      finalPoints = [...drawingPoints, snapped];
    }

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
      const result = await createWall(floorId, materialId, segments);
      onWallCreated?.(result.id, floorId, materialId, segments);
    } catch (err) {
      console.error('[WallDrawingLayer] Failed to create wall:', err);
    }

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

    <!-- Snap/cursor indicator -->
    {#if snappedMouseResult}
      <Circle
        x={snappedMouseResult.snapped.x}
        y={snappedMouseResult.snapped.y}
        radius={snappedMouseResult.didSnapEndpoint ? 8 : 4}
        fill={snappedMouseResult.didSnapEndpoint ? 'rgba(74, 108, 247, 0.3)' : 'transparent'}
        stroke={snappedMouseResult.didSnapEndpoint ? '#4a6cf7' : '#8a8aaa'}
        strokeWidth={2}
        dash={snappedMouseResult.didSnapEndpoint ? [] : [4, 2]}
        listening={false}
      />
    {/if}

    <!-- Current segment length label -->
    {#if previewLabelConfig && previewLengthM !== null && previewLengthM > 0.01}
      <Group x={previewLabelConfig.x - 30} y={previewLabelConfig.y} listening={false}>
        <Rect
          width={60}
          height={18}
          fill="rgba(26, 26, 46, 0.88)"
          cornerRadius={3}
          listening={false}
        />
        <Text
          width={60}
          height={18}
          text={`${previewLengthM.toFixed(2)} m`}
          fontSize={10}
          fontFamily="'SF Mono', 'Fira Code', monospace"
          fill="#e0e0f0"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    {/if}

    <!-- Total accumulated length (shown when multiple segments placed) -->
    {#if drawingPoints.length >= 2}
      <Group x={drawingPoints[0]!.x - 50} y={drawingPoints[0]!.y - 28} listening={false}>
        <Rect
          width={100}
          height={18}
          fill="rgba(74, 108, 247, 0.85)"
          cornerRadius={3}
          listening={false}
        />
        <Text
          width={100}
          height={18}
          text={`\u2211 ${(totalLengthM + (previewLengthM ?? 0)).toFixed(2)} m`}
          fontSize={10}
          fontFamily="'SF Mono', 'Fira Code', monospace"
          fill="#ffffff"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    {/if}

    <!-- Angle indicator when Shift is held -->
    {#if canvasStore.shiftHeld && previewAngleDeg !== null && drawingPoints.length > 0}
      {@const origin = drawingPoints[drawingPoints.length - 1]!}
      <Group x={origin.x + 18} y={origin.y - 8} listening={false}>
        <Rect
          width={36}
          height={16}
          fill="rgba(255, 152, 0, 0.85)"
          cornerRadius={2}
          listening={false}
        />
        <Text
          width={36}
          height={16}
          text={`${Math.round(previewAngleDeg)}\u00B0`}
          fontSize={9}
          fontFamily="'SF Mono', 'Fira Code', monospace"
          fill="#ffffff"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    {/if}
  </Group>
{/if}
