<!--
  ContextMenu.svelte - Right-click context menu for the editor canvas.

  Shows contextual actions based on what is under the cursor.
-->
<script lang="ts">
  import { t } from '$lib/i18n';

  interface ContextMenuProps {
    /** Whether the menu is visible */
    visible: boolean;
    /** X position in screen pixels */
    x: number;
    /** Y position in screen pixels */
    y: number;
    /** Whether a wall is selected */
    hasWall: boolean;
    /** Whether an AP is selected */
    hasAp: boolean;
    /** Whether any item is selected */
    hasSelection: boolean;
    /** Whether the clipboard has data */
    hasClipboard?: boolean;
    /** Callback to delete selected item(s) */
    onDelete?: () => void;
    /** Callback to copy selection */
    onCopy?: () => void;
    /** Callback to cut selection */
    onCut?: () => void;
    /** Callback to paste clipboard */
    onPaste?: () => void;
    /** Callback to duplicate selection */
    onDuplicate?: () => void;
    /** Callback to select all items */
    onSelectAll?: () => void;
    /** Callback to close the menu */
    onClose?: () => void;
  }

  let {
    visible = false,
    x = 0,
    y = 0,
    hasWall = false,
    hasAp = false,
    hasSelection = false,
    hasClipboard = false,
    onDelete,
    onCopy,
    onCut,
    onPaste,
    onDuplicate,
    onSelectAll,
    onClose,
  }: ContextMenuProps = $props();

  function action(fn?: () => void): void {
    fn?.();
    onClose?.();
  }

  function handleClickOutside(): void {
    onClose?.();
  }

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');
  const mod = isMac ? '\u2318' : 'Ctrl+';
</script>

{#if visible}
  <!-- Backdrop to capture click-outside -->
  <div
    class="context-backdrop"
    onclick={handleClickOutside}
    oncontextmenu={(e) => { e.preventDefault(); handleClickOutside(); }}
    role="presentation"
  ></div>
  <div class="context-menu" style="left: {x}px; top: {y}px;" role="menu">
    <!-- Group 1: Selection-dependent -->
    <button
      class="context-item"
      class:disabled={!hasSelection}
      disabled={!hasSelection}
      onclick={() => action(onCopy)}
      role="menuitem"
    >
      <span class="context-icon">📋</span>
      <span>{t('context.copy')}</span>
      <span class="context-shortcut">{mod}C</span>
    </button>
    <button
      class="context-item"
      class:disabled={!hasSelection}
      disabled={!hasSelection}
      onclick={() => action(onCut)}
      role="menuitem"
    >
      <span class="context-icon">✂</span>
      <span>{t('context.cut')}</span>
      <span class="context-shortcut">{mod}X</span>
    </button>
    <button
      class="context-item"
      class:disabled={!hasSelection}
      disabled={!hasSelection}
      onclick={() => action(onDuplicate)}
      role="menuitem"
    >
      <span class="context-icon">⧉</span>
      <span>{t('context.duplicate')}</span>
      <span class="context-shortcut">{mod}D</span>
    </button>
    <button
      class="context-item"
      class:disabled={!hasSelection}
      disabled={!hasSelection}
      onclick={() => action(onDelete)}
      role="menuitem"
    >
      <span class="context-icon">🗑</span>
      <span>{t('shortcuts.delete')}</span>
      <span class="context-shortcut">Del</span>
    </button>

    <div class="context-separator"></div>

    <!-- Group 2: Always available -->
    <button
      class="context-item"
      class:disabled={!hasClipboard}
      disabled={!hasClipboard}
      onclick={() => action(onPaste)}
      role="menuitem"
    >
      <span class="context-icon">📌</span>
      <span>{t('context.paste')}</span>
      <span class="context-shortcut">{mod}V</span>
    </button>
    <button
      class="context-item"
      onclick={() => action(onSelectAll)}
      role="menuitem"
    >
      <span class="context-icon">⊞</span>
      <span>{t('context.selectAll')}</span>
      <span class="context-shortcut">{mod}A</span>
    </button>
  </div>
{/if}

<style>
  .context-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .context-menu {
    position: fixed;
    z-index: 100;
    background: rgba(26, 26, 46, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 4px;
    min-width: 200px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: #e0e0f0;
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s ease;
  }

  .context-item:hover:not(:disabled) {
    background: rgba(74, 108, 247, 0.2);
  }

  .context-item.disabled,
  .context-item:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .context-separator {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 8px;
  }

  .context-icon {
    font-size: 0.9rem;
    width: 18px;
    text-align: center;
  }

  .context-shortcut {
    margin-left: auto;
    font-size: 0.7rem;
    color: #6a6a8a;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
</style>
