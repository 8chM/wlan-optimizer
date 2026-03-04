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
 * Updates an existing wall's material, segments, or attenuation overrides.
 */
export async function updateWall(
  wallId: string,
  updates: {
    materialId?: string;
    segments?: SegmentInput[];
    thicknessCm?: number | null;
    attenuationOverride24ghz?: number | null;
    attenuationOverride5ghz?: number | null;
    attenuationOverride6ghz?: number | null;
  },
): Promise<WallResponse> {
  return safeInvoke('update_wall', {
    params: {
      wall_id: wallId,
      material_id: updates.materialId,
      segments: updates.segments,
      thickness_cm: updates.thicknessCm,
      attenuation_override_24ghz: updates.attenuationOverride24ghz ?? undefined,
      attenuation_override_5ghz: updates.attenuationOverride5ghz ?? undefined,
      attenuation_override_6ghz: updates.attenuationOverride6ghz ?? undefined,
    },
  });
}

/**
 * Deletes a wall by ID.
 */
export async function deleteWall(wallId: string): Promise<null> {
  return safeInvoke('delete_wall', { wall_id: wallId });
}
