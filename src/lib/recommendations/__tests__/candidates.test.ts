/**
 * Unit tests for the candidate location module.
 */

import { describe, it, expect } from 'vitest';
import {
  findBestCandidate,
  getConstraintsAtPoint,
  isPositionForbidden,
  isNewApAllowed,
  getMountingOptionsAtPoint,
  isMovementAllowed,
} from '../candidates';
import type { CandidateLocation, ConstraintZone } from '../types';

function makeCandidate(id: string, x: number, y: number, overrides?: Partial<CandidateLocation>): CandidateLocation {
  return {
    id,
    x,
    y,
    label: id,
    mountingOptions: ['wall', 'ceiling'],
    hasLan: true,
    hasPoe: true,
    hasPower: true,
    preferred: false,
    forbidden: false,
    ...overrides,
  };
}

function makeZone(id: string, type: ConstraintZone['type'], x: number, y: number, w: number, h: number): ConstraintZone {
  return { id, type, x, y, width: w, height: h, weight: 1.0 };
}

describe('findBestCandidate', () => {
  it('should select the closest candidate to ideal target', () => {
    const candidates = [
      makeCandidate('c1', 1, 1),
      makeCandidate('c2', 5, 5),
      makeCandidate('c3', 9, 9),
    ];

    const result = findBestCandidate(5, 5, candidates, []);
    expect(result.candidate?.id).toBe('c2');
    expect(result.distanceToIdeal).toBeLessThan(0.1);
  });

  it('should prefer candidates with full infrastructure', () => {
    const candidates = [
      makeCandidate('c1', 4, 5, { hasLan: false, hasPoe: false }),
      makeCandidate('c2', 6, 5, { hasLan: true, hasPoe: true }),
    ];

    const result = findBestCandidate(5, 5, candidates, []);
    expect(result.candidate?.id).toBe('c2');
    expect(result.requiresInfrastructure).toBe(false);
  });

  it('should flag infrastructure requirement when no LAN/PoE', () => {
    const candidates = [
      makeCandidate('c1', 5, 5, { hasLan: false, hasPoe: false }),
    ];

    const result = findBestCandidate(5, 5, candidates, []);
    expect(result.candidate?.id).toBe('c1');
    expect(result.requiresInfrastructure).toBe(true);
  });

  it('should exclude forbidden candidates', () => {
    const candidates = [
      makeCandidate('c1', 5, 5, { forbidden: true }),
      makeCandidate('c2', 8, 8),
    ];

    const result = findBestCandidate(5, 5, candidates, []);
    expect(result.candidate?.id).toBe('c2');
  });

  it('should exclude candidates in forbidden zones', () => {
    const candidates = [
      makeCandidate('c1', 5, 5),
      makeCandidate('c2', 8, 8),
    ];
    const zones = [makeZone('z1', 'forbidden', 4, 4, 3, 3)];

    const result = findBestCandidate(5, 5, candidates, zones);
    expect(result.candidate?.id).toBe('c2');
  });

  it('should prefer user-preferred candidates when distance is similar', () => {
    // Both at equal distance from target; preferred should win
    const candidates = [
      makeCandidate('c1', 4, 5),
      makeCandidate('c2', 6, 5, { preferred: true }),
    ];

    const result = findBestCandidate(5, 5, candidates, []);
    expect(result.candidate?.id).toBe('c2');
  });

  it('should return null when no candidates available', () => {
    const result = findBestCandidate(5, 5, [], []);
    expect(result.candidate).toBeNull();
    expect(result.requiresInfrastructure).toBe(true);
  });

  it('should return null when all candidates are filtered out', () => {
    const candidates = [
      makeCandidate('c1', 5, 5, { forbidden: true }),
    ];

    const result = findBestCandidate(5, 5, candidates, []);
    expect(result.candidate).toBeNull();
  });
});

describe('getConstraintsAtPoint', () => {
  it('should find zones containing the point', () => {
    const zones = [
      makeZone('z1', 'forbidden', 0, 0, 5, 5),
      makeZone('z2', 'preferred', 3, 3, 4, 4),
    ];

    const result = getConstraintsAtPoint(4, 4, zones);
    expect(result.length).toBe(2);
  });

  it('should return empty for points outside all zones', () => {
    const zones = [makeZone('z1', 'forbidden', 0, 0, 3, 3)];

    const result = getConstraintsAtPoint(5, 5, zones);
    expect(result.length).toBe(0);
  });
});

describe('isPositionForbidden', () => {
  it('should return true for forbidden zones', () => {
    const zones = [makeZone('z1', 'forbidden', 0, 0, 5, 5)];
    expect(isPositionForbidden(3, 3, zones)).toBe(true);
  });

  it('should return false for non-forbidden zones', () => {
    const zones = [makeZone('z1', 'discouraged', 0, 0, 5, 5)];
    expect(isPositionForbidden(3, 3, zones)).toBe(false);
  });
});

describe('isNewApAllowed', () => {
  it('should block in no_new_ap zones', () => {
    const zones = [makeZone('z1', 'no_new_ap', 0, 0, 10, 10)];
    expect(isNewApAllowed(5, 5, zones)).toBe(false);
  });

  it('should allow in other zones', () => {
    const zones = [makeZone('z1', 'discouraged', 0, 0, 10, 10)];
    expect(isNewApAllowed(5, 5, zones)).toBe(true);
  });
});

describe('getMountingOptionsAtPoint', () => {
  it('should remove ceiling when no_ceiling_mount zone', () => {
    const zones = [makeZone('z1', 'no_ceiling_mount', 0, 0, 10, 10)];
    const options = getMountingOptionsAtPoint(5, 5, zones);
    expect(options).toEqual(['wall']);
  });

  it('should remove wall when no_wall_mount zone', () => {
    const zones = [makeZone('z1', 'no_wall_mount', 0, 0, 10, 10)];
    const options = getMountingOptionsAtPoint(5, 5, zones);
    expect(options).toEqual(['ceiling']);
  });

  it('should return all options when no restrictions', () => {
    const options = getMountingOptionsAtPoint(5, 5, []);
    expect(options).toEqual(['wall', 'ceiling']);
  });
});

describe('isMovementAllowed', () => {
  it('should block in no_move zones', () => {
    const zones = [makeZone('z1', 'no_move', 0, 0, 10, 10)];
    expect(isMovementAllowed(5, 5, zones)).toBe(false);
  });

  it('should allow in other zones', () => {
    const zones = [makeZone('z1', 'preferred', 0, 0, 10, 10)];
    expect(isMovementAllowed(5, 5, zones)).toBe(true);
  });
});
