<!--
  EditorHeatmapPanel.svelte - Floating heatmap controls panel for the editor.

  Positioned at bottom-right corner of the editor canvas.
  Wraps HeatmapControls with editorHeatmapStore bindings.
-->
<script lang="ts">
  import HeatmapControls from './HeatmapControls.svelte';
  import { editorHeatmapStore } from '$lib/stores/editorHeatmapStore.svelte';
  import type { FrequencyBand, ColorScheme } from '$lib/heatmap';

  interface EditorHeatmapPanelProps {
    visible?: boolean;
  }

  let { visible = true }: EditorHeatmapPanelProps = $props();
</script>

{#if visible}
  <div class="editor-heatmap-panel">
    <HeatmapControls
      band={editorHeatmapStore.band}
      colorScheme={editorHeatmapStore.colorScheme}
      opacity={editorHeatmapStore.opacity}
      visible={editorHeatmapStore.visible}
      stats={editorHeatmapStore.stats}
      onBandChange={(b: FrequencyBand) => editorHeatmapStore.setBand(b)}
      onColorSchemeChange={(cs: ColorScheme) => editorHeatmapStore.setColorScheme(cs)}
      onOpacityChange={(o: number) => editorHeatmapStore.setOpacity(o)}
      onVisibilityChange={(v: boolean) => editorHeatmapStore.setVisible(v)}
    />
  </div>
{/if}

<style>
  .editor-heatmap-panel {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 220px;
    background: rgba(26, 26, 46, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    backdrop-filter: blur(8px);
    z-index: 20;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }
</style>
