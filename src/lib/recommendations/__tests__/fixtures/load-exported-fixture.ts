/**
 * Import harness for exported regression fixtures.
 *
 * Deserializes a JSON fixture (from fixture-export.ts) back into
 * the typed objects needed by generateRecommendations().
 */

import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { RFConfig } from '$lib/heatmap/rf-engine';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { RecommendationContext, ExpertProfile, APCapabilities } from '../../types';
import { EMPTY_CONTEXT } from '../../types';
import type { ExportedFixture } from '../../fixture-export';

export interface LoadedFixture {
  aps: APConfig[];
  accessPoints: AccessPointResponse[];
  walls: WallData[];
  bounds: FloorBounds;
  band: FrequencyBand;
  stats: HeatmapStats;
  rfConfig: RFConfig;
  profile: ExpertProfile;
  ctx: RecommendationContext;
}

/** Deserialize stats JSON back to HeatmapStats with TypedArrays. */
function deserializeStats(data: Record<string, unknown>): HeatmapStats {
  return {
    ...data,
    rssiGrid: new Float32Array(data.rssiGrid as number[]),
    apIndexGrid: new Uint8Array(data.apIndexGrid as number[]),
    deltaGrid: new Float32Array(data.deltaGrid as number[]),
    overlapCountGrid: new Uint8Array(data.overlapCountGrid as number[]),
    uplinkLimitedGrid: new Uint8Array(data.uplinkLimitedGrid as number[]),
    secondBestApIndexGrid: new Uint8Array(data.secondBestApIndexGrid as number[]),
  } as unknown as HeatmapStats;
}

/**
 * Load an exported fixture JSON object and reconstruct all typed objects.
 *
 * rfConfig is always reconstructed from the band via createRFConfig()
 * to match the golden.test.ts convention.
 */
export function loadExportedFixture(data: ExportedFixture): LoadedFixture {
  const { project, stats: statsData } = data;

  const ctx: RecommendationContext = {
    ...EMPTY_CONTEXT,
    candidates: project.ctx.candidates ?? [],
    constraintZones: project.ctx.constraintZones ?? [],
    apCapabilities: new Map(project.ctx.apCapabilities ?? []) as Map<string, APCapabilities>,
    priorityZones: project.ctx.priorityZones ?? [],
    rejections: project.ctx.rejections ?? [],
    candidatePolicy: project.ctx.candidatePolicy ?? 'required_for_new_ap',
  };

  return {
    aps: project.aps,
    accessPoints: project.accessPoints,
    walls: project.walls,
    bounds: project.bounds,
    band: project.band,
    stats: deserializeStats(statsData),
    rfConfig: createRFConfig(project.band),
    profile: project.profile,
    ctx,
  };
}
