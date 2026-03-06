/**
 * Editor Heatmap Store - Controls live heatmap display in the editor.
 *
 * Manages visibility, band selection, opacity, color scheme,
 * and heatmap statistics for the editor's real-time heatmap overlay.
 */

import type { FrequencyBand, ColorScheme } from '$lib/heatmap';
import type { HeatmapStats } from '$lib/heatmap';

// ─── Store ──────────────────────────────────────────────────────

/** Heatmap overlay display mode */
export type HeatmapOverlayMode = 'signal' | 'ap-zones' | 'delta';

function createEditorHeatmapStore() {
  let visible = $state(false);
  let band = $state<FrequencyBand>('5ghz');
  let colorScheme = $state<ColorScheme>('viridis');
  let opacity = $state(0.6);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let stats = $state<HeatmapStats | null>(null);
  /** Single-AP filter for debug mode (null = all APs) */
  let apFilter = $state<string | null>(null);
  /** Overlay display mode: signal (RSSI), AP zones, or delta */
  let overlayMode = $state<HeatmapOverlayMode>('signal');
  /** Path-Loss-Exponent override (undefined = use band default) */
  let calibratedN = $state<number | undefined>(undefined);
  /** Receiver gain override in dBi (undefined = use default -3) */
  let receiverGainDbi = $state<number | undefined>(undefined);
  /** Wall-mount back sector penalty in dB */
  let backSectorPenalty = $state<number>(-15);
  /** Wall-mount side sector penalty in dB */
  let sideSectorPenalty = $state<number>(-5);
  /** Signal Probe active state */
  let probeActive = $state(false);
  /** Signal Probe clicked point (meters) */
  let probePoint = $state<{ x: number; y: number } | null>(null);
  /** Signal Probe result RSSI (dBm) */
  let probeRssi = $state<number | null>(null);
  /** Signal Probe best AP ID */
  let probeBestApId = $state<string | null>(null);

  return {
    // ── Getters ─────────────────────────────────────────────
    get visible() { return visible; },
    get band() { return band; },
    get colorScheme() { return colorScheme; },
    get opacity() { return opacity; },
    get canvas() { return canvas; },
    get stats() { return stats; },
    get apFilter() { return apFilter; },
    get overlayMode() { return overlayMode; },
    get calibratedN() { return calibratedN; },
    get receiverGainDbi() { return receiverGainDbi; },
    get backSectorPenalty() { return backSectorPenalty; },
    get sideSectorPenalty() { return sideSectorPenalty; },
    get probeActive() { return probeActive; },
    get probePoint() { return probePoint; },
    get probeRssi() { return probeRssi; },
    get probeBestApId() { return probeBestApId; },

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

    setApFilter(id: string | null): void {
      apFilter = id;
    },

    setOverlayMode(mode: HeatmapOverlayMode): void {
      overlayMode = mode;
    },

    setCalibratedN(n: number | undefined): void {
      calibratedN = n;
    },

    setReceiverGainDbi(g: number | undefined): void {
      receiverGainDbi = g;
    },

    setBackSectorPenalty(p: number): void {
      backSectorPenalty = p;
    },

    setSideSectorPenalty(p: number): void {
      sideSectorPenalty = p;
    },

    setProbeActive(v: boolean): void {
      probeActive = v;
      if (!v) {
        probePoint = null;
        probeRssi = null;
        probeBestApId = null;
      }
    },

    setProbeResult(point: { x: number; y: number }, rssi: number, apId: string | null): void {
      probePoint = point;
      probeRssi = rssi;
      probeBestApId = apId;
    },

    clearProbe(): void {
      probePoint = null;
      probeRssi = null;
      probeBestApId = null;
    },

    /** Reset advanced model parameters to defaults */
    resetAdvanced(): void {
      calibratedN = undefined;
      receiverGainDbi = undefined;
      backSectorPenalty = -15;
      sideSectorPenalty = -5;
    },

    reset(): void {
      visible = false;
      band = '5ghz';
      colorScheme = 'viridis';
      opacity = 0.6;
      canvas = null;
      stats = null;
      apFilter = null;
      overlayMode = 'signal';
      calibratedN = undefined;
      receiverGainDbi = undefined;
      backSectorPenalty = -15;
      sideSectorPenalty = -5;
      probeActive = false;
      probePoint = null;
      probeRssi = null;
      probeBestApId = null;
    },
  };
}

/** Singleton editor heatmap store instance */
export const editorHeatmapStore = createEditorHeatmapStore();
