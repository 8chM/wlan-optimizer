<!--
  MeasureLayer.svelte - Measurement tool overlay for the canvas.

  Draws a dashed line between two clicked points with a distance label.
  Distance is calculated from pixel coordinates using scalePxPerMeter.
-->
<script lang="ts">
  import { Line, Circle, Text, Rect, Group } from 'svelte-konva';

  interface MeasureLayerProps {
    /** Start point in canvas coordinates (pixels) */
    startPoint: { x: number; y: number };
    /** End point in canvas coordinates (pixels), null if not yet set */
    endPoint?: { x: number; y: number } | null;
    /** Scale factor: pixels per meter */
    scalePxPerMeter: number;
  }

  let {
    startPoint,
    endPoint = null,
    scalePxPerMeter,
  }: MeasureLayerProps = $props();

  let distance = $derived.by((): number | null => {
    if (!endPoint) return null;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    return Math.sqrt(dx * dx + dy * dy) / scalePxPerMeter;
  });

  let linePoints = $derived(
    endPoint
      ? [startPoint.x, startPoint.y, endPoint.x, endPoint.y]
      : [],
  );

  let labelPos = $derived.by(() => {
    if (!endPoint) return { x: startPoint.x, y: startPoint.y };
    return {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2 - 16,
    };
  });

  let labelText = $derived(
    distance !== null ? `${distance.toFixed(2)} m` : '',
  );
</script>

<!-- Start point marker -->
<Circle
  x={startPoint.x}
  y={startPoint.y}
  radius={5}
  fill="#4a6cf7"
  stroke="#ffffff"
  strokeWidth={2}
  listening={false}
/>

<!-- End point marker and line -->
{#if endPoint}
  <Circle
    x={endPoint.x}
    y={endPoint.y}
    radius={5}
    fill="#4a6cf7"
    stroke="#ffffff"
    strokeWidth={2}
    listening={false}
  />

  <Line
    points={linePoints}
    stroke="#4a6cf7"
    strokeWidth={2}
    dash={[8, 4]}
    listening={false}
  />

  <!-- Distance label -->
  <Group x={labelPos.x - 30} y={labelPos.y - 10} listening={false}>
    <Rect
      width={60}
      height={20}
      fill="rgba(26, 26, 46, 0.9)"
      cornerRadius={4}
      listening={false}
    />
    <Text
      width={60}
      height={20}
      text={labelText}
      fontSize={11}
      fontFamily="'SF Mono', 'Fira Code', monospace"
      fill="#e0e0f0"
      align="center"
      verticalAlign="middle"
      listening={false}
    />
  </Group>
{/if}
