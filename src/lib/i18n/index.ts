/**
 * Internationalization (i18n) module for WLAN-Optimizer.
 *
 * Detects system language and loads the corresponding message file.
 * Supports English (en) and German (de) per D-18.
 *
 * Messages use nested keys (e.g., "menu.file", "signal.excellent").
 *
 * Language detection priority:
 *   1. Explicitly set locale (via setLocale)
 *   2. Stored preference (from Tauri settings)
 *   3. System language (detected via Tauri IPC or navigator.language)
 *   4. Fallback: 'de'
 */

import enMessages from './messages/en.json';
import deMessages from './messages/de.json';

// ─── Types ───────────────────────────────────────────────────────

export type Locale = 'en' | 'de';

/** Nested message dictionary type */
type MessageDict = Record<string, string | Record<string, string>>;

// ─── State ───────────────────────────────────────────────────────

let currentLocale: Locale = 'de';
let currentMessages: MessageDict = deMessages;

const messagesByLocale: Record<Locale, MessageDict> = {
  en: enMessages,
  de: deMessages,
};

/** Subscribers notified on locale change */
const subscribers: Array<(locale: Locale) => void> = [];

// ─── Public API ──────────────────────────────────────────────────

/**
 * Returns the translated message for the given dot-notated key.
 *
 * Supports nested keys like "menu.file" or "signal.excellent".
 * Falls back to English, then to the raw key string.
 *
 * @example
 * ```ts
 * t('menu.file')        // "Datei" (DE) or "File" (EN)
 * t('signal.excellent')  // "Ausgezeichnet" (DE) or "Excellent" (EN)
 * ```
 */
export function t(key: string): string {
  const result = resolveKey(currentMessages, key);
  if (result !== undefined) return result;

  // Fallback to English
  const fallback = resolveKey(enMessages, key);
  if (fallback !== undefined) return fallback;

  // Last resort: return the key itself
  return key;
}

/**
 * Returns the current locale.
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Sets the active locale and reloads messages.
 * Notifies all subscribers of the change.
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
  currentMessages = messagesByLocale[locale] ?? deMessages;

  for (const subscriber of subscribers) {
    subscriber(locale);
  }
}

/**
 * Subscribes to locale changes. Returns an unsubscribe function.
 */
export function onLocaleChange(callback: (locale: Locale) => void): () => void {
  subscribers.push(callback);
  return () => {
    const index = subscribers.indexOf(callback);
    if (index >= 0) {
      subscribers.splice(index, 1);
    }
  };
}

/**
 * Detects the system language and initializes the locale.
 *
 * Detection strategy:
 *   1. Try Tauri IPC command 'get_system_language' (returns macOS/Windows locale)
 *   2. Fall back to navigator.language
 *   3. Default to 'de'
 */
export async function detectAndSetLocale(): Promise<Locale> {
  let detected: string | null = null;

  // Attempt Tauri IPC for native language detection
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const sysLang = await invoke<string>('get_system_language');
    detected = sysLang;
  } catch {
    // Tauri not available (e.g., running in browser during dev)
    // Fall back to browser API
  }

  // Browser fallback
  if (!detected && typeof navigator !== 'undefined') {
    detected = navigator.language;
  }

  // Normalize to supported locale
  const locale = normalizeLocale(detected);
  setLocale(locale);
  return locale;
}

// ─── Internal Helpers ────────────────────────────────────────────

/**
 * Resolves a dot-notated key in a nested message dictionary.
 *
 * "menu.file" -> messages.menu.file
 * "app.title" -> messages.app.title
 */
function resolveKey(messages: MessageDict, key: string): string | undefined {
  const parts = key.split('.');

  if (parts.length === 1) {
    const value = messages[key];
    return typeof value === 'string' ? value : undefined;
  }

  if (parts.length === 2) {
    const [group, subkey] = parts;
    if (!group || !subkey) return undefined;

    const section = messages[group];
    if (typeof section === 'object' && section !== null) {
      const value = section[subkey];
      return typeof value === 'string' ? value : undefined;
    }
  }

  return undefined;
}

/**
 * Normalizes a locale string to a supported Locale.
 * 'de', 'de-DE', 'de-AT', 'de-CH' -> 'de'
 * Everything else -> 'en'
 */
function normalizeLocale(raw: string | null | undefined): Locale {
  if (!raw) return 'de';

  const lower = raw.toLowerCase();
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('en')) return 'en';

  // Unknown locale: default to German per D-18
  return 'de';
}
