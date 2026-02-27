<!--
  ScaleIndicator.svelte - Scale bar and scale-setting tool.

  Displays a reference scale bar at the bottom of the canvas.
  When in scale-setting mode, allows clicking two points and
  entering the real-world distance to calculate px_per_meter.
-->
<script lang="ts">
  import { Line, Text, Rect, Group, Circle } from 'svelte-konva';

  interface ScalePoint {
    x: number;
    y: number;
  }

  interface ScaleIndicatorProps {
    /** Current scale in pixels per meter */
    scalePxPerMeter: number;
    /** Current stage zoom scale */
    stageScale?: number;
    /** Whether scale-setting mode is active */
    settingScale?: boolean;
    /** Points clicked during scale setting */
    scalePoints?: ScalePoint[];
    /** Callback when scale is determined */
    onScaleSet?: (pxPerMeter: number) => void;
  }

  let {
    scalePxPerMeter = 50,
    stageScale = 1,
    settingScale = false,
    scalePoints = [],
    onScaleSet,
  }: ScaleIndicatorProps = $props();

  // Scale bar: always show a round number of meters
  let scaleBarMeters = $derived(computeScaleBarLength());
  let scaleBarPx = $derived(scaleBarMeters * scalePxPerMeter);

  function computeScaleBarLength(): number {
    // Target ~100-200 pixels on screen for the scale bar
    const targetScreenPx = 150;
    const targetMeters = targetScreenPx / (scalePxPerMeter * stageScale);

    // Round to a nice number
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
    let best = 1;
    let bestDiff = Math.abs(1 - targetMeters);

    for (const c of candidates) {
      const diff = Math.abs(c - targetMeters);
      if (diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    return best;
  }

  // Scale-setting line between two clicked points
  let hasLinePoints = $derived(scalePoints.length === 2);

  let linePoints = $derived<number[]>(
    hasLinePoints
      ? [scalePoints[0]!.x, scalePoints[0]!.y, scalePoints[1]!.x, scalePoints[1]!.y]
      : []
  );

  let pixelDistance = $derived(
    hasLinePoints
      ? Math.sqrt(
          (scalePoints[1]!.x - scalePoints[0]!.x) ** 2 +
          (scalePoints[1]!.y - scalePoints[0]!.y) ** 2
        )
      : 0
  );
</script>

<!-- Scale bar indicator (always visible) -->
<Group x={20} y={20} listening={false}>
  <!-- Background -->
  <Rect
    x={-4}
    y={-4}
    width={scaleBarPx + 8}
    height={28}
    fill="rgba(255, 255, 255, 0.85)"
    cornerRadius={4}
    listening={false}
  />

  <!-- Scale bar line -->
  <Line
    points={[0, 10, scaleBarPx, 10]}
    stroke="#1a1a2e"
    strokeWidth={2}
    listening={false}
  />

  <!-- Left tick -->
  <Line
    points={[0, 4, 0, 16]}
    stroke="#1a1a2e"
    strokeWidth={2}
    listening={false}
  />

  <!-- Right tick -->
  <Line
    points={[scaleBarPx, 4, scaleBarPx, 16]}
    stroke="#1a1a2e"
    strokeWidth={2}
    listening={false}
  />

  <!-- Label -->
  <Text
    x={0}
    y={-2}
    width={scaleBarPx}
    text={`${scaleBarMeters}m`}
    fontSize={11}
    fontFamily="-apple-system, sans-serif"
    fill="#1a1a2e"
    align="center"
    listening={false}
  />
</Group>

<!-- Scale-setting reference line (when active) -->
{#if settingScale && scalePoints.length > 0}
  {#each scalePoints as point, i (i)}
    <Circle
      x={point.x}
      y={point.y}
      radius={6}
      fill="#4a6cf7"
      stroke="#ffffff"
      strokeWidth={2}
      listening={false}
    />
  {/each}

  {#if hasLinePoints}
    <Line
      points={linePoints}
      stroke="#4a6cf7"
      strokeWidth={2}
      dash={[8, 4]}
      listening={false}
    />
  {/if}
{/if}
