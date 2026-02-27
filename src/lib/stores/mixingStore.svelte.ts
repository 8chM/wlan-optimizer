/**
 * Mixing Console Store - Svelte 5 Runes-based store for the mixing console.
 *
 * Manages optimization plans, AP parameter changes (TX power, channel,
 * channel width), and forecast heatmap state. Supports generating
 * optimization plans from the backend and local parameter adjustments
 * for what-if analysis.
 */

import type {
  OptimizationPlanResponse,
  OptimizationStepResponse,
} from '$lib/api/invoke';
import {
  generateOptimizationPlan,
  getOptimizationPlan,
  listOptimizationPlans,
  updateOptimizationStep,
  updateOptimizationPlanStatus,
} from '$lib/api/optimization';

// ─── Types ──────────────────────────────────────────────────────

/** A single parameter change for an access point */
export interface APChange {
  /** Access point ID */
  apId: string;
  /** Parameter name (e.g., 'tx_power_24ghz', 'channel_5ghz', 'channel_width') */
  parameter: string;
  /** Original value before change */
  oldValue: string | null;
  /** New value after change */
  newValue: string | null;
  /** Whether this change has been applied to the physical AP */
  applied: boolean;
}

/** Slider range configuration */
export interface SliderRange {
  min: number;
  max: number;
  step: number;
  options?: number[];
}

// ─── Constants ──────────────────────────────────────────────────

/** TX power slider ranges per band */
export const TX_POWER_RANGE_24GHZ: SliderRange = { min: 1, max: 23, step: 1 };
export const TX_POWER_RANGE_5GHZ: SliderRange = { min: 1, max: 26, step: 1 };

/** Available 2.4 GHz channels (non-overlapping) */
export const CHANNELS_24GHZ: number[] = [1, 6, 11];

/** Available 5 GHz channels */
export const CHANNELS_5GHZ: number[] = [
  36, 40, 44, 48, 52, 56, 60, 64,
  100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144,
  149, 153, 157, 161, 165,
];

/** Available channel widths in MHz */
export const CHANNEL_WIDTHS: number[] = [20, 40, 80, 160];

// ─── Helpers ─────────────────────────────────────────────────────

/** Extracts a readable error message from Tauri invoke errors or standard errors. */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

/** Creates a unique key for an AP+parameter combination */
function changeKey(apId: string, parameter: string): string {
  return `${apId}::${parameter}`;
}

// ─── Store ──────────────────────────────────────────────────────

function createMixingStore() {
  // State
  let currentPlan = $state<OptimizationPlanResponse | null>(null);
  let steps = $state<OptimizationStepResponse[]>([]);
  let apChanges = $state<Map<string, APChange>>(new Map());
  let forecastMode = $state(false);
  let isGenerating = $state(false);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Derived
  let pendingChanges = $derived(
    Array.from(apChanges.values()).filter((c) => !c.applied),
  );
  let appliedChanges = $derived(
    Array.from(apChanges.values()).filter((c) => c.applied),
  );
  let changeCount = $derived(apChanges.size);
  let hasChanges = $derived(apChanges.size > 0);
  let allStepsApplied = $derived(
    steps.length > 0 && steps.every((s) => s.applied),
  );

  return {
    // ── Getters (reactive via $state) ───────────────────────
    get currentPlan() { return currentPlan; },
    get steps() { return steps; },
    get apChanges() { return apChanges; },
    get forecastMode() { return forecastMode; },
    get isGenerating() { return isGenerating; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get pendingChanges() { return pendingChanges; },
    get appliedChanges() { return appliedChanges; },
    get changeCount() { return changeCount; },
    get hasChanges() { return hasChanges; },
    get allStepsApplied() { return allStepsApplied; },

    // ── Plan Actions ─────────────────────────────────────────

    /**
     * Generates a new optimization plan from the backend.
     * Populates currentPlan and steps on success.
     */
    async generatePlan(projectId: string, floorId: string): Promise<void> {
      isGenerating = true;
      error = null;
      try {
        const result = await generateOptimizationPlan(projectId, floorId);
        currentPlan = result.plan;
        steps = result.steps;

        // Auto-populate apChanges from plan steps
        const newChanges = new Map<string, APChange>();
        for (const step of result.steps) {
          const key = changeKey(step.access_point_id, step.parameter);
          newChanges.set(key, {
            apId: step.access_point_id,
            parameter: step.parameter,
            oldValue: step.old_value,
            newValue: step.new_value,
            applied: step.applied,
          });
        }
        apChanges = newChanges;
        forecastMode = true;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isGenerating = false;
      }
    },

    /**
     * Loads an existing optimization plan.
     */
    async loadPlan(planId: string): Promise<void> {
      isLoading = true;
      error = null;
      try {
        const result = await getOptimizationPlan(planId);
        currentPlan = result.plan;
        steps = result.steps;

        // Populate apChanges from loaded steps
        const newChanges = new Map<string, APChange>();
        for (const step of result.steps) {
          const key = changeKey(step.access_point_id, step.parameter);
          newChanges.set(key, {
            apId: step.access_point_id,
            parameter: step.parameter,
            oldValue: step.old_value,
            newValue: step.new_value,
            applied: step.applied,
          });
        }
        apChanges = newChanges;
        forecastMode = true;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isLoading = false;
      }
    },

    /**
     * Lists all optimization plans for a project.
     */
    async listPlans(projectId: string): Promise<OptimizationPlanResponse[]> {
      isLoading = true;
      error = null;
      try {
        return await listOptimizationPlans(projectId);
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        return [];
      } finally {
        isLoading = false;
      }
    },

    // ── Local Change Actions ─────────────────────────────────

    /**
     * Applies a local parameter change for forecast visualization.
     * Does not persist to backend - used for what-if analysis.
     */
    applyChange(apId: string, parameter: string, oldValue: string | null, newValue: string | null): void {
      const key = changeKey(apId, parameter);

      // If reverting to the original value, remove the change
      if (newValue === oldValue) {
        const newMap = new Map(apChanges);
        newMap.delete(key);
        apChanges = newMap;
      } else {
        const newMap = new Map(apChanges);
        newMap.set(key, {
          apId,
          parameter,
          oldValue,
          newValue,
          applied: false,
        });
        apChanges = newMap;
      }

      forecastMode = true;
    },

    /**
     * Resets a single parameter change for an AP.
     */
    resetChange(apId: string, parameter: string): void {
      const key = changeKey(apId, parameter);
      const newMap = new Map(apChanges);
      newMap.delete(key);
      apChanges = newMap;

      if (newMap.size === 0) {
        forecastMode = false;
      }
    },

    /**
     * Resets all changes for a specific AP.
     */
    resetAp(apId: string): void {
      const newMap = new Map(apChanges);
      for (const [key, change] of newMap) {
        if (change.apId === apId) {
          newMap.delete(key);
        }
      }
      apChanges = newMap;

      if (newMap.size === 0) {
        forecastMode = false;
      }
    },

    /**
     * Resets all changes across all APs.
     */
    resetAll(): void {
      apChanges = new Map();
      forecastMode = false;
    },

    // ── Step Actions ─────────────────────────────────────────

    /**
     * Marks an optimization step as applied in the backend.
     */
    async markStepApplied(stepId: string): Promise<void> {
      error = null;
      try {
        await updateOptimizationStep(stepId, true);

        // Capture step info before mutating the steps array
        const step = steps.find((s) => s.id === stepId);

        steps = steps.map((s) =>
          s.id === stepId ? { ...s, applied: true, applied_at: new Date().toISOString() } : s,
        );

        // Update the corresponding apChange
        if (step) {
          const key = changeKey(step.access_point_id, step.parameter);
          const existing = apChanges.get(key);
          if (existing) {
            const newMap = new Map(apChanges);
            newMap.set(key, { ...existing, applied: true });
            apChanges = newMap;
          }
        }
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      }
    },

    /**
     * Marks an optimization step as unapplied in the backend.
     */
    async markStepUnapplied(stepId: string): Promise<void> {
      error = null;
      try {
        await updateOptimizationStep(stepId, false);

        // Capture step info before mutating the steps array
        const step = steps.find((s) => s.id === stepId);

        steps = steps.map((s) =>
          s.id === stepId ? { ...s, applied: false, applied_at: null } : s,
        );

        // Update the corresponding apChange
        if (step) {
          const key = changeKey(step.access_point_id, step.parameter);
          const existing = apChanges.get(key);
          if (existing) {
            const newMap = new Map(apChanges);
            newMap.set(key, { ...existing, applied: false });
            apChanges = newMap;
          }
        }
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      }
    },

    /**
     * Updates the status of the current optimization plan.
     */
    async updatePlanStatus(planId: string, status: 'draft' | 'applied' | 'verified'): Promise<void> {
      error = null;
      try {
        await updateOptimizationPlanStatus(planId, status);
        if (currentPlan && currentPlan.id === planId) {
          currentPlan = { ...currentPlan, status, updated_at: new Date().toISOString() };
        }
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      }
    },

    // ── Utility Methods ──────────────────────────────────────

    /**
     * Returns a formatted summary of all pending changes.
     */
    getChangeSummary(): APChange[] {
      return Array.from(apChanges.values());
    },

    /**
     * Returns the current change for a specific AP parameter, or null.
     */
    getChange(apId: string, parameter: string): APChange | null {
      return apChanges.get(changeKey(apId, parameter)) ?? null;
    },

    /**
     * Returns all changes for a specific AP.
     */
    getChangesForAp(apId: string): APChange[] {
      return Array.from(apChanges.values()).filter((c) => c.apId === apId);
    },

    /**
     * Toggles forecast mode on/off.
     */
    setForecastMode(mode: boolean): void {
      forecastMode = mode;
    },

    /**
     * Clears any error message.
     */
    clearError(): void {
      error = null;
    },

    /**
     * Resets all store state.
     */
    reset(): void {
      currentPlan = null;
      steps = [];
      apChanges = new Map();
      forecastMode = false;
      isGenerating = false;
      isLoading = false;
      error = null;
    },
  };
}

/** Singleton mixing store instance */
export const mixingStore = createMixingStore();
