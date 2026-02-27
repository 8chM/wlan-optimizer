<!--
  PlacementHintMarker.svelte - Konva markers showing suggested AP placement positions.
  Renders pulsing circles at each hint location with a tooltip.
-->
<script lang="ts">
  import { Circle, Text, Rect } from 'svelte-konva';
  import type { PlacementHint } from '$lib/heatmap/placement-hints';

  interface PlacementHintMarkerProps {
    hints: PlacementHint[];
    scalePxPerMeter: number;
    visible?: boolean;
  }

  let {
    hints,
    scalePxPerMeter,
    visible = true,
  }: PlacementHintMarkerProps = $props();

  interface MarkerData {
    x: number;
    y: number;
    label: string;
    radius: number;
  }

  let markers = $derived.by((): MarkerData[] => {
    if (!visible) return [];

    return hints.map((hint) => ({
      x: hint.xM * scalePxPerMeter,
      y: hint.yM * scalePxPerMeter,
      label: `${hint.avgRssi.toFixed(0)} dBm`,
      radius: Math.max(8, Math.min(20, hint.areaCells * 0.3)),
    }));
  });
</script>

{#if visible}
  {#each markers as marker, i (i)}
    <!-- Outer pulse ring -->
    <Circle
      x={marker.x}
      y={marker.y}
      radius={marker.radius + 6}
      fill="rgba(99, 102, 241, 0.1)"
      stroke="rgba(99, 102, 241, 0.3)"
      strokeWidth={1}
      listening={false}
    />
    <!-- Inner marker -->
    <Circle
      x={marker.x}
      y={marker.y}
      radius={marker.radius}
      fill="rgba(99, 102, 241, 0.25)"
      stroke="#6366f1"
      strokeWidth={2}
      dash={[4, 3]}
      listening={false}
    />
    <!-- Plus icon -->
    <Text
      x={marker.x - 5}
      y={marker.y - 6}
      text="+"
      fontSize={14}
      fontFamily="-apple-system, sans-serif"
      fontStyle="bold"
      fill="#a5b4fc"
      listening={false}
    />
    <!-- Label background -->
    <Rect
      x={marker.x - 22}
      y={marker.y + marker.radius + 4}
      width={44}
      height={14}
      fill="rgba(0, 0, 0, 0.7)"
      cornerRadius={3}
      listening={false}
    />
    <!-- Label text -->
    <Text
      x={marker.x - 22}
      y={marker.y + marker.radius + 6}
      width={44}
      text={marker.label}
      fontSize={8}
      fontFamily="-apple-system, sans-serif"
      fill="#a5b4fc"
      align="center"
      listening={false}
    />
  {/each}
{/if}
