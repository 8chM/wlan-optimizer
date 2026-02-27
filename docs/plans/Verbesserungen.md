# Verbesserungen - WLAN-Optimizer

**Erstellt**: 2026-02-27
**Phase**: 9 (Qualitaetskontrolle)
**Quellen**: Code-Review, Security-Audit, UX-Review, Coverage-Analyse

---

## Zusammenfassung

| Prioritaet | Anzahl |
|-----------|--------|
| HOCH | 4 |
| MITTEL | 8 |
| NIEDRIG | 6 |
| **Gesamt** | **18** |

---

## HOCH

### H-01: Accessibility - Input Labels und Focus Management
**Kategorie**: UX / Barrierefreiheit
**Betroffene Dateien**: APProperties.svelte, NewProjectDialog.svelte, alle Modale
**Beschreibung**: TX-Power-Slider in APProperties fehlen `<label for="...">` Attribute. Modale Dialoge haben keine Focus-Trap (Tab-Navigation laeuft aus dem Dialog heraus). Background-Content fehlt `aria-hidden="true"` bei offenem Dialog.
**Empfehlung**: Focus-Trap-Logik fuer alle Dialoge implementieren, Labels fuer alle interaktiven Elemente nachruesten.

### H-02: iPerf3 Sidecar Argument-Allowlist
**Kategorie**: Security (Defence-in-Depth)
**Betroffene Dateien**: src-tauri/capabilities/default.json
**Beschreibung**: `"args": true` erlaubt beliebige Argumente fuer den iperf3-Sidecar. Die Rust-Validierung (`validate_server_ip`) schuetzt, aber eine Tauri-Ebene-Einschraenkung wuerde Defence-in-Depth bieten.
**Empfehlung**: `args` durch explizite Pattern-Liste ersetzen: `["-c", {"validator": "IP_ADDRESS"}, "-t", {"validator": "\\d+"}, "-P", {"validator": "\\d+"}, "-u", "-b", {"validator": "\\d+[KMG]?"}, "-R", "-J", "--omit", {"validator": "\\d+"}]`.

### H-03: Export-Modul implementieren
**Kategorie**: Feature
**Betroffene Dateien**: src-tauri/src/commands/export.rs
**Beschreibung**: Export-Command ist ein Stub (`TODO`). ExportDialog.svelte im Frontend existiert bereits, aber das Backend gibt immer einen Fehler zurueck.
**Empfehlung**: JSON/CSV-Export implementieren. Dateipfad ausschliesslich ueber `dialog:allow-save` File-Picker beziehen (kein Raw-Pfad vom Frontend).

### H-04: Nicht getestete Stores abdecken
**Kategorie**: Test-Abdeckung
**Betroffene Dateien**: projectStore, editorStore, themeStore, toastStore, autosaveStore
**Beschreibung**: 5 Stores haben 0% Coverage. Die Stores nutzen Svelte 5 Runes (`$state`), die ein spezielles Test-Environment erfordern.
**Empfehlung**: Entweder Store-Logik in reine Funktionen extrahieren (testbar ohne Svelte Runtime) oder `@testing-library/svelte` fuer Svelte 5 kompatible Tests einrichten.

---

## MITTEL

### M-01: CSP `unsafe-inline` entfernen
**Kategorie**: Security
**Betroffene Dateien**: src-tauri/tauri.conf.json
**Beschreibung**: `style-src 'self' 'unsafe-inline'` ist breiter als noetig. SvelteKit generiert scoped CSS mit Hash-Klassen.
**Empfehlung**: `'unsafe-inline'` entfernen und testen, ob alle Styles funktionieren. Falls noetig, Nonce-basierte Ausnahme.

### M-02: Document Title Management
**Kategorie**: UX
**Betroffene Dateien**: src/routes/+layout.svelte, alle Page-Komponenten
**Beschreibung**: Kein dynamischer Seitentitel. Browser-Tab zeigt generischen Titel.
**Empfehlung**: `<svelte:head>` mit `<title>` in jeder Page-Komponente, z.B. "Editor - Projektname - WLAN-Optimizer".

### M-03: Konsistente Loading-States
**Kategorie**: UX
**Betroffene Dateien**: Diverse Seiten und Stores
**Beschreibung**: Stores haben `isLoading`-Properties, aber Loading-Feedback ist inkonsistent. Kein globaler Spinner oder Skeleton.
**Empfehlung**: Einheitliche Loading-Komponente, die `isLoading` aus dem aktiven Store anzeigt. Buttons waehrend Async-Operationen deaktivieren.

### M-04: Error Recovery fuer DB-Lock-Fehler
**Kategorie**: Robustheit
**Betroffene Dateien**: Alle Tauri Commands mit `state.db.lock()`
**Beschreibung**: Bei `MutexGuard`-Fehler wird pauschal `AppError::Internal` zurueckgegeben. Kein Retry-Mechanismus.
**Empfehlung**: Retry mit Backoff (max 3 Versuche) oder User-freundliche Fehlermeldung ("Bitte erneut versuchen").

### M-05: getErrorTitle() i18n-Keys
**Kategorie**: i18n
**Betroffene Dateien**: src/lib/api/invoke.ts (getErrorTitle)
**Beschreibung**: Fehler-Titeltexte sind hartcodiert auf Englisch statt i18n-Keys zu verwenden.
**Empfehlung**: `getErrorTitle()` mit `t('error.commandName')` ersetzen.

### M-06: Disabled-Button Kontrast und aria-disabled
**Kategorie**: UX / Barrierefreiheit
**Betroffene Dateien**: ServerSetupWizard.svelte, diverse
**Beschreibung**: Disabled-Buttons fehlt `aria-disabled` Attribut. Farbkontrast im Disabled-State evtl. unzureichend.
**Empfehlung**: `aria-disabled` ergaenzen, Kontrast >= 3:1 sicherstellen (WCAG AA).

### M-07: Keyboard Event Handling auf semantischen Elementen
**Kategorie**: UX / Barrierefreiheit
**Betroffene Dateien**: ShortcutHelp.svelte, measure/+page.svelte
**Beschreibung**: `onkeydown` auf `<div>` statt auf semantischen Elementen (`<button>`, `<dialog>`). Leere `onkeydown={() => {}}` Handler in measure page.
**Empfehlung**: Dialog-Elemente als `<dialog>` HTML-Element verwenden. Leere Handler entfernen.

### M-08: HeatmapSettings 6GHz UI vorbereiten
**Kategorie**: Feature-Vorbereitung
**Betroffene Dateien**: HeatmapControls, Settings Page
**Beschreibung**: Backend und TypeScript-Typen enthalten `reference_loss_6ghz` und `show_6ghz`, aber die UI zeigt nur 2.4 + 5 GHz Kontrollen.
**Empfehlung**: UI-Elemente fuer 6 GHz ergaenzen (disabled/hidden mit Tooltip "Coming in V1.1") oder explizit ausblenden.

---

## NIEDRIG

### L-01: SVG-Import Risiko
**Kategorie**: Security
**Betroffene Dateien**: src-tauri/src/commands/floor.rs
**Beschreibung**: SVG als erlaubtes Format fuer Grundrissbilder. SVG kann `<script>` Tags enthalten. Aktuell kein Risiko (Rendering via `<img>` sandboxt Scripts), aber bei zukuenftiger Inline-Renderung XSS-Vektor.
**Empfehlung**: SVG-Sanitizer (z.B. DOMPurify) einsetzen oder SVG aus Allowlist entfernen.

### L-02: MaterialPicker aria-label
**Kategorie**: Barrierefreiheit
**Betroffene Dateien**: MaterialPicker.svelte
**Beschreibung**: Quick-Category-Buttons nutzen `title=` aber kein `aria-label`.
**Empfehlung**: `aria-label={t('material.categoryName')}` ergaenzen.

### L-03: Toast aria-live Region
**Kategorie**: Barrierefreiheit
**Betroffene Dateien**: Toast.svelte
**Beschreibung**: `role="alert"` ist vorhanden (impliziert `aria-live`), aber explizites `aria-live="assertive"` wuerde Kompatibilitaet erhoehen.
**Empfehlung**: `aria-live="assertive"` explizit setzen.

### L-04: connect-src CSP Haertung
**Kategorie**: Security
**Betroffene Dateien**: src-tauri/tauri.conf.json
**Beschreibung**: Kein `connect-src` Direktive in CSP. Theoretisch koennten `fetch()`-Aufrufe an externe Origins gehen.
**Empfehlung**: `connect-src 'self' ipc: http://ipc.localhost` ergaenzen.

### L-05: Delete-Confirmation als alertdialog
**Kategorie**: Barrierefreiheit
**Betroffene Dateien**: APProperties.svelte
**Beschreibung**: Loeschbestaetigung nutzt generische Buttons statt `role="alertdialog"`.
**Empfehlung**: Semantisch korrekte `<dialog>` mit `role="alertdialog"` verwenden.

### L-06: navigator.platform Deprecation
**Kategorie**: Technische Schuld
**Betroffene Dateien**: src/lib/utils/keyboard.ts
**Beschreibung**: `navigator.platform` ist deprecated. In Tauri aktuell funktional, aber zukunftssicher waere `navigator.userAgentData?.platform`.
**Empfehlung**: Migration zu User-Agent Client Hints API.

---

## Phase 10 Priorisierung

Fuer Phase 10 (Produktverbesserungen) empfohlene Reihenfolge:
1. H-03 (Export-Modul) — Feature-Kompletierung
2. H-02 (iPerf3 Allowlist) — Security Defence-in-Depth
3. H-01 (Accessibility Labels) — Barrierefreiheit
4. M-02 + M-03 (Title + Loading) — UX-Grundlagen
5. M-05 (i18n Error Titles) — Konsistenz
6. Restliche MITTEL nach Aufwand
7. NIEDRIG bei Gelegenheit
