/**
 * Fixture Round-Trip Tests — prove that export → JSON → import → engine works.
 *
 * RT-1: In-memory round-trip (no file I/O)
 *       exportRegressionFixture → JSON.stringify → JSON.parse → loadExportedFixture → generateRecommendations
 * RT-2: File-based round-trip (loads rf2-user-house-5ghz.json from disk)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateRecommendations, EVIDENCE_MINIMUMS } from '../generator';
import { exportRegressionFixture } from '../fixture-export';
import { loadExportedFixture } from './fixtures/load-exported-fixture';
import { createRf2UserHouse } from './fixtures/create-rf2';
import { createRf6UserMyhouse } from './fixtures/create-rf6-user-myhouse';
import type { Recommendation } from '../types';
import { RECOMMENDATION_CATEGORIES } from '../types';
import type { ExportedFixture } from '../fixture-export';

const __testdir = dirname(fileURLToPath(import.meta.url));

function collectAll(list: Recommendation[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of list) {
    out.push(r);
    if (r.alternativeRecommendations) out.push(...collectAll(r.alternativeRecommendations));
  }
  return out;
}

describe('Fixture Round-Trip', () => {
  it('RT-1: export → JSON serialize → parse → import → generateRecommendations', () => {
    // 1. Create fixture in memory
    const fixture = createRf2UserHouse();

    // 2. Export (TypedArrays → arrays, Maps → entries)
    const exported = exportRegressionFixture(
      {
        aps: fixture.aps,
        accessPoints: fixture.apResps,
        walls: fixture.walls,
        bounds: fixture.bounds,
        band: '5ghz',
        stats: fixture.stats,
      },
      fixture.ctx,
      'balanced',
    );

    // 3. Simulate file save/load via JSON round-trip
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json) as ExportedFixture;

    // 4. Import back to typed objects
    const loaded = loadExportedFixture(parsed);

    // 5. Verify structure survived round-trip
    expect(loaded.aps.length, 'aps count').toBe(fixture.aps.length);
    expect(loaded.accessPoints.length, 'accessPoints count').toBe(fixture.apResps.length);
    expect(loaded.walls.length, 'walls count').toBe(fixture.walls.length);
    expect(loaded.band, 'band').toBe('5ghz');
    expect(loaded.profile, 'profile').toBe('balanced');
    expect(loaded.ctx.candidates.length, 'candidates count').toBe(fixture.ctx.candidates.length);
    expect(loaded.ctx.priorityZones.length, 'priorityZones count').toBe(fixture.ctx.priorityZones.length);
    expect(loaded.ctx.candidatePolicy, 'candidatePolicy').toBe(fixture.ctx.candidatePolicy);
    expect(loaded.stats.rssiGrid, 'rssiGrid is Float32Array').toBeInstanceOf(Float32Array);
    expect(loaded.stats.apIndexGrid, 'apIndexGrid is Uint8Array').toBeInstanceOf(Uint8Array);

    // 6. Run engine — must not throw
    const result = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );

    // 7. Must produce recommendations
    expect(result.recommendations.length, 'recommendations must be non-empty').toBeGreaterThan(0);

    // 8. All recs pass evidence minimums
    const allRecs = collectAll(result.recommendations);
    for (const rec of allRecs) {
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (!required) continue;
      const keys = Object.keys(rec.evidence?.metrics ?? {});
      const hasAtLeastOne = required.some(k => keys.includes(k));
      expect(
        hasAtLeastOne,
        `${rec.type} (${rec.id}) must have at least one of [${required.join(', ')}], got [${keys.join(', ')}]`,
      ).toBe(true);
    }

    // 9. Determinism: running again produces same count
    const result2 = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );
    expect(result2.recommendations.length, 'deterministic rec count').toBe(result.recommendations.length);
  });

  it('RT-2: file-based import from rf2-user-house-5ghz.json → generateRecommendations', () => {
    // 1. Load from disk (same path rf2-user-house.test.ts uses)
    const fixtureJson = JSON.parse(
      readFileSync(join(__testdir, 'real-fixtures', 'rf2-user-house-5ghz.json'), 'utf-8'),
    ) as ExportedFixture;

    // 2. Verify meta
    expect(fixtureJson._meta.version, 'fixture version').toBe(1);
    expect(fixtureJson.project.band, 'fixture band').toBe('5ghz');

    // 3. Import
    const loaded = loadExportedFixture(fixtureJson);

    // 4. Run engine
    const result = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );

    expect(result.recommendations.length, 'must produce recommendations').toBeGreaterThan(0);

    // 5. No phantom add_ap (RF2-1 invariant cross-check)
    const addAps = result.recommendations.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition != null,
        `add_ap ${rec.id} must have selectedCandidatePosition (no phantom placement)`,
      ).toBe(true);
    }
  });

  it('RT-3: RF6 User My House — export → JSON → import → engine (candidatePolicy + constraintZones)', () => {
    // 1. Create fixture
    const fixture = createRf6UserMyhouse();

    // 2. Export
    const exported = exportRegressionFixture(
      {
        aps: fixture.aps,
        accessPoints: fixture.apResps,
        walls: fixture.walls,
        bounds: fixture.bounds,
        band: '5ghz',
        stats: fixture.stats,
      },
      fixture.ctx,
      'balanced',
    );

    // 3. JSON round-trip
    const parsed = JSON.parse(JSON.stringify(exported)) as ExportedFixture;

    // 4. Import
    const loaded = loadExportedFixture(parsed);

    // 5. Verify structure — including RF6-specific fields
    expect(loaded.aps.length, 'RF6 has 4 APs').toBe(4);
    expect(loaded.ctx.candidates.length, 'RF6 has 3 candidates').toBe(3);
    expect(loaded.ctx.candidatePolicy, 'RF6 policy').toBe('required_for_new_ap');
    expect(loaded.ctx.constraintZones.length, 'RF6 has 1 constraintZone').toBe(1);
    expect(loaded.ctx.priorityZones.length, 'RF6 has 3 PZ').toBe(3);
    expect(loaded.stats.rssiGrid).toBeInstanceOf(Float32Array);

    // 6. Run engine
    const result = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );

    // 7. Evidence minimums
    const allRecs = collectAll(result.recommendations);
    for (const rec of allRecs) {
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (!required) continue;
      const keys = Object.keys(rec.evidence?.metrics ?? {});
      expect(
        required.some(k => keys.includes(k)),
        `${rec.type}: needs [${required.join(', ')}], got [${keys.join(', ')}]`,
      ).toBe(true);
    }

    // 8. No phantom add_ap under required_for_new_ap
    const addAps = result.recommendations.filter(r => r.type === 'add_ap');
    for (const rec of addAps) {
      expect(
        rec.selectedCandidatePosition != null,
        `add_ap ${rec.id} must have selectedCandidatePosition`,
      ).toBe(true);
    }

    // 9. Determinism
    const result2 = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );
    expect(result2.recommendations.length, 'deterministic').toBe(result.recommendations.length);

    // 10. No actionable roaming with marginalBenefit
    for (const rec of allRecs) {
      const metrics = rec.evidence?.metrics as Record<string, unknown> | undefined;
      if (metrics?.marginalBenefit === 1) {
        expect(
          RECOMMENDATION_CATEGORIES[rec.type],
          `marginal roaming ${rec.id} must be informational`,
        ).toBe('informational');
      }
    }
  });
});
