<!--
  CandidateLocationMarker.svelte - Candidate AP location marker on the canvas.

  Renders as a Konva.Group with:
  - Circle marker with color-coding (green=preferred, red=forbidden, blue=normal)
  - Infrastructure dots (LAN, PoE, Power)
  - Label text
  - Selection highlight ring
  - Draggable in select mode
-->
<script lang="ts">
  import { Group, Circle, Text, Rect, Line } from 'svelte-konva';
  import type { CandidateLocation } from '$lib/recommendations/types';
  import type { KonvaMouseEvent, KonvaDragTransformEvent, KonvaPointerEvent } from 'svelte-konva';

  interface CandidateLocationMarkerProps {
    candidate: CandidateLocation;
    selected?: boolean;
    scalePxPerMeter: number;
    draggable?: boolean;
    interactive?: boolean;
    onSelect?: (id: string) => void;
    onPositionChange?: (id: string, x: number, y: number) => void;
    onDelete?: (id: string) => void;
  }

  let {
    candidate,
    selected = false,
    scalePxPerMeter = 50,
    draggable = true,
    interactive = true,
    onSelect,
    onPositionChange,
  }: CandidateLocationMarkerProps = $props();

  let posX = $derived(candidate.x * scalePxPerMeter);
  let posY = $derived(candidate.y * scalePxPerMeter);

  let fillColor = $derived(
    candidate.forbidden ? '#ef4444' :
    candidate.preferred ? '#22c55e' :
    '#3b82f6'
  );

  let label = $derived(candidate.label || 'C');
  let labelWidth = $derived(Math.max(40, label.length * 7 + 10));

  const ICON_SIZE = 14;

  function handleClick(event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onSelect?.(candidate.id);
  }

  function handleDragEnd(event: KonvaDragTransformEvent): void {
    const node = event.target;
    const newX = node.x() / scalePxPerMeter;
    const newY = node.y() / scalePxPerMeter;
    onPositionChange?.(candidate.id, newX, newY);
  }

  function handleContextMenu(event: KonvaPointerEvent): void {
    event.evt.preventDefault();
    event.cancelBubble = true;
    onSelect?.(candidate.id);
  }

  // Infrastructure indicator positions
  const infraDots = $derived.by(() => {
    const dots: Array<{ x: number; y: number; color: string; label: string }> = [];
    let idx = 0;
    if (candidate.hasLan) {
      dots.push({ x: -10 + idx * 10, y: -ICON_SIZE - 6, color: '#22c55e', label: 'LAN' });
      idx++;
    }
    if (candidate.hasPoe) {
      dots.push({ x: -10 + idx * 10, y: -ICON_SIZE - 6, color: '#f59e0b', label: 'PoE' });
      idx++;
    }
    if (candidate.hasPower) {
      dots.push({ x: -10 + idx * 10, y: -ICON_SIZE - 6, color: '#ef4444', label: 'PWR' });
    }
    return dots;
  });
</script>

<Group
  x={posX}
  y={posY}
  draggable={interactive && draggable}
  dragDistance={3}
  listening={interactive}
  onclick={interactive ? handleClick : undefined}
  ondragend={interactive ? handleDragEnd : undefined}
  oncontextmenu={interactive ? handleContextMenu : undefined}
>
  <!-- Invisible hit area -->
  {#if interactive}
    <Circle
      x={0}
      y={0}
      radius={ICON_SIZE + 8}
      fill="transparent"
    />
  {/if}

  <!-- Selection highlight ring -->
  {#if selected}
    <Circle
      x={0}
      y={0}
      radius={ICON_SIZE + 4}
      stroke="#4a6cf7"
      strokeWidth={2}
      dash={[4, 2]}
      fill="rgba(74, 108, 247, 0.08)"
      listening={false}
    />
  {/if}

  <!-- Crosshair lines -->
  <Line
    points={[-ICON_SIZE, 0, ICON_SIZE, 0]}
    stroke={fillColor}
    strokeWidth={1.5}
    opacity={0.6}
    listening={false}
  />
  <Line
    points={[0, -ICON_SIZE, 0, ICON_SIZE]}
    stroke={fillColor}
    strokeWidth={1.5}
    opacity={0.6}
    listening={false}
  />

  <!-- Center circle -->
  <Circle
    x={0}
    y={0}
    radius={6}
    fill={fillColor}
    stroke="#ffffff"
    strokeWidth={1.5}
    opacity={0.9}
    listening={false}
  />

  <!-- Inner dot -->
  <Circle
    x={0}
    y={0}
    radius={2}
    fill="#ffffff"
    listening={false}
  />

  <!-- Infrastructure dots -->
  {#each infraDots as dot}
    <Circle
      x={dot.x}
      y={dot.y}
      radius={3}
      fill={dot.color}
      stroke="#ffffff"
      strokeWidth={1}
      listening={false}
    />
  {/each}

  <!-- Label background -->
  <Rect
    x={-labelWidth / 2}
    y={ICON_SIZE + 2}
    width={labelWidth}
    height={14}
    fill="rgba(255, 255, 255, 0.85)"
    cornerRadius={3}
    listening={false}
  />

  <!-- Label text -->
  <Text
    x={-labelWidth / 2}
    y={ICON_SIZE + 3}
    width={labelWidth}
    text={label}
    fontSize={9}
    fontFamily="-apple-system, sans-serif"
    fill="#1a1a2e"
    align="center"
    listening={false}
  />
</Group>
