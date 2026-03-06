/**
 * Per-page toolbar configuration.
 *
 * Defines which tools, controls, and features are available on each page type.
 * Viewer pages (measure, mixing) only get Select, Pan, Measure.
 * The editor page gets the full toolset.
 */

import type { EditorTool } from '$lib/stores/canvasStore.svelte';

export type PageContext = 'editor' | 'measure' | 'mixing' | 'results' | 'wizard';

export interface ToolbarConfig {
  /** Tools shown in the toolbar */
  allowedTools: EditorTool[];
  /** Show undo/redo buttons */
  showUndoRedo: boolean;
  /** Show snap-to-grid toggle */
  showSnapToggle: boolean;
  /** Show scale calibration button */
  showScaleCalibration: boolean;
  /** Show background opacity slider */
  showBackgroundOpacity: boolean;
  /** Show frequency band toggle (2.4 GHz / 5 GHz) */
  showBandToggle: boolean;
}

export const TOOLSETS: Record<PageContext, ToolbarConfig> = {
  editor: {
    allowedTools: ['select', 'pan', 'wall', 'room', 'door', 'window', 'ap', 'measure', 'text', 'candidate', 'zone'],
    showUndoRedo: true,
    showSnapToggle: true,
    showScaleCalibration: false,
    showBackgroundOpacity: true,
    showBandToggle: true,
  },
  measure: {
    allowedTools: ['select', 'pan', 'measure'],
    showUndoRedo: false,
    showSnapToggle: false,
    showScaleCalibration: false,
    showBackgroundOpacity: true,
    showBandToggle: true,
  },
  mixing: {
    allowedTools: ['select', 'pan', 'measure'],
    showUndoRedo: false,
    showSnapToggle: false,
    showScaleCalibration: false,
    showBackgroundOpacity: true,
    showBandToggle: true,
  },
  results: {
    allowedTools: [],
    showUndoRedo: false,
    showSnapToggle: false,
    showScaleCalibration: false,
    showBackgroundOpacity: false,
    showBandToggle: false,
  },
  wizard: {
    allowedTools: ['select', 'pan', 'wall', 'room', 'door', 'window', 'measure', 'text'],
    showUndoRedo: true,
    showSnapToggle: true,
    showScaleCalibration: false,
    showBackgroundOpacity: true,
    showBandToggle: false,
  },
};
