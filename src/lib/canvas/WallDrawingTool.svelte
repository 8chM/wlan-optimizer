<!--
  WallDrawingTool.svelte - Wall rendering component for existing walls.

  Renders an existing wall as Konva.Line with material-based styling.
  Features:
  - Material-based color coding (green=light, orange=medium, red=heavy, black=blocking)
  - Hit detection with hitStrokeWidth: 20
  - Selection highlight on click
-->
<script lang="ts">
  import { Line, Circle, Group } from 'svelte-konva';
  import type { WallResponse, SegmentInput } from '$lib/api/invoke';
  import type { KonvaMouseEvent, KonvaDragTransformEvent } from 'svelte-konva';

  type MaterialCategory = 'light' | 'medium' | 'heavy' | 'blocking';

  interface WallDrawingToolProps {
    /** Existing wall data to render */
    wall: WallResponse;
    /** Material category for color coding */
    materialCategory?: MaterialCategory;
    /** Whether this wall is selected */
    selected?: boolean;
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Whether endpoints can be dragged to edit wall geometry */
    editMode?: boolean;
    /** Whether this wall is interactive (clickable/selectable) */
    interactive?: boolean;
    /** Callback when wall is clicked/selected */
    onSelect?: (wallId: string) => void;
    /** Callback when wall should be deleted */
    onDelete?: (wallId: string) => void;
    /** Callback when wall segments are updated via drag */
    onSegmentsUpdate?: (wallId: string, segments: SegmentInput[]) => void;
  }

  let {
    wall,
    materialCategory = 'medium',
    selected = false,
    scalePxPerMeter = 50,
    editMode = false,
    interactive = true,
    onSelect,
    onDelete,
    onSegmentsUpdate,
  }: WallDrawingToolProps = $props();

  // Detect door/window material for special rendering
  let isDoor = $derived(wall.material_id === 'mat-wood-door' || wall.material_id === 'mat-metal-door' || wall.material_id === 'mat-glass-door');
  let isWindow = $derived(wall.material_id === 'mat-window');

  // Material-based styling using category (with door/window overrides)
  let strokeColor = $derived(
    isDoor ? (wall.material_id === 'mat-metal-door' ? '#5a5a6a' : '#8B6914')
    : isWindow ? '#64B5F6'
    : getStrokeColor(materialCategory)
  );
  // Wall thickness in pixels based on material category (realistic rendering)
  let wallThicknessPx = $derived(
    isDoor ? 0.1 * scalePxPerMeter     // ~10cm
    : isWindow ? 0.08 * scalePxPerMeter // ~8cm
    : materialCategory === 'light' ? 0.1 * scalePxPerMeter   // ~10cm (drywall)
    : materialCategory === 'medium' ? 0.15 * scalePxPerMeter  // ~15cm (brick)
    : materialCategory === 'heavy' ? 0.2 * scalePxPerMeter    // ~20cm (concrete)
    : materialCategory === 'blocking' ? 0.25 * scalePxPerMeter // ~25cm (reinforced concrete)
    : 0.12 * scalePxPerMeter
  );
  // Minimum visible thickness: 3px, capped at reasonable max
  let strokeWidth = $derived(selected ? Math.max(wallThicknessPx, 4) + 2 : Math.max(wallThicknessPx, 3));
  let strokeDash = $derived(isDoor ? [6, 4] : isWindow ? [2, 3] : []);

  // Convert wall segments to a flat array of points in pixels
  // Use .slice() to avoid mutating the original array with .sort()
  let rawPoints = $derived(
    wall.segments
      .slice()
      .sort((a, b) => a.segment_order - b.segment_order)
      .flatMap((seg): number[] => [
        seg.x1 * scalePxPerMeter,
        seg.y1 * scalePxPerMeter,
        seg.x2 * scalePxPerMeter,
        seg.y2 * scalePxPerMeter,
      ])
  );

  // Deduplicate consecutive identical points (shared endpoints)
  let deduplicatedPoints = $derived(deduplicatePoints(rawPoints));

  function deduplicatePoints(pts: number[]): number[] {
    if (pts.length < 4) return pts;

    const result = [pts[0]!, pts[1]!];
    for (let i = 2; i < pts.length; i += 2) {
      const prevX = result[result.length - 2];
      const prevY = result[result.length - 1];
      if (pts[i] !== prevX || pts[i + 1] !== prevY) {
        result.push(pts[i]!, pts[i + 1]!);
      }
    }
    return result;
  }

  function getStrokeColor(category: MaterialCategory): string {
    switch (category) {
      case 'light':
        return '#4caf50'; // green
      case 'medium':
        return '#ff9800'; // orange
      case 'heavy':
        return '#f44336'; // red
      case 'blocking':
        return '#1a1a2e'; // dark
      default:
        return '#ff9800'; // default: medium
    }
  }

  /** Whether the endpoint circles should be draggable */
  let endpointsDraggable = $derived(selected && editMode);

  /** Unique endpoint positions from deduplicated points (as [x,y] pairs) */
  let endpoints = $derived.by((): Array<{ x: number; y: number; index: number }> => {
    const result: Array<{ x: number; y: number; index: number }> = [];
    for (let i = 0; i < deduplicatedPoints.length; i += 2) {
      result.push({ x: deduplicatedPoints[i]!, y: deduplicatedPoints[i + 1]!, index: i });
    }
    return result;
  });

  function handleClick(event: KonvaMouseEvent): void {
    if (!interactive) return;
    event.cancelBubble = true;
    onSelect?.(wall.id);
  }

  function handleEndpointDragEnd(pointIndex: number, event: KonvaDragTransformEvent): void {
    event.cancelBubble = true;
    const target = event.target;
    const newX = target.x();
    const newY = target.y();

    // Convert pixel position back to meters
    const newXMeters = newX / scalePxPerMeter;
    const newYMeters = newY / scalePxPerMeter;

    // Find the original point position in meters
    const origXPx = deduplicatedPoints[pointIndex]!;
    const origYPx = deduplicatedPoints[pointIndex + 1]!;
    const origXMeters = origXPx / scalePxPerMeter;
    const origYMeters = origYPx / scalePxPerMeter;

    // Update segments that reference this original point
    const sortedSegments = wall.segments.slice().sort((a, b) => a.segment_order - b.segment_order);
    const newSegments: SegmentInput[] = sortedSegments.map((seg) => {
      let { x1, y1, x2, y2 } = seg;
      const eps = 0.001;

      if (Math.abs(x1 - origXMeters) < eps && Math.abs(y1 - origYMeters) < eps) {
        x1 = newXMeters;
        y1 = newYMeters;
      }
      if (Math.abs(x2 - origXMeters) < eps && Math.abs(y2 - origYMeters) < eps) {
        x2 = newXMeters;
        y2 = newYMeters;
      }

      return { segment_order: seg.segment_order, x1, y1, x2, y2 };
    });

    onSegmentsUpdate?.(wall.id, newSegments);
  }
</script>

<Group>
  {#if deduplicatedPoints.length >= 4}
    <!-- Wall line (rendered with realistic thickness) -->
    <Line
      points={deduplicatedPoints}
      stroke={selected ? '#4a6cf7' : strokeColor}
      {strokeWidth}
      dash={strokeDash}
      lineCap="butt"
      lineJoin="miter"
      hitStrokeWidth={interactive ? 20 : 0}
      listening={interactive}
      onclick={handleClick}
    />

    <!-- Endpoint circles (draggable when in edit mode) -->
    {#if selected}
      {#each endpoints as ep (ep.index)}
        <Circle
          x={ep.x}
          y={ep.y}
          radius={endpointsDraggable ? 7 : 5}
          fill="#4a6cf7"
          stroke="#ffffff"
          strokeWidth={2}
          draggable={endpointsDraggable}
          listening={endpointsDraggable}
          ondragend={(e) => handleEndpointDragEnd(ep.index, e)}
        />
      {/each}
    {/if}
  {/if}
</Group>
