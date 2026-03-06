<!--
  SignalProbeMarker.svelte - Visual marker for Signal Probe point on canvas.

  Shows a colored ring + dot at the probed location with a dBm label.
-->
<script lang="ts">
  import { Group, Circle, Rect, Text } from 'svelte-konva';

  interface SignalProbeMarkerProps {
    /** X position in canvas pixels */
    x: number;
    /** Y position in canvas pixels */
    y: number;
    /** Probed RSSI value in dBm */
    rssiDbm: number;
    /** Whether the marker is visible */
    visible?: boolean;
  }

  let {
    x,
    y,
    rssiDbm,
    visible = true,
  }: SignalProbeMarkerProps = $props();

  function rssiColor(rssi: number): string {
    if (rssi >= -45) return '#22c55e';
    if (rssi >= -60) return '#84cc16';
    if (rssi >= -70) return '#f59e0b';
    if (rssi >= -80) return '#ef4444';
    return '#6b7280';
  }

  let color = $derived(rssiColor(rssiDbm));
  let label = $derived(`${rssiDbm.toFixed(1)} dBm`);
  let labelWidth = $derived(label.length * 7 + 8);
</script>

{#if visible}
  <Group config={{ x, y, listening: false }}>
    <!-- Outer ring -->
    <Circle config={{
      x: 0,
      y: 0,
      radius: 8,
      stroke: color,
      strokeWidth: 2,
      fill: 'transparent',
    }} />
    <!-- Inner dot -->
    <Circle config={{
      x: 0,
      y: 0,
      radius: 3,
      fill: color,
    }} />
    <!-- Label background -->
    <Rect config={{
      x: -labelWidth / 2,
      y: -26,
      width: labelWidth,
      height: 16,
      fill: 'rgba(0, 0, 0, 0.75)',
      cornerRadius: 3,
    }} />
    <!-- Label text -->
    <Text config={{
      x: -labelWidth / 2,
      y: -25,
      width: labelWidth,
      height: 16,
      text: label,
      fontSize: 11,
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fill: color,
      align: 'center',
      verticalAlign: 'middle',
    }} />
  </Group>
{/if}
