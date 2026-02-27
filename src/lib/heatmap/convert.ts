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
      } else {
        const override = apOverrides?.['tx_power_5ghz'];
        txPower = override != null
          ? parseFloat(override)
          : (ap.tx_power_5ghz_dbm ?? 26);
      }

      const antennaGain = band === '2.4ghz'
        ? (ap.ap_model?.antenna_gain_24ghz_dbi ?? 3.2)
        : (ap.ap_model?.antenna_gain_5ghz_dbi ?? 4.3);

      return {
        id: ap.id,
        x: ap.x,
        y: ap.y,
        txPowerDbm: txPower,
        antennaGainDbi: antennaGain,
        enabled: true,
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
  return walls.map((wall): WallData => ({
    segments: wall.segments.map((seg) => ({
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
    })),
    attenuationDb: band === '2.4ghz'
      ? (wall.attenuation_override_24ghz ?? 3)
      : (wall.attenuation_override_5ghz ?? 5),
  }));
}
