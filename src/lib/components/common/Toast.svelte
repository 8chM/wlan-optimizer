<!--
  Toast.svelte - Single toast notification item.

  Displays a colored toast message with close button.
  Type determines the left border color:
    success=#22c55e, warning=#f59e0b, error=#ef4444, info=#6366f1
-->
<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ToastType } from '$lib/stores/toastStore.svelte';

  interface ToastProps {
    /** Unique toast identifier */
    id: string;
    /** Toast type for color coding */
    type: ToastType;
    /** Toast message text */
    message: string;
    /** Callback to dismiss this toast */
    onClose?: (id: string) => void;
  }

  let {
    id,
    type,
    message,
    onClose,
  }: ToastProps = $props();

  function typeColor(toastType: ToastType): string {
    switch (toastType) {
      case 'success': return '#22c55e';
      case 'warning': return '#f59e0b';
      case 'error': return '#ef4444';
      case 'info': return '#6366f1';
      default: return '#6366f1';
    }
  }

  function typeIcon(toastType: ToastType): string {
    switch (toastType) {
      case 'success': return '\u2713';
      case 'warning': return '\u26A0';
      case 'error': return '\u2717';
      case 'info': return '\u2139';
      default: return '\u2139';
    }
  }

  function handleClose(): void {
    onClose?.(id);
  }
</script>

<div
  class="toast"
  style="--toast-color: {typeColor(type)}"
  role="alert"
>
  <span class="toast-icon">{typeIcon(type)}</span>
  <span class="toast-message">{message}</span>
  <button
    class="toast-close"
    onclick={handleClose}
    title={t('toast.close')}
    aria-label={t('toast.close')}
  >
    &times;
  </button>
</div>

<style>
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #1e1e36;
    border-left: 4px solid var(--toast-color);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    color: #e0e0f0;
    font-size: 0.85rem;
    min-width: 280px;
    max-width: 420px;
    animation: slideIn 0.25s ease-out;
  }

  .toast-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    color: var(--toast-color);
  }

  .toast-message {
    flex: 1;
    line-height: 1.4;
    word-break: break-word;
  }

  .toast-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    color: #808090;
    cursor: pointer;
    border-radius: 4px;
    font-size: 1.1rem;
    line-height: 1;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .toast-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0f0;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
</style>
