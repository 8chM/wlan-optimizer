# Projekt-Entscheidungen (Phase 4)

> **Datum:** 2026-02-27 | **Status:** Alle 19 Fragen geklaert

## Entscheidungsregister

### D-01: Direkter AP-Zugriff (bestaetigt)
- AP wird ueber unser Tool gesteuert, NICHT ueber Nuclias Connect
- Adapter-Pattern: APControllerTrait mit austauschbaren Treibern

### D-02: Mixing Console MVP-Scope (F-01)
- **MVP: Forecast-Only** - Slider aendern nur die berechnete Heatmap + erzeugen Aenderungsliste
- **Apply = Assist-Mode** (Schritt-fuer-Schritt-Anleitung fuer manuelle Aenderungen am AP)
- **Spaeter: Auto-Mode** (Live-Steuerung pro Adapter/Hersteller, nach AP-Verifizierung)
- Run-3 bleibt sinnvoll: Verifizierung auch bei manuell angewendeten Aenderungen

### D-03: Kein Paywall (F-02)
- Alle Features sofort verfuegbar, gestuftes Onboarding
- "Optimizer-Mode" als bewusster Schritt (kein Lock, kein Lizenzschluessel)
- Optionale Monetarisierung spaeter: Signed Builds, Installer, Support, Preset-Packs
- Open Source bleibt voll nutzbar

### D-04: Tech-Stack (F-12, F-13)
- **Frontend:** Svelte 5 (Runes)
- **Desktop:** Tauri 2
- **Backend:** Rust (AP-Steuerung, DB, Netzwerk, iPerf-Sidecar)
- **Canvas:** Konva.js + svelte-konva
- **DB:** SQLite via rusqlite
- **i18n:** Paraglide-js
- **Tests:** Vitest (Unit), WebdriverIO + tauri-driver (E2E)
- **Linting:** Biome + eslint-plugin-svelte (fuer .svelte-Dateien)
- **BEDINGUNG:** PoC-Benchmarks muessen bestehen:
  - Heatmap-Render < 500ms (0.25m Grid, 3-5 APs, 50-80 Waende)
  - Canvas-Editor: Fluessiges Zoom/Pan + Wand-Editing ohne Lag
  - Worker-Offload: UI bleibt immer responsiv

### D-05: macOS-First (F-08)
- Volle Funktionalitaet zuerst auf macOS
- Windows V1.1, Linux V1.2
- RSSI/BSSID-Messung ueber plattformspezifischen Agent (macOS zuerst)
- Windows/Linux: Zuerst Basic-Messung (Ping/HTTP-Throughput), Agent spaeter
- Architektur plattformunabhaengig (Trait-basierte Abstraktionen)

### D-06: Heatmap im Frontend (F-14)
- TypeScript + Web Worker im MVP
- Progressive Render: Schnell grob, dann fein ("instant feel")
- Kein IPC-Overhead, direkte Canvas-Zugriff
- WASM-Migration spaeter moeglich ohne UI-Aenderung

### D-07: 10-12 Kernmaterialien + Quick-Kategorien (F-03)
- 3 Schnellkategorien: leicht/mittel/schwer
- 10-12 Detailmaterialien fuer Fortgeschrittene
- **WICHTIG: Materialwerte muessen user-editierbar sein** (global + pro Wand optional)
- Alle 27 Materialien in V1.1

### D-08: Multi-Floor vorbereiten (F-04)
- Datenstruktur Multi-Floor-faehig von Anfang an (floors-Tabelle, Foreign Keys)
- UI zeigt nur 1 Stockwerk im MVP
- Freischaltung in V1.1

### D-09: 6 GHz vorbereiten (F-05)
- Datenstruktur hat Felder fuer 2.4/5/6 GHz (Werte bereits recherchiert)
- UI zeigt nur 2.4 + 5 GHz Toggle im MVP
- 6 GHz freischalten sobald ein 6-GHz-AP zum Testen verfuegbar

### D-10: Herstellerunabhaengigkeit (F-19)
- DAP-X2810 als Referenz-AP mit spezifischem Adapter
- "Custom AP"-Profil: Benutzer gibt TX-Power/Antennengewinn manuell ein
- Custom AP = Forecast + Assist-Steps (kein Auto-Apply)
- D-Link-Adapter bekommt als erster Auto-Apply nach AP-Verifizierung (WL-AP-01)
- Weitere Hersteller-Adapter als Community-Contributions

### D-11: AP-Verifizierung als PoC (F-10)
- Nicht blockierend fuer MVP (bleibt im Assist-Mode)
- Aufgabenliste: IP erreichbar, Web-UI Login, SNMP on/off, SSH/Telnet, Firmware-Version
- Ergebnis bestimmt ob Auto-Mode moeglich wird

### D-12: iPerf3-Server (F-09)
- Kabelgebundenes Ziel ideal
- Same-Host-Fallback moeglich (misst WLAN + Host-Load, dokumentieren)
- App liefert Setup-Anleitung + Setup-Wizard

### D-13: iPerf3 als Sidecar bundlen (F-11)
- BSD-3-Clause kompatibel mit MIT
- ~2 MB pro Plattform
- Cross-Platform-Binaries im Build-Prozess

### D-14: Regelbasierter Optimierungsalgorithmus (F-06)
- Heuristiken erzeugen Vorschlags-Plan
- Benutzer kann Plan in der Mixing Console veraendern
- Tool zeigt Forecast-Heatmap + Confidence
- Greedy-Optimierung als V1.1-Erweiterung

### D-15: Messpunkte empfehlen, nicht erzwingen (F-07)
- Adaptive Empfehlung basierend auf Grundrissgroesse
- Warnung bei Unterschreitung, kein harter Zwang
- Kalibrierungsqualitaet (RMSE, Konfidenz) nach Messung transparent anzeigen

### D-16: Grundriss-Import Bild + PDF (F-15)
- PNG, JPG, PDF im MVP
- SVG-Import als V1.1-Erweiterung

### D-17: 3 Heatmap-Farbschemata (F-16)
- Viridis (Default, farbenblind-freundlich)
- Jet (klassischer WLAN-Look)
- Inferno (Alternative)

### D-18: System-Sprache erkennen (F-17)
- Automatisch DE wenn OS auf Deutsch, sonst EN
- Fallback: Sprach-Dialog beim Erststart
- Sprachwechsel jederzeit ueber Menue

### D-19: Code-Signing spaeter (F-18)
- MVP: Unsigned mit Installationsanleitung
- V1.0-Release: Apple Developer Account ($99/Jahr)
- Windows-Signing kann warten

## Terminologie (vereinheitlicht)

| Offiziell | Nicht verwenden |
|---|---|
| Mixing Console | Live-Konsole |
| Optimierungsassistent | Optimierungsmodul |
| Run 1 (Baseline) | nur "Run 1" |
| Run 2 (Post-Optimierung) | nur "Run 2" |
| Run 3 (Verifikation) | nur "Run 3" |
| Confidence (UI) / RMSE (technisch) | nur eins von beiden |
| Assist-Mode | manueller Modus |
| Auto-Mode | Live-Modus |

## Neue Konzepte (aus Benutzer-Praezisierungen)

### Mixing Console Modi
- **Forecast-Mode:** Slider aendern nur Simulation. Immer verfuegbar.
- **Assist-Mode:** Erzeugt Schritt-fuer-Schritt-Anleitung fuer manuelle AP-Aenderungen. MVP-Default fuer Apply.
- **Auto-Mode:** Sendet Aenderungen direkt an den AP (ueber Adapter). Nur verfuegbar nach AP-Verifizierung.

### PoC-Benchmarks (vor Phase 8)
1. Heatmap-Render < 500ms (0.25m Grid, 3-5 APs, 50-80 Waende)
2. Canvas-Editor: Fluessiges Zoom/Pan + Wand-Editing ohne Lag
3. Worker-Offload: UI bleibt immer responsiv
