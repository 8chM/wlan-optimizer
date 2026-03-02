<!--
  AccessPointMarker.svelte - Access point visual representation on the canvas.

  Renders as a Konva.Group with:
  - WiFi icon (concentric arcs)
  - Label text
  - Draggable behavior
  - Selection highlight ring
  - Position saved in meters after drag end
-->
<script lang="ts">
  import { Group, Circle, Line, Text, Rect } from 'svelte-konva';
  import type { AccessPointResponse } from '$lib/api/invoke';
  import type { KonvaMouseEvent, KonvaDragTransformEvent, KonvaPointerEvent } from 'svelte-konva';

  interface AccessPointMarkerProps {
    /** Access point data */
    accessPoint: AccessPointResponse;
    /** Whether this AP is selected */
    selected?: boolean;
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Whether the AP is draggable */
    draggable?: boolean;
    /** Callback when AP is clicked/selected */
    onSelect?: (apId: string) => void;
    /** Callback when AP position changes (after drag) */
    onPositionChange?: (apId: string, x: number, y: number) => void;
    /** Callback for delete */
    onDelete?: (apId: string) => void;
  }

  let {
    accessPoint,
    selected = false,
    scalePxPerMeter = 50,
    draggable = true,
    onSelect,
    onPositionChange,
    onDelete,
  }: AccessPointMarkerProps = $props();

  // Position in canvas pixels
  let posX = $derived(accessPoint.x * scalePxPerMeter);
  let posY = $derived(accessPoint.y * scalePxPerMeter);

  let label = $derived(accessPoint.label ?? 'AP');
  let enabled = $derived(accessPoint.enabled);

  // WiFi icon arcs configuration
  const ICON_SIZE = 18;
  const arcs = [
    { radius: 5, opacity: 0.9 },
    { radius: 10, opacity: 0.65 },
    { radius: 15, opacity: 0.4 },
  ];

  function handleClick(event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onSelect?.(accessPoint.id);
  }

  function handleDragEnd(event: KonvaDragTransformEvent): void {
    const node = event.target;
    const newX = node.x() / scalePxPerMeter;
    const newY = node.y() / scalePxPerMeter;
    onPositionChange?.(accessPoint.id, newX, newY);
  }

  function handleContextMenu(event: KonvaPointerEvent): void {
    event.evt.preventDefault();
    event.cancelBubble = true;
    onSelect?.(accessPoint.id);
  }

  /**
   * Creates points for a WiFi wave arc.
   * Uses a semicircle approximation with line segments.
   */
  function createArcPoints(radius: number): number[] {
    const points: number[] = [];
    const segments = 12;
    const startAngle = -Math.PI * 0.75;
    const endAngle = -Math.PI * 0.25;

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments);
      points.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    }
    return points;
  }
</script>

<Group
  x={posX}
  y={posY}
  rotation={accessPoint.orientation_deg ?? 0}
  draggable={draggable && enabled}
  dragDistance={3}
  opacity={enabled ? 1 : 0.4}
  onclick={handleClick}
  ondragend={handleDragEnd}
  oncontextmenu={handleContextMenu}
>
  <!-- Invisible hit area so the Group is clickable (children have listening={false}) -->
  <Circle
    x={0}
    y={0}
    radius={ICON_SIZE + 8}
    fill="transparent"
  />

  <!-- Selection highlight ring -->
  {#if selected}
    <Circle
      x={0}
      y={0}
      radius={ICON_SIZE + 6}
      stroke="#4a6cf7"
      strokeWidth={2}
      dash={[4, 2]}
      fill="rgba(74, 108, 247, 0.08)"
      listening={false}
    />
  {/if}

  <!-- AP center dot -->
  <Circle
    x={0}
    y={0}
    radius={4}
    fill={enabled ? '#4a6cf7' : '#9a9ab0'}
    listening={false}
  />

  <!-- WiFi wave arcs -->
  {#each arcs as arc, i (i)}
    <Line
      points={createArcPoints(arc.radius)}
      stroke={enabled ? '#4a6cf7' : '#9a9ab0'}
      strokeWidth={2}
      opacity={arc.opacity}
      lineCap="round"
      listening={false}
    />
  {/each}

  <!-- Label background -->
  <Rect
    x={-24}
    y={ICON_SIZE + 2}
    width={48}
    height={16}
    fill="rgba(255, 255, 255, 0.85)"
    cornerRadius={3}
    listening={false}
  />

  <!-- Label text -->
  <Text
    x={-24}
    y={ICON_SIZE + 3}
    width={48}
    text={label}
    fontSize={10}
    fontFamily="-apple-system, sans-serif"
    fill="#1a1a2e"
    align="center"
    listening={false}
  />
</Group>
