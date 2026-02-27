/**
 * Unit tests for undoStore.svelte.ts (Phase 12a)
 *
 * Tests the undo/redo command stack store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { undoStore } from '$lib/stores/undoStore.svelte';
import type { EditorCommand } from '$lib/stores/undoStore.svelte';

// ─── Helpers ─────────────────────────────────────────────────────

function createMockCommand(label = 'Test Command'): EditorCommand & {
  executeCalls: number;
  undoCalls: number;
} {
  const cmd = {
    label,
    executeCalls: 0,
    undoCalls: 0,
    async execute() {
      cmd.executeCalls++;
    },
    async undo() {
      cmd.undoCalls++;
    },
  };
  return cmd;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('undoStore', () => {
  beforeEach(() => {
    undoStore.reset();
  });

  describe('initial state', () => {
    it('starts with empty stacks', () => {
      expect(undoStore.canUndo).toBe(false);
      expect(undoStore.canRedo).toBe(false);
      expect(undoStore.undoCount).toBe(0);
      expect(undoStore.redoCount).toBe(0);
      expect(undoStore.undoLabel).toBeNull();
      expect(undoStore.redoLabel).toBeNull();
      expect(undoStore.isExecuting).toBe(false);
    });
  });

  describe('execute', () => {
    it('executes a command and pushes it onto the undo stack', async () => {
      const cmd = createMockCommand('Add Wall');
      await undoStore.execute(cmd);

      expect(cmd.executeCalls).toBe(1);
      expect(undoStore.canUndo).toBe(true);
      expect(undoStore.undoCount).toBe(1);
      expect(undoStore.undoLabel).toBe('Add Wall');
    });

    it('clears the redo stack when executing a new command', async () => {
      const cmd1 = createMockCommand('Cmd 1');
      const cmd2 = createMockCommand('Cmd 2');

      await undoStore.execute(cmd1);
      await undoStore.undo();
      expect(undoStore.canRedo).toBe(true);

      await undoStore.execute(cmd2);
      expect(undoStore.canRedo).toBe(false);
      expect(undoStore.redoCount).toBe(0);
    });

    it('limits stack size to 50', async () => {
      for (let i = 0; i < 55; i++) {
        await undoStore.execute(createMockCommand(`Cmd ${i}`));
      }
      expect(undoStore.undoCount).toBe(50);
      expect(undoStore.undoLabel).toBe('Cmd 54');
    });
  });

  describe('pushExecuted', () => {
    it('pushes a command without calling execute', () => {
      const cmd = createMockCommand('Move AP');
      undoStore.pushExecuted(cmd);

      expect(cmd.executeCalls).toBe(0);
      expect(undoStore.canUndo).toBe(true);
      expect(undoStore.undoLabel).toBe('Move AP');
    });

    it('clears the redo stack', async () => {
      const cmd1 = createMockCommand('Cmd 1');
      await undoStore.execute(cmd1);
      await undoStore.undo();

      const cmd2 = createMockCommand('Cmd 2');
      undoStore.pushExecuted(cmd2);
      expect(undoStore.canRedo).toBe(false);
    });
  });

  describe('undo', () => {
    it('undoes the most recent command', async () => {
      const cmd = createMockCommand('Delete Wall');
      await undoStore.execute(cmd);

      await undoStore.undo();

      expect(cmd.undoCalls).toBe(1);
      expect(undoStore.canUndo).toBe(false);
      expect(undoStore.canRedo).toBe(true);
      expect(undoStore.redoLabel).toBe('Delete Wall');
    });

    it('does nothing when undo stack is empty', async () => {
      await undoStore.undo();
      expect(undoStore.canUndo).toBe(false);
      expect(undoStore.canRedo).toBe(false);
    });

    it('supports multiple undos', async () => {
      const cmd1 = createMockCommand('Cmd 1');
      const cmd2 = createMockCommand('Cmd 2');
      const cmd3 = createMockCommand('Cmd 3');

      await undoStore.execute(cmd1);
      await undoStore.execute(cmd2);
      await undoStore.execute(cmd3);

      await undoStore.undo();
      expect(undoStore.undoLabel).toBe('Cmd 2');

      await undoStore.undo();
      expect(undoStore.undoLabel).toBe('Cmd 1');

      await undoStore.undo();
      expect(undoStore.canUndo).toBe(false);
      expect(undoStore.redoCount).toBe(3);
    });
  });

  describe('redo', () => {
    it('redoes the most recently undone command', async () => {
      const cmd = createMockCommand('Add AP');
      await undoStore.execute(cmd);
      await undoStore.undo();

      await undoStore.redo();

      expect(cmd.executeCalls).toBe(2); // once for execute, once for redo
      expect(undoStore.canUndo).toBe(true);
      expect(undoStore.canRedo).toBe(false);
    });

    it('does nothing when redo stack is empty', async () => {
      await undoStore.redo();
      expect(undoStore.canUndo).toBe(false);
    });

    it('supports multiple redos', async () => {
      const cmd1 = createMockCommand('Cmd 1');
      const cmd2 = createMockCommand('Cmd 2');

      await undoStore.execute(cmd1);
      await undoStore.execute(cmd2);
      await undoStore.undo();
      await undoStore.undo();

      await undoStore.redo();
      expect(undoStore.undoLabel).toBe('Cmd 1');

      await undoStore.redo();
      expect(undoStore.undoLabel).toBe('Cmd 2');
      expect(undoStore.canRedo).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears both stacks', async () => {
      await undoStore.execute(createMockCommand());
      await undoStore.undo();

      undoStore.reset();

      expect(undoStore.canUndo).toBe(false);
      expect(undoStore.canRedo).toBe(false);
      expect(undoStore.undoCount).toBe(0);
      expect(undoStore.redoCount).toBe(0);
    });
  });
});
