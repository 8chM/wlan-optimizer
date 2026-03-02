<!--
  ScaleReferenceLine.svelte - Persistent scale reference line that stays visible
  after calibration to show the user where and how the scale was set.
-->
<script lang="ts">
  import { Line, Circle, Group, Text, Rect } from 'svelte-konva';

  interface ScaleReferenceLineProps {
    /** Two calibration points in canvas coordinates (pixels) */
    points: Array<{ x: number; y: number }>;
    /** Real-world distance in meters */
    distanceM: number;
  }

  let {
    points,
    distanceM,
  }: ScaleReferenceLineProps = $props();

  let linePoints = $derived(
    points.length === 2
      ? [points[0]!.x, points[0]!.y, points[1]!.x, points[1]!.y]
      : [],
  );

  let midX = $derived(points.length === 2 ? (points[0]!.x + points[1]!.x) / 2 : 0);
  let midY = $derived(points.length === 2 ? (points[0]!.y + points[1]!.y) / 2 : 0);
  let labelText = $derived(`${distanceM.toFixed(2)} m`);
</script>

{#if points.length === 2}
  <Group listening={false}>
    <!-- Reference line -->
    <Line
      points={linePoints}
      stroke="#ff9800"
      strokeWidth={2}
      dash={[6, 4]}
      opacity={0.7}
      listening={false}
    />

    <!-- Endpoint markers -->
    {#each points as point, i (i)}
      <Circle
        x={point.x}
        y={point.y}
        radius={5}
        fill="#ff9800"
        stroke="#ffffff"
        strokeWidth={1.5}
        opacity={0.8}
        listening={false}
      />
    {/each}

    <!-- Distance label -->
    <Group x={midX - 32} y={midY - 22} listening={false}>
      <Rect
        width={64}
        height={18}
        fill="rgba(255, 152, 0, 0.85)"
        cornerRadius={3}
        listening={false}
      />
      <Text
        width={64}
        height={18}
        text={labelText}
        fontSize={10}
        fontFamily="'SF Mono', 'Fira Code', monospace"
        fill="#ffffff"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  </Group>
{/if}
