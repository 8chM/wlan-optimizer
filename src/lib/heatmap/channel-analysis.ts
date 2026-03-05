/**
 * Channel conflict detection and analysis for WLAN access points.
 *
 * Detects:
 * - Co-channel interference: APs on the same channel within range
 * - Adjacent channel interference: APs on nearby channels (2.4 GHz 1-6-11 rule)
 *
 * Returns conflict scores and recommendations for each AP pair.
 */

import type { AccessPointResponse } from '$lib/api/invoke';

// ─── Types ──────────────────────────────────────────────────────

/** Frequency band for analysis */
export type AnalysisBand = '2.4ghz' | '5ghz';

/** Conflict type */
export type ConflictType = 'co-channel' | 'adjacent-channel';

/** Conflict severity */
export type ConflictSeverity = 'high' | 'medium' | 'low';

/** A detected channel conflict between two APs */
export interface ChannelConflict {
  /** First AP ID */
  ap1Id: string;
  /** Second AP ID */
  ap2Id: string;
  /** Type of interference */
  type: ConflictType;
  /** Conflict score (0-1, higher = worse) */
  score: number;
  /** Severity based on score */
  severity: ConflictSeverity;
  /** Distance between the two APs in meters */
  distanceM: number;
  /** Channel of AP1 */
  channel1: number;
  /** Channel of AP2 */
  channel2: number;
  /** Recommended action */
  recommendation: string;
}

/** Per-AP conflict summary */
export interface APConflictSummary {
  apId: string;
  label: string;
  channel: number;
  totalConflicts: number;
  worstScore: number;
  worstSeverity: ConflictSeverity;
}

/** Full analysis result */
export interface ChannelAnalysisResult {
  /** All detected conflicts */
  conflicts: ChannelConflict[];
  /** Per-AP summaries */
  apSummaries: APConflictSummary[];
  /** Frequency band analyzed */
  band: AnalysisBand;
}

// ─── Constants ──────────────────────────────────────────────────

/** Effective range in meters for each band (conservative estimates) */
const EFFECTIVE_RANGE_M: Record<AnalysisBand, number> = {
  '2.4ghz': 35,
  '5ghz': 20,
};

/**
 * Allowed channel pools per band.
 * 5 GHz: UNII-1 only (no DFS, no UNII-3) — safest for home setups.
 * 2.4 GHz: Non-overlapping channels only.
 */
export const ALLOWED_CHANNELS: Record<AnalysisBand, readonly number[]> = {
  '2.4ghz': [1, 6, 11],
  '5ghz': [36, 40, 44, 48],
} as const;

/**
 * Non-overlapping channel sets for 2.4 GHz.
 * Channels 1, 6, 11 don't overlap each other.
 * Adjacent overlap depends on channel distance.
 */
const MAX_ADJACENT_OFFSET_24GHZ = 4;

// ─── Functions ──────────────────────────────────────────────────

/**
 * Calculate the Euclidean distance between two APs.
 */
function distanceBetweenAPs(ap1: AccessPointResponse, ap2: AccessPointResponse): number {
  const dx = ap1.x - ap2.x;
  const dy = ap1.y - ap2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get the channel for an AP on the given band.
 */
function getChannel(ap: AccessPointResponse, band: AnalysisBand): number | null {
  if (band === '2.4ghz') return ap.channel_24ghz ?? null;
  return ap.channel_5ghz ?? null;
}

/**
 * Get the TX power for an AP on the given band.
 */
function getTxPower(ap: AccessPointResponse, band: AnalysisBand): number {
  if (band === '2.4ghz') return ap.tx_power_24ghz_dbm ?? 17;
  return ap.tx_power_5ghz_dbm ?? 20;
}

/**
 * Estimate effective range based on TX power and band.
 * Higher TX power = larger range.
 */
function estimateRange(ap: AccessPointResponse, band: AnalysisBand): number {
  const baseRange = EFFECTIVE_RANGE_M[band];
  const txPower = getTxPower(ap, band);
  const maxPower = band === '2.4ghz' ? 23 : 26;

  // Scale range linearly with TX power ratio
  const powerRatio = txPower / maxPower;
  return baseRange * powerRatio;
}

/**
 * Determine conflict severity from score.
 */
function scoreSeverity(score: number): ConflictSeverity {
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

/**
 * Analyze channel conflicts for all APs on a given band.
 */
export function analyzeChannelConflicts(
  accessPoints: AccessPointResponse[],
  band: AnalysisBand,
): ChannelAnalysisResult {
  const enabledAPs = accessPoints.filter((ap) => ap.enabled);
  const conflicts: ChannelConflict[] = [];

  // Check every pair of APs
  for (let i = 0; i < enabledAPs.length; i++) {
    for (let j = i + 1; j < enabledAPs.length; j++) {
      const ap1 = enabledAPs[i]!;
      const ap2 = enabledAPs[j]!;

      const ch1 = getChannel(ap1, band);
      const ch2 = getChannel(ap2, band);

      // Skip APs without channel assignment
      if (ch1 === null || ch2 === null) continue;

      const distance = distanceBetweenAPs(ap1, ap2);
      const range1 = estimateRange(ap1, band);
      const range2 = estimateRange(ap2, band);
      const effectiveRange = Math.max(range1, range2);

      // Only check APs within range of each other
      if (distance > effectiveRange) continue;

      const distanceFactor = 1 - (distance / effectiveRange);
      const channelDiff = Math.abs(ch1 - ch2);

      if (channelDiff === 0) {
        // Co-channel interference
        const score = 1.0 * distanceFactor;
        conflicts.push({
          ap1Id: ap1.id,
          ap2Id: ap2.id,
          type: 'co-channel',
          score,
          severity: scoreSeverity(score),
          distanceM: distance,
          channel1: ch1,
          channel2: ch2,
          recommendation: `Change one AP to a non-overlapping channel`,
        });
      } else if (band === '2.4ghz' && channelDiff <= MAX_ADJACENT_OFFSET_24GHZ) {
        // Adjacent channel interference (2.4 GHz only)
        const channelFactor = 1 - (channelDiff / (MAX_ADJACENT_OFFSET_24GHZ + 1));
        const score = 0.5 * channelFactor * distanceFactor;

        if (score > 0.05) {
          conflicts.push({
            ap1Id: ap1.id,
            ap2Id: ap2.id,
            type: 'adjacent-channel',
            score,
            severity: scoreSeverity(score),
            distanceM: distance,
            channel1: ch1,
            channel2: ch2,
            recommendation: `Use non-overlapping channels (1, 6, or 11)`,
          });
        }
      }
      // 5 GHz channels don't have adjacent channel interference
      // with proper channel spacing (20/40/80 MHz)
    }
  }

  // Sort by score (worst first)
  conflicts.sort((a, b) => b.score - a.score);

  // Build per-AP summaries
  const apSummaries = buildAPSummaries(enabledAPs, conflicts, band);

  return { conflicts, apSummaries, band };
}

/**
 * Build per-AP conflict summaries.
 */
function buildAPSummaries(
  aps: AccessPointResponse[],
  conflicts: ChannelConflict[],
  band: AnalysisBand,
): APConflictSummary[] {
  return aps.map((ap) => {
    const apConflicts = conflicts.filter(
      (c) => c.ap1Id === ap.id || c.ap2Id === ap.id,
    );

    const worstScore = apConflicts.length > 0
      ? Math.max(...apConflicts.map((c) => c.score))
      : 0;

    return {
      apId: ap.id,
      label: ap.label ?? 'AP',
      channel: getChannel(ap, band) ?? 0,
      totalConflicts: apConflicts.length,
      worstScore,
      worstSeverity: scoreSeverity(worstScore),
    };
  });
}

/**
 * Get recommended channels for an AP to minimize conflicts.
 * Returns up to 3 best channel options.
 */
export function getRecommendedChannels(
  apId: string,
  accessPoints: AccessPointResponse[],
  band: AnalysisBand,
): number[] {
  const candidateChannels = [...ALLOWED_CHANNELS[band]];

  const ap = accessPoints.find((a) => a.id === apId);
  if (!ap) return candidateChannels.slice(0, 3);

  // Score each candidate channel
  const channelScores = candidateChannels.map((ch) => {
    let totalConflictScore = 0;

    for (const other of accessPoints) {
      if (other.id === apId || !other.enabled) continue;
      const otherCh = getChannel(other, band);
      if (otherCh === null) continue;

      const distance = distanceBetweenAPs(ap, other);
      const range = Math.max(estimateRange(ap, band), estimateRange(other, band));

      if (distance > range) continue;

      const distanceFactor = 1 - (distance / range);
      const channelDiff = Math.abs(ch - otherCh);

      if (channelDiff === 0) {
        totalConflictScore += 1.0 * distanceFactor;
      } else if (band === '2.4ghz' && channelDiff <= MAX_ADJACENT_OFFSET_24GHZ) {
        const channelFactor = 1 - (channelDiff / (MAX_ADJACENT_OFFSET_24GHZ + 1));
        totalConflictScore += 0.5 * channelFactor * distanceFactor;
      }
    }

    return { channel: ch, score: totalConflictScore };
  });

  // Sort by least conflict
  channelScores.sort((a, b) => a.score - b.score);

  return channelScores.slice(0, 3).map((cs) => cs.channel);
}
