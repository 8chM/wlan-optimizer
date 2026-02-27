/**
 * Settings Store - Svelte 5 Runes-based store for application settings.
 *
 * Loads settings from the Tauri backend on init, provides getters
 * for all fields, and auto-saves changes with debouncing.
 */

import { safeInvoke, type AppSettingsResponse } from '$lib/api/invoke';

// ─── Types ──────────────────────────────────────────────────────

export type ColorScheme = 'viridis' | 'thermal' | 'grayscale';

/** Default settings used before backend data is loaded */
const DEFAULT_SETTINGS: AppSettingsResponse = {
  locale: 'de',
  theme: 'system',
  default_color_scheme: 'viridis',
  default_grid_resolution_m: 0.5,
  iperf_server_ip: null,
  iperf_server_port: 5201,
  auto_save_enabled: true,
  auto_save_interval_s: 30,
};

// ─── Store ──────────────────────────────────────────────────────

function createSettingsStore() {
  let settings = $state<AppSettingsResponse>({ ...DEFAULT_SETTINGS });
  let isLoading = $state(false);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let initialized = $state(false);

  // Debounce timer handle
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Internal helpers ────────────────────────────────────────

  /** Extracts a readable error message from unknown errors. */
  function extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      return String((err as Record<string, unknown>).message);
    }
    return String(err);
  }

  /** Debounced save to backend. Waits 500ms after last change. */
  function debouncedSave(partial: Partial<AppSettingsResponse>): void {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(async () => {
      isSaving = true;
      error = null;
      try {
        const updated = await safeInvoke('update_settings', { params: partial });
        settings = updated;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isSaving = false;
        saveTimer = null;
      }
    }, 500);
  }

  return {
    // ── Getters (reactive via $state) ───────────────────────
    get locale() { return settings.locale; },
    get theme() { return settings.theme; },
    get defaultColorScheme() { return settings.default_color_scheme; },
    get defaultGridResolutionM() { return settings.default_grid_resolution_m; },
    get iperfServerIp() { return settings.iperf_server_ip; },
    get iperfServerPort() { return settings.iperf_server_port; },
    get autoSaveEnabled() { return settings.auto_save_enabled; },
    get autoSaveIntervalS() { return settings.auto_save_interval_s; },
    get isLoading() { return isLoading; },
    get isSaving() { return isSaving; },
    get error() { return error; },
    get initialized() { return initialized; },

    // ── Actions ─────────────────────────────────────────────

    /**
     * Load settings from the backend. Should be called once on app init.
     */
    async loadSettings(): Promise<void> {
      isLoading = true;
      error = null;
      try {
        settings = await safeInvoke('get_settings', {} as Record<string, never>);
        initialized = true;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
        // Keep default settings on error
      } finally {
        isLoading = false;
      }
    },

    /**
     * Update a single setting. Merges into local state immediately
     * and triggers a debounced save to the backend.
     */
    updateSetting<K extends keyof AppSettingsResponse>(
      key: K,
      value: AppSettingsResponse[K],
    ): void {
      settings = { ...settings, [key]: value };
      debouncedSave({ [key]: value });
    },

    /**
     * Update multiple settings at once. Merges into local state
     * immediately and triggers a debounced save.
     */
    updateSettings(partial: Partial<AppSettingsResponse>): void {
      settings = { ...settings, ...partial };
      debouncedSave(partial);
    },

    /**
     * Force an immediate save without debounce.
     */
    async saveNow(): Promise<void> {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      isSaving = true;
      error = null;
      try {
        const updated = await safeInvoke('update_settings', { params: settings });
        settings = updated;
      } catch (err: unknown) {
        error = extractErrorMessage(err);
      } finally {
        isSaving = false;
      }
    },

    clearError(): void {
      error = null;
    },

    reset(): void {
      settings = { ...DEFAULT_SETTINGS };
      initialized = false;
      error = null;
      isLoading = false;
      isSaving = false;
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    },
  };
}

/** Singleton settings store instance */
export const settingsStore = createSettingsStore();
