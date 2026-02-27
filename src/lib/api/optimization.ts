/**
 * Optimization API - IPC wrapper functions for optimization commands.
 *
 * Provides typed functions for generating optimization plans,
 * managing plan steps, and updating plan status.
 */

import { type OptimizationPlanResponse, type OptimizationStepResponse, safeInvoke } from './invoke';

/**
 * Generates a new optimization plan for a floor.
 * Analyzes current AP configuration and suggests improvements.
 */
export async function generateOptimizationPlan(
  projectId: string,
  floorId: string,
): Promise<{ plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }> {
  return safeInvoke('generate_optimization_plan', {
    params: {
      project_id: projectId,
      floor_id: floorId,
    },
  });
}

/**
 * Loads an optimization plan with all its steps.
 */
export async function getOptimizationPlan(
  planId: string,
): Promise<{ plan: OptimizationPlanResponse; steps: OptimizationStepResponse[] }> {
  return safeInvoke('get_optimization_plan', { plan_id: planId });
}

/**
 * Lists all optimization plans for a project.
 */
export async function listOptimizationPlans(
  projectId: string,
): Promise<OptimizationPlanResponse[]> {
  return safeInvoke('list_optimization_plans', { project_id: projectId });
}

/**
 * Marks an optimization step as applied or unapplied.
 */
export async function updateOptimizationStep(stepId: string, applied: boolean): Promise<void> {
  await safeInvoke('update_optimization_step', { step_id: stepId, applied });
}

/**
 * Updates the status of an optimization plan.
 */
export async function updateOptimizationPlanStatus(
  planId: string,
  status: 'draft' | 'applied' | 'verified',
): Promise<void> {
  await safeInvoke('update_optimization_plan_status', {
    plan_id: planId,
    status,
  });
}
