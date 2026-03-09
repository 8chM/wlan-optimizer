/**
 * Phase 28bk — Preview/Apply Consistency Tests
 *
 * Verifies that the mapping chain is airtight:
 *   suggestedChange → mapSuggestedChangeToOverrides → convertApsToConfig (Preview)
 *   suggestedChange → mapSuggestedChangeToApUpdate                       (Apply)
 *
 * Both paths must agree on what parameter is changed, and Preview must
 * actually produce a different APConfig (no silent no-ops).
 */

import { describe, it, expect } from 'vitest';
import { generateRecommendations } from '../generator';
import { mapSuggestedChangeToOverrides, mapSuggestedChangeToApUpdate } from '../apFieldMap';
import { convertApsToConfig } from '$lib/heatmap/convert';
import { createRFConfig } from '$lib/heatmap/rf-engine';
import { RECOMMENDATION_CATEGORIES } from '../types';
import type { Recommendation, RecommendationType } from '../types';
import type { AccessPointResponse } from '$lib/api/invoke';
import type { FrequencyBand } from '$lib/heatmap/color-schemes';
import { createRf2UserHouse } from './fixtures/create-rf2';
import { createRf3MyHouse } from './fixtures/create-rf3';
import { createRf5UserLiveV2 } from './fixtures/create-rf5';
import { createRf6UserMyhouse } from './fixtures/create-rf6-user-myhouse';

// ─── Helpers ─────────────────────────────────────────────────────

const RF_CONFIG = createRFConfig('5ghz');

function collectAll(list: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of list) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

/** Build an overrides Map from a single suggestedChange */
function buildOverridesMap(
  apId: string,
  parameter: string,
  suggestedValue: string | number,
): Map<string, Record<string, string>> {
  const pairs = mapSuggestedChangeToOverrides(parameter, suggestedValue);
  if (pairs.length === 0) return new Map();
  const rec: Record<string, string> = {};
  for (const { key, value } of pairs) rec[key] = value;
  return new Map([[apId, rec]]);
}

/** Parameters that change heatmap via convertApsToConfig */
const HEATMAP_PARAMS = new Set([
  'tx_power_24ghz', 'tx_power_5ghz', 'tx_power_6ghz',
  'enabled', 'position', 'orientationDeg', 'mounting',
]);

/** Parameters that only affect channel/width analysis (not heatmap) */
const ANALYSIS_ONLY_PARAMS = new Set([
  'channel_24ghz', 'channel_5ghz', 'channel_6ghz', 'channel_width',
]);

// ─── BK-1: Channel override correctness ─────────────────────────

describe('Phase 28bk — Preview/Apply Consistency', () => {
  describe('BK-1: channel overrides produce correct keys per band', () => {
    const cases: Array<{ param: string; value: number; expectedKey: string }> = [
      { param: 'channel_24ghz', value: 6, expectedKey: 'channel_24ghz' },
      { param: 'channel_5ghz', value: 44, expectedKey: 'channel_5ghz' },
      { param: 'channel_6ghz', value: 1, expectedKey: 'channel_6ghz' },
    ];

    for (const { param, value, expectedKey } of cases) {
      it(`${param} → override key '${expectedKey}', apUpdate field matches`, () => {
        const overrides = mapSuggestedChangeToOverrides(param, value);
        expect(overrides.length, 'must produce at least 1 override').toBeGreaterThan(0);
        expect(overrides[0]!.key).toBe(expectedKey);
        expect(overrides[0]!.value).toBe(String(value));

        const apUpdate = mapSuggestedChangeToApUpdate(param, value);
        expect(Object.keys(apUpdate).length, 'apUpdate must be non-empty').toBeGreaterThan(0);
        // channel_24ghz → { channel_24ghz: 6 }, channel_5ghz → { channel_5ghz: 44 }, etc.
        expect(apUpdate[param]).toBe(value);
      });
    }
  });

  // ─── BK-2: TX power override → convertApsToConfig ───────────────

  describe('BK-2: TX power overrides change txPowerDbm in APConfig', () => {
    const txCases: Array<{ param: string; band: FrequencyBand; dbField: string }> = [
      { param: 'tx_power_24ghz', band: '2.4ghz', dbField: 'tx_power_24ghz_dbm' },
      { param: 'tx_power_5ghz', band: '5ghz', dbField: 'tx_power_5ghz_dbm' },
      { param: 'tx_power_6ghz', band: '6ghz', dbField: 'tx_power_6ghz_dbm' },
    ];

    for (const { param, band, dbField } of txCases) {
      it(`${param} → txPowerDbm changes in band ${band}`, () => {
        const ap: AccessPointResponse = {
          id: 'ap-test', floor_id: 'f1', ap_model_id: 'test',
          x: 5, y: 5, label: 'Test', enabled: true,
          mounting: 'ceiling', orientation_deg: 0, height_m: 2.5,
          tx_power_5ghz_dbm: 20, tx_power_24ghz_dbm: 17, tx_power_6ghz_dbm: 23,
          channel_5ghz: 36, channel_24ghz: 1, channel_6ghz: null,
          channel_width: '80', band_steering_enabled: false,
          ip_address: null, ssid: null, created_at: '', updated_at: '',
          ap_model: {
            id: 'test', manufacturer: 'Test', model: 'TestAP',
            wifi_standard: null, mimo_streams: null,
            antenna_gain_24ghz_dbi: 3, antenna_gain_5ghz_dbi: 4,
            antenna_gain_6ghz_dbi: 4.5,
            max_tx_power_24ghz_dbm: 23, max_tx_power_5ghz_dbm: 26, max_tx_power_6ghz_dbm: 26,
            supported_channels_24ghz: null, supported_channels_5ghz: null, supported_channels_6ghz: null,
            is_user_defined: false,
          },
        };

        const suggestedTx = 14;
        const overrides = buildOverridesMap('ap-test', param, suggestedTx);

        // Before: original TX
        const before = convertApsToConfig([ap], band);
        expect(before.length).toBe(1);

        // After: with override
        const after = convertApsToConfig([ap], band, overrides);
        expect(after.length).toBe(1);
        expect(after[0]!.txPowerDbm, `txPowerDbm must be ${suggestedTx} after override`).toBe(suggestedTx);
        expect(after[0]!.txPowerDbm).not.toBe(before[0]!.txPowerDbm);

        // Apply path targets same DB field
        const apUpdate = mapSuggestedChangeToApUpdate(param, suggestedTx);
        expect(apUpdate[dbField], `apUpdate must set ${dbField}`).toBe(suggestedTx);
      });
    }
  });

  // ─── BK-3: Channel width override ──────────────────────────────

  describe('BK-3: channel_width overrides produce correct mapping', () => {
    it('channel_width → override key "channel_width", apUpdate sets channel_width string', () => {
      const overrides = mapSuggestedChangeToOverrides('channel_width', 40);
      expect(overrides.length).toBe(1);
      expect(overrides[0]!.key).toBe('channel_width');
      expect(overrides[0]!.value).toBe('40');

      const apUpdate = mapSuggestedChangeToApUpdate('channel_width', 40);
      expect(apUpdate.channel_width).toBe('40');
    });
  });

  // ─── BK-4: enabled=false filters AP in convertApsToConfig ──────

  describe('BK-4: disable_ap → enabled=false removes AP from APConfig', () => {
    it('enabled override "false" filters AP out of convertApsToConfig', () => {
      const ap: AccessPointResponse = {
        id: 'ap-disable', floor_id: 'f1', ap_model_id: 'test',
        x: 5, y: 5, label: 'Disable', enabled: true,
        mounting: 'ceiling', orientation_deg: 0, height_m: 2.5,
        tx_power_5ghz_dbm: 20, tx_power_24ghz_dbm: 17, tx_power_6ghz_dbm: null,
        channel_5ghz: 36, channel_24ghz: 1, channel_6ghz: null,
        channel_width: '80', band_steering_enabled: false,
        ip_address: null, ssid: null, created_at: '', updated_at: '',
        ap_model: null,
      };

      // Before: AP is included
      const before = convertApsToConfig([ap], '5ghz');
      expect(before.length).toBe(1);

      // After: enabled=false override
      const overrides = buildOverridesMap('ap-disable', 'enabled', 'false');
      const after = convertApsToConfig([ap], '5ghz', overrides);
      expect(after.length, 'AP must be filtered out when enabled=false').toBe(0);

      // Apply path: apUpdate sets enabled=false
      const apUpdate = mapSuggestedChangeToApUpdate('enabled', 'false');
      expect(apUpdate.enabled).toBe(false);
    });
  });

  // ─── BK-5: Cross-fixture — every actionable_config rec has valid mapping ─

  describe('BK-5: cross-fixture actionable_config roundtrip', () => {
    const ACTIONABLE_CONFIG_TYPES = new Set<RecommendationType>(
      Object.entries(RECOMMENDATION_CATEGORIES)
        .filter(([, cat]) => cat === 'actionable_config')
        .map(([t]) => t as RecommendationType),
    );

    const fixtures = [
      { name: 'RF2', create: createRf2UserHouse, expectConfig: true },
      { name: 'RF3', create: createRf3MyHouse, expectConfig: false },
      { name: 'RF5', create: createRf5UserLiveV2, expectConfig: false },
      { name: 'RF6', create: createRf6UserMyhouse, expectConfig: false },
    ];

    for (const { name, create, expectConfig } of fixtures) {
      it(`${name}: every actionable_config rec maps to non-empty overrides + apUpdate`, () => {
        const f = create();
        const band: FrequencyBand = '5ghz';
        const result = generateRecommendations(
          f.aps, f.apResps, f.walls, f.bounds,
          band, f.stats, RF_CONFIG, 'balanced', f.ctx,
        );

        const allRecs = collectAll(result.recommendations);
        const configRecs = allRecs.filter(r =>
          ACTIONABLE_CONFIG_TYPES.has(r.type) && r.suggestedChange?.apId,
        );

        if (expectConfig) {
          expect(configRecs.length, `${name} must have actionable_config recs`).toBeGreaterThan(0);
        }

        for (const rec of configRecs) {
          const sc = rec.suggestedChange!;
          const param = sc.parameter;
          const value = sc.suggestedValue;

          // Override path
          const overrides = mapSuggestedChangeToOverrides(param, value);
          expect(
            overrides.length,
            `${name}/${rec.type}/${param}: overrides must be non-empty`,
          ).toBeGreaterThan(0);

          // Apply path
          const apUpdate = mapSuggestedChangeToApUpdate(param, value);
          expect(
            Object.keys(apUpdate).length,
            `${name}/${rec.type}/${param}: apUpdate must be non-empty`,
          ).toBeGreaterThan(0);
        }
      });

      it(`${name}: heatmap-affecting overrides actually change APConfig`, () => {
        const f = create();
        const band: FrequencyBand = '5ghz';
        const result = generateRecommendations(
          f.aps, f.apResps, f.walls, f.bounds,
          band, f.stats, RF_CONFIG, 'balanced', f.ctx,
        );

        const allRecs = collectAll(result.recommendations);
        const heatmapRecs = allRecs.filter(r =>
          ACTIONABLE_CONFIG_TYPES.has(r.type) &&
          r.suggestedChange?.apId &&
          HEATMAP_PARAMS.has(r.suggestedChange.parameter),
        );

        for (const rec of heatmapRecs) {
          const sc = rec.suggestedChange!;
          const overridesMap = buildOverridesMap(sc.apId!, sc.parameter, sc.suggestedValue);

          const before = convertApsToConfig(f.apResps, band);
          const after = convertApsToConfig(f.apResps, band, overridesMap);

          if (sc.parameter === 'enabled') {
            // AP should be removed
            const apBefore = before.find(a => a.id === sc.apId);
            const apAfter = after.find(a => a.id === sc.apId);
            expect(apBefore, `${rec.type}: AP must exist before`).toBeTruthy();
            expect(apAfter, `${rec.type}: AP must be removed after disable`).toBeUndefined();
          } else {
            // AP parameter should differ
            const apBefore = before.find(a => a.id === sc.apId);
            const apAfter = after.find(a => a.id === sc.apId);
            expect(apBefore, `${rec.type}: AP before`).toBeTruthy();
            expect(apAfter, `${rec.type}: AP after`).toBeTruthy();

            // Deep-equal check: at least one field must differ
            const a = apAfter as unknown as Record<string, unknown>;
            const b = apBefore as unknown as Record<string, unknown>;
            const changed = Object.keys(a).some(k => a[k] !== b[k]);
            expect(
              changed,
              `${rec.type}/${sc.parameter}: convertApsToConfig must produce different APConfig`,
            ).toBe(true);
          }
        }
      });
    }
  });

  // ─── BK-6: No preview without real effect ──────────────────────

  describe('BK-6: no preview without effect — override/apUpdate always non-empty for known params', () => {
    const ALL_PARAMS = [
      'tx_power_24ghz', 'tx_power_5ghz', 'tx_power_6ghz',
      'channel_24ghz', 'channel_5ghz', 'channel_6ghz',
      'channel_width', 'enabled', 'position', 'orientationDeg', 'mounting',
    ];

    for (const param of ALL_PARAMS) {
      it(`${param}: mapSuggestedChangeToOverrides + mapSuggestedChangeToApUpdate produce non-empty result`, () => {
        // Use a sensible dummy value per param
        const dummyValues: Record<string, string | number> = {
          tx_power_24ghz: 15, tx_power_5ghz: 18, tx_power_6ghz: 20,
          channel_24ghz: 6, channel_5ghz: 44, channel_6ghz: 5,
          channel_width: 40, enabled: 'false',
          position: '10,10', orientationDeg: 90, mounting: 'wall',
        };

        const value = dummyValues[param]!;
        const overrides = mapSuggestedChangeToOverrides(param, value);
        expect(overrides.length, `${param}: overrides must be non-empty`).toBeGreaterThan(0);

        const apUpdate = mapSuggestedChangeToApUpdate(param, value);
        expect(Object.keys(apUpdate).length, `${param}: apUpdate must be non-empty`).toBeGreaterThan(0);
      });
    }
  });
});
