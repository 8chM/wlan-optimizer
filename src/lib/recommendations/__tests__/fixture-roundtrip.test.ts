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
import { exportRegressionFixture, sanitizeFixture } from '../fixture-export';
import { loadExportedFixture, validateExportedFixture } from './fixtures/load-exported-fixture';
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

  it('RT-4: _meta completeness — band, projectId, exportedAt, version', () => {
    const fixture = createRf2UserHouse();
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
      'test-project-42',
    );

    expect(exported._meta.version, '_meta.version').toBe(1);
    expect(exported._meta.band, '_meta.band').toBe('5ghz');
    expect(exported._meta.projectId, '_meta.projectId').toBe('test-project-42');
    expect(typeof exported._meta.exportedAt, '_meta.exportedAt is string').toBe('string');
    expect(exported._meta.exportedAt.length, '_meta.exportedAt non-empty').toBeGreaterThan(0);
  });

  it('BY-1: validateExportedFixture rejects invalid data', () => {
    expect(validateExportedFixture(null), 'null').not.toBeNull();
    expect(validateExportedFixture({}), 'empty object').not.toBeNull();
    expect(validateExportedFixture({ _meta: { version: 2 } }), 'wrong version').toContain('version');
    expect(validateExportedFixture({ _meta: { version: 1 } }), 'missing project').toContain('project');
    expect(validateExportedFixture({ _meta: { version: 1 }, project: { aps: [] }, stats: {} }), 'missing accessPoints').toContain('accessPoints');
    expect(
      validateExportedFixture({ _meta: { version: 1 }, project: { aps: [], accessPoints: [], bounds: {} }, stats: {} }),
      'missing band',
    ).toContain('band');
  });

  it('BY-2: validateExportedFixture accepts valid fixture', () => {
    const fixture = createRf2UserHouse();
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
    const json = JSON.parse(JSON.stringify(exported));
    expect(validateExportedFixture(json), 'valid fixture passes validation').toBeNull();
  });

  it('BY-3: validated fixture → loadExportedFixture → generateRecommendations (no exception)', () => {
    const fixtureJson = JSON.parse(
      readFileSync(join(__testdir, 'real-fixtures', 'rf3-my-house-5ghz.json'), 'utf-8'),
    );

    // Validate first (as the UI handler would)
    const validationError = validateExportedFixture(fixtureJson);
    expect(validationError, 'rf3 fixture must pass validation').toBeNull();

    // Load and run engine
    const loaded = loadExportedFixture(fixtureJson as ExportedFixture);
    const result = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );
    expect(result.recommendations.length, 'must produce recommendations').toBeGreaterThan(0);
  });

  it('RT-5: band + policy round-trip through JSON', () => {
    const fixture = createRf6UserMyhouse();
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
      null,
    );

    // JSON round-trip
    const parsed = JSON.parse(JSON.stringify(exported)) as ExportedFixture;

    expect(parsed._meta.band, 'round-trip _meta.band').toBe('5ghz');
    expect(parsed._meta.projectId, 'round-trip _meta.projectId null').toBeNull();
    expect(parsed.project.ctx.candidatePolicy, 'round-trip candidatePolicy').toBe('required_for_new_ap');
  });

  it('RT-6: sanitizeFixture removes sensitive fields', () => {
    const fixture = createRf2UserHouse();
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
      'secret-project-id',
    );

    const sanitized = sanitizeFixture(exported);

    // _meta.projectId removed
    expect(sanitized._meta.projectId, '_meta.projectId must be null').toBeNull();

    // AccessPoints sanitized
    for (const ap of sanitized.project.accessPoints) {
      expect(ap.label, 'label must be null').toBeNull();
      expect(ap.ssid, 'ssid must be null').toBeNull();
      expect(ap.ip_address, 'ip_address must be null').toBeNull();
      expect(ap.ap_model_id, 'ap_model_id must be null').toBeNull();
      expect(ap.floor_id, 'floor_id must be floor-1').toBe('floor-1');
      expect(ap.created_at, 'created_at sanitized').toBe('2000-01-01T00:00:00Z');
      expect(ap.updated_at, 'updated_at sanitized').toBe('2000-01-01T00:00:00Z');
    }

    // AP IDs consistent between aps[] and accessPoints[]
    for (let i = 0; i < sanitized.project.aps.length; i++) {
      expect(
        sanitized.project.aps[i]!.id,
        `aps[${i}].id matches accessPoints[${i}].id`,
      ).toBe(sanitized.project.accessPoints[i]!.id);
    }

    // IDs are sequential "ap-N"
    for (let i = 0; i < sanitized.project.accessPoints.length; i++) {
      expect(sanitized.project.accessPoints[i]!.id, `ap id ${i}`).toBe(`ap-${i + 1}`);
    }

    // Candidate labels sanitized
    for (let i = 0; i < sanitized.project.ctx.candidates.length; i++) {
      expect(
        sanitized.project.ctx.candidates[i]!.label,
        `candidate ${i} label`,
      ).toBe(`Candidate-${i + 1}`);
      expect(
        sanitized.project.ctx.candidates[i]!,
        `candidate ${i} notes removed`,
      ).not.toHaveProperty('notes');
    }

    // PriorityZone labels sanitized
    for (let i = 0; i < sanitized.project.ctx.priorityZones.length; i++) {
      expect(
        sanitized.project.ctx.priorityZones[i]!.label,
        `pz ${i} label`,
      ).toBe(`Zone-${i + 1}`);
    }

    // ConstraintZone notes removed
    for (const z of sanitized.project.ctx.constraintZones) {
      expect(
        z,
        'constraintZone notes removed',
      ).not.toHaveProperty('notes');
    }

    // apCapabilities keys use new IDs
    for (const [key] of sanitized.project.ctx.apCapabilities) {
      expect(key, 'apCapabilities key starts with ap-').toMatch(/^ap-\d+$/);
    }

    // RF-essential data preserved
    expect(sanitized.project.aps.length, 'aps count preserved').toBe(exported.project.aps.length);
    expect(sanitized.project.walls.length, 'walls preserved').toBe(exported.project.walls.length);
    expect(sanitized.project.bounds, 'bounds preserved').toEqual(exported.project.bounds);
    expect(sanitized.project.band, 'band preserved').toBe(exported.project.band);
    expect(sanitized.project.profile, 'profile preserved').toBe(exported.project.profile);
    expect(sanitized.project.ctx.candidatePolicy, 'policy preserved').toBe(exported.project.ctx.candidatePolicy);
  });

  it('RT-7: sanitized fixture remains functional — loadExportedFixture → generateRecommendations', () => {
    const fixture = createRf2UserHouse();
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
      'project-to-sanitize',
    );

    // Sanitize → JSON round-trip → load → run engine
    const sanitized = sanitizeFixture(exported);
    const parsed = JSON.parse(JSON.stringify(sanitized)) as ExportedFixture;
    const loaded = loadExportedFixture(parsed);

    const result = generateRecommendations(
      loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
      loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
    );

    expect(result.recommendations.length, 'sanitized fixture must produce recommendations').toBeGreaterThan(0);

    // All recs pass evidence minimums
    const allRecs = collectAll(result.recommendations);
    for (const rec of allRecs) {
      const required = EVIDENCE_MINIMUMS[rec.type];
      if (!required) continue;
      const keys = Object.keys(rec.evidence?.metrics ?? {});
      expect(
        required.some(k => keys.includes(k)),
        `${rec.type} (${rec.id}): needs [${required.join(', ')}], got [${keys.join(', ')}]`,
      ).toBe(true);
    }
  });
});
