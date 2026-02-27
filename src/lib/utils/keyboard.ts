/**
 * Keyboard Shortcuts - Registration and handling for the editor.
 *
 * Provides a typed shortcut definition and a registration function
 * that attaches a global keydown listener. Skips shortcuts when
 * the user is typing in input/textarea/select elements.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface KeyboardShortcut {
  /** The key to match (e.g., 'z', 'Delete', 'Escape') */
  key: string;
  /** Require Ctrl (or Cmd on macOS) */
  ctrl?: boolean;
  /** Require Shift */
  shift?: boolean;
  /** Action identifier (used as key in handlers map) */
  action: string;
  /** i18n key for the description shown in help dialog */
  description_key: string;
}

// ─── Shortcut Definitions ───────────────────────────────────────

export const SHORTCUTS: KeyboardShortcut[] = [
  { key: 'z', ctrl: true, action: 'undo', description_key: 'shortcuts.undo' },
  { key: 'z', ctrl: true, shift: true, action: 'redo', description_key: 'shortcuts.redo' },
  { key: 'Delete', action: 'delete', description_key: 'shortcuts.delete' },
  { key: 'Backspace', action: 'delete', description_key: 'shortcuts.delete' },
  { key: 's', ctrl: true, action: 'save', description_key: 'shortcuts.save' },
  { key: 'Escape', action: 'deselect', description_key: 'shortcuts.deselect' },
  { key: 'w', action: 'wallTool', description_key: 'shortcuts.wallTool' },
  { key: 'a', action: 'apTool', description_key: 'shortcuts.apTool' },
  { key: 'm', action: 'measureTool', description_key: 'shortcuts.measureTool' },
  { key: 's', action: 'selectTool', description_key: 'shortcuts.selectTool' },
  { key: 'g', action: 'gridToggle', description_key: 'shortcuts.gridToggle' },
  { key: 'h', action: 'heatmapToggle', description_key: 'shortcuts.heatmapToggle' },
  { key: '?', shift: true, action: 'shortcutHelp', description_key: 'shortcuts.showHelp' },
];

/**
 * Deduplicated shortcuts for display in the help dialog.
 * Filters out the Backspace duplicate (same action as Delete).
 */
export const DISPLAY_SHORTCUTS: KeyboardShortcut[] = SHORTCUTS.filter((s) => s.key !== 'Backspace');

// ─── Matching ───────────────────────────────────────────────────

/**
 * Find the first shortcut that matches a keyboard event.
 * Returns the matching shortcut or undefined.
 */
export function matchShortcut(event: KeyboardEvent): KeyboardShortcut | undefined {
  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  for (const shortcut of SHORTCUTS) {
    const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
    const ctrlMatches = shortcut.ctrl ? ctrlOrMeta : !ctrlOrMeta;
    const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;

    if (keyMatches && ctrlMatches && shiftMatches) {
      return shortcut;
    }
  }
  return undefined;
}

// ─── Registration ───────────────────────────────────────────────

/**
 * Check if the active element is an input field that should swallow key events.
 */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;

  return false;
}

/**
 * Format a shortcut key combination for display (e.g., "Ctrl+Z", "Shift+Ctrl+Z").
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  // Use Cmd symbol on macOS, Ctrl elsewhere
  if (shortcut.ctrl) {
    const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');
    parts.push(isMac ? '\u2318' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }

  // Format special key names
  const keyDisplay =
    shortcut.key === 'Delete'
      ? 'Del'
      : shortcut.key === 'Escape'
        ? 'Esc'
        : shortcut.key === 'Backspace'
          ? '\u232B'
          : shortcut.key.toUpperCase();

  parts.push(keyDisplay);

  return parts.join('+');
}

/**
 * Register keyboard shortcuts on the document.
 *
 * @param handlers - Map of action names to handler functions.
 *   Only actions with a handler will be active.
 * @returns Cleanup function to remove the event listener.
 *
 * @example
 * ```ts
 * const cleanup = registerShortcuts({
 *   undo: () => console.log('undo'),
 *   redo: () => console.log('redo'),
 *   delete: () => deleteSelection(),
 * });
 *
 * // Later: cleanup();
 * ```
 */
export function registerShortcuts(handlers: Record<string, () => void>): () => void {
  function handleKeydown(event: KeyboardEvent): void {
    if (isInputFocused()) return;

    const matched = matchShortcut(event);
    if (!matched) return;

    const handler = handlers[matched.action];
    if (handler) {
      event.preventDefault();
      event.stopPropagation();
      handler();
    }
  }

  document.addEventListener('keydown', handleKeydown);

  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
}
