/**
 * Material API wrapper functions.
 *
 * Provides typed functions for material-related IPC commands.
 */

import { safeInvoke, type MaterialResponse } from './invoke';

/**
 * Lists all available materials (built-in + user-defined).
 * Optionally filter by floor/wall type.
 */
export async function listMaterials(isFloor?: boolean): Promise<MaterialResponse[]> {
  return safeInvoke('list_materials', { is_floor: isFloor });
}

/**
 * Gets a single material by ID.
 */
export async function getMaterial(id: string): Promise<MaterialResponse> {
  return safeInvoke('get_material', { id });
}
