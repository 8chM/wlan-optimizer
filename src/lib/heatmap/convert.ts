/**
 * Shared conversion utilities for AP/Wall response data → heatmap input types.
 *
 * Extracted from ForecastHeatmap.svelte so the same logic can be reused
 * by the editor live heatmap and any future heatmap consumers.
 */

import type { AccessPointResponse, WallResponse } from '$lib/api/invoke';
import type { APConfig, WallData } from './worker-types';
import type { FrequencyBand } from './color-schemes';

/**
 * Converts AccessPointResponse[] into APConfig[] for heatmap calculation.
 *
 * Optionally applies AP parameter overrides (e.g., from the mixing console).
 * Only enabled APs are included.
 */
export function convertApsToConfig(
  accessPoints: AccessPointResponse[],
  band: FrequencyBand,
  overrides?: Map<string, Record<string, string>>,
): APConfig[] {
  return accessPoints
    .filter((ap) => ap.enabled)
    .map((ap): APConfig => {
      const apOverrides = overrides?.get(ap.id);

      let txPower: number;
      if (band === '2.4ghz') {
        const override = apOverrides?.['tx_power_24ghz'];
        txPower = override != null
          ? parseFloat(override)
          : (ap.tx_power_24ghz_dbm ?? 23);
      } else if (band === '6ghz') {
        const override = apOverrides?.['tx_power_6ghz'];
        txPower = override != null
          ? parseFloat(override)
          : (ap.tx_power_6ghz_dbm ?? ap.tx_power_5ghz_dbm ?? 26);
      } else {
        const override = apOverrides?.['tx_power_5ghz'];
        txPower = override != null
          ? parseFloat(override)
          : (ap.tx_power_5ghz_dbm ?? 26);
      }

      const antennaGain = band === '2.4ghz'
        ? (ap.ap_model?.antenna_gain_24ghz_dbi ?? 3.2)
        : band === '6ghz'
        ? (ap.ap_model?.antenna_gain_6ghz_dbi ?? ap.ap_model?.antenna_gain_5ghz_dbi ?? 4.3)
        : (ap.ap_model?.antenna_gain_5ghz_dbi ?? 4.3);

      // Apply position overrides (from move_ap recommendations)
      const posXOverride = apOverrides?.['position_x'];
      const posYOverride = apOverrides?.['position_y'];
      const x = posXOverride != null ? parseFloat(posXOverride) : ap.x;
      const y = posYOverride != null ? parseFloat(posYOverride) : ap.y;

      // Apply orientation override (from rotate_ap recommendations)
      const orientOverride = apOverrides?.['orientationDeg'];
      const orientationDeg = orientOverride != null
        ? parseFloat(orientOverride)
        : (ap.orientation_deg ?? 0);

      // Apply mounting override (from change_mounting recommendations)
      const mountOverride = apOverrides?.['mounting'];
      const mounting = mountOverride ?? (ap.mounting ?? 'ceiling');

      return {
        id: ap.id,
        x,
        y,
        heightM: ap.height_m ?? 0,
        txPowerDbm: txPower,
        antennaGainDbi: antennaGain,
        enabled: true,
        mounting,
        orientationDeg,
      };
    });
}

/**
 * Converts WallResponse[] into WallData[] for heatmap calculation.
 */
export function convertWallsToData(
  walls: WallResponse[],
  band: FrequencyBand,
): WallData[] {
  return walls.map((wall): WallData => {
    const baseThickness = wall.material?.default_thickness_cm ?? 10;
    return {
      segments: wall.segments.map((seg) => ({
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
      })),
      attenuationDb: getWallAttenuation(wall, band),
      baseThicknessCm: baseThickness,
      actualThicknessCm: wall.thickness_cm ?? baseThickness,
      materialLabel: wall.material?.name_en ?? 'Unknown',
    };
  });
}

/** Picks the correct attenuation value for a wall based on frequency band. */
function getWallAttenuation(wall: WallResponse, band: FrequencyBand): number {
  if (band === '2.4ghz') {
    return wall.attenuation_override_24ghz ?? wall.material?.attenuation_24ghz_db ?? 3;
  }
  if (band === '5ghz') {
    return wall.attenuation_override_5ghz ?? wall.material?.attenuation_5ghz_db ?? 5;
  }
  // 6 GHz: no per-wall override field exists, use material value directly
  return wall.material?.attenuation_6ghz_db ?? wall.material?.attenuation_5ghz_db ?? 6;
}
