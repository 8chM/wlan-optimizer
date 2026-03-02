/**
 * Access Point API wrapper functions.
 *
 * Provides typed functions for AP-related IPC commands.
 */

import { safeInvoke, type AccessPointResponse } from './invoke';

/**
 * Creates a new access point on the given floor.
 *
 * @param floorId - The floor to add the AP to
 * @param x - X position in meters
 * @param y - Y position in meters
 * @param apModelId - Optional AP model reference
 * @param label - Optional display label
 */
export async function createAccessPoint(
  floorId: string,
  x: number,
  y: number,
  apModelId?: string,
  label?: string,
): Promise<AccessPointResponse> {
  return safeInvoke('create_access_point', {
    params: {
      floor_id: floorId,
      x,
      y,
      ap_model_id: apModelId,
      label,
    },
  });
}

/**
 * Updates an access point's position, power, channels, or other properties.
 */
export async function updateAccessPoint(
  accessPointId: string,
  updates: {
    x?: number;
    y?: number;
    label?: string;
    enabled?: boolean;
    height_m?: number;
    mounting?: string;
    tx_power_24ghz_dbm?: number;
    tx_power_5ghz_dbm?: number;
    channel_24ghz?: number;
    channel_5ghz?: number;
    channel_width?: string;
  },
): Promise<AccessPointResponse> {
  return safeInvoke('update_access_point', {
    params: {
      access_point_id: accessPointId,
      ...updates,
    },
  });
}

/**
 * Deletes an access point by ID.
 */
export async function deleteAccessPoint(accessPointId: string): Promise<null> {
  return safeInvoke('delete_access_point', { access_point_id: accessPointId });
}
