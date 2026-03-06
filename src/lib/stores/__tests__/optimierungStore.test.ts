/**
 * Tests for optimierungStore — instructional done tracking + stale logic.
 *
 * Phase 28r: Instructional recommendations get "mark as done" instead of apply.
 * The done state persists across re-analyses via stable keys.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { optimierungStore, instructionalStableKey } from '../optimierungStore.svelte';

describe('optimierungStore — instructional done tracking', () => {
  beforeEach(() => {
    optimierungStore.resetSteps();
    optimierungStore.clearDone();
    optimierungStore.setStale(false);
  });

  // ─── stableKey ───────────────────────────────────────────────

  it('stableKey generates deterministic key from type + sorted apIds', () => {
    const key1 = instructionalStableKey({ type: 'move_ap', affectedApIds: ['ap-2', 'ap-1'] });
    const key2 = instructionalStableKey({ type: 'move_ap', affectedApIds: ['ap-1', 'ap-2'] });
    expect(key1).toBe(key2);
    expect(key1).toBe('move_ap:ap-1,ap-2');
  });

  it('stableKey differentiates by type', () => {
    const k1 = instructionalStableKey({ type: 'move_ap', affectedApIds: ['ap-1'] });
    const k2 = instructionalStableKey({ type: 'rotate_ap', affectedApIds: ['ap-1'] });
    expect(k1).not.toBe(k2);
  });

  // ─── markInstructionalDone / isInstructionalDone ─────────────

  it('markInstructionalDone marks rec as done', () => {
    const rec = { type: 'move_ap', affectedApIds: ['ap-1'] };
    expect(optimierungStore.isInstructionalDone(rec)).toBe(false);
    optimierungStore.markInstructionalDone(rec);
    expect(optimierungStore.isInstructionalDone(rec)).toBe(true);
  });

  it('markInstructionalDone does NOT set stale', () => {
    const rec = { type: 'move_ap', affectedApIds: ['ap-1'] };
    optimierungStore.setStale(false);
    optimierungStore.markInstructionalDone(rec);
    expect(optimierungStore.stale).toBe(false);
  });

  it('stale remains unchanged when marking instructional as done', () => {
    // If stale was already true (from a previous actionable_config apply), it stays true
    optimierungStore.setStale(true);
    const rec = { type: 'rotate_ap', affectedApIds: ['ap-2'] };
    optimierungStore.markInstructionalDone(rec);
    expect(optimierungStore.stale).toBe(true);
  });

  it('multiple recs can be marked as done independently', () => {
    const rec1 = { type: 'move_ap', affectedApIds: ['ap-1'] };
    const rec2 = { type: 'rotate_ap', affectedApIds: ['ap-2'] };
    optimierungStore.markInstructionalDone(rec1);
    expect(optimierungStore.isInstructionalDone(rec1)).toBe(true);
    expect(optimierungStore.isInstructionalDone(rec2)).toBe(false);
    optimierungStore.markInstructionalDone(rec2);
    expect(optimierungStore.isInstructionalDone(rec2)).toBe(true);
    expect(optimierungStore.doneCount).toBe(2);
  });

  // ─── clearDone ───────────────────────────────────────────────

  it('clearDone resets all done states', () => {
    optimierungStore.markInstructionalDone({ type: 'move_ap', affectedApIds: ['ap-1'] });
    optimierungStore.markInstructionalDone({ type: 'rotate_ap', affectedApIds: ['ap-2'] });
    expect(optimierungStore.doneCount).toBe(2);
    optimierungStore.clearDone();
    expect(optimierungStore.doneCount).toBe(0);
    expect(optimierungStore.isInstructionalDone({ type: 'move_ap', affectedApIds: ['ap-1'] })).toBe(false);
  });

  // ─── Serialization (getDoneKeys / loadDoneKeys) ──────────────

  it('getDoneKeys returns serializable array', () => {
    optimierungStore.markInstructionalDone({ type: 'move_ap', affectedApIds: ['ap-1'] });
    const keys = optimierungStore.getDoneKeys();
    expect(keys).toEqual(['move_ap:ap-1']);
  });

  it('loadDoneKeys restores done states', () => {
    optimierungStore.loadDoneKeys(['move_ap:ap-1', 'rotate_ap:ap-2']);
    expect(optimierungStore.isInstructionalDone({ type: 'move_ap', affectedApIds: ['ap-1'] })).toBe(true);
    expect(optimierungStore.isInstructionalDone({ type: 'rotate_ap', affectedApIds: ['ap-2'] })).toBe(true);
    expect(optimierungStore.doneCount).toBe(2);
  });

  // ─── stale interaction ───────────────────────────────────────

  it('setStale(true) only triggered for actionable types — store does not auto-set stale', () => {
    // The store's markInstructionalDone never touches stale.
    // This confirms the separation: stale is only managed by explicit setStale calls.
    optimierungStore.setStale(false);
    optimierungStore.markInstructionalDone({ type: 'change_mounting', affectedApIds: ['ap-3'] });
    optimierungStore.setStepState('rec-1', 'applied');
    expect(optimierungStore.stale).toBe(false);
  });
});
