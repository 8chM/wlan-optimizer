/**
 * Optimierung Store — Svelte 5 reactive store.
 *
 * Manages the combined Optimierung page state:
 * - Active tab: 'empfehlungen' (recommendations wizard) or 'manuell' (mixing console)
 * - Step states: per-recommendation status tracking for the wizard flow
 */

export type OptimierungTab = 'empfehlungen' | 'manuell';
export type StepState = 'pending' | 'applied' | 'skipped';

/** Stable key for identifying a recommendation across re-analyses */
export function instructionalStableKey(rec: { type: string; affectedApIds: string[] }): string {
  return `${rec.type}:${[...rec.affectedApIds].sort().join(',')}`;
}

function createOptimierungStore() {
  let activeTab = $state<OptimierungTab>('empfehlungen');
  let stepStates = $state<Map<string, StepState>>(new Map());
  let stale = $state(false);
  let doneInstructional = $state<Set<string>>(new Set());

  return {
    get activeTab() { return activeTab; },
    get stepStates() { return stepStates; },
    get stale() { return stale; },

    setTab(tab: OptimierungTab): void {
      activeTab = tab;
    },

    setStale(value: boolean): void {
      stale = value;
    },

    setStepState(recId: string, state: StepState): void {
      const next = new Map(stepStates);
      next.set(recId, state);
      stepStates = next;
    },

    resetSteps(): void {
      stepStates = new Map();
      stale = false;
    },

    getProgress(): { completed: number; total: number } {
      let completed = 0;
      let total = 0;
      for (const state of stepStates.values()) {
        total++;
        if (state === 'applied' || state === 'skipped') completed++;
      }
      return { completed, total };
    },

    // ─── Instructional Done Tracking ──────────────────────────

    /** Mark an instructional recommendation as done (user performed the physical action) */
    markInstructionalDone(rec: { type: string; affectedApIds: string[] }): void {
      const next = new Set(doneInstructional);
      next.add(instructionalStableKey(rec));
      doneInstructional = next;
    },

    /** Check if an instructional recommendation was previously marked as done */
    isInstructionalDone(rec: { type: string; affectedApIds: string[] }): boolean {
      return doneInstructional.has(instructionalStableKey(rec));
    },

    /** Get serializable done keys for localStorage persistence */
    getDoneKeys(): string[] {
      return [...doneInstructional];
    },

    /** Load done keys from serialized data */
    loadDoneKeys(keys: string[]): void {
      doneInstructional = new Set(keys);
    },

    /** Clear all done states */
    clearDone(): void {
      doneInstructional = new Set();
    },

    get doneCount() { return doneInstructional.size; },
  };
}

/** Singleton optimierung store instance */
export const optimierungStore = createOptimierungStore();
