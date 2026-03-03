/**
 * Per-page toolbar configuration.
 *
 * Defines which tools, controls, and features are available on each page type.
 * Viewer pages (measure, mixing) only get Select, Pan, Measure.
 * The editor page gets the full toolset.
 */

import type { EditorTool } from '$lib/stores/canvasStore.svelte';

export type PageContext = 'editor' | 'measure' | 'mixing' | 'results';

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
}

export const TOOLSETS: Record<PageContext, ToolbarConfig> = {
  editor: {
    allowedTools: ['select', 'pan', 'wall', 'room', 'door', 'window', 'ap', 'measure', 'text'],
    showUndoRedo: true,
    showSnapToggle: true,
    showScaleCalibration: true,
    showBackgroundOpacity: true,
  },
  measure: {
    allowedTools: ['select', 'pan', 'measure'],
    showUndoRedo: false,
    showSnapToggle: false,
    showScaleCalibration: false,
    showBackgroundOpacity: true,
  },
  mixing: {
    allowedTools: ['select', 'pan', 'measure'],
    showUndoRedo: false,
    showSnapToggle: false,
    showScaleCalibration: false,
    showBackgroundOpacity: true,
  },
  results: {
    allowedTools: [],
    showUndoRedo: false,
    showSnapToggle: false,
    showScaleCalibration: false,
    showBackgroundOpacity: false,
  },
};
