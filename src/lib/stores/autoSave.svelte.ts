/**
 * Auto-save module - Watches for dirty state changes and triggers
 * debounced save operations.
 *
 * Also registers a beforeunload warning for unsaved changes.
 */

import { projectStore } from './projectStore.svelte';
import { debounce } from '$lib/utils/debounce';

// ─── Types ──────────────────────────────────────────────────────

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

// ─── Singleton Reactive Store ────────────────────────────────────

function createAutoSaveStore() {
  let saveStatus = $state<SaveStatus>('saved');
  let saveError = $state<string | null>(null);
  let initialized = $state(false);

  // ── Debounced Save ─────────────────────────────────────────────

  const AUTO_SAVE_DELAY_MS = 2000;

  async function performSave(): Promise<void> {
    if (!projectStore.isDirty) {
      saveStatus = 'saved';
      return;
    }

    saveStatus = 'saving';
    saveError = null;

    try {
      // Individual mutations (createWall, updateAP, etc.) persist immediately
      // via IPC. This refresh ensures local state is in sync with backend.
      await projectStore.saveCurrentProject();
      saveStatus = 'saved';
    } catch (err: unknown) {
      saveStatus = 'error';
      saveError = err instanceof Error ? err.message : String(err);
      console.error('[AutoSave] Save failed:', saveError);
    }
  }

  const debouncedSave = debounce(performSave, AUTO_SAVE_DELAY_MS);

  // ── beforeunload Warning ───────────────────────────────────────

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (projectStore.isDirty) {
      event.preventDefault();
      // Modern browsers ignore custom messages, but setting returnValue
      // is still needed to trigger the dialog
      event.returnValue = '';
    }
  }

  return {
    // ── Reactive getters ──────────────────────────────────────
    get status() { return saveStatus; },
    get error() { return saveError; },
    get initialized() { return initialized; },

    /**
     * Initializes auto-save watching. Call once on app mount.
     * Returns a cleanup function.
     */
    init(): () => void {
      if (initialized) {
        return () => {};
      }

      initialized = true;

      // Watch dirty state
      const unsubscribe = projectStore.onDirtyChange((dirty) => {
        if (dirty) {
          saveStatus = 'unsaved';
          debouncedSave();
        }
      });

      // Register beforeunload
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', handleBeforeUnload);
      }

      return () => {
        unsubscribe();
        debouncedSave.cancel();
        initialized = false;
        if (typeof window !== 'undefined') {
          window.removeEventListener('beforeunload', handleBeforeUnload);
        }
      };
    },

    /**
     * Forces an immediate save (bypasses debounce).
     */
    async saveNow(): Promise<void> {
      debouncedSave.cancel();
      await performSave();
    },
  };
}

/** Singleton auto-save store instance with reactive properties */
export const autoSaveStore = createAutoSaveStore();
