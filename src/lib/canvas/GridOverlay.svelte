<!--
  GridOverlay.svelte - Optional grid overlay on the canvas.

  Renders an evenly-spaced grid using Konva.Line elements.
  Grid spacing is configurable (0.5m, 1m, 2m).
  Major grid lines are slightly darker every N lines.
-->
<script lang="ts">
  import { Line, Group } from 'svelte-konva';

  interface GridOverlayProps {
    /** Total canvas width in pixels */
    widthPx: number;
    /** Total canvas height in pixels */
    heightPx: number;
    /** Grid spacing in meters */
    gridSizeM: number;
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Whether the grid is visible */
    visible?: boolean;
    /** Grid line color */
    color?: string;
    /** Grid line opacity */
    opacity?: number;
    /** Major grid line interval (every N lines is darker) */
    majorInterval?: number;
  }

  let {
    widthPx = 500,
    heightPx = 500,
    gridSizeM = 1,
    scalePxPerMeter = 50,
    visible = true,
    color = '#b0b0c0',
    opacity = 0.25,
    majorInterval = 5,
  }: GridOverlayProps = $props();

  // Grid spacing in pixels
  let gridSizePx = $derived(gridSizeM * scalePxPerMeter);

  // Generate vertical lines
  let verticalLines = $derived(computeVerticalLines());
  let horizontalLines = $derived(computeHorizontalLines());

  interface GridLine {
    key: string;
    points: number[];
    isMajor: boolean;
  }

  function computeVerticalLines(): GridLine[] {
    if (!visible || gridSizePx < 2) return [];

    const lines: GridLine[] = [];
    const count = Math.ceil(widthPx / gridSizePx);

    for (let i = 0; i <= count; i++) {
      const x = i * gridSizePx;
      lines.push({
        key: `v-${i}`,
        points: [x, 0, x, heightPx],
        isMajor: i % majorInterval === 0,
      });
    }
    return lines;
  }

  function computeHorizontalLines(): GridLine[] {
    if (!visible || gridSizePx < 2) return [];

    const lines: GridLine[] = [];
    const count = Math.ceil(heightPx / gridSizePx);

    for (let i = 0; i <= count; i++) {
      const y = i * gridSizePx;
      lines.push({
        key: `h-${i}`,
        points: [0, y, widthPx, y],
        isMajor: i % majorInterval === 0,
      });
    }
    return lines;
  }
</script>

{#if visible}
  <Group listening={false}>
    {#each verticalLines as line (line.key)}
      <Line
        points={line.points}
        stroke={color}
        strokeWidth={line.isMajor ? 1 : 0.5}
        opacity={line.isMajor ? opacity * 1.5 : opacity}
        listening={false}
      />
    {/each}

    {#each horizontalLines as line (line.key)}
      <Line
        points={line.points}
        stroke={color}
        strokeWidth={line.isMajor ? 1 : 0.5}
        opacity={line.isMajor ? opacity * 1.5 : opacity}
        listening={false}
      />
    {/each}
  </Group>
{/if}
