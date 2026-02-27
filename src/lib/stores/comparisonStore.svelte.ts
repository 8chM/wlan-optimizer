/**
 * Comparison Store - Manages heatmap snapshots for before/after comparison.
 */

import type { DifferenceResult } from '$lib/heatmap/difference';
import { computeHeatmapDifference, snapshotCanvas } from '$lib/heatmap/difference';

export type ComparisonMode = 'side-by-side' | 'overlay' | 'difference';

function createComparisonStore() {
  let beforeCanvas = $state<HTMLCanvasElement | null>(null);
  let afterCanvas = $state<HTMLCanvasElement | null>(null);
  let diffResult = $state<DifferenceResult | null>(null);
  let mode = $state<ComparisonMode>('side-by-side');
  let overlayOpacity = $state(0.5);
  let isActive = $state(false);
  let beforeLabel = $state('');
  let afterLabel = $state('');

  return {
    get beforeCanvas() { return beforeCanvas; },
    get afterCanvas() { return afterCanvas; },
    get diffResult() { return diffResult; },
    get mode() { return mode; },
    get overlayOpacity() { return overlayOpacity; },
    get isActive() { return isActive; },
    get beforeLabel() { return beforeLabel; },
    get afterLabel() { return afterLabel; },

    get canCompare(): boolean {
      return beforeCanvas !== null && afterCanvas !== null;
    },

    /** Take a snapshot as the "before" canvas */
    setBeforeSnapshot(canvas: HTMLCanvasElement, label: string = ''): void {
      beforeCanvas = snapshotCanvas(canvas);
      beforeLabel = label;
      diffResult = null;
    },

    /** Take a snapshot as the "after" canvas */
    setAfterSnapshot(canvas: HTMLCanvasElement, label: string = ''): void {
      afterCanvas = snapshotCanvas(canvas);
      afterLabel = label;
      diffResult = null;
    },

    /** Set comparison mode */
    setMode(m: ComparisonMode): void {
      mode = m;
      // Auto-compute difference when switching to difference mode
      if (m === 'difference' && beforeCanvas && afterCanvas && !diffResult) {
        diffResult = computeHeatmapDifference(beforeCanvas, afterCanvas);
      }
    },

    /** Set overlay opacity (0-1) */
    setOverlayOpacity(opacity: number): void {
      overlayOpacity = Math.max(0, Math.min(1, opacity));
    },

    /** Activate the comparison view */
    activate(): void {
      isActive = true;
    },

    /** Deactivate the comparison view */
    deactivate(): void {
      isActive = false;
    },

    /** Compute the difference (if both canvases are set) */
    computeDifference(): void {
      if (beforeCanvas && afterCanvas) {
        diffResult = computeHeatmapDifference(beforeCanvas, afterCanvas);
      }
    },

    /** Reset everything */
    reset(): void {
      beforeCanvas = null;
      afterCanvas = null;
      diffResult = null;
      mode = 'side-by-side';
      overlayOpacity = 0.5;
      isActive = false;
      beforeLabel = '';
      afterLabel = '';
    },
  };
}

export const comparisonStore = createComparisonStore();
