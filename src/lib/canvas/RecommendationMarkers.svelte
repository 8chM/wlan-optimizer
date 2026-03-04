<!--
  RecommendationMarkers.svelte - Visual markers for recommendation targets.

  Shows:
  - idealTargetPosition: gray crosshair (dashed)
  - selectedCandidatePosition: green dot
  - Connection line + distance label between them
  - Only visible when a recommendation with these fields is selected
-->
<script lang="ts">
  import { Group, Circle, Line, Text, Rect } from 'svelte-konva';
  import type { Recommendation } from '$lib/recommendations/types';

  interface RecommendationMarkersProps {
    recommendation: Recommendation | null;
    scalePxPerMeter: number;
  }

  let {
    recommendation,
    scalePxPerMeter = 50,
  }: RecommendationMarkersProps = $props();

  let idealPos = $derived(recommendation?.idealTargetPosition);
  let candidatePos = $derived(recommendation?.selectedCandidatePosition);

  let idealPx = $derived(idealPos ? {
    x: idealPos.x * scalePxPerMeter,
    y: idealPos.y * scalePxPerMeter,
  } : null);

  let candidatePx = $derived(candidatePos ? {
    x: candidatePos.x * scalePxPerMeter,
    y: candidatePos.y * scalePxPerMeter,
  } : null);

  let distanceLabel = $derived(
    recommendation?.distanceToIdeal !== undefined && recommendation.distanceToIdeal > 0
      ? `${(recommendation.distanceToIdeal).toFixed(1)}m`
      : null
  );

  let midpoint = $derived(
    idealPx && candidatePx ? {
      x: (idealPx.x + candidatePx.x) / 2,
      y: (idealPx.y + candidatePx.y) / 2,
    } : null
  );

  const CROSSHAIR_SIZE = 12;
</script>

{#if idealPx || candidatePx}
  <Group listening={false}>
    <!-- Connection line -->
    {#if idealPx && candidatePx}
      <Line
        points={[idealPx.x, idealPx.y, candidatePx.x, candidatePx.y]}
        stroke="rgba(156, 163, 175, 0.6)"
        strokeWidth={1.5}
        dash={[4, 3]}
        listening={false}
      />
    {/if}

    <!-- Ideal target position (gray crosshair) -->
    {#if idealPx}
      <Line
        points={[idealPx.x - CROSSHAIR_SIZE, idealPx.y, idealPx.x + CROSSHAIR_SIZE, idealPx.y]}
        stroke="rgba(156, 163, 175, 0.7)"
        strokeWidth={1.5}
        dash={[3, 2]}
        listening={false}
      />
      <Line
        points={[idealPx.x, idealPx.y - CROSSHAIR_SIZE, idealPx.x, idealPx.y + CROSSHAIR_SIZE]}
        stroke="rgba(156, 163, 175, 0.7)"
        strokeWidth={1.5}
        dash={[3, 2]}
        listening={false}
      />
      <Circle
        x={idealPx.x}
        y={idealPx.y}
        radius={4}
        fill="transparent"
        stroke="rgba(156, 163, 175, 0.7)"
        strokeWidth={1.5}
        listening={false}
      />
    {/if}

    <!-- Selected candidate position (green dot) -->
    {#if candidatePx}
      <Circle
        x={candidatePx.x}
        y={candidatePx.y}
        radius={6}
        fill="#22c55e"
        stroke="#ffffff"
        strokeWidth={2}
        listening={false}
      />
    {/if}

    <!-- Distance label -->
    {#if distanceLabel && midpoint}
      <Rect
        x={midpoint.x - 16}
        y={midpoint.y - 8}
        width={32}
        height={14}
        fill="rgba(0, 0, 0, 0.6)"
        cornerRadius={3}
        listening={false}
      />
      <Text
        x={midpoint.x - 16}
        y={midpoint.y - 6}
        width={32}
        text={distanceLabel}
        fontSize={9}
        fontFamily="'SF Mono', 'Fira Code', monospace"
        fill="#e0e0f0"
        align="center"
        listening={false}
      />
    {/if}
  </Group>
{/if}
