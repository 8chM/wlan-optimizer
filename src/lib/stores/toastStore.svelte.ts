/**
 * Toast Store - Svelte 5 Runes-based store for toast notifications.
 *
 * Manages a list of toast messages with auto-dismiss timers.
 * Supports success, warning, error, and info toast types.
 */

// ─── Types ──────────────────────────────────────────────────────

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
}

// ─── Store ──────────────────────────────────────────────────────

const DEFAULT_DURATION = 5000;

function createToastStore() {
  let toasts = $state<Toast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Generates a unique ID for each toast */
  function generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function scheduleRemoval(id: string, duration: number): void {
    const timer = setTimeout(() => {
      removeToast(id);
    }, duration);
    timers.set(id, timer);
  }

  function removeToast(id: string): void {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    toasts = toasts.filter((t) => t.id !== id);
  }

  function addToast(type: ToastType, message: string, duration?: number): string {
    const id = generateId();
    const effectiveDuration = duration ?? DEFAULT_DURATION;

    const toast: Toast = {
      id,
      type,
      message,
      duration: effectiveDuration,
    };

    toasts = [...toasts, toast];
    scheduleRemoval(id, effectiveDuration);

    return id;
  }

  return {
    // ── Getters ─────────────────────────────────────────────
    get toasts() {
      return toasts;
    },

    // ── Actions ─────────────────────────────────────────────

    addToast,
    removeToast,

    /** Show a success toast */
    success(message: string, duration?: number): string {
      return addToast('success', message, duration);
    },

    /** Show a warning toast */
    warning(message: string, duration?: number): string {
      return addToast('warning', message, duration);
    },

    /** Show an error toast */
    error(message: string, duration?: number): string {
      return addToast('error', message, duration);
    },

    /** Show an info toast */
    info(message: string, duration?: number): string {
      return addToast('info', message, duration);
    },

    /** Remove all toasts */
    clear(): void {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      toasts = [];
    },
  };
}

/** Singleton toast store instance */
export const toastStore = createToastStore();
