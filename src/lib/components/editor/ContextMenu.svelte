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
    /** Callback to delete selected item(s) */
    onDelete?: () => void;
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
    onDelete,
    onClose,
  }: ContextMenuProps = $props();

  function handleDelete(): void {
    onDelete?.();
    onClose?.();
  }

  function handleClickOutside(): void {
    onClose?.();
  }
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
    {#if hasSelection}
      <button class="context-item" onclick={handleDelete} role="menuitem">
        <span class="context-icon">🗑</span>
        <span>{t('shortcuts.delete')}</span>
        <span class="context-shortcut">Del</span>
      </button>
    {:else}
      <div class="context-item disabled">
        <span class="context-hint">{t('properties.noSelection')}</span>
      </div>
    {/if}
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
    min-width: 180px;
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

  .context-item:hover {
    background: rgba(74, 108, 247, 0.2);
  }

  .context-item.disabled {
    cursor: default;
    opacity: 0.5;
  }

  .context-item.disabled:hover {
    background: transparent;
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

  .context-hint {
    font-size: 0.75rem;
    color: #6a6a8a;
  }
</style>
