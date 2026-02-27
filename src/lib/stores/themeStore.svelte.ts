/**
 * Theme Store - Svelte 5 Runes-based store for theme management.
 *
 * Supports three modes: 'light', 'dark', and 'system'.
 * In 'system' mode, the effective theme follows the OS preference
 * via matchMedia('(prefers-color-scheme: dark)').
 *
 * Persists the user's choice in localStorage under 'wlan-optimizer-theme'.
 */

// ─── Types ──────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'wlan-optimizer-theme';

// ─── Store ──────────────────────────────────────────────────────

function createThemeStore() {
  let theme = $state<ThemePreference>('system');
  let systemPrefersDark = $state(false);
  let initialized = $state(false);

  let effectiveTheme = $derived<EffectiveTheme>(
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme
  );

  /**
   * Apply the effective theme to the document root element.
   */
  function applyToDocument(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset['theme'] = effectiveTheme;
    }
  }

  /**
   * Initialize the theme store.
   * Detects system preference, loads saved preference, and sets up listeners.
   * Should be called once on app startup.
   */
  function initTheme(): void {
    if (typeof window === 'undefined') return;
    if (initialized) return;

    // Detect system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark = mediaQuery.matches;

    // Listen for system preference changes
    mediaQuery.addEventListener('change', (e: MediaQueryListEvent) => {
      systemPrefersDark = e.matches;
      applyToDocument();
    });

    // Load saved preference from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        theme = saved;
      }
    } catch {
      // localStorage not available (e.g., in tests)
    }

    initialized = true;
    applyToDocument();
  }

  /**
   * Set the theme preference and persist it.
   */
  function setTheme(newTheme: ThemePreference): void {
    theme = newTheme;

    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage not available
    }

    applyToDocument();
  }

  /**
   * Cycle through theme modes: light -> dark -> system -> light ...
   */
  function toggleTheme(): void {
    const cycle: ThemePreference[] = ['light', 'dark', 'system'];
    const currentIndex = cycle.indexOf(theme);
    const nextIndex = (currentIndex + 1) % cycle.length;
    setTheme(cycle[nextIndex]!);
  }

  return {
    // ── Getters ─────────────────────────────────────────────
    get theme() { return theme; },
    get effectiveTheme() { return effectiveTheme; },
    get initialized() { return initialized; },

    // ── Actions ──────────────────────────────────────────────
    initTheme,
    setTheme,
    toggleTheme,
  };
}

/** Singleton theme store instance */
export const themeStore = createThemeStore();
