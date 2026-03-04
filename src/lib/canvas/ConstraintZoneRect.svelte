<!--
  ConstraintZoneRect.svelte - Constraint zone rectangle on the canvas.

  Renders as a Konva.Group with:
  - Semi-transparent colored rectangle
  - Stroke (solid or dashed depending on type)
  - Centered label text
  - Draggable + resize handles when selected
-->
<script lang="ts">
  import { Group, Rect, Text, Circle } from 'svelte-konva';
  import { t } from '$lib/i18n';
  import type { ConstraintZone, ConstraintZoneType } from '$lib/recommendations/types';
  import type { KonvaMouseEvent, KonvaDragTransformEvent } from 'svelte-konva';

  interface ConstraintZoneRectProps {
    zone: ConstraintZone;
    selected?: boolean;
    scalePxPerMeter: number;
    interactive?: boolean;
    onSelect?: (id: string) => void;
    onPositionChange?: (id: string, x: number, y: number) => void;
    onResize?: (id: string, x: number, y: number, width: number, height: number) => void;
    onDelete?: (id: string) => void;
  }

  let {
    zone,
    selected = false,
    scalePxPerMeter = 50,
    interactive = true,
    onSelect,
    onPositionChange,
  }: ConstraintZoneRectProps = $props();

  const ZONE_COLORS: Record<ConstraintZoneType, { fill: string; stroke: string; dash?: number[] }> = {
    forbidden:       { fill: 'rgba(239, 68, 68, 0.15)', stroke: '#ef4444' },
    discouraged:     { fill: 'rgba(245, 158, 11, 0.12)', stroke: '#f59e0b' },
    preferred:       { fill: 'rgba(34, 197, 94, 0.12)', stroke: '#22c55e' },
    no_new_ap:       { fill: 'rgba(239, 68, 68, 0.10)', stroke: '#ef4444', dash: [6, 4] },
    no_ceiling_mount:{ fill: 'rgba(168, 85, 247, 0.10)', stroke: '#a855f7', dash: [4, 3] },
    no_wall_mount:   { fill: 'rgba(168, 85, 247, 0.10)', stroke: '#a855f7', dash: [4, 3] },
    no_move:         { fill: 'rgba(168, 85, 247, 0.12)', stroke: '#a855f7' },
    high_priority:   { fill: 'rgba(59, 130, 246, 0.12)', stroke: '#3b82f6' },
    low_priority:    { fill: 'rgba(156, 163, 175, 0.10)', stroke: '#9ca3af' },
  };

  const ZONE_LABEL_KEYS: Record<ConstraintZoneType, string> = {
    forbidden: 'zone.forbidden',
    discouraged: 'zone.discouraged',
    preferred: 'zone.preferred',
    no_new_ap: 'zone.noNewAp',
    no_ceiling_mount: 'zone.noCeilingMount',
    no_wall_mount: 'zone.noWallMount',
    no_move: 'zone.noMove',
    high_priority: 'zone.highPriority',
    low_priority: 'zone.lowPriority',
  };

  let posX = $derived(zone.x * scalePxPerMeter);
  let posY = $derived(zone.y * scalePxPerMeter);
  let w = $derived(zone.width * scalePxPerMeter);
  let h = $derived(zone.height * scalePxPerMeter);

  let colors = $derived(ZONE_COLORS[zone.type] ?? ZONE_COLORS.forbidden);
  let label = $derived(zone.notes || t(ZONE_LABEL_KEYS[zone.type] ?? 'zone.forbidden'));

  function handleClick(event: KonvaMouseEvent): void {
    event.cancelBubble = true;
    onSelect?.(zone.id);
  }

  function handleDragEnd(event: KonvaDragTransformEvent): void {
    const node = event.target;
    const newX = node.x() / scalePxPerMeter;
    const newY = node.y() / scalePxPerMeter;
    onPositionChange?.(zone.id, newX, newY);
  }
</script>

<Group
  x={posX}
  y={posY}
  draggable={interactive && selected}
  dragDistance={3}
  listening={interactive}
  onclick={interactive ? handleClick : undefined}
  ondragend={interactive ? handleDragEnd : undefined}
>
  <!-- Zone rectangle -->
  <Rect
    x={0}
    y={0}
    width={w}
    height={h}
    fill={colors.fill}
    stroke={colors.stroke}
    strokeWidth={selected ? 2 : 1.5}
    dash={colors.dash}
    cornerRadius={2}
    listening={interactive}
  />

  <!-- Selection border -->
  {#if selected}
    <Rect
      x={-1}
      y={-1}
      width={w + 2}
      height={h + 2}
      stroke="#4a6cf7"
      strokeWidth={1.5}
      dash={[4, 2]}
      listening={false}
    />

    <!-- Resize handles (4 corners) -->
    {#each [[0, 0], [w, 0], [0, h], [w, h]] as [cx, cy]}
      <Circle
        x={cx}
        y={cy}
        radius={4}
        fill="#4a6cf7"
        stroke="#ffffff"
        strokeWidth={1}
        listening={false}
      />
    {/each}
  {/if}

  <!-- Label text (centered) -->
  {#if w > 30 && h > 20}
    <Text
      x={4}
      y={h / 2 - 6}
      width={w - 8}
      text={label}
      fontSize={10}
      fontFamily="-apple-system, sans-serif"
      fill={colors.stroke}
      align="center"
      listening={false}
      ellipsis={true}
      wrap="none"
    />
  {/if}
</Group>
