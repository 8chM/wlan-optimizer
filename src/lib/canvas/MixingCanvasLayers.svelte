<!--
  MixingCanvasLayers.svelte - Mixing/Optimierung-specific canvas overlays.

  Rendered inside WorkspaceCanvas when pageContext === 'mixing'.
  Contains: CandidateLocationMarker (read-only) + ConstraintZoneRect (read-only).
-->
<script lang="ts">
  import CandidateLocationMarker from '$lib/canvas/CandidateLocationMarker.svelte';
  import ConstraintZoneRect from '$lib/canvas/ConstraintZoneRect.svelte';
  import { recommendationStore } from '$lib/stores/recommendationStore.svelte';

  // ─── Props ──────────────────────────────────────────────────────

  interface MixingCanvasLayersProps {
    scalePxPerMeter: number;
  }

  let { scalePxPerMeter }: MixingCanvasLayersProps = $props();

  // ─── Derived State ──────────────────────────────────────────────

  let candidates = $derived(recommendationStore.context.candidates);
  let constraintZones = $derived(recommendationStore.context.constraintZones);
</script>

<!-- Candidate locations (read-only) -->
{#each candidates as cand (cand.id)}
  <CandidateLocationMarker
    candidate={cand}
    selected={false}
    {scalePxPerMeter}
    draggable={false}
    interactive={false}
  />
{/each}

<!-- Constraint zones (read-only) -->
{#each constraintZones as zone (zone.id)}
  <ConstraintZoneRect
    {zone}
    selected={false}
    {scalePxPerMeter}
    interactive={false}
  />
{/each}
