/**
 * Unit tests for mixingStore.svelte.ts (Phase 8e)
 *
 * Tests the mixing console store state management by mocking the API layer.
 * The store uses Svelte 5 $state/$derived runes; in Vitest (jsdom) these
 * rune-based getters are read directly as plain property accesses — no
 * reactive context needed for synchronous state reads.
 *
 * All IPC is mocked through '$lib/api/optimization'. No real Tauri invoke
 * is ever called.
 *
 * Covered actions:
 *   - Initial state (all defaults)
 *   - applyChange (add, update, revert-to-original removes entry)
 *   - resetChange (removes a single AP+parameter entry)
 *   - resetAp (removes all changes for one AP)
 *   - resetAll (clears every change)
 *   - changeCount / hasChanges derived values
 *   - pendingChanges / appliedChanges filters
 *   - getChangeSummary (all changes as array)
 *   - getChange (single lookup)
 *   - getChangesForAp (per-AP lookup)
 *   - generatePlan (success, isGenerating lifecycle, error)
 *   - loadPlan (success, isLoading lifecycle, error)
 *   - listPlans (success, error)
 *   - markStepApplied (success, local state update, error)
 *   - markStepUnapplied (success, local state update, error)
 *   - updatePlanStatus (success, local state update, error)
 *   - setForecastMode
 *   - clearError
 *   - reset (clears all state)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the API layer (hoisted before all imports) ──────────────────────────
vi.mock('$lib/api/optimization', () => ({
  generateOptimizationPlan: vi.fn(),
  getOptimizationPlan: vi.fn(),
  listOptimizationPlans: vi.fn(),
  updateOptimizationStep: vi.fn(),
  updateOptimizationPlanStatus: vi.fn(),
}));

import {
  generateOptimizationPlan,
  getOptimizationPlan,
  listOptimizationPlans,
  updateOptimizationStep,
  updateOptimizationPlanStatus,
} from '$lib/api/optimization';

import type {
  OptimizationPlanResponse,
  OptimizationStepResponse,
} from '$lib/api/invoke';

// Because the store is a singleton we call reset() before each test so state
// never leaks between tests.
import { mixingStore as store } from '$lib/stores/mixingStore.svelte';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlan(id: string, status: string = 'draft'): OptimizationPlanResponse {
  return {
    id,
    project_id: 'project-1',
    name: `Plan ${id}`,
    mode: 'auto',
    status,
    predicted_rmse_improvement_db: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeStep(
  id: string,
  planId: string,
  apId: string = 'ap-1',
  parameter: string = 'tx_power_24ghz',
  applied: boolean = false,
): OptimizationStepResponse {
  return {
    id,
    plan_id: planId,
    access_point_id: apId,
    step_order: 1,
    parameter,
    old_value: '20',
    new_value: '15',
    description_de: null,
    description_en: null,
    applied,
    applied_at: applied ? '2026-01-02T00:00:00Z' : null,
  };
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  store.reset();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('currentPlan is null', () => {
    expect(store.currentPlan).toBeNull();
  });

  it('steps is an empty array', () => {
    expect(store.steps).toEqual([]);
  });

  it('apChanges is an empty Map', () => {
    expect(store.apChanges.size).toBe(0);
  });

  it('forecastMode is false', () => {
    expect(store.forecastMode).toBe(false);
  });

  it('isGenerating is false', () => {
    expect(store.isGenerating).toBe(false);
  });

  it('isLoading is false', () => {
    expect(store.isLoading).toBe(false);
  });

  it('error is null', () => {
    expect(store.error).toBeNull();
  });

  it('changeCount is 0', () => {
    expect(store.changeCount).toBe(0);
  });

  it('hasChanges is false', () => {
    expect(store.hasChanges).toBe(false);
  });

  it('pendingChanges is an empty array', () => {
    expect(store.pendingChanges).toEqual([]);
  });

  it('appliedChanges is an empty array', () => {
    expect(store.appliedChanges).toEqual([]);
  });

  it('allStepsApplied is false when there are no steps', () => {
    expect(store.allStepsApplied).toBe(false);
  });
});

// ─── applyChange ──────────────────────────────────────────────────────────────

describe('applyChange', () => {
  it('adds a new change to apChanges', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    expect(store.apChanges.size).toBe(1);
    const change = store.apChanges.get('ap-1::tx_power_24ghz');
    expect(change).toBeDefined();
    expect(change?.apId).toBe('ap-1');
    expect(change?.parameter).toBe('tx_power_24ghz');
    expect(change?.oldValue).toBe('20');
    expect(change?.newValue).toBe('15');
    expect(change?.applied).toBe(false);
  });

  it('updates an existing change when called again for the same AP+parameter', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '10');

    expect(store.apChanges.size).toBe(1);
    expect(store.apChanges.get('ap-1::tx_power_24ghz')?.newValue).toBe('10');
  });

  it('removes the change when newValue equals oldValue (revert to original)', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.apChanges.size).toBe(1);

    store.applyChange('ap-1', 'tx_power_24ghz', '20', '20');

    expect(store.apChanges.size).toBe(0);
  });

  it('enables forecastMode when a change is applied', () => {
    expect(store.forecastMode).toBe(false);
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');
    expect(store.forecastMode).toBe(true);
  });

  it('keeps forecastMode enabled even after reverting to original', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    // Revert: newValue === oldValue removes the change but forecastMode stays true
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '20');
    expect(store.forecastMode).toBe(true);
  });

  it('accumulates independent changes for different AP+parameter pairs', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');
    store.applyChange('ap-2', 'tx_power_5ghz', '26', '20');

    expect(store.apChanges.size).toBe(3);
  });

  it('accepts null as oldValue', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', null, '15');
    expect(store.apChanges.get('ap-1::tx_power_24ghz')?.oldValue).toBeNull();
  });

  it('accepts null as newValue', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', null);
    expect(store.apChanges.get('ap-1::tx_power_24ghz')?.newValue).toBeNull();
  });
});

// ─── resetChange ──────────────────────────────────────────────────────────────

describe('resetChange', () => {
  it('removes the specified AP+parameter change', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');

    store.resetChange('ap-1', 'tx_power_24ghz');

    expect(store.apChanges.size).toBe(1);
    expect(store.apChanges.has('ap-1::tx_power_24ghz')).toBe(false);
    expect(store.apChanges.has('ap-1::channel_5ghz')).toBe(true);
  });

  it('is a no-op when the change does not exist', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    store.resetChange('ap-99', 'nonexistent_param');

    expect(store.apChanges.size).toBe(1);
  });

  it('sets forecastMode to false when the last change is removed', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.forecastMode).toBe(true);

    store.resetChange('ap-1', 'tx_power_24ghz');

    expect(store.forecastMode).toBe(false);
  });

  it('keeps forecastMode true when other changes remain', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');

    store.resetChange('ap-1', 'tx_power_24ghz');

    expect(store.forecastMode).toBe(true);
  });
});

// ─── resetAp ──────────────────────────────────────────────────────────────────

describe('resetAp', () => {
  it('removes all changes for the specified AP', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');
    store.applyChange('ap-2', 'tx_power_5ghz', '26', '20');

    store.resetAp('ap-1');

    expect(store.apChanges.size).toBe(1);
    expect(store.apChanges.has('ap-1::tx_power_24ghz')).toBe(false);
    expect(store.apChanges.has('ap-1::channel_5ghz')).toBe(false);
    expect(store.apChanges.has('ap-2::tx_power_5ghz')).toBe(true);
  });

  it('is a no-op when the AP has no changes', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    store.resetAp('ap-99');

    expect(store.apChanges.size).toBe(1);
  });

  it('sets forecastMode to false when the last AP changes are removed', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    store.resetAp('ap-1');

    expect(store.forecastMode).toBe(false);
  });

  it('keeps forecastMode true when other APs still have changes', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-2', 'channel_5ghz', '36', '40');

    store.resetAp('ap-1');

    expect(store.forecastMode).toBe(true);
  });
});

// ─── resetAll ─────────────────────────────────────────────────────────────────

describe('resetAll', () => {
  it('clears all changes across all APs', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-2', 'channel_5ghz', '36', '40');
    store.applyChange('ap-3', 'channel_width', '40', '20');

    store.resetAll();

    expect(store.apChanges.size).toBe(0);
  });

  it('sets forecastMode to false', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.forecastMode).toBe(true);

    store.resetAll();

    expect(store.forecastMode).toBe(false);
  });

  it('is a no-op when there are no changes', () => {
    store.resetAll();

    expect(store.apChanges.size).toBe(0);
    expect(store.forecastMode).toBe(false);
  });
});

// ─── changeCount / hasChanges derived values ──────────────────────────────────

describe('changeCount', () => {
  it('increments with each unique AP+parameter change', () => {
    expect(store.changeCount).toBe(0);

    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.changeCount).toBe(1);

    store.applyChange('ap-1', 'channel_5ghz', '36', '40');
    expect(store.changeCount).toBe(2);

    store.applyChange('ap-2', 'tx_power_5ghz', '26', '20');
    expect(store.changeCount).toBe(3);
  });

  it('does not increment when the same AP+parameter is updated', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '10');

    expect(store.changeCount).toBe(1);
  });

  it('decrements when a change is removed', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');

    store.resetChange('ap-1', 'tx_power_24ghz');

    expect(store.changeCount).toBe(1);
  });
});

describe('hasChanges', () => {
  it('is false initially', () => {
    expect(store.hasChanges).toBe(false);
  });

  it('is true after adding a change', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.hasChanges).toBe(true);
  });

  it('is false after all changes are cleared', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.resetAll();
    expect(store.hasChanges).toBe(false);
  });
});

// ─── pendingChanges / appliedChanges ──────────────────────────────────────────

describe('pendingChanges', () => {
  it('returns only changes where applied is false', async () => {
    const plan = makePlan('plan-1');
    const pendingStep = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', false);
    const appliedStep = makeStep('step-2', 'plan-1', 'ap-2', 'channel_5ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [pendingStep, appliedStep] });

    await store.generatePlan('project-1', 'floor-1');

    const pending = store.pendingChanges;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.apId).toBe('ap-1');
    expect(pending[0]?.applied).toBe(false);
  });

  it('is empty when all changes are applied', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.pendingChanges).toHaveLength(0);
  });
});

describe('appliedChanges', () => {
  it('returns only changes where applied is true', async () => {
    const plan = makePlan('plan-1');
    const pendingStep = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', false);
    const appliedStep = makeStep('step-2', 'plan-1', 'ap-2', 'channel_5ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [pendingStep, appliedStep] });

    await store.generatePlan('project-1', 'floor-1');

    const applied = store.appliedChanges;
    expect(applied).toHaveLength(1);
    expect(applied[0]?.apId).toBe('ap-2');
    expect(applied[0]?.applied).toBe(true);
  });

  it('is empty when no changes have been applied', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    expect(store.appliedChanges).toHaveLength(0);
  });
});

// ─── getChangeSummary ─────────────────────────────────────────────────────────

describe('getChangeSummary', () => {
  it('returns all changes as an array', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-2', 'channel_5ghz', '36', '40');

    const summary = store.getChangeSummary();

    expect(summary).toHaveLength(2);
    expect(summary.map((c) => c.apId)).toEqual(expect.arrayContaining(['ap-1', 'ap-2']));
  });

  it('returns an empty array when there are no changes', () => {
    expect(store.getChangeSummary()).toEqual([]);
  });
});

// ─── getChange ────────────────────────────────────────────────────────────────

describe('getChange', () => {
  it('returns the change for a given AP+parameter', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    const change = store.getChange('ap-1', 'tx_power_24ghz');

    expect(change).not.toBeNull();
    expect(change?.apId).toBe('ap-1');
    expect(change?.parameter).toBe('tx_power_24ghz');
    expect(change?.newValue).toBe('15');
  });

  it('returns null when the AP+parameter has no change', () => {
    expect(store.getChange('ap-99', 'nonexistent')).toBeNull();
  });

  it('returns null after the change is removed', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.resetChange('ap-1', 'tx_power_24ghz');

    expect(store.getChange('ap-1', 'tx_power_24ghz')).toBeNull();
  });
});

// ─── getChangesForAp ──────────────────────────────────────────────────────────

describe('getChangesForAp', () => {
  it('returns all changes for the given AP', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-1', 'channel_5ghz', '36', '40');
    store.applyChange('ap-2', 'tx_power_5ghz', '26', '20');

    const ap1Changes = store.getChangesForAp('ap-1');

    expect(ap1Changes).toHaveLength(2);
    expect(ap1Changes.every((c) => c.apId === 'ap-1')).toBe(true);
  });

  it('returns an empty array when the AP has no changes', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');

    expect(store.getChangesForAp('ap-99')).toEqual([]);
  });

  it('returns an empty array when no changes exist at all', () => {
    expect(store.getChangesForAp('ap-1')).toEqual([]);
  });
});

// ─── generatePlan ─────────────────────────────────────────────────────────────

describe('generatePlan', () => {
  it('populates currentPlan and steps on success', async () => {
    const plan = makePlan('plan-1');
    const step1 = makeStep('step-1', 'plan-1');
    const step2 = makeStep('step-2', 'plan-1', 'ap-2', 'channel_5ghz');
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step1, step2] });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.currentPlan).not.toBeNull();
    expect(store.currentPlan?.id).toBe('plan-1');
    expect(store.steps).toHaveLength(2);
    expect(store.steps[0]?.id).toBe('step-1');
    expect(store.steps[1]?.id).toBe('step-2');
  });

  it('calls the API with the correct project and floor IDs', async () => {
    vi.mocked(generateOptimizationPlan).mockResolvedValue({
      plan: makePlan('p1'),
      steps: [],
    });

    await store.generatePlan('project-X', 'floor-Y');

    expect(generateOptimizationPlan).toHaveBeenCalledWith('project-X', 'floor-Y');
  });

  it('auto-populates apChanges from the returned steps', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-3', 'tx_power_5ghz');
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.apChanges.size).toBe(1);
    const change = store.apChanges.get('ap-3::tx_power_5ghz');
    expect(change?.apId).toBe('ap-3');
    expect(change?.oldValue).toBe('20');
    expect(change?.newValue).toBe('15');
  });

  it('enables forecastMode after generating a plan', async () => {
    vi.mocked(generateOptimizationPlan).mockResolvedValue({
      plan: makePlan('p1'),
      steps: [],
    });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.forecastMode).toBe(true);
  });

  it('sets isGenerating to false after success', async () => {
    vi.mocked(generateOptimizationPlan).mockResolvedValue({
      plan: makePlan('p1'),
      steps: [],
    });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.isGenerating).toBe(false);
  });

  it('sets isGenerating during the operation', async () => {
    let capturedIsGenerating = false;
    let resolve!: (v: { plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }) => void;
    const pending = new Promise<{ plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }>(
      (res) => { resolve = res; },
    );
    vi.mocked(generateOptimizationPlan).mockReturnValue(pending);

    const generatePromise = store.generatePlan('project-1', 'floor-1');
    capturedIsGenerating = store.isGenerating;

    resolve({ plan: makePlan('p1'), steps: [] });
    await generatePromise;

    expect(capturedIsGenerating).toBe(true);
    expect(store.isGenerating).toBe(false);
  });

  it('stores the error message when the API rejects with an Error', async () => {
    vi.mocked(generateOptimizationPlan).mockRejectedValue(new Error('backend error'));

    await store.generatePlan('project-1', 'floor-1');

    expect(store.error).toBe('backend error');
    expect(store.currentPlan).toBeNull();
    expect(store.steps).toEqual([]);
  });

  it('stores the stringified error for non-Error rejections', async () => {
    vi.mocked(generateOptimizationPlan).mockRejectedValue('timeout');

    await store.generatePlan('project-1', 'floor-1');

    expect(store.error).toBe('timeout');
  });

  it('sets isGenerating to false even when the API rejects', async () => {
    vi.mocked(generateOptimizationPlan).mockRejectedValue(new Error('fail'));

    await store.generatePlan('project-1', 'floor-1');

    expect(store.isGenerating).toBe(false);
  });

  it('clears error before calling the API', async () => {
    vi.mocked(generateOptimizationPlan)
      .mockRejectedValueOnce(new Error('first error'))
      .mockResolvedValueOnce({ plan: makePlan('p1'), steps: [] });

    await store.generatePlan('project-1', 'floor-1');
    expect(store.error).not.toBeNull();

    await store.generatePlan('project-1', 'floor-1');
    expect(store.error).toBeNull();
  });
});

// ─── loadPlan ─────────────────────────────────────────────────────────────────

describe('loadPlan', () => {
  it('populates currentPlan and steps on success', async () => {
    const plan = makePlan('plan-42');
    const step = makeStep('step-1', 'plan-42');
    vi.mocked(getOptimizationPlan).mockResolvedValue({ plan, steps: [step] });

    await store.loadPlan('plan-42');

    expect(store.currentPlan?.id).toBe('plan-42');
    expect(store.steps).toHaveLength(1);
    expect(store.steps[0]?.id).toBe('step-1');
  });

  it('calls the API with the correct plan ID', async () => {
    vi.mocked(getOptimizationPlan).mockResolvedValue({ plan: makePlan('p1'), steps: [] });

    await store.loadPlan('plan-99');

    expect(getOptimizationPlan).toHaveBeenCalledWith('plan-99');
  });

  it('populates apChanges from the loaded steps', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-5', 'channel_width', true);
    vi.mocked(getOptimizationPlan).mockResolvedValue({ plan, steps: [step] });

    await store.loadPlan('plan-1');

    expect(store.apChanges.size).toBe(1);
    const change = store.apChanges.get('ap-5::channel_width');
    expect(change?.applied).toBe(true);
  });

  it('enables forecastMode after loading a plan', async () => {
    vi.mocked(getOptimizationPlan).mockResolvedValue({ plan: makePlan('p1'), steps: [] });

    await store.loadPlan('p1');

    expect(store.forecastMode).toBe(true);
  });

  it('sets isLoading to false after success', async () => {
    vi.mocked(getOptimizationPlan).mockResolvedValue({ plan: makePlan('p1'), steps: [] });

    await store.loadPlan('p1');

    expect(store.isLoading).toBe(false);
  });

  it('stores the error message when the API rejects', async () => {
    vi.mocked(getOptimizationPlan).mockRejectedValue(new Error('plan not found'));

    await store.loadPlan('nonexistent-plan');

    expect(store.error).toBe('plan not found');
    expect(store.currentPlan).toBeNull();
  });

  it('sets isLoading to false even when the API rejects', async () => {
    vi.mocked(getOptimizationPlan).mockRejectedValue(new Error('fail'));

    await store.loadPlan('p1');

    expect(store.isLoading).toBe(false);
  });
});

// ─── listPlans ────────────────────────────────────────────────────────────────

describe('listPlans', () => {
  it('returns the array of plans on success', async () => {
    const plan1 = makePlan('plan-1');
    const plan2 = makePlan('plan-2');
    vi.mocked(listOptimizationPlans).mockResolvedValue([plan1, plan2]);

    const result = await store.listPlans('project-1');

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('plan-1');
    expect(result[1]?.id).toBe('plan-2');
  });

  it('calls the API with the correct project ID', async () => {
    vi.mocked(listOptimizationPlans).mockResolvedValue([]);

    await store.listPlans('project-X');

    expect(listOptimizationPlans).toHaveBeenCalledWith('project-X');
  });

  it('returns an empty array and sets error when the API rejects', async () => {
    vi.mocked(listOptimizationPlans).mockRejectedValue(new Error('access denied'));

    const result = await store.listPlans('project-1');

    expect(result).toEqual([]);
    expect(store.error).toBe('access denied');
  });

  it('sets isLoading to false after success', async () => {
    vi.mocked(listOptimizationPlans).mockResolvedValue([]);

    await store.listPlans('project-1');

    expect(store.isLoading).toBe(false);
  });

  it('sets isLoading to false after failure', async () => {
    vi.mocked(listOptimizationPlans).mockRejectedValue(new Error('fail'));

    await store.listPlans('project-1');

    expect(store.isLoading).toBe(false);
  });
});

// ─── markStepApplied ──────────────────────────────────────────────────────────

describe('markStepApplied', () => {
  it('calls the API with the correct step ID and applied=true', async () => {
    // Set up a plan with a step first
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', false);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);

    await store.markStepApplied('step-1');

    expect(updateOptimizationStep).toHaveBeenCalledWith('step-1', true);
  });

  it('marks the corresponding step as applied in local state', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', false);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);
    await store.markStepApplied('step-1');

    const updatedStep = store.steps.find((s) => s.id === 'step-1');
    expect(updatedStep?.applied).toBe(true);
    expect(updatedStep?.applied_at).not.toBeNull();
  });

  it('updates the apChange.applied flag to true', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', false);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);
    await store.markStepApplied('step-1');

    const change = store.apChanges.get('ap-1::tx_power_24ghz');
    expect(change?.applied).toBe(true);
  });

  it('stores the error message when the API rejects', async () => {
    vi.mocked(updateOptimizationStep).mockRejectedValue(new Error('step update failed'));

    await store.markStepApplied('step-nonexistent');

    expect(store.error).toBe('step update failed');
  });

  it('allStepsApplied becomes true when all steps are marked applied', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', false);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    expect(store.allStepsApplied).toBe(false);

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);
    await store.markStepApplied('step-1');

    expect(store.allStepsApplied).toBe(true);
  });
});

// ─── markStepUnapplied ────────────────────────────────────────────────────────

describe('markStepUnapplied', () => {
  it('calls the API with the correct step ID and applied=false', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);

    await store.markStepUnapplied('step-1');

    expect(updateOptimizationStep).toHaveBeenCalledWith('step-1', false);
  });

  it('marks the corresponding step as unapplied in local state', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);
    await store.markStepUnapplied('step-1');

    const updatedStep = store.steps.find((s) => s.id === 'step-1');
    expect(updatedStep?.applied).toBe(false);
    expect(updatedStep?.applied_at).toBeNull();
  });

  it('updates the apChange.applied flag to false', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationStep).mockResolvedValue(undefined);
    await store.markStepUnapplied('step-1');

    const change = store.apChanges.get('ap-1::tx_power_24ghz');
    expect(change?.applied).toBe(false);
  });

  it('stores the error message when the API rejects', async () => {
    vi.mocked(updateOptimizationStep).mockRejectedValue(new Error('cannot unapply'));

    await store.markStepUnapplied('step-x');

    expect(store.error).toBe('cannot unapply');
  });
});

// ─── updatePlanStatus ─────────────────────────────────────────────────────────

describe('updatePlanStatus', () => {
  it('calls the API with the correct plan ID and status', async () => {
    vi.mocked(updateOptimizationPlanStatus).mockResolvedValue(undefined);

    await store.updatePlanStatus('plan-1', 'applied');

    expect(updateOptimizationPlanStatus).toHaveBeenCalledWith('plan-1', 'applied');
  });

  it('updates currentPlan.status in local state when IDs match', async () => {
    const plan = makePlan('plan-1', 'draft');
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationPlanStatus).mockResolvedValue(undefined);
    await store.updatePlanStatus('plan-1', 'applied');

    expect(store.currentPlan?.status).toBe('applied');
  });

  it('updates currentPlan.updated_at after status change', async () => {
    const plan = makePlan('plan-1', 'draft');
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [] });
    await store.generatePlan('project-1', 'floor-1');

    const originalUpdatedAt = store.currentPlan?.updated_at;
    vi.mocked(updateOptimizationPlanStatus).mockResolvedValue(undefined);
    await store.updatePlanStatus('plan-1', 'verified');

    expect(store.currentPlan?.updated_at).not.toBe(originalUpdatedAt);
  });

  it('does not update currentPlan when plan IDs differ', async () => {
    const plan = makePlan('plan-1', 'draft');
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [] });
    await store.generatePlan('project-1', 'floor-1');

    vi.mocked(updateOptimizationPlanStatus).mockResolvedValue(undefined);
    await store.updatePlanStatus('different-plan', 'applied');

    expect(store.currentPlan?.status).toBe('draft');
  });

  it('does not update when currentPlan is null', async () => {
    vi.mocked(updateOptimizationPlanStatus).mockResolvedValue(undefined);

    // No plan loaded — should not throw
    await expect(store.updatePlanStatus('any-plan', 'applied')).resolves.toBeUndefined();
    expect(store.currentPlan).toBeNull();
  });

  it('stores the error message when the API rejects', async () => {
    vi.mocked(updateOptimizationPlanStatus).mockRejectedValue(new Error('forbidden'));

    await store.updatePlanStatus('plan-1', 'applied');

    expect(store.error).toBe('forbidden');
  });

  it('accepts all valid status values', async () => {
    vi.mocked(updateOptimizationPlanStatus).mockResolvedValue(undefined);

    await store.updatePlanStatus('plan-1', 'draft');
    await store.updatePlanStatus('plan-1', 'applied');
    await store.updatePlanStatus('plan-1', 'verified');

    expect(updateOptimizationPlanStatus).toHaveBeenCalledTimes(3);
  });
});

// ─── setForecastMode ──────────────────────────────────────────────────────────

describe('setForecastMode', () => {
  it('sets forecastMode to true', () => {
    store.setForecastMode(true);
    expect(store.forecastMode).toBe(true);
  });

  it('sets forecastMode to false', () => {
    store.setForecastMode(true);
    store.setForecastMode(false);
    expect(store.forecastMode).toBe(false);
  });
});

// ─── clearError ───────────────────────────────────────────────────────────────

describe('clearError', () => {
  it('clears a previously set error', async () => {
    vi.mocked(generateOptimizationPlan).mockRejectedValue(new Error('plan failed'));
    await store.generatePlan('project-1', 'floor-1');
    expect(store.error).not.toBeNull();

    store.clearError();

    expect(store.error).toBeNull();
  });

  it('is a no-op when error is already null', () => {
    expect(store.error).toBeNull();
    store.clearError();
    expect(store.error).toBeNull();
  });
});

// ─── allStepsApplied ──────────────────────────────────────────────────────────

describe('allStepsApplied', () => {
  it('is false when steps array is empty', () => {
    expect(store.steps).toHaveLength(0);
    expect(store.allStepsApplied).toBe(false);
  });

  it('is false when at least one step is not applied', async () => {
    const plan = makePlan('plan-1');
    const step1 = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', true);
    const step2 = makeStep('step-2', 'plan-1', 'ap-2', 'channel_5ghz', false);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step1, step2] });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.allStepsApplied).toBe(false);
  });

  it('is true when every step is applied', async () => {
    const plan = makePlan('plan-1');
    const step1 = makeStep('step-1', 'plan-1', 'ap-1', 'tx_power_24ghz', true);
    const step2 = makeStep('step-2', 'plan-1', 'ap-2', 'channel_5ghz', true);
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step1, step2] });

    await store.generatePlan('project-1', 'floor-1');

    expect(store.allStepsApplied).toBe(true);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears currentPlan', async () => {
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan: makePlan('p1'), steps: [] });
    await store.generatePlan('project-1', 'floor-1');
    expect(store.currentPlan).not.toBeNull();

    store.reset();

    expect(store.currentPlan).toBeNull();
  });

  it('clears steps', async () => {
    const plan = makePlan('plan-1');
    const step = makeStep('step-1', 'plan-1');
    vi.mocked(generateOptimizationPlan).mockResolvedValue({ plan, steps: [step] });
    await store.generatePlan('project-1', 'floor-1');
    expect(store.steps).toHaveLength(1);

    store.reset();

    expect(store.steps).toEqual([]);
  });

  it('clears apChanges', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    store.applyChange('ap-2', 'channel_5ghz', '36', '40');
    expect(store.apChanges.size).toBe(2);

    store.reset();

    expect(store.apChanges.size).toBe(0);
  });

  it('resets forecastMode to false', () => {
    store.setForecastMode(true);
    store.reset();
    expect(store.forecastMode).toBe(false);
  });

  it('resets isGenerating to false', async () => {
    let resolve!: (v: { plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }) => void;
    const pending = new Promise<{ plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }>(
      (res) => { resolve = res; },
    );
    vi.mocked(generateOptimizationPlan).mockReturnValue(pending);

    const generatePromise = store.generatePlan('project-1', 'floor-1');
    store.reset();
    expect(store.isGenerating).toBe(false);

    resolve({ plan: makePlan('p1'), steps: [] });
    await generatePromise;
  });

  it('resets isLoading to false', async () => {
    let resolve!: (v: { plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }) => void;
    const pending = new Promise<{ plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }>(
      (res) => { resolve = res; },
    );
    vi.mocked(getOptimizationPlan).mockReturnValue(pending);

    const loadPromise = store.loadPlan('plan-1');
    store.reset();
    expect(store.isLoading).toBe(false);

    resolve({ plan: makePlan('p1'), steps: [] });
    await loadPromise;
  });

  it('resets error to null', async () => {
    vi.mocked(generateOptimizationPlan).mockRejectedValue(new Error('err'));
    await store.generatePlan('project-1', 'floor-1');
    expect(store.error).not.toBeNull();

    store.reset();

    expect(store.error).toBeNull();
  });

  it('resets changeCount to 0', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.changeCount).toBe(1);

    store.reset();

    expect(store.changeCount).toBe(0);
  });

  it('resets hasChanges to false', () => {
    store.applyChange('ap-1', 'tx_power_24ghz', '20', '15');
    expect(store.hasChanges).toBe(true);

    store.reset();

    expect(store.hasChanges).toBe(false);
  });
});
