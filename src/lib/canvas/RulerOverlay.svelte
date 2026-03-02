<!--
  RulerOverlay.svelte - Ruler tick marks along the top and left edges of the canvas.

  Renders meter/sub-meter tick marks as Konva Lines in a non-interactive Group.
  Adjusts to the current scale and shows distance labels at major ticks.
-->
<script lang="ts">
  import { Line, Text, Rect, Group } from 'svelte-konva';

  interface RulerOverlayProps {
    /** Total canvas width in pixels */
    widthPx: number;
    /** Total canvas height in pixels */
    heightPx: number;
    /** Scale: pixels per meter */
    scalePxPerMeter: number;
    /** Stage scale (zoom level) for correct font sizing */
    stageScale?: number;
    /** Stage offset for positioning */
    stageOffsetX?: number;
    stageOffsetY?: number;
    /** Whether visible */
    visible?: boolean;
  }

  let {
    widthPx = 500,
    heightPx = 500,
    scalePxPerMeter = 50,
    stageScale = 1,
    stageOffsetX = 0,
    stageOffsetY = 0,
    visible = true,
  }: RulerOverlayProps = $props();

  const RULER_SIZE = 24;
  const TICK_COLOR = '#4a4a6a';
  const BG_COLOR = 'rgba(255, 255, 255, 0.92)';
  const LABEL_COLOR = '#3a3a5a';

  // Determine appropriate tick spacing based on zoom level
  let tickConfig = $derived.by(() => {
    const effectiveScale = scalePxPerMeter * stageScale;
    // Choose tick spacing so ticks are 40-120px apart on screen
    const targetScreenPx = 80;
    const metersPerTick = targetScreenPx / effectiveScale;

    // Round to nice values: 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50...
    const niceValues = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
    let spacing = niceValues[0]!;
    for (const v of niceValues) {
      if (v >= metersPerTick) {
        spacing = v;
        break;
      }
    }

    return {
      spacingM: spacing,
      spacingPx: spacing * scalePxPerMeter,
      majorEvery: 5,
    };
  });

  // Convert viewport boundaries to canvas coordinates
  let viewBounds = $derived.by(() => {
    const left = -stageOffsetX / stageScale;
    const top = -stageOffsetY / stageScale;
    const right = left + widthPx / stageScale;
    const bottom = top + heightPx / stageScale;
    return { left, top, right, bottom };
  });

  // Horizontal ruler ticks
  let hTicks = $derived.by(() => {
    if (!visible) return [];
    const { spacingPx, spacingM, majorEvery } = tickConfig;
    if (spacingPx < 1) return [];

    const ticks: Array<{ x: number; isMajor: boolean; label: string }> = [];
    const startIdx = Math.floor(viewBounds.left / spacingPx);
    const endIdx = Math.ceil(viewBounds.right / spacingPx);

    for (let i = startIdx; i <= endIdx; i++) {
      const x = i * spacingPx;
      const isMajor = i % majorEvery === 0;
      const meters = i * spacingM;
      ticks.push({
        x,
        isMajor,
        label: isMajor ? `${meters.toFixed(meters % 1 === 0 ? 0 : 1)}` : '',
      });
    }
    return ticks;
  });

  // Vertical ruler ticks
  let vTicks = $derived.by(() => {
    if (!visible) return [];
    const { spacingPx, spacingM, majorEvery } = tickConfig;
    if (spacingPx < 1) return [];

    const ticks: Array<{ y: number; isMajor: boolean; label: string }> = [];
    const startIdx = Math.floor(viewBounds.top / spacingPx);
    const endIdx = Math.ceil(viewBounds.bottom / spacingPx);

    for (let i = startIdx; i <= endIdx; i++) {
      const y = i * spacingPx;
      const isMajor = i % majorEvery === 0;
      const meters = i * spacingM;
      ticks.push({
        y,
        isMajor,
        label: isMajor ? `${meters.toFixed(meters % 1 === 0 ? 0 : 1)}` : '',
      });
    }
    return ticks;
  });

  // Ruler needs to be rendered at inverse stage transform so it stays fixed on screen
  let inverseScale = $derived(1 / stageScale);
  let rulerOffsetX = $derived(-stageOffsetX / stageScale);
  let rulerOffsetY = $derived(-stageOffsetY / stageScale);
  let rulerW = $derived(widthPx / stageScale);
  let rulerH = $derived(heightPx / stageScale);
  let rulerSize = $derived(RULER_SIZE / stageScale);
  let fontSize = $derived(9 / stageScale);
</script>

{#if visible}
  <Group listening={false}>
    <!-- Horizontal ruler background -->
    <Rect
      x={rulerOffsetX}
      y={rulerOffsetY}
      width={rulerW}
      height={rulerSize}
      fill={BG_COLOR}
      listening={false}
    />

    <!-- Horizontal ticks -->
    {#each hTicks as tick, i (i)}
      <Line
        points={[tick.x, rulerOffsetY + rulerSize * (tick.isMajor ? 0.3 : 0.6), tick.x, rulerOffsetY + rulerSize]}
        stroke={TICK_COLOR}
        strokeWidth={(tick.isMajor ? 1 : 0.5) / stageScale}
        opacity={tick.isMajor ? 0.8 : 0.4}
        listening={false}
      />
      {#if tick.label}
        <Text
          x={tick.x + 2 / stageScale}
          y={rulerOffsetY + 2 / stageScale}
          text={tick.label}
          fontSize={fontSize}
          fontFamily="-apple-system, sans-serif"
          fill={LABEL_COLOR}
          listening={false}
        />
      {/if}
    {/each}

    <!-- Vertical ruler background -->
    <Rect
      x={rulerOffsetX}
      y={rulerOffsetY}
      width={rulerSize}
      height={rulerH}
      fill={BG_COLOR}
      listening={false}
    />

    <!-- Vertical ticks -->
    {#each vTicks as tick, i (i)}
      <Line
        points={[rulerOffsetX + rulerSize * (tick.isMajor ? 0.3 : 0.6), tick.y, rulerOffsetX + rulerSize, tick.y]}
        stroke={TICK_COLOR}
        strokeWidth={(tick.isMajor ? 1 : 0.5) / stageScale}
        opacity={tick.isMajor ? 0.8 : 0.4}
        listening={false}
      />
      {#if tick.label}
        <Text
          x={rulerOffsetX + 2 / stageScale}
          y={tick.y + 2 / stageScale}
          text={tick.label}
          fontSize={fontSize}
          fontFamily="-apple-system, sans-serif"
          fill={LABEL_COLOR}
          listening={false}
        />
      {/if}
    {/each}

    <!-- Corner square -->
    <Rect
      x={rulerOffsetX}
      y={rulerOffsetY}
      width={rulerSize}
      height={rulerSize}
      fill={BG_COLOR}
      listening={false}
    />
    <Text
      x={rulerOffsetX + 2 / stageScale}
      y={rulerOffsetY + 4 / stageScale}
      text="m"
      fontSize={fontSize}
      fontFamily="-apple-system, sans-serif"
      fill={LABEL_COLOR}
      fontStyle="italic"
      listening={false}
    />

    <!-- Ruler border lines -->
    <Line
      points={[rulerOffsetX, rulerOffsetY + rulerSize, rulerOffsetX + rulerW, rulerOffsetY + rulerSize]}
      stroke={TICK_COLOR}
      strokeWidth={0.5 / stageScale}
      opacity={0.5}
      listening={false}
    />
    <Line
      points={[rulerOffsetX + rulerSize, rulerOffsetY, rulerOffsetX + rulerSize, rulerOffsetY + rulerH]}
      stroke={TICK_COLOR}
      strokeWidth={0.5 / stageScale}
      opacity={0.5}
      listening={false}
    />
  </Group>
{/if}
