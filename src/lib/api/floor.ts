/**
 * Floor API wrapper functions.
 *
 * Provides typed functions for floor-related IPC commands.
 */

import { safeInvoke, type FloorDataResponse, type FloorResponse } from './invoke';

/**
 * Loads floor data including walls and access points.
 */
export async function getFloorData(floorId: string): Promise<FloorDataResponse> {
  return safeInvoke('get_floor_data', { floor_id: floorId });
}

/**
 * Lists all floors belonging to a project.
 */
export async function getFloorsByProject(projectId: string): Promise<FloorResponse[]> {
  return safeInvoke('get_floors_by_project', { project_id: projectId });
}

/**
 * Sets the floor scale (pixels per meter) and physical dimensions.
 */
export async function setFloorScale(
  floorId: string,
  pxPerMeter: number,
  widthMeters: number,
  heightMeters: number,
): Promise<FloorResponse> {
  return safeInvoke('set_floor_scale', {
    floor_id: floorId,
    px_per_meter: pxPerMeter,
    width_meters: widthMeters,
    height_meters: heightMeters,
  });
}

/**
 * Imports a background image for a floor.
 * Image data is passed as a byte array (number[]).
 */
export async function importFloorImage(
  floorId: string,
  imageData: number[],
  format: string,
): Promise<FloorResponse> {
  return safeInvoke('import_floor_image', {
    floor_id: floorId,
    image_data: imageData,
    format,
  });
}

/**
 * Sets the background image rotation for a floor.
 * Rotation must be 0, 90, 180, or 270 degrees.
 */
export async function setFloorRotation(
  floorId: string,
  rotation: number,
): Promise<FloorResponse> {
  return safeInvoke('set_floor_rotation', {
    floor_id: floorId,
    rotation,
  });
}
