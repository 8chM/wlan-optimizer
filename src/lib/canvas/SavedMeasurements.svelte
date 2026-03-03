<!--
  SavedMeasurements.svelte - Renders persisted measurement lines on the canvas.

  Displays saved distance measurements as dashed lines with labels.
  Supports selection and deletion when interactive.
-->
<script lang="ts">
  import { Line, Circle, Text, Rect, Group } from 'svelte-konva';

  export interface SavedMeasurement {
    id: string;
    /** Start X in meters */
    x1: number;
    /** Start Y in meters */
    y1: number;
    /** End X in meters */
    x2: number;
    /** End Y in meters */
    y2: number;
    /** Pre-computed distance in meters */
    distanceM: number;
  }

  interface SavedMeasurementsProps {
    measurements: SavedMeasurement[];
    scalePxPerMeter: number;
    /** Whether measurements are interactive (selectable/deletable) */
    interactive?: boolean;
    /** Currently selected measurement ID */
    selectedId?: string | null;
    /** Callback when a measurement is clicked */
    onSelect?: (id: string) => void;
  }

  let {
    measurements,
    scalePxPerMeter,
    interactive = false,
    selectedId = null,
    onSelect,
  }: SavedMeasurementsProps = $props();

  const TICK_LENGTH = 6;

  function computeTickPoints(
    px: number, py: number, dx: number, dy: number
  ): number[] {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return [];
    const nx = -dy / len;
    const ny = dx / len;
    return [
      px + nx * TICK_LENGTH, py + ny * TICK_LENGTH,
      px - nx * TICK_LENGTH, py - ny * TICK_LENGTH,
    ];
  }
</script>

{#each measurements as m (m.id)}
  {@const x1px = m.x1 * scalePxPerMeter}
  {@const y1px = m.y1 * scalePxPerMeter}
  {@const x2px = m.x2 * scalePxPerMeter}
  {@const y2px = m.y2 * scalePxPerMeter}
  {@const midX = (x1px + x2px) / 2}
  {@const midY = (y1px + y2px) / 2}
  {@const isSelected = selectedId === m.id}
  {@const color = isSelected ? '#ff9800' : '#7a8cf7'}
  {@const dx = x2px - x1px}
  {@const dy = y2px - y1px}
  {@const tickStart = computeTickPoints(x1px, y1px, dx, dy)}
  {@const tickEnd = computeTickPoints(x2px, y2px, dx, dy)}

  <!-- Measurement line -->
  <Line
    points={[x1px, y1px, x2px, y2px]}
    stroke={color}
    strokeWidth={isSelected ? 2.5 : 1.5}
    dash={[6, 4]}
    listening={interactive}
    onclick={() => interactive && onSelect?.(m.id)}
    hitStrokeWidth={interactive ? 12 : 0}
  />

  <!-- Tick marks -->
  {#if tickStart.length >= 4}
    <Line
      points={tickStart}
      stroke={color}
      strokeWidth={1.5}
      lineCap="round"
      listening={false}
    />
  {/if}
  {#if tickEnd.length >= 4}
    <Line
      points={tickEnd}
      stroke={color}
      strokeWidth={1.5}
      lineCap="round"
      listening={false}
    />
  {/if}

  <!-- Endpoints -->
  <Circle
    x={x1px} y={y1px}
    radius={3}
    fill={color}
    stroke="#ffffff"
    strokeWidth={1}
    listening={false}
  />
  <Circle
    x={x2px} y={y2px}
    radius={3}
    fill={color}
    stroke="#ffffff"
    strokeWidth={1}
    listening={false}
  />

  <!-- Distance label -->
  <Group x={midX - 28} y={midY - 18} listening={false}>
    <Rect
      width={56}
      height={16}
      fill={isSelected ? 'rgba(255, 152, 0, 0.85)' : 'rgba(26, 26, 46, 0.75)'}
      cornerRadius={3}
      listening={false}
    />
    <Text
      width={56}
      height={16}
      text={`${m.distanceM.toFixed(2)} m`}
      fontSize={10}
      fontFamily="'SF Mono', 'Fira Code', monospace"
      fill="#ffffff"
      align="center"
      verticalAlign="middle"
      listening={false}
    />
  </Group>
{/each}
