<!--
  CrosshairCursor.svelte - Permanent crosshair overlay that follows mouse position.
  Rendered in the UI layer to provide visual feedback for all tools.
-->
<script lang="ts">
  import { Line } from 'svelte-konva';

  interface CrosshairCursorProps {
    /** Mouse position in canvas coordinates (pixels) */
    x: number;
    y: number;
    /** Crosshair arm length in pixels */
    size?: number;
    /** Color */
    color?: string;
    /** Opacity */
    opacity?: number;
  }

  let {
    x,
    y,
    size = 20,
    color = '#4a6cf7',
    opacity = 0.6,
  }: CrosshairCursorProps = $props();
</script>

<!-- Horizontal arm -->
<Line
  points={[x - size, y, x + size, y]}
  stroke={color}
  strokeWidth={1}
  {opacity}
  dash={[4, 3]}
  listening={false}
/>
<!-- Vertical arm -->
<Line
  points={[x, y - size, x, y + size]}
  stroke={color}
  strokeWidth={1}
  {opacity}
  dash={[4, 3]}
  listening={false}
/>
