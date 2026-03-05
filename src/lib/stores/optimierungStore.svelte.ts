/**
 * Optimierung Store — Svelte 5 reactive store.
 *
 * Manages the combined Optimierung page state:
 * - Active tab: 'empfehlungen' (recommendations wizard) or 'manuell' (mixing console)
 * - Step states: per-recommendation status tracking for the wizard flow
 */

export type OptimierungTab = 'empfehlungen' | 'manuell';
export type StepState = 'pending' | 'applied' | 'skipped';

function createOptimierungStore() {
  let activeTab = $state<OptimierungTab>('empfehlungen');
  let stepStates = $state<Map<string, StepState>>(new Map());
  let stale = $state(false);

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
  };
}

/** Singleton optimierung store instance */
export const optimierungStore = createOptimierungStore();
