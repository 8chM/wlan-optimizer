/**
 * Measurement JSON Export utility.
 *
 * Exports measurement runs, points, and measurements as a self-contained
 * JSON file for external analysis or archival.
 */

import type {
  MeasurementRunResponse,
  MeasurementPointResponse,
  MeasurementResponse,
} from '$lib/api/invoke';

export interface MeasurementExport {
  _meta: { version: 1; exportedAt: string; floorId: string };
  runs: MeasurementRunResponse[];
  points: MeasurementPointResponse[];
  measurements: MeasurementResponse[];
}

/**
 * Serializes measurement data into a formatted JSON string.
 */
export function exportMeasurementsToJson(
  runs: MeasurementRunResponse[],
  points: MeasurementPointResponse[],
  measurements: MeasurementResponse[],
  floorId: string,
): string {
  const payload: MeasurementExport = {
    _meta: { version: 1, exportedAt: new Date().toISOString(), floorId },
    runs,
    points,
    measurements,
  };
  return JSON.stringify(payload, null, 2);
}
