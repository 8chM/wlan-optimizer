/**
 * AP Model API wrapper functions.
 *
 * Provides typed functions for AP model-related IPC commands.
 */

import { safeInvoke, type ApModelResponse } from './invoke';

/**
 * Lists all available AP models (built-in + user-defined).
 */
export async function listApModels(): Promise<ApModelResponse[]> {
  return safeInvoke('list_ap_models', {} as Record<string, never>);
}

/**
 * Gets a single AP model by ID.
 */
export async function getApModel(id: string): Promise<ApModelResponse> {
  return safeInvoke('get_ap_model', { id });
}
