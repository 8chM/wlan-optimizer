/**
 * Access Point-related editor commands for the undo/redo system.
 *
 * Each factory returns an EditorCommand that wraps existing API calls
 * so they can be undone/redone.
 */

import type { EditorCommand } from '../undoStore.svelte';
import type { AccessPointResponse } from '$lib/api/invoke';
import { createAccessPoint, deleteAccessPoint, updateAccessPoint } from '$lib/api/accessPoint';

/**
 * Command: Add a new access point.
 * Execute: creates the AP via API.
 * Undo: deletes the created AP.
 */
export function addApCommand(
  floorId: string,
  x: number,
  y: number,
  apModelId: string | undefined,
  label: string | undefined,
  onRefresh: () => Promise<void>,
): EditorCommand {
  let createdAp: AccessPointResponse | null = null;

  return {
    label: 'Add Access Point',
    async execute() {
      createdAp = await createAccessPoint(floorId, x, y, apModelId, label);
      await onRefresh();
    },
    async undo() {
      if (createdAp) {
        await deleteAccessPoint(createdAp.id);
        createdAp = null;
        await onRefresh();
      }
    },
  };
}

/**
 * Command: Delete an access point.
 * Execute: deletes the AP via API.
 * Undo: re-creates the AP with original data.
 */
export function deleteApCommand(
  ap: AccessPointResponse,
  onRefresh: () => Promise<void>,
): EditorCommand {
  return {
    label: 'Delete Access Point',
    async execute() {
      await deleteAccessPoint(ap.id);
      await onRefresh();
    },
    async undo() {
      await createAccessPoint(
        ap.floor_id,
        ap.x,
        ap.y,
        ap.ap_model_id ?? undefined,
        ap.label ?? undefined,
      );
      await onRefresh();
    },
  };
}

/**
 * Command: Move an access point.
 * Execute: updates AP position to new coordinates.
 * Undo: restores AP to old position.
 */
export function moveApCommand(
  apId: string,
  oldX: number,
  oldY: number,
  newX: number,
  newY: number,
  onRefresh: () => Promise<void>,
): EditorCommand {
  return {
    label: 'Move Access Point',
    async execute() {
      await updateAccessPoint(apId, { x: newX, y: newY });
      await onRefresh();
    },
    async undo() {
      await updateAccessPoint(apId, { x: oldX, y: oldY });
      await onRefresh();
    },
  };
}

/**
 * Command: Update AP properties (label, enabled, tx power).
 * Execute: applies new values.
 * Undo: restores old values.
 */
export function updateApCommand(
  apId: string,
  oldValues: { label?: string; enabled?: boolean },
  newValues: { label?: string; enabled?: boolean },
  onRefresh: () => Promise<void>,
): EditorCommand {
  return {
    label: 'Update Access Point',
    async execute() {
      await updateAccessPoint(apId, newValues);
      await onRefresh();
    },
    async undo() {
      await updateAccessPoint(apId, oldValues);
      await onRefresh();
    },
  };
}
