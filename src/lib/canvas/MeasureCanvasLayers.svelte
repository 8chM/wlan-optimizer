<!--
  MeasureCanvasLayers.svelte - Measure-specific canvas overlays.

  Rendered inside WorkspaceCanvas when pageContext === 'measure'.
  Contains: MeasurementPoints (interactive markers for measurement workflow).
-->
<script lang="ts">
  import MeasurementPoints from '$lib/canvas/MeasurementPoints.svelte';
  import { measurementStore } from '$lib/stores/measurementStore.svelte';

  // ─── Props ──────────────────────────────────────────────────────

  interface MeasureCanvasLayersProps {
    scalePxPerMeter: number;
  }

  let { scalePxPerMeter }: MeasureCanvasLayersProps = $props();

  // ─── Derived State ──────────────────────────────────────────────

  let activeRunNumber = $derived(
    measurementStore.currentRun?.run_number ?? 1,
  );

  function handlePointClick(pointId: string): void {
    console.log('[Measure] Point clicked:', pointId);
  }
</script>

<!-- Measurement points -->
<MeasurementPoints
  points={measurementStore.points}
  measurements={measurementStore.measurements}
  {scalePxPerMeter}
  activeRunId={measurementStore.currentRunId}
  {activeRunNumber}
  interactive={!measurementStore.isMeasuring}
  onPointClick={handlePointClick}
/>
