<!--
  GridOverlay.svelte - Viewport-filling grid overlay on the canvas.

  Renders grid lines that cover the ENTIRE visible area (not just floor bounds).
  Grid spacing is configurable (0.5m, 1m, 2m).
  Major grid lines are slightly darker every N lines.
  Origin is always at (0,0) to align with the coordinate system.
-->
<script lang="ts">
  import { Line, Group } from 'svelte-konva';

  interface GridOverlayProps {
    /** Grid spacing in meters */
    gridSizeM: number;
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Stage zoom level */
    stageScale: number;
    /** Stage offset X (screen pixels) */
    stageOffsetX: number;
    /** Stage offset Y (screen pixels) */
    stageOffsetY: number;
    /** Viewport width (screen pixels) */
    viewportWidth: number;
    /** Viewport height (screen pixels) */
    viewportHeight: number;
    /** Whether the grid is visible */
    visible?: boolean;
    /** Grid line color */
    color?: string;
    /** Grid line opacity */
    opacity?: number;
    /** Major grid line interval (every N lines is darker) */
    majorInterval?: number;
    /** Whether to use adaptive grid sizing (default: true). When false, gridSizeM is used directly. */
    adaptive?: boolean;
  }

  let {
    gridSizeM = 1,
    scalePxPerMeter = 50,
    stageScale = 1,
    stageOffsetX = 0,
    stageOffsetY = 0,
    viewportWidth = 800,
    viewportHeight = 600,
    visible = true,
    color = '#000000',
    opacity = 0.15,
    majorInterval = 5,
    adaptive = true,
  }: GridOverlayProps = $props();

  // Subdivision model: start with gridSizeM, subdivide by 2 while cells are >= 20px on screen
  let adaptiveConfig = $derived.by(() => {
    if (!adaptive) {
      const majorEvery = 5;
      return { spacingM: gridSizeM, spacingPx: gridSizeM * scalePxPerMeter, majorEvery };
    }
    const effectiveScale = scalePxPerMeter * stageScale;
    const minScreenPx = 12;
    let spacingM = gridSizeM;
    while ((spacingM / 2) * effectiveScale >= minScreenPx) {
      spacingM /= 2;
    }
    const majorEvery = Math.max(1, Math.round(gridSizeM / spacingM));
    return { spacingM, spacingPx: spacingM * scalePxPerMeter, majorEvery };
  });

  // Grid spacing in canvas pixels (adaptive or fixed)
  let gridSizePx = $derived(adaptive ? adaptiveConfig.spacingPx : gridSizeM * scalePxPerMeter);

  // Major line interval (adaptive or fixed)
  let majorEvery = $derived(adaptive ? adaptiveConfig.majorEvery : majorInterval);

  // Compute visible area in canvas coordinates (inverse stage transform)
  let viewBounds = $derived.by(() => {
    const left = -stageOffsetX / stageScale;
    const top = -stageOffsetY / stageScale;
    const right = left + viewportWidth / stageScale;
    const bottom = top + viewportHeight / stageScale;
    return { left, top, right, bottom };
  });

  interface GridLine {
    key: string;
    points: number[];
    isMajor: boolean;
  }

  // Generate vertical lines covering the visible area
  let verticalLines = $derived.by((): GridLine[] => {
    if (!visible || gridSizePx < 2) return [];

    const { left, top, right, bottom } = viewBounds;
    const startIdx = Math.floor(left / gridSizePx) - 1;
    const endIdx = Math.ceil(right / gridSizePx) + 1;

    const lines: GridLine[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const x = i * gridSizePx;
      lines.push({
        key: `v-${i}`,
        points: [x, top - gridSizePx, x, bottom + gridSizePx],
        isMajor: i % majorEvery === 0,
      });
    }
    return lines;
  });

  // Generate horizontal lines covering the visible area
  let horizontalLines = $derived.by((): GridLine[] => {
    if (!visible || gridSizePx < 2) return [];

    const { left, top, right, bottom } = viewBounds;
    const startIdx = Math.floor(top / gridSizePx) - 1;
    const endIdx = Math.ceil(bottom / gridSizePx) + 1;

    const lines: GridLine[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const y = i * gridSizePx;
      lines.push({
        key: `h-${i}`,
        points: [left - gridSizePx, y, right + gridSizePx, y],
        isMajor: i % majorEvery === 0,
      });
    }
    return lines;
  });
</script>

{#if visible}
  <Group listening={false}>
    {#each verticalLines as line (line.key)}
      <Line
        points={line.points}
        stroke={color}
        strokeWidth={(line.isMajor ? 1.5 : 0.5) / stageScale}
        opacity={line.isMajor ? opacity * 2.5 : opacity}
        listening={false}
      />
    {/each}

    {#each horizontalLines as line (line.key)}
      <Line
        points={line.points}
        stroke={color}
        strokeWidth={(line.isMajor ? 1.5 : 0.5) / stageScale}
        opacity={line.isMajor ? opacity * 2.5 : opacity}
        listening={false}
      />
    {/each}
  </Group>
{/if}
