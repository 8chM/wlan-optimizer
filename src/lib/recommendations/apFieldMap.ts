/**
 * Central mapping: Generator parameter names → DB fields (Apply) / Override keys (Preview).
 *
 * The generator emits band-specific parameter names (e.g. 'tx_power_5ghz').
 * This module translates them to:
 *   - updateAccessPoint() field names (DB level)
 *   - mixingStore.applyChange() override keys (forecast/preview)
 *
 * Also provides verifyApplyResult() for closed-loop verification:
 * compares intended updates against the DB response after apply.
 *
 * convert.ts consumes the override keys — they must stay in sync with this map.
 * See also: docs/recommendations/engine-rules.md
 */

import type { AccessPointResponse } from '$lib/api/invoke';
import type { ApplyVerification } from '$lib/stores/optimierungStore.svelte';

/** All parameter strings emitted by the recommendation generator. */
export type SuggestedParameter =
  | 'tx_power_24ghz' | 'tx_power_5ghz' | 'tx_power_6ghz'
  | 'channel_24ghz' | 'channel_5ghz' | 'channel_6ghz'
  | 'channel_width' | 'enabled'
  | 'position' | 'orientationDeg' | 'mounting';

interface FieldMapping {
  /** Fields for updateAccessPoint API (DB level). */
  toApUpdate: (value: string | number) => Record<string, number | string | boolean>;
  /** Key/value pairs for mixingStore.applyChange (preview/forecast). */
  toOverrides: (value: string | number) => Array<{ key: string; value: string }>;
}

/** Parse "(x, y)" position string into numeric x/y. Returns null on invalid input. */
function parsePosition(v: string | number): { x: number; y: number } | null {
  const m = String(v).match(/\(?\s*([\d.]+)\s*,\s*([\d.]+)\s*\)?/);
  if (!m) return null;
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

const FIELD_MAP: Record<SuggestedParameter, FieldMapping> = {
  tx_power_24ghz: {
    toApUpdate: (v) => ({ tx_power_24ghz_dbm: Number(v) }),
    toOverrides: (v) => [{ key: 'tx_power_24ghz', value: String(v) }],
  },
  tx_power_5ghz: {
    toApUpdate: (v) => ({ tx_power_5ghz_dbm: Number(v) }),
    toOverrides: (v) => [{ key: 'tx_power_5ghz', value: String(v) }],
  },
  tx_power_6ghz: {
    toApUpdate: (v) => ({ tx_power_6ghz_dbm: Number(v) }),
    toOverrides: (v) => [{ key: 'tx_power_6ghz', value: String(v) }],
  },
  channel_24ghz: {
    toApUpdate: (v) => ({ channel_24ghz: Number(v) }),
    toOverrides: (v) => [{ key: 'channel_24ghz', value: String(v) }],
  },
  channel_5ghz: {
    toApUpdate: (v) => ({ channel_5ghz: Number(v) }),
    toOverrides: (v) => [{ key: 'channel_5ghz', value: String(v) }],
  },
  channel_6ghz: {
    toApUpdate: (v) => ({ channel_6ghz: Number(v) }),
    toOverrides: (v) => [{ key: 'channel_6ghz', value: String(v) }],
  },
  channel_width: {
    toApUpdate: (v) => ({ channel_width: String(v) }),
    toOverrides: (v) => [{ key: 'channel_width', value: String(v) }],
  },
  enabled: {
    toApUpdate: (v) => ({ enabled: String(v) !== 'false' }),
    toOverrides: (v) => [{ key: 'enabled', value: String(v) }],
  },
  position: {
    toApUpdate: (v): Record<string, number | string | boolean> => {
      const pos = parsePosition(v);
      return pos ? { x: pos.x, y: pos.y } : {};
    },
    toOverrides: (v) => {
      const pos = parsePosition(v);
      return pos
        ? [{ key: 'position_x', value: String(pos.x) }, { key: 'position_y', value: String(pos.y) }]
        : [];
    },
  },
  orientationDeg: {
    toApUpdate: (v) => ({ orientation_deg: Number(v) }),
    toOverrides: (v) => [{ key: 'orientationDeg', value: String(v) }],
  },
  mounting: {
    toApUpdate: (v) => ({ mounting: String(v) }),
    toOverrides: (v) => [{ key: 'mounting', value: String(v) }],
  },
};

/**
 * Maps a generator-emitted parameter + value to DB field updates for updateAccessPoint().
 * Returns empty object for unknown parameters.
 */
export function mapSuggestedChangeToApUpdate(
  parameter: string,
  suggestedValue: string | number,
): Record<string, number | string | boolean> {
  const mapping = FIELD_MAP[parameter as SuggestedParameter];
  return mapping ? mapping.toApUpdate(suggestedValue) : {};
}

/**
 * Maps a generator-emitted parameter + value to override key/value pairs
 * for mixingStore.applyChange() (preview/forecast).
 * Returns empty array for unknown parameters.
 */
export function mapSuggestedChangeToOverrides(
  parameter: string,
  suggestedValue: string | number,
): Array<{ key: string; value: string }> {
  const mapping = FIELD_MAP[parameter as SuggestedParameter];
  return mapping ? mapping.toOverrides(suggestedValue) : [];
}

/**
 * Verifies that the AP returned by updateAccessPoint() matches the intended updates.
 *
 * Compares the DB-level fields produced by mapSuggestedChangeToApUpdate() against
 * the actual values in the returned AccessPointResponse. Numeric fields are compared
 * with a tolerance of 0.01. Boolean/string fields use strict equality.
 *
 * Note: This verifies the DB write only — no vendor/hardware API verification is possible.
 */
export function verifyApplyResult(
  parameter: string,
  suggestedValue: string | number,
  returnedAp: AccessPointResponse,
): ApplyVerification {
  const intended = mapSuggestedChangeToApUpdate(parameter, suggestedValue);
  const checkedFields: string[] = [];
  const mismatchedFields: string[] = [];

  for (const [field, expectedValue] of Object.entries(intended)) {
    checkedFields.push(field);
    const actualValue = (returnedAp as unknown as Record<string, unknown>)[field];

    if (typeof expectedValue === 'number' && typeof actualValue === 'number') {
      if (Math.abs(actualValue - expectedValue) > 0.01) {
        mismatchedFields.push(field);
      }
    } else if (typeof expectedValue === 'boolean') {
      if (actualValue !== expectedValue) {
        mismatchedFields.push(field);
      }
    } else {
      if (String(actualValue) !== String(expectedValue)) {
        mismatchedFields.push(field);
      }
    }
  }

  if (checkedFields.length === 0) {
    return { status: 'unverified', checkedFields, hardwareVerified: false };
  }

  return {
    status: mismatchedFields.length === 0 ? 'verified' : 'failed',
    checkedFields,
    mismatchedFields: mismatchedFields.length > 0 ? mismatchedFields : undefined,
    hardwareVerified: false,
  };
}
