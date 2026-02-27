/**
 * Undo/Redo Store - Command Pattern implementation for the editor.
 *
 * Every user action (add/delete/move wall or AP) creates an EditorCommand
 * with execute() and undo() methods. Commands are pushed onto a stack
 * and can be undone/redone via Ctrl+Z / Ctrl+Shift+Z.
 *
 * Max stack depth: 50 commands (oldest are discarded).
 */

// ─── Types ──────────────────────────────────────────────────────

/** A reversible editor command */
export interface EditorCommand {
  /** Human-readable description for UI display */
  readonly label: string;
  /** Execute the command (first time or redo) */
  execute(): Promise<void>;
  /** Undo the command */
  undo(): Promise<void>;
}

const MAX_STACK_SIZE = 50;

// ─── Store ──────────────────────────────────────────────────────

function createUndoStore() {
  let undoStack = $state<EditorCommand[]>([]);
  let redoStack = $state<EditorCommand[]>([]);
  let isExecuting = $state(false);

  return {
    // ── Getters ─────────────────────────────────────────────
    get canUndo(): boolean { return undoStack.length > 0; },
    get canRedo(): boolean { return redoStack.length > 0; },
    get undoLabel(): string | null { return undoStack.at(-1)?.label ?? null; },
    get redoLabel(): string | null { return redoStack.at(-1)?.label ?? null; },
    get undoCount(): number { return undoStack.length; },
    get redoCount(): number { return redoStack.length; },
    get isExecuting(): boolean { return isExecuting; },

    // ── Actions ─────────────────────────────────────────────

    /**
     * Execute a command and push it onto the undo stack.
     * Clears the redo stack (new action invalidates future).
     */
    async execute(command: EditorCommand): Promise<void> {
      if (isExecuting) return;
      isExecuting = true;
      try {
        await command.execute();
        undoStack = [...undoStack, command].slice(-MAX_STACK_SIZE);
        redoStack = [];
      } finally {
        isExecuting = false;
      }
    },

    /**
     * Push a command onto the undo stack WITHOUT executing it.
     * Used when the action has already been performed (e.g., drag-end).
     */
    pushExecuted(command: EditorCommand): void {
      undoStack = [...undoStack, command].slice(-MAX_STACK_SIZE);
      redoStack = [];
    },

    /** Undo the most recent command */
    async undo(): Promise<void> {
      if (isExecuting || undoStack.length === 0) return;
      isExecuting = true;
      try {
        const command = undoStack.at(-1)!;
        await command.undo();
        undoStack = undoStack.slice(0, -1);
        redoStack = [...redoStack, command];
      } finally {
        isExecuting = false;
      }
    },

    /** Redo the most recently undone command */
    async redo(): Promise<void> {
      if (isExecuting || redoStack.length === 0) return;
      isExecuting = true;
      try {
        const command = redoStack.at(-1)!;
        await command.execute();
        redoStack = redoStack.slice(0, -1);
        undoStack = [...undoStack, command].slice(-MAX_STACK_SIZE);
      } finally {
        isExecuting = false;
      }
    },

    /** Clear both stacks (e.g., when switching projects) */
    reset(): void {
      undoStack = [];
      redoStack = [];
      isExecuting = false;
    },
  };
}

/** Singleton undo store instance */
export const undoStore = createUndoStore();
