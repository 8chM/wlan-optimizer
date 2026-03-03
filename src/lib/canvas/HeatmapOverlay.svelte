<!--
  HeatmapOverlay.svelte - Renders the heatmap as a Konva.Image on the canvas.

  Receives a pre-rendered canvas (HTMLCanvasElement) from the parent
  and displays it scaled to floor bounds with configurable opacity.
  Placed on the non-interactive heatmap layer of FloorplanEditor.
-->
<script lang="ts">
  import { Image as KonvaImage } from 'svelte-konva';

  // ─── Props ─────────────────────────────────────────────────────

  interface HeatmapOverlayProps {
    /** The rendered heatmap image (offscreen canvas from HeatmapManager) */
    heatmapCanvas: HTMLCanvasElement | null;
    /** Floor dimensions in meters (with optional origin offset) */
    bounds: { width: number; height: number; originX?: number; originY?: number };
    /** Heatmap opacity (0-1), default 0.65 */
    opacity?: number;
    /** Whether the heatmap overlay is visible */
    visible?: boolean;
    /** Pixels per meter for proper sizing on the Konva stage */
    scalePxPerMeter?: number;
  }

  let {
    heatmapCanvas,
    bounds,
    opacity = 0.65,
    visible = true,
    scalePxPerMeter = 50,
  }: HeatmapOverlayProps = $props();

  // ─── Derived ──────────────────────────────────────────────────

  /** X position in canvas pixels (origin offset * px/m) */
  let displayX = $derived((bounds.originX ?? 0) * scalePxPerMeter);

  /** Y position in canvas pixels (origin offset * px/m) */
  let displayY = $derived((bounds.originY ?? 0) * scalePxPerMeter);

  /** Width in canvas pixels (meters * px/m) */
  let displayWidth = $derived(bounds.width * scalePxPerMeter);

  /** Height in canvas pixels (meters * px/m) */
  let displayHeight = $derived(bounds.height * scalePxPerMeter);
</script>

{#if visible && heatmapCanvas}
  <KonvaImage
    image={heatmapCanvas}
    x={displayX}
    y={displayY}
    width={displayWidth}
    height={displayHeight}
    {opacity}
    listening={false}
  />
{/if}
