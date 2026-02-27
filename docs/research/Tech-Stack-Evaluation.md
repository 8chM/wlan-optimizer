# Tech-Stack-Evaluation: WLAN-Optimizer

> **Phase 3c Deliverable** | **Datum:** 2026-02-27 | **Status:** Abgeschlossen
>
> Umfassende Evaluation der Technologie-Kandidaten fuer das WLAN-Optimizer Projekt.
> Basis: Aktuelle Benchmarks und Dokumentation (2025/2026).

---

## Inhaltsverzeichnis

1. [Frontend-Framework](#1-frontend-framework)
2. [Desktop-Framework](#2-desktop-framework)
3. [Canvas-Library](#3-canvas-library)
4. [Datenbank](#4-datenbank)
5. [Testing](#5-testing)
6. [Build & Tooling](#6-build--tooling)
7. [Zusammenfassung & Empfehlung](#7-zusammenfassung--empfehlung)

---

## 1. Frontend-Framework

### 1.1 Svelte 5 (Runes)

**Performance (js-framework-benchmark, Stand 2025/2026):**
- Fuehrend mit ~39,5 Operationen/Sekunde
- 39% schneller als React 19 in synthetischen Benchmarks
- 60% schneller beim Rendering in realen Szenarien
- Lighthouse Score: 96/100

**Bundle-Size:**
- Baseline: ~28 KB (gzipped)
- Compiler-Ansatz: Nur genutzter Code landet im Bundle
- 2,5x kleiner als React 19

**Canvas-Integration:**
- `svelte-konva` (offiziell von Konva.js): Runes-only, voll Svelte 5 kompatibel
- Deklarative Bindings zu Konva Framework
- Alle Konva-Shapes verfuegbar (Rect, Circle, Line, Path, Image, etc.)
- Unmittelbar nutzbare Node-Objekte (kein `await tick()` mehr noetig)
- Tree-Shaking: Nur benoetigte Konva-Komponenten werden importiert

**i18n-Loesungen:**
- **Paraglide-js** (empfohlen): Compiler-basiert, Tree-Shakeable Message-Funktionen, vollstaendige Typsicherheit, IntelliSense-Support, minimale Bundle-Size. Offiziell im Svelte CLI integriert.
- **svelte-i18n**: Runtime-basiert, ausgereifter, aber groesserer Bundle-Impact.
- **Empfehlung:** Paraglide-js - perfekte Passung fuer Compiler-Philosophie von Svelte.

**State Management (Runes):**
- `$state`, `$derived`, `$effect` als Kern-Runes
- Universelle Reaktivitaet in `.svelte.js/.svelte.ts` Dateien
- Kein externer State Manager noetig fuer die meisten Anwendungsfaelle
- Stores weiterhin verfuegbar, aber Anwendungsfaelle stark reduziert
- Granulare Reaktivitaet auch bei komplexen Objekten
- `$derived.by(fn)` fuer abgeleitete Berechnungen

**TypeScript-Support:**
- Native TypeScript-Unterstuetzung ohne Preprocessor (ab Svelte 5)
- Automatische Typ-Inferenz fuer Props und Parameter
- **Einschraenkung:** Keine TypeScript-Runtime-Features (Enums, Decorators)
- Gute IDE-Integration (VS Code, WebStorm)

**Oekosystem & Community:**
- shadcn-svelte: 40+ Komponenten, Svelte 5 + Tailwind v4 Support (7.500+ GitHub Stars)
- Skeleton, Flowbite Svelte als Alternativen
- Wachsend, aber kleiner als React/Vue (7,2% Marktanteil vs. 44,7% React)
- Aktive Entwicklung mit monatlichen Updates (November/Dezember 2025)

**Limitationen:**
- LSP kann bei sehr grossen Projekten langsam werden (RAM-Probleme)
- Kein esbuild/swc/rspack-Support fuer Svelte (nur Vite/Rollup)
- Kleineres Oekosystem: Weniger Third-Party-Libraries als React/Vue
- Weniger etablierte Best Practices fuer komplexe Architekturmuster

### 1.2 React 19

**Performance (js-framework-benchmark):**
- ~28,4 Operationen/Sekunde
- Lighthouse Score: 92/100
- Server Components: **Nicht relevant** fuer Desktop-App (kein Server)

**Bundle-Size:**
- Baseline: ~72 KB (gzipped) - groesster der drei Kandidaten
- React 19 + ReactDOM als Pflicht-Dependencies

**Canvas-Integration:**
- `react-konva` (v19.2.0): Aktiv gepflegt, React 19 kompatibel
- Aelteste und reifste Konva-Integration
- Umfangreiche Dokumentation und Beispiele
- Grosses Oekosystem: react-flow, react-dnd als Ergaenzung

**i18n-Loesungen:**
- `react-i18next` + `i18next`: De-facto-Standard, sehr ausgereift
- `next-intl`, `formatjs` als Alternativen
- Tree-Shaking moeglich, aber nicht so elegant wie Paraglide

**State Management:**
- Zustand, Jotai, Recoil - alle ausgereift und stabil
- React 19: Verbesserte Context-API
- Mehr Boilerplate als Svelte Runes

**TypeScript-Support:**
- Exzellent, seit Jahren etabliert
- Groesste Sammlung an Type-Definitionen (@types/*)
- Volle IDE-Unterstuetzung

**Oekosystem & Community:**
- Groesstes Oekosystem aller Frontend-Frameworks
- 44,7% Marktanteil, riesige Community
- Library fuer praktisch jeden Anwendungsfall verfuegbar
- shadcn/ui als Referenz-Component-Library

**Limitationen:**
- Groesserer Bundle
- Mehr Boilerplate-Code
- Virtual DOM Overhead (geringer als frueher, aber vorhanden)
- Server Components fuer Desktop irrelevant

### 1.3 Vue 3.5+

**Performance (js-framework-benchmark):**
- ~31,2 Operationen/Sekunde (Platz 2)
- Lighthouse Score: 94/100
- Vapor Mode (experimentell): Unter 10 KB Baseline, Svelte-aehnliche Performance

**Bundle-Size:**
- Standard: ~58 KB (gzipped)
- Mit Vapor Mode: Unter 10 KB (experimentell, noch nicht produktionsreif)
- Gutes Tree-Shaking (~20 KB gzipped bei Vue 3)

**Canvas-Integration:**
- `vue-konva`: Vue 3 kompatibel, deklarative Bindings
- Interactive Building Map Beispiele in Konva-Dokumentation
- Weniger aktiv als react-konva, aber funktional

**i18n-Loesungen:**
- `vue-i18n` (v9.x): Ausgereift, gute Integration
- AST-Kompilierung ab v9.3, Runtime-only-Version verfuegbar
- CSP-kompatibel
- Bundle-Size-Optimierung moeglich, aber komplexer als Paraglide

**State Management:**
- Pinia: Offizieller Store, exzellent
- Composition API: Reaktivitaet aehnlich elegant wie Svelte Runes
- `ref()`, `computed()`, `watch()` als Aequivalente

**TypeScript-Support:**
- Sehr gut, native Vue 3 Integration
- `<script setup lang="ts">` fuer optimale DX
- Automatische Prop-Typisierung

**Oekosystem & Community:**
- Zweitgroesstes Oekosystem
- Nuxt als Meta-Framework (aber fuer Desktop nicht relevant)
- PrimeVue, Vuetify, Naive UI als Component Libraries
- Starke Community in Asien und Europa

**Limitationen:**
- Vapor Mode noch experimentell
- vue-konva weniger aktiv gepflegt als react-konva
- Options API vs. Composition API: Fragmentierung der Codebasis

### 1.4 Frontend-Framework Vergleichsmatrix

| Kriterium | Svelte 5 | React 19 | Vue 3.5+ |
|-----------|----------|----------|----------|
| **Performance (Benchmark)** | 39,5 ops/s | 28,4 ops/s | 31,2 ops/s |
| **Bundle-Size** | ~28 KB | ~72 KB | ~58 KB |
| **Lighthouse Score** | 96/100 | 92/100 | 94/100 |
| **Canvas (Konva)** | svelte-konva (Svelte 5 nativ) | react-konva (am reifsten) | vue-konva (funktional) |
| **i18n** | Paraglide (compiler-basiert) | react-i18next (ausgereift) | vue-i18n (ausgereift) |
| **State Management** | Runes (eingebaut) | Zustand/Jotai (extern) | Pinia/Composition (offiziell) |
| **TypeScript** | Gut (nativ, Einschraenkungen) | Exzellent | Sehr gut |
| **Oekosystem-Groesse** | Klein (wachsend) | Sehr gross | Gross |
| **Lernkurve** | Niedrig | Mittel | Niedrig-Mittel |
| **Boilerplate** | Minimal | Mittel | Gering |
| **Desktop-Eignung** | Sehr gut | Gut | Gut |

---

## 2. Desktop-Framework

### 2.1 Tauri 2

**Stabilitaet & Version:**
- Tauri 2.0 Stable Release: Oktober 2024
- Aktiv gepflegt, regelmaessige Patches (2025/2026)
- Plugin-Oekosystem stabil und wachsend
- Adoption +35% Year-over-Year nach 2.0 Release

**IPC-Performance (Frontend <-> Rust Backend):**
- Kompletter IPC-Rewrite in v2: Raw Payloads statt JSON-Serialisierung
- macOS: ~5 ms fuer 10 MB Daten
- **Windows: ~200 ms fuer 10 MB Daten** (bekanntes Problem, WebView2-basiert)
- Fuer typische IPC-Aufrufe (kleine Payloads): Sub-Millisekunde
- **Bewertung fuer WLAN-Optimizer:** Akzeptabel - Heatmap-Daten werden im Frontend berechnet, grosse Datentransfers selten noetig

**Filesystem-Zugriff (SQLite):**
- Offizielles `tauri-plugin-sql` (basiert auf sqlx): SQLite, MySQL, PostgreSQL
- `tauri-plugin-rusqlite2` (Community): Direkter rusqlite-Zugriff, Transactions, Migrations
- Voller Filesystem-Zugriff ueber Tauri-Scope-System
- **Empfehlung:** rusqlite direkt im Rust-Backend (synchron, performant, ideal fuer Desktop)

**Netzwerk-Zugriff:**
- `tauri-plugin-http`: HTTP-Requests (reqwest Re-Export), Scope-basiert
- `tauri-plugin-network`: Netzwerk-Interface-Scanning
- SNMP: Kein offizielles Plugin, aber Rust-Crates (snmp, snmp-rs) ueber Custom Commands nutzbar
- SSH/Telnet: Ueber Rust-Crates (russh, telnet) moeglich
- **Bewertung:** Alle fuer AP-Steuerung benoetigten Protokolle ueber Rust-Backend realisierbar

**Auto-Update:**
- `tauri-plugin-updater`: Offizielles Plugin
- GitHub Releases als Update-Endpoint
- Code-Signing erforderlich (TAURI_SIGNING_PRIVATE_KEY)
- `latest.json` Format mit OS/Arch/Installer-Keys
- **Bewertung:** Produktionsreif

**Cross-Platform-Build:**
- `tauri-action` (GitHub Actions): macOS, Windows, Linux in einer Workflow-Matrix
- ARM64-Support (Ubuntu 22.04/24.04 ARM Runner seit August 2025)
- macOS Universal Binary: Noch problematisch (Doppel-Codesigning gemeldet)
- Windows: .exe und .msi (kein .appx/.msix)
- Linux: .deb, .AppImage, .rpm
- **Bewertung:** Gut, aber macOS Universal Binary beachten

**Bundle-Size:**
- Installer: 2,5-10 MB (je nach Abhaengigkeiten)
- Nutzt System-WebView (kein Chromium gebundled)
- **Vergleich Electron:** 80-150 MB

**RAM-Verbrauch:**
- Idle: 30-50 MB
- **Vergleich Electron:** 150-300 MB

**Startup-Zeit:**
- Unter 500 ms
- **Vergleich Electron:** 1-2 Sekunden

### 2.2 Electron (Vergleich)

**Stabilitaet:**
- Seit 2013, extrem ausgereift
- Verwendet von VS Code, Slack, Discord, Figma
- Chromium + Node.js gebundled

**IPC-Performance:**
- Basiert auf Chromium IPC
- Konsistent ueber alle Plattformen
- Etwas langsamer als Tauri fuer kleine Payloads, aber gleichmaessiger

**Filesystem & Datenbank:**
- `better-sqlite3`: Synchron, extrem schnell, de-facto-Standard fuer Node.js SQLite
- Voller Node.js Filesystem-Zugriff ohne Scope-Einschraenkungen
- `sql.js` als WebAssembly-Alternative

**Netzwerk-Zugriff:**
- Voller Node.js-Zugriff: net-snmp, ssh2, node-telnet als bewaahrte Libraries
- npm-Oekosystem fuer praktisch jedes Netzwerk-Protokoll
- **Vorteil gegenueber Tauri:** Deutlich einfachere iPerf3-Integration (child_process)

**Auto-Update:**
- `electron-updater` / `update-electron-app`: Ausgereift
- GitHub, S3, eigener Server als Update-Quelle
- Squirrel, NSIS als Installer

**Cross-Platform-Build:**
- `electron-builder`: Sehr ausgereift
- macOS Universal Binary: Funktioniert zuverlaessig
- Code-Signing gut dokumentiert
- GitHub Actions Support exzellent

**Bundle-Size:**
- 80-150 MB (Chromium + Node.js gebundled)
- Delta-Updates reduzieren Update-Groesse

**RAM-Verbrauch:**
- 150-300 MB idle
- Bei komplexen Apps: 300-500+ MB
- Multi-Prozess-Architektur (Main + Renderer)

**Startup-Zeit:**
- 1-2 Sekunden (Mid-Range Hardware)
- Chromium-Initialisierung dominiert

### 2.3 Neutralino.js (Kurz-Evaluation)

**Eignung fuer WLAN-Optimizer: NICHT EMPFOHLEN**

- Kein Auto-Update-Mechanismus
- Kein Single-Binary-Support (immer Ressource-Datei + Binary)
- Sicherheitsmaengel fuer native Apps
- Kein Node.js/npm-Oekosystem
- Keine Transaction/Migration-faehige SQLite-Integration
- Deutlich weniger Community und Plugin-Support
- **Fazit:** Neutralino.js ist fuer einfache Web-Wrapper geeignet, nicht fuer eine komplexe Desktop-App wie den WLAN-Optimizer.

### 2.4 Desktop-Framework Vergleichsmatrix

| Kriterium | Tauri 2 | Electron | Neutralino.js |
|-----------|---------|----------|---------------|
| **Bundle-Size** | 2,5-10 MB | 80-150 MB | 3-5 MB |
| **RAM (idle)** | 30-50 MB | 150-300 MB | 20-40 MB |
| **Startup** | < 500 ms | 1-2 s | < 500 ms |
| **IPC** | Schnell (Plattform-abh.) | Konsistent | Begrenzt |
| **SQLite** | rusqlite/sqlx (Rust) | better-sqlite3 (Node.js) | Kein nativer Support |
| **Netzwerk** | Rust-Crates | npm-Pakete (umfangreicher) | Begrenzt |
| **Auto-Update** | Plugin (funktional) | Sehr ausgereift | Nicht vorhanden |
| **Cross-Platform** | Gut (macOS-Einschraenkung) | Exzellent | Gut |
| **Sicherheit** | Scope-basiert (stark) | Prozess-Isolation | Schwach |
| **Lernkurve** | Mittel (Rust noetig) | Niedrig (JavaScript) | Niedrig |
| **Community** | Wachsend (35k+ Stars) | Sehr gross (115k+ Stars) | Klein (7k Stars) |

---

## 3. Canvas-Library

### 3.1 Konva.js (mit svelte-konva)

**Eignung fuer WLAN-Optimizer:**
- Deklarative API: Grundriss als Szene-Graph (Waende = Lines, APs = Circles/Images)
- Layer-System: Grundriss-Layer + Heatmap-Layer + UI-Layer getrennt
- Event-Handling: Drag-and-Drop fuer AP-Platzierung
- Hit-Detection: Wand-Selektion per Klick
- Custom Shapes: Fuer Tueren/Fenster, spezielle Wandtypen
- Image-Import: Grundriss-Bild als Hintergrund-Layer
- Export: Stage-to-Image fuer Screenshot/PDF-Export
- Performance: Virtual-DOM-aehnliche Struktur, minimiert Redraws

**svelte-konva Spezifika:**
- Runes-only (Svelte 5 nativ)
- Tree-Shaking pro Komponente
- Reaktive Prop-Updates
- Aktiv gepflegt vom Konva-Team

### 3.2 Heatmap-Rendering-Strategie

**Problem:** RF-Berechnung ist CPU-intensiv (Pixel-fuer-Pixel Signalstaerke)

**Loesung: Web Workers + OffscreenCanvas**
- RF-Berechnung in Web Worker (blockiert nicht die UI)
- Heatmap als ImageData rendern
- OffscreenCanvas fuer Worker-seitiges Rendering
- Ergebnis als ImageBitmap an Hauptthread transferieren
- Konva Image-Node zeigt das Ergebnis an
- **Vorteil:** Echtzeit-Aktualisierung bei Parameteraenderungen moeglich

**Alternative: Canvas 2D direkt (ohne Konva fuer Heatmap)**
- Dedizierter Canvas-Layer unter dem Konva-Stage
- Direkte Pixel-Manipulation via `putImageData()`
- Performanter fuer grosse Heatmaps (kein Shape-Overhead)
- **Empfehlung:** Hybrid-Ansatz: Konva fuer interaktive Elemente, nativer Canvas fuer Heatmap

### 3.3 Fabric.js (Vergleich)

| Kriterium | Konva.js | Fabric.js |
|-----------|----------|-----------|
| **Bundle-Size** | Kleiner (fokussiert) | Groesser (mehr Features) |
| **Performance** | Besser bei vielen Objekten | Gut, aber schwerer |
| **Svelte-Integration** | svelte-konva (offiziell) | Keine offizielle Svelte-Wrapper |
| **Layer-System** | Eingebaut | Manuell |
| **Text-Editing** | Manuell | Eingebaut |
| **Event-System** | Global (Stage-basiert) | Objekt-basiert |
| **Desktop-Eignung** | Sehr gut | Gut |

**Empfehlung:** Konva.js - Bessere Svelte-Integration, leichter, Layer-System ideal fuer Grundriss + Heatmap Overlay.

---

## 4. Datenbank

### 4.1 SQLite ueber Tauri-Backend (Empfehlung)

**Optionen:**

| Option | Beschreibung | Empfehlung |
|--------|-------------|------------|
| `tauri-plugin-sql` (sqlx) | Offizielles Plugin, SQL ueber IPC | Einfachster Einstieg |
| `rusqlite` direkt | Synchron, im Rust-Backend | Beste Performance |
| `tauri-plugin-rusqlite2` | Community-Plugin mit Transactions | Guter Kompromiss |
| Kysely + Tauri SQL | Type-safe Query Builder | Beste DX im Frontend |

**Empfehlung: rusqlite im Rust-Backend**
- Synchrone API: Ideal fuer Desktop (kein async Overhead)
- Volle Kontrolle ueber Schema, Migrations, Transactions
- Keine IPC fuer Datenbank-Queries noetig
- Frontend greift ueber Tauri Commands auf Daten zu (strukturierte DTOs)

**Schema-Design fuer Grundriss-Daten (Konzept):**

```sql
-- Projekte
CREATE TABLE projects (
  id TEXT PRIMARY KEY,  -- UUID
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  settings TEXT  -- JSON fuer Projekt-Einstellungen
);

-- Grundriss-Ebenen (Stockwerke)
CREATE TABLE floors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  floor_number INTEGER NOT NULL,
  background_image BLOB,  -- Grundriss-Bild
  scale_px_per_meter REAL,  -- Massstab
  width_meters REAL,
  height_meters REAL
);

-- Waende
CREATE TABLE walls (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES floors(id),
  x1 REAL NOT NULL, y1 REAL NOT NULL,
  x2 REAL NOT NULL, y2 REAL NOT NULL,
  material TEXT NOT NULL,  -- 'concrete', 'brick', 'drywall', etc.
  thickness_cm REAL NOT NULL,
  attenuation_24ghz_db REAL,  -- Berechnet aus Material
  attenuation_5ghz_db REAL
);

-- Access Points
CREATE TABLE access_points (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES floors(id),
  model_id TEXT REFERENCES ap_models(id),
  x REAL NOT NULL, y REAL NOT NULL,
  height_meters REAL DEFAULT 2.5,
  mounting TEXT DEFAULT 'ceiling',  -- 'ceiling', 'wall', 'desk'
  tx_power_24ghz_dbm REAL,
  tx_power_5ghz_dbm REAL,
  channel_24ghz INTEGER,
  channel_5ghz INTEGER,
  channel_width TEXT DEFAULT '80'  -- '20', '40', '80', '160'
);

-- AP-Modell-Bibliothek
CREATE TABLE ap_models (
  id TEXT PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  wifi_standard TEXT,  -- 'wifi6', 'wifi6e', 'wifi5'
  max_tx_power_24ghz_dbm REAL,
  max_tx_power_5ghz_dbm REAL,
  antenna_gain_24ghz_dbi REAL,
  antenna_gain_5ghz_dbi REAL,
  mimo_streams INTEGER
);

-- Messungen
CREATE TABLE measurements (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES floors(id),
  run_number INTEGER NOT NULL,  -- 1, 2 oder 3
  x REAL NOT NULL, y REAL NOT NULL,
  timestamp TEXT NOT NULL,
  rssi_dbm REAL,
  snr_db REAL,
  throughput_mbps REAL,
  latency_ms REAL,
  jitter_ms REAL,
  packet_loss_pct REAL,
  connected_ap_id TEXT REFERENCES access_points(id),
  band TEXT,  -- '2.4ghz', '5ghz'
  channel INTEGER
);
```

**Performance fuer typische Queries:**
- Alle Waende eines Stockwerks laden: < 1 ms (typisch 10-50 Waende)
- Alle Messpunkte eines Laufs: < 5 ms (typisch 20-100 Punkte)
- Projekt speichern/laden: < 10 ms
- SQLite ist fuer diese Datenmengen massiv ueberdimensioniert - Performance kein Thema

---

## 5. Testing

### 5.1 Unit-Testing: Vitest (Empfehlung)

**Vitest vs. Jest:**

| Kriterium | Vitest | Jest 30 |
|-----------|--------|---------|
| **Cold Start** | 4x schneller | Langsamer |
| **Watch-Mode** | 380 ms (3 Dateien) | 3,4 s (3 Dateien) |
| **Memory** | 30% weniger | Hoeher |
| **ESM Support** | Nativ (Vite-Pipeline) | Experimentell |
| **Svelte Support** | Offiziell empfohlen | Kein zuverlaessiger Svelte-Support |
| **Vite Integration** | Nativ (geteilte Config) | Separate Konfiguration |
| **API** | Jest-kompatibel | Standard |

**Empfehlung: Vitest**
- Von SvelteKit offiziell empfohlen
- Teilt Vite-Konfiguration (kein Doppel-Setup)
- Nativer ESM-Support ohne Workarounds
- Jest-kompatible API (einfache Migration)
- Schnelleres Feedback im Entwicklungsprozess

### 5.2 Component Testing

**@testing-library/svelte:**
- Offizieller Svelte-Adapter
- Rendert Svelte-Komponenten in jsdom/happy-dom
- Queries: `getByRole`, `getByText`, `getByTestId`
- Svelte 5 Runes kompatibel
- Integration mit Vitest

### 5.3 E2E Testing fuer Desktop-App

**Option A: WebdriverIO + tauri-driver (Empfehlung)**
- Offiziell von Tauri dokumentiert
- `tauri-driver` stellt WebDriver-Interface bereit
- Testet die tatsaechliche Desktop-App (inkl. Rust-Backend)
- CI-faehig (Linux mit virtuellem Display)
- Cross-Platform moeglich

**Option B: Playwright (Frontend-only)**
- Testet nur das Frontend gegen Dev-Server
- IPC-Calls muessen gemockt werden
- Schneller als WebdriverIO, aber weniger realistisch
- Gut fuer UI-Regressionstests

**Option C: Tauri Rust-Tests**
- Unit-Tests fuer Rust-Backend-Logik
- `cargo test` fuer RF-Berechnungen, Datenbank-Operationen
- Kein UI-Test, aber kritisch fuer Korrektheit

**Empfehlung: Dreistufige Strategie**
1. **Vitest + @testing-library/svelte**: Schnelle Unit/Component-Tests
2. **cargo test**: Rust-Backend (RF-Modell, Datenbank, Netzwerk)
3. **WebdriverIO + tauri-driver**: E2E fuer kritische Workflows

---

## 6. Build & Tooling

### 6.1 Vite 6

- Standard-Bundler fuer Svelte 5 / SvelteKit
- HMR unter 50 ms fuer typische Aenderungen
- Tree-Shaking und Code-Splitting out-of-the-box
- CSS Minification: esbuild (Standard) oder Lightning CSS
- Environment API fuer fortgeschrittene Konfigurationen
- Node.js 18/20/22 Support

**Konfiguration fuer WLAN-Optimizer:**
```typescript
// vite.config.ts (Konzept)
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
  worker: {
    format: 'es',  // Fuer Web Worker (Heatmap-Berechnung)
  },
});
```

### 6.2 Linting & Formatting: Biome (Empfehlung)

**Biome vs. ESLint + Prettier:**

| Kriterium | Biome | ESLint + Prettier |
|-----------|-------|-------------------|
| **Linting 10k Dateien** | 0,8 s | 45,2 s |
| **Formatting 10k Dateien** | 0,3 s | 12,1 s |
| **Konfigurationsdateien** | 1 (biome.json) | 4+ (.eslintrc, .prettierrc, .ignore-Dateien) |
| **npm Pakete** | 1 Binary | 127+ Pakete |
| **Prettier-Kompatibilitaet** | 97% | 100% (ist Prettier) |
| **TypeScript Rules** | Basis (~85% von typescript-eslint) | Umfassend |
| **Svelte-Support** | Plugin noetig | eslint-plugin-svelte (ausgereift) |

**Empfehlung: Biome**
- 10-25x schneller
- Einfachere Konfiguration (eine Datei)
- Formatter + Linter in einem Tool
- **Einschraenkung:** Svelte-Dateien benoetigen evtl. zusaetzliche Konfiguration
- **Fallback:** Fuer Svelte-spezifische Rules `eslint-plugin-svelte` ergaenzend nutzen

### 6.3 CI/CD: GitHub Actions

**Tauri Cross-Platform Build Pipeline (Konzept):**

```yaml
# .github/workflows/build.yml (Konzept)
name: Build & Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
          - os: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
```

---

## 7. Zusammenfassung & Empfehlung

### 7.1 Empfohlener Tech-Stack

| Bereich | Empfehlung | Begruendung |
|---------|------------|-------------|
| **Frontend** | **Svelte 5 (Runes)** | Beste Performance, kleinstes Bundle, minimaler Boilerplate, Runes als elegantes State-Management |
| **Desktop** | **Tauri 2** | 10x kleiner als Electron, 5x weniger RAM, schneller Start, Rust-Backend fuer RF-Berechnung |
| **Canvas** | **Konva.js (svelte-konva)** | Offizielle Svelte 5 Integration, Layer-System, Drag-and-Drop, Export |
| **Heatmap** | **Web Workers + Canvas 2D** | Nicht-blockierende RF-Berechnung, OffscreenCanvas fuer Performance |
| **Datenbank** | **SQLite (rusqlite)** | Direkt im Rust-Backend, synchron, performant, keine IPC fuer DB |
| **i18n** | **Paraglide-js** | Compiler-basiert, Tree-Shakeable, Typ-sicher, offiziell im Svelte CLI |
| **Unit-Tests** | **Vitest** | Offiziell empfohlen, Vite-nativ, schnelles Feedback |
| **Component-Tests** | **@testing-library/svelte** | Standard fuer Svelte, Svelte 5 kompatibel |
| **E2E-Tests** | **WebdriverIO + tauri-driver** | Testet echte Desktop-App inkl. Rust-Backend |
| **Bundler** | **Vite 6** | Standard fuer Svelte, HMR, Tree-Shaking |
| **Linting** | **Biome** (+ eslint-plugin-svelte) | 10-25x schneller, minimale Konfiguration |
| **CI/CD** | **GitHub Actions + tauri-action** | Cross-Platform-Builds, Auto-Update-Release |

### 7.2 Begruendung der Kernentscheidungen

**Warum Svelte 5 statt React 19?**
- 39% bessere Performance, 2,5x kleineres Bundle
- Runes eliminieren Bedarf an externem State Manager
- svelte-konva ist Runes-nativ und aktuell
- Paraglide-js als ideale i18n-Loesung (Compiler meets Compiler)
- Weniger Boilerplate = schnellere Entwicklung
- **Risiko:** Kleineres Oekosystem, aber fuer unseren Anwendungsfall ausreichend

**Warum Svelte 5 statt Vue 3.5?**
- Bessere Performance in Benchmarks
- Kleineres Bundle
- Paraglide-js > vue-i18n (Tree-Shaking, Typsicherheit)
- svelte-konva aktiver gepflegt als vue-konva
- Vue Vapor Mode noch nicht produktionsreif
- **Trade-off:** Vue hat groesseres Oekosystem, aber Svelte deckt unsere Anforderungen ab

**Warum Tauri 2 statt Electron?**
- 10x kleineres Bundle (5-10 MB vs. 80-150 MB)
- 5-8x weniger RAM (30-50 MB vs. 150-300 MB)
- Rust-Backend: RF-Berechnungen, SQLite, Netzwerk-Protokolle nativ
- Sicherheit: Scope-basiertes Permission-System
- **Risiko:** Windows IPC-Latenz bei grossen Payloads (~200ms fuer 10MB)
- **Mitigation:** Grosse Berechnungen (Heatmap) im Frontend via Web Workers, nicht ueber IPC
- **Risiko:** Rust-Lernkurve
- **Mitigation:** Backend-Logik ist ueberschaubar (DB, Netzwerk, Datei-IO). RF-Modell kann in TypeScript im Web Worker laufen.

**Warum rusqlite statt tauri-plugin-sql?**
- Kein IPC-Overhead fuer Datenbank-Operationen
- Volle Kontrolle ueber Migrations und Transactions
- Synchrone API ideal fuer Desktop
- **Trade-off:** Frontend muss ueber Tauri Commands zugreifen (saubere API-Grenze)

### 7.3 Risiken und Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|---------------------|--------|------------|
| Svelte-Oekosystem zu klein | Mittel | Mittel | Kernbibliotheken (Konva, Paraglide) sind verfuegbar. Fuer UI: shadcn-svelte |
| Tauri Windows IPC langsam | Niedrig | Niedrig | Grosse Berechnungen im Frontend (Web Worker), kleine Payloads ueber IPC |
| Rust-Lernkurve | Mittel | Mittel | Backend-Code ist begrenzt. Gute Rust-Dokumentation. AI-Assistenz. |
| Tauri macOS Universal Binary | Niedrig | Niedrig | Separate ARM64 + x86_64 Builds als Workaround |
| Svelte LSP bei grossem Projekt | Niedrig | Niedrig | Modularer Aufbau, kleine Dateien, regelmaessige LSP-Updates |
| Biome Svelte-Support lueckenhaft | Mittel | Niedrig | eslint-plugin-svelte als Ergaenzung fuer .svelte-Dateien |

### 7.4 Architektur-Skizze

```
┌─────────────────────────────────────────────────────┐
│                    Tauri 2 Shell                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              Svelte 5 Frontend                │  │
│  │                                               │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │ Konva   │  │ Heatmap  │  │  UI (shadcn  │  │  │
│  │  │ Canvas  │  │ Canvas   │  │  -svelte)    │  │  │
│  │  │ (inter- │  │ (Web     │  │             │  │  │
│  │  │ aktiv)  │  │ Worker)  │  │  Paraglide  │  │  │
│  │  └─────────┘  └──────────┘  │  i18n        │  │  │
│  │                             └─────────────┘  │  │
│  │         State: Svelte 5 Runes                │  │
│  └──────────────────┬────────────────────────────┘  │
│                     │ Tauri IPC (Commands)           │
│  ┌──────────────────┴────────────────────────────┐  │
│  │             Rust Backend                      │  │
│  │                                               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │ rusqlite │  │ Netzwerk │  │ Datei-IO   │  │  │
│  │  │ (SQLite) │  │ (HTTP,   │  │ (Projekt-  │  │  │
│  │  │          │  │  SNMP,   │  │  Import/   │  │  │
│  │  │          │  │  SSH)    │  │  Export)    │  │  │
│  │  └──────────┘  └──────────┘  └────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 7.5 Naechste Schritte

1. **Phase 4:** Offene Fragen klaeren (MVP-Scope Mixing Console, Freischalt-Feature)
2. **Phase 5:** Architektur-Dokument basierend auf diesem Tech-Stack erstellen
3. **Phase 7:** Detailplanung mit konkreten Tauri-Commands, Svelte-Komponenten, DB-Schema

---

## Quellen

### Frontend-Benchmarks
- [js-framework-benchmark (krausest)](https://github.com/krausest/js-framework-benchmark)
- [React vs Vue vs Svelte - FrontendTools Benchmark](https://www.frontendtools.tech/blog/best-frontend-frameworks-2025-comparison)
- [React 19 vs Vue 3.6 vs Svelte 5: 2026 Framework Convergence](https://byteiota.com/react-19-vs-vue-3-6-vs-svelte-5-2026-framework-convergence/)
- [Svelte 5 Performance Deep Dive (DEV Community)](https://dev.to/krish_kakadiya_5f0eaf6342/why-svelte-5-is-redefining-frontend-performance-in-2025-a-deep-dive-into-reactivity-and-bundle-5200)

### Svelte 5
- [Svelte 5 Runes Benchmark Discussion](https://github.com/sveltejs/svelte/discussions/13277)
- [Svelte in 2025: Production Ready?](https://codifysol.com/svelte-in-2025-is-it-ready-for-production/)
- [Svelte & SvelteKit Updates Summer 2025](https://blog.openreplay.com/svelte-sveltekit-updates-summer-2025-recap/)
- [Svelte 5 State Management - Runes (Mainmatter)](https://mainmatter.com/blog/2025/03/11/global-state-in-svelte-5/)
- [shadcn-svelte](https://github.com/huntabyte/shadcn-svelte)

### Canvas & Konva
- [svelte-konva (GitHub)](https://github.com/konvajs/svelte-konva)
- [Konva.js Dokumentation](https://konvajs.org/docs/svelte/index.html)
- [Konva vs Fabric Vergleich](https://medium.com/@www.blog4j.com/konva-js-vs-fabric-js-in-depth-technical-comparison-and-use-case-analysis-9c247968dd0f)
- [OffscreenCanvas + Web Workers (web.dev)](https://web.dev/articles/offscreen-canvas)

### Tauri 2
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/)
- [Tauri vs Electron: Real Trade-offs (Hopp)](https://www.gethopp.app/blog/tauri-vs-electron)
- [Tauri IPC Performance Discussion](https://github.com/tauri-apps/tauri/discussions/11915)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri WebDriver Testing](https://v2.tauri.app/develop/tests/webdriver/)
- [Electron vs Tauri (DoltHub 2025)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)

### Datenbank
- [Rust ORMs 2026: Diesel vs SQLx vs Rusqlite](https://aarambhdevhub.medium.com/rust-orms-in-2026-diesel-vs-sqlx-vs-seaorm-vs-rusqlite-which-one-should-you-actually-use-706d0fe912f3)
- [tauri-plugin-rusqlite2](https://github.com/razein97/tauri-plugin-rusqlite2)

### i18n
- [Paraglide-js (Svelte CLI Docs)](https://svelte.dev/docs/cli/paraglide)
- [Paraglide-js SvelteKit Anleitung](https://inlang.com/m/dxnzrydw/paraglide-sveltekit-i18n/)

### Testing
- [Vitest vs Jest 2026 (SitePoint)](https://www.sitepoint.com/vitest-vs-jest-2026-migration-benchmark/)
- [Vitest vs Jest (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/vitest-vs-jest/)

### Tooling
- [Biome vs ESLint + Prettier 2025](https://medium.com/better-dev-nextjs-react/biome-vs-eslint-prettier-the-2025-linting-revolution-you-need-to-know-about-ec01c5d5b6c8)
- [Biome Migration Guide 2026](https://pockit.tools/blog/biome-eslint-prettier-migration-guide/)
- [Vite 6 Features](https://www.clique8.com/article/everything-you-need-to-know-about-vite-6)

### Neutralino.js
- [NeutralinoJS: Alternative zu Electron & Tauri (Notesnook)](https://blog.notesnook.com/neutralinojs-next-best-alternative-to-electron-and-tauri/)
