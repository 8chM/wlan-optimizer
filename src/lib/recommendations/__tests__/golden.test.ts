/**
 * Golden File Regression Tests — "Real Project Replay"
 *
 * Tests that the recommendation engine produces identical output for known
 * input scenarios. Changes to the engine that alter recommendations show
 * up as diffs in the golden expected.json files, making them reviewable.
 *
 * To update golden files after an intentional engine change:
 *   GOLDEN_UPDATE=1 npx vitest run golden.test.ts
 *
 * Golden cases:
 *   G1-G8: Synthetic fixtures (regression-fixtures.ts)
 *   G9: Home-Office (create-rf1.ts, realistic 3-AP scenario)
 *   G10: User House (create-rf2.ts, 4-AP + walls + PZ + channel conflict)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateRecommendations } from '../generator';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { Recommendation, RecommendationContext } from '../types';
import { EMPTY_CONTEXT } from '../types';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import {
  createF1DenseCluster,
  createF2RoamingConflict,
  createF3UplinkLimited,
  createF4NoNewCable,
  createF5FarCandidates,
  createF6StickyTinyHandoff,
  createF7UplinkWeakCoverage,
  createF8CandidateRequiredNoNear,
} from './fixtures/regression-fixtures';
import { createRf1HomeOffice } from './fixtures/create-rf1';
import { createRf2UserHouse } from './fixtures/create-rf2';
import { createRf3MyHouse } from './fixtures/create-rf3';
import { createRf4UserLive } from './fixtures/create-rf4';
import { createRf5UserLiveV2 } from './fixtures/create-rf5';
import { createRf6UserMyhouse } from './fixtures/create-rf6-user-myhouse';

const __testdir = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__testdir, 'golden');
const BAND = '5ghz' as const;
const RF_CONFIG = createRFConfig(BAND);
const UPDATE_MODE = process.env.GOLDEN_UPDATE === '1';

// ─── Serialization Helpers ──────────────────────────────────────

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

// ─── Normalization ──────────────────────────────────────────────

interface NormalizedRec {
  type: string;
  affectedApIds: string[];
  affectedBand: string;
  priority: string;
  severity: string;
  titleKey: string;
  reasonKey: string;
  suggestedChange?: {
    parameter: string;
    suggestedValue: unknown;
  };
  evidenceKeys: string[];
}

/** Strip unstable fields (IDs, floats) and keep only auditable fields. */
function normalizeRec(rec: Recommendation): NormalizedRec {
  const result: NormalizedRec = {
    type: rec.type,
    affectedApIds: [...rec.affectedApIds].sort(),
    affectedBand: rec.affectedBand,
    priority: rec.priority,
    severity: rec.severity,
    titleKey: rec.titleKey,
    reasonKey: rec.reasonKey,
    evidenceKeys: Object.keys(rec.evidence?.metrics ?? {}).sort(),
  };
  if (rec.suggestedChange) {
    result.suggestedChange = {
      parameter: rec.suggestedChange.parameter,
      suggestedValue: rec.suggestedChange.suggestedValue,
    };
  }
  return result;
}

/** Recursively collects all recommendations including nested alternatives. */
function collectAll(recs: Recommendation[]): Recommendation[] {
  const result: Recommendation[] = [];
  for (const rec of recs) {
    result.push(rec);
    if (rec.alternativeRecommendations) {
      result.push(...collectAll(rec.alternativeRecommendations));
    }
  }
  return result;
}

/** Normalize entire engine output for stable golden comparison. */
function normalizeOutput(recs: Recommendation[]): NormalizedRec[] {
  return collectAll(recs).map(normalizeRec);
}

// ─── Diff Helper ────────────────────────────────────────────────

interface GoldenDiff {
  added: NormalizedRec[];
  removed: NormalizedRec[];
  changed: { expected: NormalizedRec; actual: NormalizedRec }[];
}

/** Create a stable key for matching recs across expected/actual. */
function recKey(rec: NormalizedRec): string {
  return `${rec.type}|${rec.affectedApIds.join(',')}|${rec.titleKey}`;
}

/** Compute structured diff between expected and actual golden output. */
function computeDiff(expected: NormalizedRec[], actual: NormalizedRec[]): GoldenDiff {
  const expectedMap = new Map(expected.map(r => [recKey(r), r]));
  const actualMap = new Map(actual.map(r => [recKey(r), r]));

  const added: NormalizedRec[] = [];
  const removed: NormalizedRec[] = [];
  const changed: { expected: NormalizedRec; actual: NormalizedRec }[] = [];

  for (const [key, rec] of actualMap) {
    if (!expectedMap.has(key)) {
      added.push(rec);
    } else if (JSON.stringify(rec) !== JSON.stringify(expectedMap.get(key))) {
      changed.push({ expected: expectedMap.get(key)!, actual: rec });
    }
  }
  for (const [key, rec] of expectedMap) {
    if (!actualMap.has(key)) {
      removed.push(rec);
    }
  }

  return { added, removed, changed };
}

/** Format a diff for human-readable output (top 10 changes). */
function formatDiff(diff: GoldenDiff): string {
  const lines: string[] = [];
  if (diff.added.length > 0) {
    lines.push(`\n  ADDED (${diff.added.length}):`);
    for (const rec of diff.added.slice(0, 5)) {
      lines.push(`    + ${rec.type} [${rec.affectedApIds.join(',')}] ${rec.priority}/${rec.severity}`);
    }
  }
  if (diff.removed.length > 0) {
    lines.push(`\n  REMOVED (${diff.removed.length}):`);
    for (const rec of diff.removed.slice(0, 5)) {
      lines.push(`    - ${rec.type} [${rec.affectedApIds.join(',')}] ${rec.priority}/${rec.severity}`);
    }
  }
  if (diff.changed.length > 0) {
    lines.push(`\n  CHANGED (${diff.changed.length}):`);
    for (const { expected, actual } of diff.changed.slice(0, 5)) {
      lines.push(`    ~ ${actual.type} [${actual.affectedApIds.join(',')}]:`);
      if (expected.priority !== actual.priority) lines.push(`      priority: ${expected.priority} → ${actual.priority}`);
      if (expected.severity !== actual.severity) lines.push(`      severity: ${expected.severity} → ${actual.severity}`);
      if (expected.reasonKey !== actual.reasonKey) lines.push(`      reasonKey: ${expected.reasonKey} → ${actual.reasonKey}`);
      if (JSON.stringify(expected.suggestedChange) !== JSON.stringify(actual.suggestedChange)) {
        lines.push(`      suggestedChange: ${JSON.stringify(expected.suggestedChange)} → ${JSON.stringify(actual.suggestedChange)}`);
      }
      if (JSON.stringify(expected.evidenceKeys) !== JSON.stringify(actual.evidenceKeys)) {
        lines.push(`      evidenceKeys: [${expected.evidenceKeys}] → [${actual.evidenceKeys}]`);
      }
    }
  }
  return lines.join('\n');
}

// ─── Load / Generate Golden Files ───────────────────────────────

interface GoldenCase {
  name: string;
  create: () => ReturnType<typeof createF1DenseCluster>;
}

const GOLDEN_CASES: GoldenCase[] = [
  { name: 'g1-dense-cluster', create: createF1DenseCluster },
  { name: 'g2-roaming-conflict', create: createF2RoamingConflict },
  { name: 'g3-uplink-limited', create: createF3UplinkLimited },
  { name: 'g4-no-new-cable', create: createF4NoNewCable },
  { name: 'g5-far-candidates', create: createF5FarCandidates },
  { name: 'g6-sticky-tiny-handoff', create: createF6StickyTinyHandoff },
  { name: 'g7-uplink-weak-coverage', create: createF7UplinkWeakCoverage },
  { name: 'g8-candidate-required-no-near', create: createF8CandidateRequiredNoNear },
  { name: 'g9-home-office', create: createRf1HomeOffice },
  { name: 'g10-rf2-user-house', create: createRf2UserHouse },
  { name: 'g11-rf3-my-house', create: createRf3MyHouse },
  { name: 'g12-rf4-user-live', create: createRf4UserLive },
  { name: 'g13-rf5-user-live-v2', create: createRf5UserLiveV2 },
  { name: 'g14-user-myhouse', create: createRf6UserMyhouse },
];

/** Generate golden input files (project.json + stats.json) from fixture. */
function ensureInputFiles(caseName: string, fixture: ReturnType<typeof createF1DenseCluster>): void {
  const dir = join(GOLDEN_DIR, caseName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const projectPath = join(dir, 'project.json');
  if (!existsSync(projectPath)) {
    // Serialize ctx with Map→Array conversion for JSON compatibility
    const ctxForJson = {
      ...fixture.ctx,
      apCapabilities: Array.from(fixture.ctx.apCapabilities.entries()),
    };
    writeFileSync(projectPath, JSON.stringify({
      aps: fixture.aps,
      accessPoints: fixture.apResps,
      walls: fixture.walls,
      bounds: fixture.bounds,
      band: BAND,
      profile: 'balanced',
      ctx: ctxForJson,
    }, null, 2));
  }

  const statsPath = join(dir, 'stats.json');
  if (!existsSync(statsPath)) {
    writeFileSync(statsPath, JSON.stringify(serializeStats(fixture.stats), null, 2));
  }
}

/** Load golden input from files and reconstruct TypedArrays + Maps. */
function loadGolden(caseName: string) {
  const dir = join(GOLDEN_DIR, caseName);
  const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf-8'));
  const statsData = JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf-8'));
  const stats = deserializeStats(statsData);

  // Reconstruct ctx with Map from serialized Array entries
  if (project.ctx) {
    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      ...project.ctx,
      apCapabilities: new Map(project.ctx.apCapabilities ?? []),
    };
    project.ctx = ctx;
  }

  return { project, stats };
}

/** Load expected golden output, or return null if not yet generated. */
function loadExpected(caseName: string): NormalizedRec[] | null {
  const path = join(GOLDEN_DIR, caseName, 'expected.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** Write expected golden output. */
function writeExpected(caseName: string, recs: NormalizedRec[]): void {
  const path = join(GOLDEN_DIR, caseName, 'expected.json');
  writeFileSync(path, JSON.stringify(recs, null, 2) + '\n');
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Golden File Regression Tests', () => {
  // Generate input files from fixtures (idempotent)
  beforeAll(() => {
    for (const gc of GOLDEN_CASES) {
      const fixture = gc.create();
      ensureInputFiles(gc.name, fixture);
    }
  });

  for (const gc of GOLDEN_CASES) {
    describe(gc.name, () => {
      it('produces expected recommendations (golden replay)', () => {
        const { project, stats } = loadGolden(gc.name);

        const result = generateRecommendations(
          project.aps,
          project.accessPoints,
          project.walls,
          project.bounds,
          project.band,
          stats,
          RF_CONFIG,
          project.profile,
          project.ctx,
        );

        const actual = normalizeOutput(result.recommendations);
        const loaded = loadExpected(gc.name);

        if (loaded === null && !UPDATE_MODE) {
          expect.fail(
            `Golden file missing for ${gc.name}.\n` +
            `  expected.json does not exist — cannot validate.\n` +
            `  To generate: GOLDEN_UPDATE=1 npx vitest run golden.test.ts\n`,
          );
        }

        if (UPDATE_MODE) {
          writeExpected(gc.name, actual);
          // eslint-disable-next-line no-console
          console.log(`[golden] ${loaded === null ? 'Generated' : 'Updated'} expected.json for ${gc.name} (${actual.length} recs)`);
          return;
        }

        const expected = loaded!;

        // Compare with diff-friendly output on mismatch
        const diff = computeDiff(expected, actual);
        const hasDiff = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

        if (hasDiff) {
          const diffText = formatDiff(diff);
          expect.fail(
            `Golden mismatch for ${gc.name}:\n` +
            `  Expected ${expected.length} recs, got ${actual.length} recs.\n` +
            diffText +
            '\n\n  To accept these changes: GOLDEN_UPDATE=1 npx vitest run golden.test.ts\n',
          );
        }

        // Count check as fallback
        expect(actual.length, 'recommendation count').toBe(expected.length);
      });

      it('golden output exists and is valid array', () => {
        const expected = loadExpected(gc.name);
        expect(expected, `${gc.name}/expected.json must exist`).not.toBeNull();
        expect(Array.isArray(expected), `${gc.name} expected must be an array`).toBe(true);
        // g6 correctly produces 0 recs — BI-1 conflict pressure guard suppresses width recs
        if (gc.name !== 'g6-sticky-tiny-handoff') {
          expect(expected!.length, `${gc.name} must have at least 1 rec`).toBeGreaterThan(0);
        }
      });

      it('golden input files exist and are valid', () => {
        const dir = join(GOLDEN_DIR, gc.name);
        expect(existsSync(join(dir, 'project.json')), 'project.json must exist').toBe(true);
        expect(existsSync(join(dir, 'stats.json')), 'stats.json must exist').toBe(true);

        const project = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf-8'));
        expect(Array.isArray(project.aps), 'project.aps must be array').toBe(true);
        expect(project.band, 'project.band must be set').toBe(BAND);

        const stats = JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf-8'));
        expect(Array.isArray(stats.rssiGrid), 'stats.rssiGrid must be array').toBe(true);
        expect(stats.gridWidth, 'stats.gridWidth must be set').toBeGreaterThan(0);
      });
    });
  }

  // Cross-case invariant: no two golden cases produce identical output
  it('golden cases produce distinct recommendation sets', () => {
    const outputs: string[] = [];
    for (const gc of GOLDEN_CASES) {
      const expected = loadExpected(gc.name);
      outputs.push(JSON.stringify(expected));
    }
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        expect(
          outputs[i] !== outputs[j],
          `${GOLDEN_CASES[i]!.name} and ${GOLDEN_CASES[j]!.name} must produce different recommendations`,
        ).toBe(true);
      }
    }
  });

  // ─── g9-g14 shared guardrails (Phase 28av/28bj) ─────────────────

  const REAL_WORLD_CASES = [
    'g9-home-office',
    'g10-rf2-user-house',
    'g11-rf3-my-house',
    'g12-rf4-user-live',
    'g13-rf5-user-live-v2',
    'g14-user-myhouse',
  ] as const;

  describe('g9-g14 shared guardrails', () => {
    for (const name of REAL_WORLD_CASES) {
      it(`${name}: no phantom add_ap without evidence`, () => {
        const expected = loadExpected(name);
        expect(expected, `${name} expected.json must exist`).not.toBeNull();
        const addApRecs = expected!.filter(r => r.type === 'add_ap');
        for (const rec of addApRecs) {
          expect(
            rec.evidenceKeys.length > 0,
            `${name}: add_ap must have evidenceKeys`,
          ).toBe(true);
        }
      });

      it(`${name}: infrastructure_required max 2`, () => {
        const expected = loadExpected(name);
        expect(expected, `${name} expected.json must exist`).not.toBeNull();
        const infraRecs = expected!.filter(r => r.type === 'infrastructure_required');
        expect(infraRecs.length, `${name}: infra_required capped at 2`).toBeLessThanOrEqual(2);
      });

      it(`${name}: channel recs bounded at 5`, () => {
        const expected = loadExpected(name);
        expect(expected, `${name} expected.json must exist`).not.toBeNull();
        const channelRecs = expected!.filter(r => r.type === 'change_channel');
        expect(channelRecs.length, `${name}: channel recs bounded`).toBeLessThanOrEqual(5);
      });

      it(`${name}: roaming_tx_adjustment must not regress (informational or non-regressing)`, () => {
        const expected = loadExpected(name);
        expect(expected, `${name} expected.json must exist`).not.toBeNull();
        const roamingRecs = expected!.filter(r => r.type === 'roaming_tx_adjustment');
        for (const rec of roamingRecs) {
          // Must be informational (severity=info) OR have non-regressing evidence
          const isInformational = rec.severity === 'info' || rec.priority === 'low';
          // If not informational, evidenceKeys must indicate positive outcome
          if (!isInformational) {
            expect(
              rec.evidenceKeys.length > 0,
              `${name}: actionable roaming_tx_adjustment must have evidence`,
            ).toBe(true);
          }
        }
      });
    }
  });

  // ─── g9 (RF1 Home Office) specific guardrails ──────────────────
  describe('g9-home-office guardrails', () => {
    it('g9: no add_ap in golden output (required policy)', () => {
      const expected = loadExpected('g9-home-office');
      expect(expected, 'g9 expected.json must exist').not.toBeNull();
      expect(expected!.filter(r => r.type === 'add_ap').length, 'g9: no add_ap').toBe(0);
    });

    it('g9: all recs have valid type and evidenceKeys', () => {
      const expected = loadExpected('g9-home-office');
      expect(expected, 'g9 expected.json must exist').not.toBeNull();
      for (const rec of expected!) {
        expect(rec.type, 'type must be non-empty').toBeTruthy();
        expect(Array.isArray(rec.evidenceKeys), `${rec.type} must have evidenceKeys array`).toBe(true);
        expect(rec.evidenceKeys.length, `${rec.type} must have ≥1 evidenceKey`).toBeGreaterThan(0);
      }
    });
  });

  // ─── g10 (RF2 User House) specific guardrails ─────────────────
  describe('g10-rf2-user-house guardrails', () => {
    it('g10: no add_ap in golden output (required policy)', () => {
      const expected = loadExpected('g10-rf2-user-house');
      expect(expected, 'g10 expected.json must exist').not.toBeNull();
      expect(expected!.filter(r => r.type === 'add_ap').length, 'g10: no add_ap').toBe(0);
    });

    it('g10: all recs have valid type and evidenceKeys', () => {
      const expected = loadExpected('g10-rf2-user-house');
      expect(expected, 'g10 expected.json must exist').not.toBeNull();
      for (const rec of expected!) {
        expect(rec.type, 'type must be non-empty').toBeTruthy();
        expect(Array.isArray(rec.evidenceKeys), `${rec.type} must have evidenceKeys array`).toBe(true);
        expect(rec.evidenceKeys.length, `${rec.type} must have ≥1 evidenceKey`).toBeGreaterThan(0);
      }
    });

    it('g10: channel recs have correct parameter', () => {
      const expected = loadExpected('g10-rf2-user-house');
      expect(expected, 'g10 expected.json must exist').not.toBeNull();
      const channelRecs = expected!.filter(r => r.type === 'change_channel');
      for (const rec of channelRecs) {
        expect(rec.suggestedChange?.parameter).toBe('channel_5ghz');
      }
    });
  });

  // ─── g11 (RF3 My House) specific guardrails ─────────────────────
  describe('g11-rf3-my-house guardrails', () => {
    it('g11: no phantom add_ap in golden output', () => {
      const expected = loadExpected('g11-rf3-my-house');
      expect(expected, 'g11 expected.json must exist').not.toBeNull();

      const addApRecs = expected!.filter(r => r.type === 'add_ap');
      expect(addApRecs.length, 'g11 must not contain phantom add_ap (strict policy)').toBe(0);
    });

    it('g11: all recs have valid type and evidenceKeys', () => {
      const expected = loadExpected('g11-rf3-my-house');
      expect(expected, 'g11 expected.json must exist').not.toBeNull();

      for (const rec of expected!) {
        expect(rec.type, 'type must be non-empty').toBeTruthy();
        expect(Array.isArray(rec.evidenceKeys), `${rec.type} must have evidenceKeys array`).toBe(true);
        expect(rec.evidenceKeys.length, `${rec.type} must have at least 1 evidenceKey`).toBeGreaterThan(0);
      }
    });

    it('g11: adjust_channel_width suppressed at low conflict pressure (BI-1)', () => {
      const expected = loadExpected('g11-rf3-my-house');
      expect(expected, 'g11 expected.json must exist').not.toBeNull();

      // RF3 APs have low co-channel conflict pressure (worstScore < 0.35),
      // so the BI-1 guard correctly suppresses width recs
      const widthRecs = expected!.filter(r => r.type === 'adjust_channel_width');
      expect(widthRecs.length, 'g11 width recs suppressed by BI-1 conflict guard').toBe(0);
    });

    it('g11: sticky_client_risk recs are informational', () => {
      const expected = loadExpected('g11-rf3-my-house');
      expect(expected, 'g11 expected.json must exist').not.toBeNull();

      const stickyRecs = expected!.filter(r => r.type === 'sticky_client_risk');
      for (const rec of stickyRecs) {
        expect(rec.severity, `sticky_client_risk severity`).toBe('info');
        expect(rec.priority, `sticky_client_risk priority`).toBe('low');
      }
    });
  });

  // ─── g12 (RF4 User Live) specific guardrails ───────────────────
  describe('g12-rf4-user-live guardrails', () => {
    it('g12: no phantom add_ap without evidence', () => {
      const expected = loadExpected('g12-rf4-user-live');
      expect(expected, 'g12 expected.json must exist').not.toBeNull();

      // With optional policy, add_ap may exist but must be traceable
      const addApRecs = expected!.filter(r => r.type === 'add_ap');
      for (const rec of addApRecs) {
        // Must have either suggestedChange or evidenceKeys with weakCells
        expect(
          rec.evidenceKeys.length > 0,
          `add_ap must have evidenceKeys`,
        ).toBe(true);
      }
    });

    it('g12: all recs have valid evidenceKeys', () => {
      const expected = loadExpected('g12-rf4-user-live');
      expect(expected, 'g12 expected.json must exist').not.toBeNull();

      for (const rec of expected!) {
        expect(rec.type, 'type must be non-empty').toBeTruthy();
        expect(Array.isArray(rec.evidenceKeys), `${rec.type} must have evidenceKeys array`).toBe(true);
        expect(rec.evidenceKeys.length, `${rec.type} must have at least 1 evidenceKey`).toBeGreaterThan(0);
      }
    });

    it('g12: bounded infrastructure_required recs', () => {
      const expected = loadExpected('g12-rf4-user-live');
      expect(expected, 'g12 expected.json must exist').not.toBeNull();

      const infraRecs = expected!.filter(r => r.type === 'infrastructure_required');
      expect(infraRecs.length, 'infra_required bounded').toBeLessThanOrEqual(3);
    });

    it('g12: bounded channel recs', () => {
      const expected = loadExpected('g12-rf4-user-live');
      expect(expected, 'g12 expected.json must exist').not.toBeNull();

      const channelRecs = expected!.filter(r => r.type === 'change_channel');
      expect(channelRecs.length, 'channel recs bounded').toBeLessThanOrEqual(5);

      // Each must have correct parameter
      for (const rec of channelRecs) {
        expect(rec.suggestedChange?.parameter).toBe('channel_5ghz');
      }
    });
  });

  // ─── CR-C: Candidate-Only Guarantee in golden output (Phase 28aw) ─
  describe('CR-C: Candidate-Only Guarantee — golden hard guard', () => {
    // Required-policy cases: g9 (RF1), g10 (RF2), g11 (RF3), g13 (RF5) — no add_ap without evidence of candidate
    const REQUIRED_CASES = [
      { name: 'g9-home-office', policy: 'required_for_new_ap' },
      { name: 'g10-rf2-user-house', policy: 'required_for_new_ap' },
      { name: 'g11-rf3-my-house', policy: 'required_for_move_and_new_ap' },
      { name: 'g13-rf5-user-live-v2', policy: 'required_for_new_ap' },
      { name: 'g14-user-myhouse', policy: 'required_for_new_ap' },
    ] as const;

    for (const { name, policy } of REQUIRED_CASES) {
      it(`CR-C: ${name} (${policy}) — no add_ap with usedFallback in golden`, () => {
        const expected = loadExpected(name);
        expect(expected, `${name} expected.json must exist`).not.toBeNull();

        const addApRecs = expected!.filter(r => r.type === 'add_ap');
        for (const rec of addApRecs) {
          // Under required policy, add_ap must NOT carry usedFallback evidence
          expect(
            rec.evidenceKeys.includes('usedFallback'),
            `${name}: add_ap must not have usedFallback (required policy forbids fallback)`,
          ).toBe(false);
        }
      });
    }

    // Optional-policy case: g12 (RF4) — fallback add_ap must have usedFallback
    it('CR-C: g12-rf4-user-live (optional) — add_ap with usedFallback is valid', () => {
      const expected = loadExpected('g12-rf4-user-live');
      expect(expected, 'g12 expected.json must exist').not.toBeNull();

      const addApRecs = expected!.filter(r => r.type === 'add_ap');
      for (const rec of addApRecs) {
        // Under optional policy: either has candidateCount (matched) or usedFallback (fallback)
        const hasCandidate = rec.evidenceKeys.includes('candidateCount');
        const hasFallback = rec.evidenceKeys.includes('usedFallback');
        expect(
          hasCandidate || hasFallback || rec.evidenceKeys.includes('weakCells'),
          `g12: add_ap must have candidateCount, usedFallback, or weakCells in evidence`,
        ).toBe(true);
      }
    });
  });

  // ─── g13 (RF5 User Live v2, uplink-limited) specific guardrails ─
  describe('g13-rf5-user-live-v2 guardrails', () => {
    it('g13: no phantom add_ap in golden output', () => {
      const expected = loadExpected('g13-rf5-user-live-v2');
      expect(expected, 'g13 expected.json must exist').not.toBeNull();

      // required_for_new_ap: add_ap must not appear without candidate evidence
      const addApRecs = expected!.filter(r => r.type === 'add_ap');
      for (const rec of addApRecs) {
        expect(
          rec.evidenceKeys.includes('weakCells') || rec.evidenceKeys.includes('candidateCount'),
          `add_ap must have weakCells or candidateCount in evidenceKeys`,
        ).toBe(true);
      }
    });

    it('g13: infra_required bounded', () => {
      const expected = loadExpected('g13-rf5-user-live-v2');
      expect(expected, 'g13 expected.json must exist').not.toBeNull();

      const infraRecs = expected!.filter(r => r.type === 'infrastructure_required');
      expect(infraRecs.length, 'infra_required bounded').toBeLessThanOrEqual(2);
    });

    it('g13: all recs have non-empty evidenceKeys', () => {
      const expected = loadExpected('g13-rf5-user-live-v2');
      expect(expected, 'g13 expected.json must exist').not.toBeNull();

      for (const rec of expected!) {
        expect(rec.type).toBeTruthy();
        expect(Array.isArray(rec.evidenceKeys)).toBe(true);
        expect(rec.evidenceKeys.length, `${rec.type} needs evidenceKeys`).toBeGreaterThan(0);
      }
    });

    it('g13: channel recs bounded', () => {
      const expected = loadExpected('g13-rf5-user-live-v2');
      expect(expected, 'g13 expected.json must exist').not.toBeNull();

      const channelRecs = expected!.filter(r => r.type === 'change_channel');
      expect(channelRecs.length, 'channel recs bounded').toBeLessThanOrEqual(5);
    });
  });

  // ─── g14 (RF6 User My House) specific guardrails ─────────────────
  describe('g14-user-myhouse guardrails', () => {
    it('g14: no phantom add_ap in golden output (required_for_new_ap)', () => {
      const expected = loadExpected('g14-user-myhouse');
      expect(expected, 'g14 expected.json must exist').not.toBeNull();

      const addApRecs = expected!.filter(r => r.type === 'add_ap');
      for (const rec of addApRecs) {
        expect(
          rec.evidenceKeys.includes('weakCells') || rec.evidenceKeys.includes('candidateCount'),
          `g14: add_ap must have weakCells or candidateCount`,
        ).toBe(true);
      }
    });

    it('g14: all recs have valid type and evidenceKeys', () => {
      const expected = loadExpected('g14-user-myhouse');
      expect(expected, 'g14 expected.json must exist').not.toBeNull();

      for (const rec of expected!) {
        expect(rec.type, 'type must be non-empty').toBeTruthy();
        expect(Array.isArray(rec.evidenceKeys), `${rec.type} must have evidenceKeys array`).toBe(true);
        expect(rec.evidenceKeys.length, `${rec.type} must have ≥1 evidenceKey`).toBeGreaterThan(0);
      }
    });

    it('g14: channel recs bounded and correct parameter', () => {
      const expected = loadExpected('g14-user-myhouse');
      expect(expected, 'g14 expected.json must exist').not.toBeNull();

      const channelRecs = expected!.filter(r => r.type === 'change_channel');
      expect(channelRecs.length, 'channel recs bounded at 5').toBeLessThanOrEqual(5);
      for (const rec of channelRecs) {
        expect(rec.suggestedChange?.parameter).toBe('channel_5ghz');
      }
    });

    it('g14: infrastructure_required bounded', () => {
      const expected = loadExpected('g14-user-myhouse');
      expect(expected, 'g14 expected.json must exist').not.toBeNull();

      const infraRecs = expected!.filter(r => r.type === 'infrastructure_required');
      expect(infraRecs.length, 'infra_required bounded at 2').toBeLessThanOrEqual(2);
    });

    it('g14: sticky_client_risk recs are informational', () => {
      const expected = loadExpected('g14-user-myhouse');
      expect(expected, 'g14 expected.json must exist').not.toBeNull();

      const stickyRecs = expected!.filter(r => r.type === 'sticky_client_risk');
      for (const rec of stickyRecs) {
        expect(rec.severity, 'sticky severity').toBe('info');
        expect(rec.priority, 'sticky priority').toBe('low');
      }
    });
  });
});
