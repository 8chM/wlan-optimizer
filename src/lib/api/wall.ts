/**
 * Wall API wrapper functions.
 *
 * Provides typed functions for wall-related IPC commands.
 */

import { safeInvoke, type WallResponse, type SegmentInput } from './invoke';

/** Re-export SegmentInput for convenience */
export type WallSegmentInput = SegmentInput;

/**
 * Creates a new wall with the given material and segments.
 *
 * @param floorId - The floor to add the wall to
 * @param materialId - The material ID for the wall
 * @param segments - Array of line segments forming the wall
 */
export async function createWall(
  floorId: string,
  materialId: string,
  segments: SegmentInput[],
): Promise<WallResponse> {
  return safeInvoke('create_wall', {
    params: {
      floor_id: floorId,
      material_id: materialId,
      segments,
    },
  });
}

/**
 * Updates an existing wall's material or segments.
 */
export async function updateWall(
  wallId: string,
  updates: {
    materialId?: string;
    segments?: SegmentInput[];
  },
): Promise<WallResponse> {
  return safeInvoke('update_wall', {
    params: {
      wall_id: wallId,
      material_id: updates.materialId,
      segments: updates.segments,
    },
  });
}

/**
 * Deletes a wall by ID.
 */
export async function deleteWall(wallId: string): Promise<null> {
  return safeInvoke('delete_wall', { wall_id: wallId });
}
