/**
 * Export current recommendation analysis state as a regression fixture.
 *
 * Produces a JSON blob compatible with golden.test.ts serialization format
 * (TypedArrays → plain arrays, Maps → entry arrays).
 *
 * Also provides sanitizeFixture() for privacy-safe support exports.
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

/**
 * Create a sanitized copy of an exported fixture with sensitive fields removed.
 *
 * Preserves all RF-relevant data (coordinates, walls, attenuation, TX power,
 * channels, antenna gain, mounting, stats/grids, band, profile, policy).
 *
 * Removes: AP names/labels, SSID, IP, model IDs, floor IDs, timestamps,
 * candidate/zone notes, project ID. IDs are remapped for consistency.
 */
export function sanitizeFixture(fixture: ExportedFixture): ExportedFixture {
  const clone: ExportedFixture = JSON.parse(JSON.stringify(fixture));

  // Build ID map: old AP id → "ap-1", "ap-2", ...
  const idMap = new Map<string, string>();
  for (let i = 0; i < clone.project.accessPoints.length; i++) {
    const oldId = clone.project.accessPoints[i]!.id;
    const newId = `ap-${i + 1}`;
    idMap.set(oldId, newId);
  }

  // Sanitize _meta
  clone._meta.projectId = null;

  // Sanitize aps (APConfig[])
  for (const ap of clone.project.aps) {
    ap.id = idMap.get(ap.id) ?? ap.id;
  }

  // Sanitize accessPoints (AccessPointResponse[])
  for (const ap of clone.project.accessPoints) {
    ap.id = idMap.get(ap.id) ?? ap.id;
    ap.label = null;
    ap.ssid = null;
    ap.ip_address = null;
    ap.ap_model_id = null;
    ap.floor_id = 'floor-1';
    ap.created_at = '2000-01-01T00:00:00Z';
    ap.updated_at = '2000-01-01T00:00:00Z';
    // Clear ap_model reference if present
    if ('ap_model' in ap) (ap as unknown as Record<string, unknown>).ap_model = null;
  }

  // Sanitize candidates
  for (let i = 0; i < clone.project.ctx.candidates.length; i++) {
    const c = clone.project.ctx.candidates[i]!;
    c.label = `Candidate-${i + 1}`;
    if ('notes' in c) (c as unknown as Record<string, unknown>).notes = undefined;
  }

  // Sanitize constraintZones
  for (const z of clone.project.ctx.constraintZones) {
    if ('notes' in z) (z as unknown as Record<string, unknown>).notes = undefined;
  }

  // Sanitize priorityZones
  for (let i = 0; i < clone.project.ctx.priorityZones.length; i++) {
    const pz = clone.project.ctx.priorityZones[i]!;
    pz.label = `Zone-${i + 1}`;
  }

  // Remap apCapabilities keys
  clone.project.ctx.apCapabilities = clone.project.ctx.apCapabilities.map(
    ([oldKey, value]) => [idMap.get(oldKey) ?? oldKey, value] as [string, unknown],
  );

  return clone;
}
