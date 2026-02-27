<!--
  ShortcutHelp.svelte - Modal dialog showing all keyboard shortcuts.

  Renders shortcuts in a table with visual keyboard key styling.
  All descriptions are translated via i18n.
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import { DISPLAY_SHORTCUTS, formatShortcut } from '$lib/utils/keyboard';

  interface ShortcutHelpProps {
    open?: boolean;
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    onClose,
  }: ShortcutHelpProps = $props();

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      close();
    }
  }

  function close(): void {
    open = false;
    onClose?.();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="shortcut-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
    <div class="shortcut-dialog" role="dialog" aria-modal="true" aria-label={t('shortcuts.title')}>
      <div class="dialog-header">
        <h2 class="dialog-title">{t('shortcuts.title')}</h2>
        <button class="close-btn" onclick={close} title={t('action.close')}>
          <span>&times;</span>
        </button>
      </div>

      <div class="dialog-body">
        <table class="shortcut-table">
          <tbody>
            {#each DISPLAY_SHORTCUTS as shortcut (shortcut.action + shortcut.key)}
              <tr class="shortcut-row">
                <td class="shortcut-keys">
                  {#each formatShortcut(shortcut).split('+') as part, i}
                    {#if i > 0}
                      <span class="key-separator">+</span>
                    {/if}
                    <kbd class="key-cap">{part}</kbd>
                  {/each}
                </td>
                <td class="shortcut-desc">{t(shortcut.description_key)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcut-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .shortcut-dialog {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    max-width: 480px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
  }

  .dialog-title {
    font-size: 1rem;
    font-weight: 600;
    color: #1a1a2e;
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: #808090;
    font-size: 1.2rem;
    line-height: 1;
    transition: background 0.15s ease;
  }

  .close-btn:hover {
    background: #f0f0f5;
    color: #1a1a2e;
  }

  .dialog-body {
    padding: 12px 20px 20px;
    overflow-y: auto;
  }

  .shortcut-table {
    width: 100%;
    border-collapse: collapse;
  }

  .shortcut-row {
    border-bottom: 1px solid #f0f0f5;
  }

  .shortcut-row:last-child {
    border-bottom: none;
  }

  .shortcut-keys {
    padding: 10px 12px 10px 0;
    white-space: nowrap;
    width: 140px;
  }

  .shortcut-desc {
    padding: 10px 0;
    color: #4a4a6a;
    font-size: 0.85rem;
  }

  .key-cap {
    display: inline-block;
    min-width: 24px;
    padding: 3px 7px;
    background: linear-gradient(to bottom, #f8f8fc, #e8e8f0);
    border: 1px solid #d0d0e0;
    border-bottom-width: 2px;
    border-radius: 5px;
    color: #1a1a2e;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
    line-height: 1.4;
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
  }

  .key-separator {
    display: inline-block;
    margin: 0 2px;
    color: #808090;
    font-size: 0.7rem;
  }
</style>
