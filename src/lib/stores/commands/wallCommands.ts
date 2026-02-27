/**
 * Wall-related editor commands for the undo/redo system.
 *
 * Each factory returns an EditorCommand that wraps existing API calls
 * so they can be undone/redone.
 */

import type { EditorCommand } from '../undoStore.svelte';
import type { WallResponse } from '$lib/api/invoke';
import type { WallSegmentInput } from '$lib/api/wall';
import { createWall, deleteWall, updateWall } from '$lib/api/wall';

/**
 * Command: Add a new wall.
 * Execute: creates the wall via API.
 * Undo: deletes the created wall.
 */
export function addWallCommand(
  floorId: string,
  materialId: string,
  segments: WallSegmentInput[],
  onRefresh: () => Promise<void>,
): EditorCommand {
  let createdWall: WallResponse | null = null;

  return {
    label: 'Add Wall',
    async execute() {
      createdWall = await createWall(floorId, materialId, segments);
      await onRefresh();
    },
    async undo() {
      if (createdWall) {
        await deleteWall(createdWall.id);
        createdWall = null;
        await onRefresh();
      }
    },
  };
}

/**
 * Command: Delete a wall.
 * Execute: deletes the wall via API.
 * Undo: re-creates the wall with original data.
 */
export function deleteWallCommand(
  wall: WallResponse,
  onRefresh: () => Promise<void>,
): EditorCommand {
  const segments: WallSegmentInput[] = wall.segments.map((seg, i) => ({
    segment_order: i,
    x1: seg.x1,
    y1: seg.y1,
    x2: seg.x2,
    y2: seg.y2,
  }));

  return {
    label: 'Delete Wall',
    async execute() {
      await deleteWall(wall.id);
      await onRefresh();
    },
    async undo() {
      await createWall(wall.floor_id, wall.material_id, segments);
      await onRefresh();
    },
  };
}

/**
 * Command: Update a wall's material.
 * Execute: sets the new material.
 * Undo: restores the old material.
 */
export function updateWallMaterialCommand(
  wallId: string,
  oldMaterialId: string,
  newMaterialId: string,
  onRefresh: () => Promise<void>,
): EditorCommand {
  return {
    label: 'Change Wall Material',
    async execute() {
      await updateWall(wallId, { materialId: newMaterialId });
      await onRefresh();
    },
    async undo() {
      await updateWall(wallId, { materialId: oldMaterialId });
      await onRefresh();
    },
  };
}
