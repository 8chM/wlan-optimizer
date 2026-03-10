<!--
  Settings page - Application settings with sections for language, appearance,
  heatmap defaults, measurement defaults, and about.

  Integrates:
  - settingsStore for loading/saving settings via Tauri backend
  - i18n setLocale/getLocale for language switching
  - themeStore for theme preference
-->
<script lang="ts">
import Layout from '$lib/components/layout/Layout.svelte';
import { t, type Locale, getLocale, setLocale } from '$lib/i18n';
import { settingsStore } from '$lib/stores/settingsStore.svelte';
import { type ThemePreference, themeStore } from '$lib/stores/themeStore.svelte';
import { recommendationStore } from '$lib/stores/recommendationStore.svelte';
import type { CandidatePolicy } from '$lib/recommendations/types';

// ─── Load Settings on Mount ─────────────────────────────────────

$effect(() => {
  if (!settingsStore.initialized) {
    settingsStore.loadSettings();
  }
});

// ─── Local State (bound to form controls) ──────────────────────

let currentLocale = $derived(getLocale());
let currentTheme = $derived(themeStore.theme);
let colorScheme = $derived(settingsStore.defaultColorScheme);
let candidatePolicy = $derived(recommendationStore.candidatePolicy);
let gridResolution = $derived(settingsStore.defaultGridResolutionM);
let iperfIp = $derived(settingsStore.iperfServerIp ?? '');
let iperfPort = $derived(settingsStore.iperfServerPort);

// ─── Handlers ──────────────────────────────────────────────────

function handleLocaleChange(locale: Locale): void {
  setLocale(locale);
  settingsStore.updateSetting('locale', locale);
}

function handleThemeChange(theme: ThemePreference): void {
  themeStore.setTheme(theme);
  settingsStore.updateSetting('theme', theme);
}

function handleColorSchemeChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  settingsStore.updateSetting('default_color_scheme', value);
}

function handleGridResolutionChange(event: Event): void {
  const value = Number.parseFloat((event.target as HTMLInputElement).value);
  settingsStore.updateSetting('default_grid_resolution_m', value);
}

function handleIperfIpChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  settingsStore.updateSetting('iperf_server_ip', value || null);
}

function handleIperfPortChange(event: Event): void {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  if (!isNaN(value) && value > 0 && value <= 65535) {
    settingsStore.updateSetting('iperf_server_port', value);
  }
}

function handleCandidatePolicyChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as CandidatePolicy;
  recommendationStore.setCandidatePolicy(value);
}

let supportToolsEnabled = $derived(recommendationStore.supportToolsEnabled);

function handleSupportToolsChange(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  recommendationStore.setSupportToolsEnabled(checked);
}
</script>

<svelte:head>
  <title>{t('nav.settings')} - {t('app.title')}</title>
</svelte:head>

<Layout showSidebar={false} showEditorTools={false}>
  <div class="settings-page">
    <div class="settings-container">
      <h2 class="settings-title">{t('settings.title')}</h2>

      <!-- Save Status Indicator -->
      {#if settingsStore.isSaving}
        <div class="save-indicator saving">{t('settings.saving')}</div>
      {/if}

      <!-- Language Section -->
      <section class="settings-section">
        <h3 class="section-title">{t('settings.language')}</h3>
        <div class="radio-group">
          <label class="radio-option" class:active={currentLocale === 'de'}>
            <input
              type="radio"
              name="language"
              value="de"
              checked={currentLocale === 'de'}
              onchange={() => handleLocaleChange('de')}
            />
            <span class="radio-label">{t('settings.languageDe')}</span>
          </label>
          <label class="radio-option" class:active={currentLocale === 'en'}>
            <input
              type="radio"
              name="language"
              value="en"
              checked={currentLocale === 'en'}
              onchange={() => handleLocaleChange('en')}
            />
            <span class="radio-label">{t('settings.languageEn')}</span>
          </label>
        </div>
      </section>

      <!-- Appearance Section -->
      <section class="settings-section">
        <h3 class="section-title">{t('settings.appearance')}</h3>
        <div class="field-row">
          <span class="field-label">{t('settings.theme')}</span>
          <div class="theme-buttons">
            <button
              class="theme-btn"
              class:active={currentTheme === 'light'}
              onclick={() => handleThemeChange('light')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1A.5.5 0 018 1zm3.354 2.646a.5.5 0 010 .708l-.708.708a.5.5 0 11-.707-.708l.707-.707a.5.5 0 01.708 0zM14 7.5a.5.5 0 010 1h-1a.5.5 0 010-1h1zM11.354 12.354l-.708-.708a.5.5 0 01.708-.708l.707.708a.5.5 0 01-.707.708zM8 13a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1A.5.5 0 018 13zm-3.354-.646l.708-.708a.5.5 0 11.707.708l-.707.707a.5.5 0 01-.708-.707zM2 7.5a.5.5 0 010 1h1a.5.5 0 010-1H2zm2.646-3.354l.708.708a.5.5 0 01-.708.708l-.707-.708a.5.5 0 01.707-.708zM8 5a3 3 0 100 6 3 3 0 000-6z"/>
              </svg>
              {t('settings.themeLight')}
            </button>
            <button
              class="theme-btn"
              class:active={currentTheme === 'dark'}
              onclick={() => handleThemeChange('dark')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z"/>
              </svg>
              {t('settings.themeDark')}
            </button>
            <button
              class="theme-btn"
              class:active={currentTheme === 'system'}
              onclick={() => handleThemeChange('system')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 10.5v-7zM3.5 3a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5h-9z"/>
                <path d="M5 14h6a.5.5 0 010 1H5a.5.5 0 010-1z"/>
              </svg>
              {t('settings.themeSystem')}
            </button>
          </div>
        </div>
      </section>

      <!-- Heatmap Defaults Section -->
      <section class="settings-section">
        <h3 class="section-title">{t('settings.heatmapDefaults')}</h3>

        <div class="field-row">
          <label class="field-label" for="color-scheme">{t('settings.colorScheme')}</label>
          <select
            id="color-scheme"
            value={colorScheme}
            onchange={handleColorSchemeChange}
            class="field-select"
          >
            <option value="viridis">Viridis</option>
            <option value="thermal">Thermal</option>
            <option value="grayscale">Grayscale</option>
          </select>
        </div>

        <div class="field-row">
          <label class="field-label" for="grid-resolution">
            {t('settings.gridResolution')}
            <span class="field-hint">{gridResolution.toFixed(2)} m</span>
          </label>
          <input
            id="grid-resolution"
            type="range"
            min="0.25"
            max="2.0"
            step="0.25"
            value={gridResolution}
            oninput={handleGridResolutionChange}
            class="field-slider"
          />
        </div>
      </section>

      <!-- Measurement Defaults Section -->
      <section class="settings-section">
        <h3 class="section-title">{t('settings.measurementDefaults')}</h3>

        <div class="field-row">
          <label class="field-label" for="iperf-ip">{t('settings.iperfServer')}</label>
          <input
            id="iperf-ip"
            type="text"
            value={iperfIp}
            oninput={handleIperfIpChange}
            placeholder="192.168.1.100"
            class="field-input"
          />
        </div>

        <div class="field-row">
          <label class="field-label" for="iperf-port">{t('settings.iperfPort')}</label>
          <input
            id="iperf-port"
            type="number"
            value={iperfPort}
            oninput={handleIperfPortChange}
            min="1"
            max="65535"
            class="field-input narrow"
          />
        </div>
      </section>

      <!-- Optimization Section -->
      <section class="settings-section">
        <h3 class="section-title">{t('settings.optimization')}</h3>

        <div class="field-row">
          <label class="field-label" for="candidate-policy">{t('settings.candidatePolicy')}</label>
          <select
            id="candidate-policy"
            value={candidatePolicy}
            onchange={handleCandidatePolicyChange}
            class="field-select"
          >
            <option value="required_for_new_ap">{t('settings.candidatePolicyRequiredNew')}</option>
            <option value="required_for_move_and_new_ap">{t('settings.candidatePolicyRequiredAll')}</option>
            <option value="optional">{t('settings.candidatePolicyOptional')}</option>
          </select>
        </div>

        <div class="field-row">
          <label class="field-label" for="support-tools">
            {t('settings.supportTools')}
            <span class="field-hint">{t('settings.supportToolsDesc')}</span>
          </label>
          <input
            id="support-tools"
            type="checkbox"
            checked={supportToolsEnabled}
            onchange={handleSupportToolsChange}
            class="field-checkbox"
          />
        </div>
      </section>

      <!-- About Section -->
      <section class="settings-section about-section">
        <h3 class="section-title">{t('settings.about')}</h3>

        <div class="about-grid">
          <div class="about-row">
            <span class="about-label">{t('settings.version')}</span>
            <span class="about-value">0.1.0 (MVP)</span>
          </div>
          <div class="about-row">
            <span class="about-label">{t('settings.techStack')}</span>
            <span class="about-value">SvelteKit + Tauri + Rust</span>
          </div>
        </div>
      </section>

      <!-- Error display -->
      {#if settingsStore.error}
        <div class="error-banner">{settingsStore.error}</div>
      {/if}
    </div>
  </div>
</Layout>

<style>
  .settings-page {
    height: 100%;
    overflow-y: auto;
    background: var(--bg-primary, #16162e);
  }

  .settings-container {
    max-width: 560px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  .settings-title {
    margin: 0 0 24px;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text-primary, #e0e0f0);
  }

  /* ── Save Indicator ──────────────────────────────────────── */

  .save-indicator {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-bottom: 16px;
    text-align: center;
  }

  .save-indicator.saving {
    background: rgba(99, 102, 241, 0.1);
    color: #a5b4fc;
  }

  /* ── Sections ────────────────────────────────────────────── */

  .settings-section {
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
  }

  .settings-section:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-title {
    margin: 0 0 14px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary, #e0e0f0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ── Radio Group (Language) ──────────────────────────────── */

  .radio-group {
    display: flex;
    gap: 10px;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    flex: 1;
  }

  .radio-option:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .radio-option.active {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.4);
  }

  .radio-option input[type="radio"] {
    accent-color: #6366f1;
  }

  .radio-label {
    font-size: 0.85rem;
    color: #c0c0d0;
    font-weight: 500;
  }

  /* ── Theme Buttons ───────────────────────────────────────── */

  .theme-buttons {
    display: flex;
    gap: 8px;
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #c0c0d0;
    font-size: 0.8rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .theme-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .theme-btn.active {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.4);
    color: #a5b4fc;
  }

  .theme-btn svg {
    opacity: 0.7;
  }

  .theme-btn.active svg {
    opacity: 1;
  }

  /* ── Field Rows ──────────────────────────────────────────── */

  .field-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .field-row:last-child {
    margin-bottom: 0;
  }

  .field-label {
    font-size: 0.8rem;
    color: #c0c0d0;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-hint {
    font-size: 0.7rem;
    color: #808090;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .field-select {
    padding: 7px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #c0c0d0;
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    min-width: 150px;
    transition: border-color 0.15s ease;
  }

  .field-select:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .field-select option {
    background: #1e1e3a;
    color: #c0c0d0;
  }

  .field-input {
    padding: 7px 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #c0c0d0;
    font-size: 0.8rem;
    font-family: inherit;
    outline: none;
    min-width: 180px;
    transition: border-color 0.15s ease;
  }

  .field-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .field-input.narrow {
    min-width: 100px;
    max-width: 120px;
  }

  .field-input::placeholder {
    color: #606070;
  }

  .field-slider {
    width: 180px;
    accent-color: #6366f1;
    cursor: pointer;
  }

  .field-checkbox {
    accent-color: #6366f1;
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  /* ── About Section ───────────────────────────────────────── */

  .about-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .about-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .about-label {
    font-size: 0.8rem;
    color: #808090;
  }

  .about-value {
    font-size: 0.8rem;
    color: #c0c0d0;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* ── Error ────────────────────────────────────────────────── */

  .error-banner {
    margin-top: 16px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 6px;
    color: #f87171;
    font-size: 0.8rem;
  }
</style>
