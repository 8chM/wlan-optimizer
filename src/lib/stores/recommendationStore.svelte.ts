/**
 * Recommendation Store — Svelte 5 reactive store.
 *
 * Manages the recommendation analysis lifecycle, profile selection,
 * constraint context, candidate locations, and rejection workflow.
 *
 * Context fields are stored as SEPARATE $state variables to avoid
 * circular $effect dependencies when syncing from the editor page.
 */

import type { APConfig, WallData, FloorBounds } from '$lib/heatmap/worker-types';
import type { RFConfig } from '$lib/heatmap/rf-engine';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import type {
  AnalysisResult,
  ExpertProfile,
  Recommendation,
  RecommendationContext,
  CandidateLocation,
  ConstraintZone,
  APCapabilities,
  PriorityZone,
  RejectionReason,
  RecommendationRejection,
  CandidatePolicy,
} from '$lib/recommendations/types';
import { generateRecommendations } from '$lib/recommendations/generator';
import { applyRejection } from '$lib/recommendations/constraints';

function createRecommendationStore() {
  let result = $state<AnalysisResult | null>(null);
  let loading = $state(false);
  let profile = $state<ExpertProfile>('balanced');
  let selectedRecommendationId = $state<string | null>(null);

  // Context fields as separate state to avoid circular dependencies
  let ctxCandidates = $state<CandidateLocation[]>([]);
  let ctxConstraintZones = $state<ConstraintZone[]>([]);
  let ctxApCapabilities = $state<Map<string, APCapabilities>>(new Map());
  let ctxPriorityZones = $state<PriorityZone[]>([]);
  let ctxRejections = $state<RecommendationRejection[]>([]);
  let ctxCandidatePolicy = $state<CandidatePolicy>('required_for_new_ap');

  // Cache last analysis params for re-run after rejection
  let lastAnalysisParams = $state<{
    aps: APConfig[];
    accessPoints: AccessPointResponse[];
    walls: WallData[];
    bounds: FloorBounds;
    band: FrequencyBand;
    stats: HeatmapStats;
    rfConfig: RFConfig;
  } | null>(null);

  /** Build context object from separate state fields */
  function buildContext(): RecommendationContext {
    return {
      candidates: ctxCandidates,
      constraintZones: ctxConstraintZones,
      apCapabilities: ctxApCapabilities,
      priorityZones: ctxPriorityZones,
      rejections: ctxRejections,
      candidatePolicy: ctxCandidatePolicy,
    };
  }

  return {
    get result() { return result; },
    get loading() { return loading; },
    get profile() { return profile; },
    get selectedRecommendationId() { return selectedRecommendationId; },
    get context() { return buildContext(); },
    get candidatePolicy() { return ctxCandidatePolicy; },
    get lastAnalysisParams() { return lastAnalysisParams; },

    setProfile(p: ExpertProfile): void {
      profile = p;
    },

    selectRecommendation(id: string | null): void {
      selectedRecommendationId = id;
    },

    // ─── Context Management ──────────────────────────────
    // Each setter only writes its OWN field — no reading/spreading of context.

    setCandidates(candidates: CandidateLocation[]): void {
      ctxCandidates = candidates;
    },

    setConstraintZones(zones: ConstraintZone[]): void {
      ctxConstraintZones = zones;
    },

    setAPCapabilities(caps: APCapabilities[]): void {
      const map = new Map<string, APCapabilities>();
      for (const c of caps) map.set(c.apId, c);
      ctxApCapabilities = map;
    },

    setPriorityZones(zones: PriorityZone[]): void {
      ctxPriorityZones = zones;
    },

    setCandidatePolicy(policy: CandidatePolicy): void {
      ctxCandidatePolicy = policy;
    },

    // ─── Rejection Workflow ──────────────────────────────

    /** Reject a recommendation and re-run analysis with updated constraints */
    rejectAndRecompute(
      recommendationId: string,
      reason: RejectionReason,
      notes?: string,
    ): void {
      const rec = result?.recommendations.find(r => r.id === recommendationId);
      if (!rec || !lastAnalysisParams) return;

      const rejection: RecommendationRejection = {
        recommendationId,
        reason,
        notes,
      };

      // Apply rejection to context — updates all fields at once
      const updatedContext = applyRejection(buildContext(), rejection, rec);
      ctxCandidates = updatedContext.candidates;
      ctxConstraintZones = updatedContext.constraintZones;
      ctxApCapabilities = updatedContext.apCapabilities;
      ctxPriorityZones = updatedContext.priorityZones;
      ctxRejections = updatedContext.rejections ?? [];

      // Re-run analysis with updated context
      const p = lastAnalysisParams;
      this.analyze(p.aps, p.accessPoints, p.walls, p.bounds, p.band, p.stats, p.rfConfig);
    },

    // ─── Analysis ────────────────────────────────────────

    /** Run the analysis. Call after heatmap stats update. */
    analyze(
      aps: APConfig[],
      accessPoints: AccessPointResponse[],
      walls: WallData[],
      bounds: FloorBounds,
      band: FrequencyBand,
      stats: HeatmapStats,
      rfConfig: RFConfig,
    ): void {
      loading = true;
      try {
        // Cache params for rejection re-run
        lastAnalysisParams = { aps, accessPoints, walls, bounds, band, stats, rfConfig };

        result = generateRecommendations(
          aps, accessPoints, walls, bounds, band, stats, rfConfig, profile, buildContext(),
        );
      } finally {
        loading = false;
      }
    },

    reset(): void {
      result = null;
      selectedRecommendationId = null;
    },

    resetContext(): void {
      ctxCandidates = [];
      ctxConstraintZones = [];
      ctxApCapabilities = new Map();
      ctxPriorityZones = [];
      ctxRejections = [];
      ctxCandidatePolicy = 'required_for_new_ap';
    },
  };
}

/** Singleton recommendation store instance */
export const recommendationStore = createRecommendationStore();
