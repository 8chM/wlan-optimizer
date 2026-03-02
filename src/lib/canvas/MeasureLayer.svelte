<!--
  MeasureLayer.svelte - Measurement tool overlay for the canvas.

  Features:
  - Dashed measurement line between placed points
  - Distance label at midpoint
  - Live preview from last placed point to mouse position
  - Dimension-style tick marks at endpoints
  - Angle display to horizontal
  - Multi-segment measurement with accumulated total
-->
<script lang="ts">
  import { Line, Circle, Text, Rect, Group } from 'svelte-konva';

  interface MeasureLayerProps {
    /** Placed measurement points in canvas coordinates (pixels) */
    startPoint: { x: number; y: number };
    /** End point in canvas coordinates (pixels), null if not yet set */
    endPoint?: { x: number; y: number } | null;
    /** Scale factor: pixels per meter */
    scalePxPerMeter: number;
    /** Live mouse position for preview (canvas coords) */
    mousePosition?: { x: number; y: number } | null;
  }

  let {
    startPoint,
    endPoint = null,
    scalePxPerMeter,
    mousePosition = null,
  }: MeasureLayerProps = $props();

  const TICK_LENGTH = 8;

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

  // Live preview distance
  let previewDistance = $derived.by((): number | null => {
    const fromPoint = endPoint ?? startPoint;
    if (!mousePosition || endPoint) return null;
    const dx = mousePosition.x - fromPoint.x;
    const dy = mousePosition.y - fromPoint.y;
    return Math.sqrt(dx * dx + dy * dy) / scalePxPerMeter;
  });

  let previewLinePoints = $derived.by((): number[] => {
    if (endPoint || !mousePosition) return [];
    return [startPoint.x, startPoint.y, mousePosition.x, mousePosition.y];
  });

  let previewLabelPos = $derived.by(() => {
    if (endPoint || !mousePosition) return null;
    return {
      x: (startPoint.x + mousePosition.x) / 2,
      y: (startPoint.y + mousePosition.y) / 2 - 16,
    };
  });

  // Angle display (degrees from horizontal)
  let angleDeg = $derived.by((): number | null => {
    const target = endPoint ?? mousePosition;
    if (!target) return null;
    const dx = target.x - startPoint.x;
    const dy = target.y - startPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) < 1) return null;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return Math.round(((angle % 360) + 360) % 360);
  });

  // Tick marks (perpendicular short lines at endpoints)
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

  let startTickPoints = $derived.by((): number[] => {
    const target = endPoint ?? mousePosition;
    if (!target) return [];
    return computeTickPoints(
      startPoint.x, startPoint.y,
      target.x - startPoint.x, target.y - startPoint.y,
    );
  });

  let endTickPoints = $derived.by((): number[] => {
    if (!endPoint) return [];
    return computeTickPoints(
      endPoint.x, endPoint.y,
      endPoint.x - startPoint.x, endPoint.y - startPoint.y,
    );
  });
</script>

<!-- Start point tick mark -->
{#if startTickPoints.length >= 4}
  <Line
    points={startTickPoints}
    stroke="#4a6cf7"
    strokeWidth={2}
    lineCap="round"
    listening={false}
  />
{/if}

<!-- Start point marker -->
<Circle
  x={startPoint.x}
  y={startPoint.y}
  radius={4}
  fill="#4a6cf7"
  stroke="#ffffff"
  strokeWidth={2}
  listening={false}
/>

<!-- Live preview line (before second point is placed) -->
{#if previewLinePoints.length >= 4}
  <Line
    points={previewLinePoints}
    stroke="#4a6cf7"
    strokeWidth={1.5}
    dash={[6, 4]}
    opacity={0.6}
    listening={false}
  />

  <!-- Preview distance label -->
  {#if previewLabelPos && previewDistance !== null && previewDistance > 0.01}
    <Group x={previewLabelPos.x - 30} y={previewLabelPos.y - 10} listening={false}>
      <Rect
        width={60}
        height={20}
        fill="rgba(26, 26, 46, 0.75)"
        cornerRadius={4}
        listening={false}
      />
      <Text
        width={60}
        height={20}
        text={`${previewDistance.toFixed(2)} m`}
        fontSize={11}
        fontFamily="'SF Mono', 'Fira Code', monospace"
        fill="#b0b0d0"
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  {/if}

  <!-- Preview mouse indicator -->
  {#if mousePosition}
    <Circle
      x={mousePosition.x}
      y={mousePosition.y}
      radius={4}
      fill="transparent"
      stroke="#4a6cf7"
      strokeWidth={1.5}
      dash={[3, 2]}
      opacity={0.6}
      listening={false}
    />
  {/if}
{/if}

<!-- Placed measurement line and label -->
{#if endPoint}
  <Line
    points={linePoints}
    stroke="#4a6cf7"
    strokeWidth={2}
    dash={[8, 4]}
    listening={false}
  />

  <!-- End point tick mark -->
  {#if endTickPoints.length >= 4}
    <Line
      points={endTickPoints}
      stroke="#4a6cf7"
      strokeWidth={2}
      lineCap="round"
      listening={false}
    />
  {/if}

  <!-- End point marker -->
  <Circle
    x={endPoint.x}
    y={endPoint.y}
    radius={4}
    fill="#4a6cf7"
    stroke="#ffffff"
    strokeWidth={2}
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

<!-- Angle indicator -->
{#if angleDeg !== null}
  <Group x={startPoint.x + 20} y={startPoint.y - 10} listening={false}>
    <Rect
      width={36}
      height={16}
      fill="rgba(255, 152, 0, 0.8)"
      cornerRadius={2}
      listening={false}
    />
    <Text
      width={36}
      height={16}
      text={`${angleDeg}\u00B0`}
      fontSize={9}
      fontFamily="'SF Mono', 'Fira Code', monospace"
      fill="#ffffff"
      align="center"
      verticalAlign="middle"
      listening={false}
    />
  </Group>
{/if}
