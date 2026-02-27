/**
 * Editor Heatmap Store - Controls live heatmap display in the editor.
 *
 * Manages visibility, band selection, opacity, color scheme,
 * and heatmap statistics for the editor's real-time heatmap overlay.
 */

import type { FrequencyBand, ColorScheme } from '$lib/heatmap';
import type { HeatmapStats } from '$lib/heatmap';

// ─── Store ──────────────────────────────────────────────────────

function createEditorHeatmapStore() {
  let visible = $state(false);
  let band = $state<FrequencyBand>('5ghz');
  let colorScheme = $state<ColorScheme>('viridis');
  let opacity = $state(0.6);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stats = $state<HeatmapStats | null>(null);

  return {
    // ── Getters ─────────────────────────────────────────────
    get visible() { return visible; },
    get band() { return band; },
    get colorScheme() { return colorScheme; },
    get opacity() { return opacity; },
    get canvas() { return canvas; },
    get stats() { return stats; },

    // ── Actions ─────────────────────────────────────────────

    toggleVisible(): void {
      visible = !visible;
    },

    setVisible(v: boolean): void {
      visible = v;
    },

    setBand(b: FrequencyBand): void {
      band = b;
    },

    setColorScheme(cs: ColorScheme): void {
      colorScheme = cs;
    },

    setOpacity(o: number): void {
      opacity = Math.max(0, Math.min(1, o));
    },

    setCanvas(c: HTMLCanvasElement | null): void {
      canvas = c;
    },

    setStats(s: HeatmapStats | null): void {
      stats = s;
    },

    reset(): void {
      visible = false;
      band = '5ghz';
      colorScheme = 'viridis';
      opacity = 0.6;
      canvas = null;
      stats = null;
    },
  };
}

/** Singleton editor heatmap store instance */
export const editorHeatmapStore = createEditorHeatmapStore();
