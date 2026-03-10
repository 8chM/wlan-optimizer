/**
 * Export current recommendation analysis state as a regression fixture.
 *
 * DEV-only utility — produces a JSON blob compatible with golden.test.ts
 * serialization format (TypedArrays → plain arrays, Maps → entry arrays).
 */

import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { RecommendationContext, ExpertProfile } from './types';

export interface ExportedFixture {
  _meta: { exportedAt: string; version: 1; band: FrequencyBand; projectId: string | null };
  project: {
    aps: APConfig[];
    accessPoints: AccessPointResponse[];
    walls: WallData[];
    bounds: FloorBounds;
    band: FrequencyBand;
    profile: ExpertProfile;
    ctx: {
      candidates: RecommendationContext['candidates'];
      constraintZones: RecommendationContext['constraintZones'];
      apCapabilities: [string, unknown][];
      priorityZones: RecommendationContext['priorityZones'];
      rejections: RecommendationContext['rejections'];
      candidatePolicy: RecommendationContext['candidatePolicy'];
    };
  };
  stats: Record<string, unknown>;
}

/** Serialize HeatmapStats (TypedArrays → plain arrays) for JSON storage. */
function serializeStats(stats: HeatmapStats): Record<string, unknown> {
  return {
    minRSSI: stats.minRSSI,
    maxRSSI: stats.maxRSSI,
    avgRSSI: stats.avgRSSI,
    calculationTimeMs: stats.calculationTimeMs,
    gridStep: stats.gridStep,
    lodLevel: stats.lodLevel,
    totalCells: stats.totalCells,
    gridWidth: stats.gridWidth,
    gridHeight: stats.gridHeight,
    apIds: stats.apIds,
    coverageBins: stats.coverageBins,
    rssiGrid: Array.from(stats.rssiGrid as Float32Array),
    apIndexGrid: Array.from(stats.apIndexGrid as Uint8Array),
    deltaGrid: Array.from(stats.deltaGrid as Float32Array),
    overlapCountGrid: Array.from(stats.overlapCountGrid as Uint8Array),
    uplinkLimitedGrid: Array.from(stats.uplinkLimitedGrid as Uint8Array),
    secondBestApIndexGrid: Array.from(stats.secondBestApIndexGrid as Uint8Array),
  };
}

/**
 * Export the current analysis state as a regression fixture JSON object.
 *
 * rfConfig is intentionally NOT exported — golden.test.ts always reconstructs
 * it via `createRFConfig(band)` to ensure consistency.
 */
export function exportRegressionFixture(
  params: {
    aps: APConfig[];
    accessPoints: AccessPointResponse[];
    walls: WallData[];
    bounds: FloorBounds;
    band: FrequencyBand;
    stats: HeatmapStats;
  },
  ctx: RecommendationContext,
  profile: ExpertProfile,
  projectId: string | null = null,
): ExportedFixture {
  return {
    _meta: {
      exportedAt: new Date().toISOString(),
      version: 1,
      band: params.band,
      projectId,
    },
    project: {
      aps: params.aps,
      accessPoints: params.accessPoints,
      walls: params.walls,
      bounds: params.bounds,
      band: params.band,
      profile,
      ctx: {
        candidates: ctx.candidates,
        constraintZones: ctx.constraintZones,
        apCapabilities: Array.from(ctx.apCapabilities.entries()),
        priorityZones: ctx.priorityZones,
        rejections: ctx.rejections,
        candidatePolicy: ctx.candidatePolicy,
      },
    },
    stats: serializeStats(params.stats),
  };
}
