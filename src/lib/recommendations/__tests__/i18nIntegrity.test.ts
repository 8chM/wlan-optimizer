/**
 * i18n Key Integrity Tests — Phase 28aa
 *
 * Ensures all titleKey/reasonKey values emitted by the generator:
 * 1. Start with 'rec.' prefix
 * 2. Exist in both en.json and de.json
 * 3. No orphaned rec.* keys (exist in i18n but never referenced)
 *
 * Uses static extraction from generator source + live recommendation generation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateRecommendations } from '../generator';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import { EMPTY_CONTEXT } from '../types';
import type { Recommendation, RecommendationContext, CandidateLocation } from '../types';
import type { APConfig, FloorBounds, WallData } from '$lib/heatmap/worker-types';
import type { HeatmapStats } from '$lib/heatmap/heatmap-manager';
import type { AccessPointResponse } from '$lib/api/invoke';
import {
  createF1DenseCluster,
  createF2RoamingConflict,
  createF3UplinkLimited,
  createF3UplinkWithMustHavePZ,
} from './fixtures/regression-fixtures';

// ─── Load i18n JSON ──────────────────────────────────────────────

const I18N_DIR = resolve(__dirname, '../../../lib/i18n/messages');

function loadRecKeys(lang: string): Set<string> {
  const json = JSON.parse(readFileSync(resolve(I18N_DIR, `${lang}.json`), 'utf-8'));
  const recObj = json.rec;
  if (!recObj || typeof recObj !== 'object') return new Set();
  return new Set(Object.keys(recObj));
}

const EN_KEYS = loadRecKeys('en');
const DE_KEYS = loadRecKeys('de');

// ─── Extract all titleKey/reasonKey from generator source ────────

function extractKeysFromSource(): Set<string> {
  const src = readFileSync(resolve(__dirname, '../generator.ts'), 'utf-8');
  const keys = new Set<string>();

  // Match titleKey: 'rec.xxx' and reasonKey: 'rec.xxx'
  const pattern = /(?:titleKey|reasonKey):\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = pattern.exec(src)) !== null) {
    keys.add(match[1]!);
  }

  // Match ternary patterns: condition ? 'rec.xxx' : 'rec.yyy'
  const ternaryPattern = /(?:titleKey|reasonKey):\s*\w+[^,]*\?\s*['"`]([^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]/g;
  while ((match = ternaryPattern.exec(src)) !== null) {
    keys.add(match[1]!);
    keys.add(match[2]!);
  }

  return keys;
}

const SOURCE_KEYS = extractKeysFromSource();

// ─── Collect keys from live recommendation runs ──────────────────

function collectAllRecs(recs: Recommendation[]): Recommendation[] {
  const result: Recommendation[] = [];
  for (const rec of recs) {
    result.push(rec);
    if (rec.alternativeRecommendations) {
      result.push(...collectAllRecs(rec.alternativeRecommendations));
    }
  }
  return result;
}

function makeAP(id: string, x: number, y: number, overrides?: Partial<APConfig>): APConfig {
  return {
    id, x, y, txPowerDbm: 20, antennaGainDbi: 4.0, enabled: true,
    mounting: 'ceiling', orientationDeg: 0, heightM: 2.5,
    ...overrides,
  };
}

function makeAPResponse(id: string, x: number, y: number, ch5 = 36): AccessPointResponse {
  return {
    id, floor_id: 'floor-1', ap_model_id: 'test', x, y,
    label: id, enabled: true, mounting: 'ceiling', orientation_deg: 0, height_m: 2.5,
    tx_power_5ghz_dbm: 20, tx_power_24ghz_dbm: 17, tx_power_6ghz_dbm: null,
    channel_5ghz: ch5, channel_24ghz: 1, channel_6ghz: null,
    channel_width: '80', band_steering_enabled: false,
    ip_address: null, ssid: null, created_at: '', updated_at: '',
    ap_model: {
      id: 'test', name: 'Test AP', manufacturer: 'Test',
      antenna_gain_24ghz_dbi: 3.2, antenna_gain_5ghz_dbi: 4.3, antenna_gain_6ghz_dbi: 4.3,
    },
  } as unknown as AccessPointResponse;
}

function makeGrids(w: number, h: number) {
  const total = w * h;
  return {
    rssiGrid: new Float32Array(total).fill(-55),
    apIndexGrid: new Uint8Array(total),
    deltaGrid: new Float32Array(total).fill(20),
    overlapCountGrid: new Uint8Array(total).fill(1),
    uplinkLimitedGrid: new Uint8Array(total),
    secondBestApIndexGrid: new Uint8Array(total).fill(1),
  };
}

function collectLiveKeys(): Set<string> {
  const RF = createRFConfig('5ghz');
  const keys = new Set<string>();

  function harvest(recs: Recommendation[]) {
    for (const rec of collectAllRecs(recs)) {
      keys.add(rec.titleKey);
      if (rec.reasonKey) keys.add(rec.reasonKey);
    }
  }

  // Scenario 1: F1 Dense Cluster
  {
    const { aps, apResps, walls, bounds, stats } = createF1DenseCluster();
    const r = generateRecommendations(aps, apResps, walls, bounds, '5ghz', stats, RF, 'balanced');
    harvest(r.recommendations);
  }

  // Scenario 2: F2 Roaming Conflict
  {
    const { aps, apResps, walls, bounds, stats } = createF2RoamingConflict();
    const r = generateRecommendations(aps, apResps, walls, bounds, '5ghz', stats, RF, 'balanced');
    harvest(r.recommendations);
  }

  // Scenario 3: F3 Uplink Limited
  {
    const { aps, apResps, walls, bounds, stats } = createF3UplinkLimited();
    const r = generateRecommendations(aps, apResps, walls, bounds, '5ghz', stats, RF, 'balanced');
    harvest(r.recommendations);
  }

  // Scenario 4: F3b with mustHaveCoverage
  {
    const { aps, apResps, walls, bounds, stats, ctx } = createF3UplinkWithMustHavePZ();
    const r = generateRecommendations(aps, apResps, walls, bounds, '5ghz', stats, RF, 'balanced', ctx);
    harvest(r.recommendations);
  }

  // Scenario 5: Weak grid + required_for_new_ap + no candidates (triggers infrastructure_required)
  {
    const ap = makeAP('ap-1', 3, 5);
    const apResp = makeAPResponse('ap-1', 3, 5);
    const W = 20, H = 10;
    const grids = makeGrids(W, H);
    for (let r = 0; r < H; r++) {
      for (let c = 6; c < W; c++) {
        grids.rssiGrid[r * W + c] = -88;
      }
    }
    const stats: HeatmapStats = {
      minRSSI: -90, maxRSSI: -30, avgRSSI: -60, calculationTimeMs: 10,
      gridStep: 1.0, lodLevel: 2, totalCells: W * H, gridWidth: W, gridHeight: H,
      apIds: ['ap-1'],
      coverageBins: { excellent: 30, good: 10, fair: 10, poor: 50, none: 100 },
      ...grids,
    };
    const ctx: RecommendationContext = {
      ...EMPTY_CONTEXT,
      candidatePolicy: 'required_for_new_ap',
      candidates: [],
    };
    const r = generateRecommendations(
      [ap], [apResp], [], { width: W, height: H, originX: 0, originY: 0 },
      '5ghz', stats, RF, 'balanced', ctx,
    );
    harvest(r.recommendations);
  }

  // Scenario 6: 2 close APs same channel (triggers change_channel)
  {
    const aps = [makeAP('ap-1', 3, 5), makeAP('ap-2', 7, 5)];
    const apResps = [makeAPResponse('ap-1', 3, 5, 36), makeAPResponse('ap-2', 7, 5, 36)];
    const W = 10, H = 10;
    const grids = makeGrids(W, H);
    for (let i = 50; i < 100; i++) grids.apIndexGrid[i] = 1;
    const stats: HeatmapStats = {
      minRSSI: -80, maxRSSI: -30, avgRSSI: -50, calculationTimeMs: 10,
      gridStep: 1.0, lodLevel: 2, totalCells: W * H, gridWidth: W, gridHeight: H,
      apIds: ['ap-1', 'ap-2'],
      coverageBins: { excellent: 40, good: 30, fair: 20, poor: 8, none: 2 },
      ...grids,
    };
    const r = generateRecommendations(
      aps, apResps, [], { width: W, height: H, originX: 0, originY: 0 },
      '5ghz', stats, RF, 'balanced',
    );
    harvest(r.recommendations);
  }

  return keys;
}

const LIVE_KEYS = collectLiveKeys();

// ─── Tests ───────────────────────────────────────────────────────

describe('i18n Key Integrity (Phase 28aa)', () => {
  describe('I1: All source-extracted keys start with rec.', () => {
    it('every titleKey/reasonKey in generator.ts starts with rec.', () => {
      for (const key of SOURCE_KEYS) {
        expect(key, `Key "${key}" does not start with rec.`).toMatch(/^rec\./);
      }
    });

    it('extracts at least 20 unique keys from source', () => {
      expect(SOURCE_KEYS.size).toBeGreaterThanOrEqual(20);
    });
  });

  describe('I2: All source keys exist in en.json', () => {
    it('every key from generator.ts exists in en.json rec object', () => {
      const missing: string[] = [];
      for (const key of SOURCE_KEYS) {
        const suffix = key.replace('rec.', '');
        if (!EN_KEYS.has(suffix)) missing.push(key);
      }
      expect(missing, `Missing in en.json: ${missing.join(', ')}`).toHaveLength(0);
    });
  });

  describe('I3: All source keys exist in de.json', () => {
    it('every key from generator.ts exists in de.json rec object', () => {
      const missing: string[] = [];
      for (const key of SOURCE_KEYS) {
        const suffix = key.replace('rec.', '');
        if (!DE_KEYS.has(suffix)) missing.push(key);
      }
      expect(missing, `Missing in de.json: ${missing.join(', ')}`).toHaveLength(0);
    });
  });

  describe('I4: en.json and de.json rec keys are identical', () => {
    it('no key exists in en.json but not de.json', () => {
      const onlyEn = [...EN_KEYS].filter(k => !DE_KEYS.has(k));
      expect(onlyEn, `Keys only in en.json: ${onlyEn.join(', ')}`).toHaveLength(0);
    });

    it('no key exists in de.json but not en.json', () => {
      const onlyDe = [...DE_KEYS].filter(k => !EN_KEYS.has(k));
      expect(onlyDe, `Keys only in de.json: ${onlyDe.join(', ')}`).toHaveLength(0);
    });
  });

  describe('I5: Live recommendation keys are valid', () => {
    it('every key from live runs starts with rec.', () => {
      for (const key of LIVE_KEYS) {
        expect(key, `Live key "${key}" does not start with rec.`).toMatch(/^rec\./);
      }
    });

    it('every key from live runs exists in en.json', () => {
      const missing: string[] = [];
      for (const key of LIVE_KEYS) {
        const suffix = key.replace('rec.', '');
        if (!EN_KEYS.has(suffix)) missing.push(key);
      }
      expect(missing, `Live keys missing in en.json: ${missing.join(', ')}`).toHaveLength(0);
    });

    it('every key from live runs exists in de.json', () => {
      const missing: string[] = [];
      for (const key of LIVE_KEYS) {
        const suffix = key.replace('rec.', '');
        if (!DE_KEYS.has(suffix)) missing.push(key);
      }
      expect(missing, `Live keys missing in de.json: ${missing.join(', ')}`).toHaveLength(0);
    });
  });

  describe('I6: Z2 demotion keys are correct', () => {
    it('stickyClientRiskTitle exists and is different from stickyClientTitle', () => {
      expect(EN_KEYS.has('stickyClientRiskTitle')).toBe(true);
      expect(EN_KEYS.has('stickyClientTitle')).toBe(true);
      // They must be semantically different (demotion vs generic)
      const enJson = JSON.parse(readFileSync(resolve(I18N_DIR, 'en.json'), 'utf-8'));
      expect(enJson.rec.stickyClientRiskTitle).not.toBe(enJson.rec.stickyClientTitle);
    });

    it('stickyClientRiskReason exists and is different from stickyClientReason', () => {
      expect(EN_KEYS.has('stickyClientRiskReason')).toBe(true);
      expect(EN_KEYS.has('stickyClientReason')).toBe(true);
      const enJson = JSON.parse(readFileSync(resolve(I18N_DIR, 'en.json'), 'utf-8'));
      expect(enJson.rec.stickyClientRiskReason).not.toBe(enJson.rec.stickyClientReason);
    });

    it('generator uses stickyClientRiskTitle for Z2 demotion path', () => {
      expect(SOURCE_KEYS.has('rec.stickyClientRiskTitle')).toBe(true);
      expect(SOURCE_KEYS.has('rec.stickyClientRiskReason')).toBe(true);
    });
  });

  describe('I7: No title/reason keys outside rec. namespace', () => {
    it('all titleKey values in source use rec. prefix exclusively', () => {
      const src = readFileSync(resolve(__dirname, '../generator.ts'), 'utf-8');
      const titlePattern = /titleKey:\s*['"`]([^'"`]+)['"`]/g;
      let match;
      const nonRec: string[] = [];
      while ((match = titlePattern.exec(src)) !== null) {
        if (!match[1]!.startsWith('rec.')) nonRec.push(match[1]!);
      }
      expect(nonRec, `titleKeys without rec. prefix: ${nonRec.join(', ')}`).toHaveLength(0);
    });

    it('all reasonKey values in source use rec. prefix exclusively', () => {
      const src = readFileSync(resolve(__dirname, '../generator.ts'), 'utf-8');
      const reasonPattern = /reasonKey:\s*['"`]([^'"`]+)['"`]/g;
      let match;
      const nonRec: string[] = [];
      while ((match = reasonPattern.exec(src)) !== null) {
        if (!match[1]!.startsWith('rec.')) nonRec.push(match[1]!);
      }
      expect(nonRec, `reasonKeys without rec. prefix: ${nonRec.join(', ')}`).toHaveLength(0);
    });
  });
});
