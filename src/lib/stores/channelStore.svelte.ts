/**
 * Channel Store - Manages channel analysis results and overlay visibility.
 */

import type { ChannelAnalysisResult, AnalysisBand } from '$lib/heatmap/channel-analysis';
import { analyzeChannelConflicts } from '$lib/heatmap/channel-analysis';
import type { AccessPointResponse } from '$lib/api/invoke';

function createChannelStore() {
  let analysis = $state<ChannelAnalysisResult | null>(null);
  let overlayVisible = $state(false);
  let band = $state<AnalysisBand>('5ghz');

  return {
    get analysis() { return analysis; },
    get overlayVisible() { return overlayVisible; },
    get band() { return band; },

    get hasConflicts(): boolean {
      return (analysis?.conflicts.length ?? 0) > 0;
    },

    get conflictCount(): number {
      return analysis?.conflicts.length ?? 0;
    },

    /** Run channel analysis on the given APs */
    analyze(accessPoints: AccessPointResponse[]): void {
      analysis = analyzeChannelConflicts(accessPoints, band);
    },

    /** Toggle overlay visibility */
    toggleOverlay(): void {
      overlayVisible = !overlayVisible;
    },

    setOverlayVisible(v: boolean): void {
      overlayVisible = v;
    },

    setBand(b: AnalysisBand): void {
      band = b;
    },

    reset(): void {
      analysis = null;
      overlayVisible = false;
      band = '5ghz';
    },
  };
}

export const channelStore = createChannelStore();
