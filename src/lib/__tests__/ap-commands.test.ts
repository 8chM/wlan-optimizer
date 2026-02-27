/**
 * Unit tests for access point editor commands (Phase 12a)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AP API before importing commands
vi.mock('$lib/api/accessPoint', () => ({
  createAccessPoint: vi.fn(),
  deleteAccessPoint: vi.fn(),
  updateAccessPoint: vi.fn(),
}));

import { createAccessPoint, deleteAccessPoint, updateAccessPoint } from '$lib/api/accessPoint';
import { addApCommand, deleteApCommand, moveApCommand, updateApCommand } from '$lib/stores/commands/apCommands';
import type { AccessPointResponse } from '$lib/api/invoke';

const mockedCreateAp = vi.mocked(createAccessPoint);
const mockedDeleteAp = vi.mocked(deleteAccessPoint);
const mockedUpdateAp = vi.mocked(updateAccessPoint);

const mockRefresh = vi.fn().mockResolvedValue(undefined);

function makeMockAp(overrides: Partial<AccessPointResponse> = {}): AccessPointResponse {
  return {
    id: 'ap-1',
    floor_id: 'floor-1',
    ap_model_id: 'model-1',
    label: 'AP-1',
    x: 3.0,
    y: 4.0,
    height_m: 2.5,
    mounting: 'ceiling',
    tx_power_24ghz_dbm: 17,
    tx_power_5ghz_dbm: 20,
    tx_power_6ghz_dbm: null,
    channel_24ghz: 6,
    channel_5ghz: 36,
    channel_6ghz: null,
    channel_width: 80,
    band_steering_enabled: false,
    ip_address: null,
    ssid: null,
    enabled: true,
    ap_model: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as AccessPointResponse;
}

describe('apCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addApCommand', () => {
    it('creates AP on execute and deletes on undo', async () => {
      const mockAp = makeMockAp();
      mockedCreateAp.mockResolvedValue(mockAp);
      mockedDeleteAp.mockResolvedValue(null);

      const cmd = addApCommand('floor-1', 3.0, 4.0, 'model-1', 'AP-1', mockRefresh);

      // Execute
      await cmd.execute();
      expect(mockedCreateAp).toHaveBeenCalledWith('floor-1', 3.0, 4.0, 'model-1', 'AP-1');
      expect(mockRefresh).toHaveBeenCalledTimes(1);

      // Undo
      await cmd.undo();
      expect(mockedDeleteAp).toHaveBeenCalledWith('ap-1');
      expect(mockRefresh).toHaveBeenCalledTimes(2);
    });

    it('does not delete on undo if execute was never called', async () => {
      const cmd = addApCommand('floor-1', 3.0, 4.0, undefined, undefined, mockRefresh);
      await cmd.undo();
      expect(mockedDeleteAp).not.toHaveBeenCalled();
    });
  });

  describe('deleteApCommand', () => {
    it('deletes on execute and re-creates on undo', async () => {
      const mockAp = makeMockAp();
      mockedDeleteAp.mockResolvedValue(null);
      mockedCreateAp.mockResolvedValue(mockAp);

      const cmd = deleteApCommand(mockAp, mockRefresh);

      // Execute
      await cmd.execute();
      expect(mockedDeleteAp).toHaveBeenCalledWith('ap-1');

      // Undo
      await cmd.undo();
      expect(mockedCreateAp).toHaveBeenCalledWith('floor-1', 3.0, 4.0, 'model-1', 'AP-1');
    });
  });

  describe('moveApCommand', () => {
    it('moves to new position on execute, restores on undo', async () => {
      mockedUpdateAp.mockResolvedValue(makeMockAp());

      const cmd = moveApCommand('ap-1', 3.0, 4.0, 7.0, 8.0, mockRefresh);

      // Execute
      await cmd.execute();
      expect(mockedUpdateAp).toHaveBeenCalledWith('ap-1', { x: 7.0, y: 8.0 });

      // Undo
      await cmd.undo();
      expect(mockedUpdateAp).toHaveBeenCalledWith('ap-1', { x: 3.0, y: 4.0 });
    });
  });

  describe('updateApCommand', () => {
    it('applies new values on execute, restores old on undo', async () => {
      mockedUpdateAp.mockResolvedValue(makeMockAp());

      const cmd = updateApCommand(
        'ap-1',
        { label: 'Old Label', enabled: true },
        { label: 'New Label', enabled: false },
        mockRefresh,
      );

      // Execute
      await cmd.execute();
      expect(mockedUpdateAp).toHaveBeenCalledWith('ap-1', { label: 'New Label', enabled: false });

      // Undo
      await cmd.undo();
      expect(mockedUpdateAp).toHaveBeenCalledWith('ap-1', { label: 'Old Label', enabled: true });
    });
  });
});
