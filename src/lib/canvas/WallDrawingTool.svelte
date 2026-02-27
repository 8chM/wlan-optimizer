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
  import type { WallResponse } from '$lib/api/invoke';
  import type { KonvaMouseEvent } from 'svelte-konva';

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
    /** Callback when wall is clicked/selected */
    onSelect?: (wallId: string) => void;
    /** Callback when wall should be deleted */
    onDelete?: (wallId: string) => void;
  }

  let {
    wall,
    materialCategory = 'medium',
    selected = false,
    scalePxPerMeter = 50,
    onSelect,
    onDelete,
  }: WallDrawingToolProps = $props();

  // Material-based styling using category
  let strokeColor = $derived(getStrokeColor(materialCategory));
  let strokeWidth = $derived(selected ? 5 : 3);

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

  function handleClick(event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onSelect?.(wall.id);
  }
</script>

<Group>
  {#if deduplicatedPoints.length >= 4}
    <!-- Wall line -->
    <Line
      points={deduplicatedPoints}
      stroke={selected ? '#4a6cf7' : strokeColor}
      {strokeWidth}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={20}
      onclick={handleClick}
    />

    <!-- Selection highlight endpoints -->
    {#if selected}
      <Circle
        x={deduplicatedPoints[0]!}
        y={deduplicatedPoints[1]!}
        radius={5}
        fill="#4a6cf7"
        stroke="#ffffff"
        strokeWidth={2}
        listening={false}
      />
      <Circle
        x={deduplicatedPoints[deduplicatedPoints.length - 2]!}
        y={deduplicatedPoints[deduplicatedPoints.length - 1]!}
        radius={5}
        fill="#4a6cf7"
        stroke="#ffffff"
        strokeWidth={2}
        listening={false}
      />
    {/if}
  {/if}
</Group>
