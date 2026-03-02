<!--
  RoomDrawingLayer.svelte - Interactive room (closed polygon) drawing.

  Draws a closed polygon that automatically creates walls for each edge.
  - Click to place vertices
  - Double-click or click on start point to close the polygon
  - ESC to cancel
  - Shift for angle snapping
  - Live length display on current segment
  - Snap to existing wall endpoints
-->
<script lang="ts">
  import { Line, Circle, Group, Text, Rect } from 'svelte-konva';
  import type { Position } from '$lib/models/types';
  import { snapToPoint, snapToGrid, snapToAngle } from '$lib/utils/geometry';
  import { createWall, type WallSegmentInput } from '$lib/api/wall';
  import { canvasStore } from '$lib/stores/canvasStore.svelte';

  interface RoomDrawingLayerProps {
    active: boolean;
    scalePxPerMeter: number;
    stageScale?: number;
    snapTargets?: Position[];
    floorId: string;
    materialId: string;
    mousePosition?: Position | null;
    onRoomCreated?: (wallIds: string[], areaM2: number, centroid: Position) => void;
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
    onRoomCreated,
    onCancel,
  }: RoomDrawingLayerProps = $props();

  const SNAP_THRESHOLD_SCREEN_PX = 10;
  const CLOSE_THRESHOLD_SCREEN_PX = 15;

  let vertices = $state<Position[]>([]);
  let isDrawing = $state(false);

  $effect(() => {
    if (!active && isDrawing) {
      isDrawing = false;
      vertices = [];
    }
  });

  let snapThresholdCanvas = $derived(SNAP_THRESHOLD_SCREEN_PX / stageScale);
  let closeThresholdCanvas = $derived(CLOSE_THRESHOLD_SCREEN_PX / stageScale);
  let gridSizePx = $derived(canvasStore.gridSize * scalePxPerMeter);

  function applySnaps(rawPos: Position): { snapped: Position; didSnap: boolean } {
    let pos = { ...rawPos };

    if (canvasStore.shiftHeld && vertices.length > 0) {
      const origin = vertices[vertices.length - 1]!;
      pos = snapToAngle(origin, pos, 45);
    }

    if (canvasStore.snapToGridEnabled && gridSizePx > 0) {
      pos = snapToGrid(pos, gridSizePx);
    }

    const epSnap = snapToPoint(pos, snapTargets, snapThresholdCanvas);
    if (epSnap.didSnap) {
      return { snapped: epSnap.snapped, didSnap: true };
    }

    return { snapped: pos, didSnap: false };
  }

  let snappedMouse = $derived.by(() => {
    if (!isDrawing || !mousePosition) return null;
    return applySnaps(mousePosition);
  });

  // Check if mouse is close to start point (to close polygon)
  let isNearStart = $derived.by((): boolean => {
    if (!snappedMouse || vertices.length < 3) return false;
    const start = vertices[0]!;
    const dx = snappedMouse.snapped.x - start.x;
    const dy = snappedMouse.snapped.y - start.y;
    return Math.sqrt(dx * dx + dy * dy) < closeThresholdCanvas;
  });

  // Preview polygon points (vertices + current mouse)
  let previewPoints = $derived.by((): number[] => {
    if (!isDrawing || vertices.length === 0) return [];
    const pts: number[] = [];
    for (const v of vertices) {
      pts.push(v.x, v.y);
    }
    if (snappedMouse) {
      if (isNearStart && vertices.length >= 3) {
        pts.push(vertices[0]!.x, vertices[0]!.y);
      } else {
        pts.push(snappedMouse.snapped.x, snappedMouse.snapped.y);
      }
    }
    return pts;
  });

  // Current segment length
  let segmentLengthM = $derived.by((): number | null => {
    if (!isDrawing || vertices.length === 0 || !snappedMouse) return null;
    const last = vertices[vertices.length - 1]!;
    const target = isNearStart ? vertices[0]! : snappedMouse.snapped;
    const dx = target.x - last.x;
    const dy = target.y - last.y;
    return Math.sqrt(dx * dx + dy * dy) / scalePxPerMeter;
  });

  // Label position for segment length
  let segmentLabelPos = $derived.by(() => {
    if (!isDrawing || vertices.length === 0 || !snappedMouse) return null;
    const last = vertices[vertices.length - 1]!;
    const target = isNearStart ? vertices[0]! : snappedMouse.snapped;
    return {
      x: (last.x + target.x) / 2,
      y: (last.y + target.y) / 2 - 14,
    };
  });

  // Total perimeter
  let perimeterM = $derived.by((): number => {
    let total = 0;
    for (let i = 1; i < vertices.length; i++) {
      const prev = vertices[i - 1]!;
      const curr = vertices[i]!;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total / scalePxPerMeter;
  });

  export function handleClick(canvasPosition: Position): void {
    if (!active) return;
    const { snapped } = applySnaps(canvasPosition);

    if (!isDrawing) {
      isDrawing = true;
      vertices = [snapped];
      return;
    }

    // Close polygon if clicking near start point
    if (isNearStart && vertices.length >= 3) {
      closePolygon();
      return;
    }

    // Skip duplicate points
    const last = vertices[vertices.length - 1]!;
    if (last.x === snapped.x && last.y === snapped.y) return;

    vertices = [...vertices, snapped];
  }

  export function handleDoubleClick(_canvasPosition: Position): void {
    if (!active || !isDrawing || vertices.length < 3) return;
    closePolygon();
  }

  export function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isDrawing) {
      isDrawing = false;
      vertices = [];
      onCancel?.();
    }
  }

  /**
   * Calculate the area of a polygon using the Shoelace formula.
   * Returns area in square meters.
   */
  function calculateAreaM2(pts: Position[]): number {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      // Convert from canvas pixels to meters
      const xi = pts[i]!.x / scalePxPerMeter;
      const yi = pts[i]!.y / scalePxPerMeter;
      const xj = pts[j]!.x / scalePxPerMeter;
      const yj = pts[j]!.y / scalePxPerMeter;
      area += xi * yj;
      area -= xj * yi;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Calculate the centroid (center of mass) of a polygon.
   */
  function calculateCentroid(pts: Position[]): Position {
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    return { x: cx / pts.length, y: cy / pts.length };
  }

  // Live area preview while drawing
  let previewAreaM2 = $derived.by((): number | null => {
    if (!isDrawing || vertices.length < 3) return null;
    return calculateAreaM2(vertices);
  });

  async function closePolygon(): Promise<void> {
    const pts = [...vertices];
    isDrawing = false;
    vertices = [];

    if (pts.length < 3) return;

    // Calculate area and centroid before creating walls
    const areaM2 = calculateAreaM2(pts);
    const centroid = calculateCentroid(pts);

    // Create a wall for each edge of the polygon (including closing edge)
    const wallIds: string[] = [];
    for (let i = 0; i < pts.length; i++) {
      const start = pts[i]!;
      const end = pts[(i + 1) % pts.length]!;
      const segments: WallSegmentInput[] = [{
        segment_order: 0,
        x1: start.x / scalePxPerMeter,
        y1: start.y / scalePxPerMeter,
        x2: end.x / scalePxPerMeter,
        y2: end.y / scalePxPerMeter,
      }];

      try {
        const result = await createWall(floorId, materialId, segments);
        wallIds.push(result.id);
      } catch (err) {
        console.error('[RoomDrawingLayer] Failed to create wall edge:', err);
      }
    }

    if (wallIds.length > 0) {
      onRoomCreated?.(wallIds, areaM2, centroid);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if active && isDrawing}
  <Group>
    <!-- Preview polygon outline -->
    {#if previewPoints.length >= 4}
      <Line
        points={previewPoints}
        stroke="#10b981"
        strokeWidth={2}
        dash={[6, 3]}
        lineCap="round"
        lineJoin="round"
        closed={false}
        listening={false}
      />
    {/if}

    <!-- Filled polygon preview (semi-transparent) -->
    {#if vertices.length >= 3}
      {@const fillPts = vertices.flatMap(v => [v.x, v.y])}
      <Line
        points={fillPts}
        fill="rgba(16, 185, 129, 0.08)"
        stroke="transparent"
        closed={true}
        listening={false}
      />
    {/if}

    <!-- Placed vertices -->
    {#each vertices as vertex, i (i)}
      <Circle
        x={vertex.x}
        y={vertex.y}
        radius={i === 0 ? 6 : 4}
        fill={i === 0 ? '#10b981' : '#34d399'}
        stroke="#ffffff"
        strokeWidth={2}
        listening={false}
      />
    {/each}

    <!-- Close indicator (highlight start point when near) -->
    {#if isNearStart && vertices.length >= 3}
      <Circle
        x={vertices[0]!.x}
        y={vertices[0]!.y}
        radius={12}
        fill="rgba(16, 185, 129, 0.3)"
        stroke="#10b981"
        strokeWidth={2}
        listening={false}
      />
    {/if}

    <!-- Snap indicator -->
    {#if snappedMouse && !isNearStart}
      <Circle
        x={snappedMouse.snapped.x}
        y={snappedMouse.snapped.y}
        radius={snappedMouse.didSnap ? 8 : 4}
        fill={snappedMouse.didSnap ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}
        stroke={snappedMouse.didSnap ? '#10b981' : '#8a8aaa'}
        strokeWidth={2}
        dash={snappedMouse.didSnap ? [] : [4, 2]}
        listening={false}
      />
    {/if}

    <!-- Current segment length -->
    {#if segmentLabelPos && segmentLengthM !== null && segmentLengthM > 0.01}
      <Group x={segmentLabelPos.x - 30} y={segmentLabelPos.y} listening={false}>
        <Rect
          width={60}
          height={18}
          fill="rgba(16, 185, 129, 0.88)"
          cornerRadius={3}
          listening={false}
        />
        <Text
          width={60}
          height={18}
          text={`${segmentLengthM.toFixed(2)} m`}
          fontSize={10}
          fontFamily="'SF Mono', 'Fira Code', monospace"
          fill="#ffffff"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    {/if}

    <!-- Perimeter total and area (when 2+ edges placed) -->
    {#if vertices.length >= 2}
      <Group x={vertices[0]!.x - 60} y={vertices[0]!.y - 46} listening={false}>
        <Rect
          width={120}
          height={previewAreaM2 !== null ? 36 : 18}
          fill="rgba(16, 185, 129, 0.85)"
          cornerRadius={3}
          listening={false}
        />
        <Text
          width={120}
          height={18}
          text={`\u2211 ${(perimeterM + (segmentLengthM ?? 0)).toFixed(2)} m`}
          fontSize={10}
          fontFamily="'SF Mono', 'Fira Code', monospace"
          fill="#ffffff"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
        {#if previewAreaM2 !== null}
          <Text
            y={18}
            width={120}
            height={18}
            text={`\u25A1 ${previewAreaM2.toFixed(2)} m\u00B2`}
            fontSize={10}
            fontFamily="'SF Mono', 'Fira Code', monospace"
            fill="#ffffff"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        {/if}
      </Group>
    {/if}
  </Group>
{/if}
