/**
 * Unit tests for wall editor commands (Phase 12a)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the wall API before importing commands
vi.mock('$lib/api/wall', () => ({
  createWall: vi.fn(),
  deleteWall: vi.fn(),
  updateWall: vi.fn(),
}));

import { createWall, deleteWall, updateWall } from '$lib/api/wall';
import { addWallCommand, deleteWallCommand, updateWallMaterialCommand } from '$lib/stores/commands/wallCommands';
import type { WallResponse } from '$lib/api/invoke';

const mockedCreateWall = vi.mocked(createWall);
const mockedDeleteWall = vi.mocked(deleteWall);
const mockedUpdateWall = vi.mocked(updateWall);

const mockRefresh = vi.fn().mockResolvedValue(undefined);

function makeMockWall(overrides: Partial<WallResponse> = {}): WallResponse {
  return {
    id: 'wall-1',
    floor_id: 'floor-1',
    material_id: 'mat-concrete',
    segments: [
      { id: 'seg-1', wall_id: 'wall-1', segment_order: 0, x1: 0, y1: 0, x2: 5, y2: 0 },
    ],
    attenuation_override_24ghz: null,
    attenuation_override_5ghz: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as WallResponse;
}

describe('wallCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addWallCommand', () => {
    it('creates a wall on execute and deletes on undo', async () => {
      const mockWall = makeMockWall();
      mockedCreateWall.mockResolvedValue(mockWall);
      mockedDeleteWall.mockResolvedValue(null);

      const segments = [{ segment_order: 0, x1: 0, y1: 0, x2: 5, y2: 0 }];
      const cmd = addWallCommand('floor-1', 'mat-concrete', segments, mockRefresh);

      // Execute
      await cmd.execute();
      expect(mockedCreateWall).toHaveBeenCalledWith('floor-1', 'mat-concrete', segments);
      expect(mockRefresh).toHaveBeenCalledTimes(1);

      // Undo
      await cmd.undo();
      expect(mockedDeleteWall).toHaveBeenCalledWith('wall-1');
      expect(mockRefresh).toHaveBeenCalledTimes(2);
    });

    it('does not delete on undo if execute was never called', async () => {
      const segments = [{ segment_order: 0, x1: 0, y1: 0, x2: 5, y2: 0 }];
      const cmd = addWallCommand('floor-1', 'mat-concrete', segments, mockRefresh);

      await cmd.undo();
      expect(mockedDeleteWall).not.toHaveBeenCalled();
    });
  });

  describe('deleteWallCommand', () => {
    it('deletes on execute and re-creates on undo', async () => {
      const mockWall = makeMockWall();
      mockedDeleteWall.mockResolvedValue(null);
      mockedCreateWall.mockResolvedValue(mockWall);

      const cmd = deleteWallCommand(mockWall, mockRefresh);

      // Execute
      await cmd.execute();
      expect(mockedDeleteWall).toHaveBeenCalledWith('wall-1');
      expect(mockRefresh).toHaveBeenCalledTimes(1);

      // Undo
      await cmd.undo();
      expect(mockedCreateWall).toHaveBeenCalledWith('floor-1', 'mat-concrete', [
        { segment_order: 0, x1: 0, y1: 0, x2: 5, y2: 0 },
      ]);
      expect(mockRefresh).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateWallMaterialCommand', () => {
    it('changes material on execute and restores on undo', async () => {
      mockedUpdateWall.mockResolvedValue(makeMockWall());

      const cmd = updateWallMaterialCommand('wall-1', 'mat-old', 'mat-new', mockRefresh);

      // Execute
      await cmd.execute();
      expect(mockedUpdateWall).toHaveBeenCalledWith('wall-1', { materialId: 'mat-new' });

      // Undo
      await cmd.undo();
      expect(mockedUpdateWall).toHaveBeenCalledWith('wall-1', { materialId: 'mat-old' });
    });
  });
});
