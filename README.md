# WLAN-Optimizer

Open-Source-Tool zur Planung, Messung und Optimierung von WLAN-Infrastrukturen in Heimnetzwerken.

Built with **Svelte 5** + **Tauri 2** + **Rust** | Laeuft lokal, keine Cloud erforderlich.

---

## Features

- **Grundrissplanung** — Grundriss als Bild importieren, Waende mit Materialien zeichnen, Access Points platzieren
- **Heatmap-Berechnung** — Konservative Abdeckungsprognosen fuer 2,4 GHz und 5 GHz (ITU-R P.1238)
- **Gefuehrte Messungen** — 3-Phasen-Messlaeufe (Baseline, Post-Optimization, Verification) mit iPerf3 und RSSI
- **Mixing Console** — Interaktive Anpassung von AP-Parametern (Kanal, TX-Power, Kanalbreite) mit Forecast-Heatmap
- **Ergebnisvergleich** — Vorher-/Nachher-Dashboard mit Export (JSON/CSV)

## Quick Start

### Voraussetzungen

- **Node.js** >= 18
- **Rust** >= 1.77 (mit `cargo`)
- **Tauri CLI**: `cargo install tauri-cli --version "^2"`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

### Installation

```bash
git clone https://github.com/8chM/wlan-optimizer.git
cd wlan-optimizer
npm install
```

### Entwicklungsmodus

```bash
npm run tauri dev
```

Startet die App mit Hot-Reload fuer Frontend und Backend.

### Production Build

```bash
npm run tauri build
```

Erstellt die native App in `src-tauri/target/release/bundle/`.

### Tests ausfuehren

```bash
# Frontend-Tests (497 Tests)
npx vitest run

# Mit Coverage
npx vitest run --coverage

# Einzelne Test-Suite
npx vitest run src/lib/__tests__/integration.test.ts
```

## Architektur

```
wlan-optimizer/
├── src/                    # Svelte 5 Frontend
│   ├── lib/
│   │   ├── api/            # Typsicheres Tauri IPC (CommandMap)
│   │   ├── canvas/         # Konva.js Editor-Komponenten
│   │   ├── components/     # UI-Komponenten
│   │   ├── heatmap/        # RF-Engine, Spatial Grid, Color Schemes
│   │   ├── i18n/           # Zweisprachig (EN/DE)
│   │   ├── stores/         # Svelte 5 Runes State Management
│   │   └── utils/          # Keyboard Shortcuts, Geometry, Math
│   └── routes/             # SvelteKit Pages
├── src-tauri/              # Rust Backend
│   ├── src/
│   │   ├── commands/       # Tauri Command Handler
│   │   ├── db/             # SQLite via rusqlite
│   │   ├── export/         # JSON/CSV Export
│   │   ├── measurement/    # iPerf3 Sidecar, WiFi Scanner
│   │   ├── optimizer/      # Regelbasierter Optimierer
│   │   └── platform/       # macOS WiFi-Integration
│   └── capabilities/       # Tauri Security Permissions
└── docs/                   # Projektdokumentation
    ├── prd/                # Product Requirements
    ├── research/           # Technische Recherche
    ├── architecture/       # ADRs, Architektur
    └── plans/              # Implementierungsplan, Test-Report
```

### Tech-Stack

| Komponente | Technologie |
|-----------|-------------|
| Frontend | Svelte 5 (Runes), SvelteKit, TypeScript |
| Backend | Rust, Tauri 2 |
| Datenbank | SQLite (rusqlite, bundled) |
| Canvas | Konva.js |
| Heatmap | TypeScript Web Worker, ITU-R P.1238 |
| Messung | iPerf3 (Sidecar), macOS airport CLI |
| Linting | Biome |
| Tests | Vitest (497 Tests) |
| i18n | Custom key-based (EN/DE) |

### RF-Modell

Die Heatmap-Berechnung basiert auf dem ITU-R P.1238 Indoor-Propagation-Modell:

```
PL(d) = L_ref + 10 * n * log10(d) + Σ L_wall
```

- **L_ref**: Referenz-Pfadverlust bei 1m (frequenzabhaengig)
- **n**: Pfadverlustexponent (Standard: 3.5, kalibrierbar)
- **L_wall**: Wanddaempfung pro Material (12 vordefinierte Materialien)

Referenz-AP: D-Link DAP-X2810 (Wi-Fi 6, 2x2 MU-MIMO).

## Benutzung

### 1. Projekt erstellen
Neues Projekt anlegen und Grundrissbild importieren (PNG, JPG, SVG).

### 2. Massstab setzen
Referenzstrecke auf dem Grundriss markieren und reale Laenge eingeben.

### 3. Waende zeichnen
Waende auf dem Grundriss einzeichnen und Materialien zuweisen (Trockenbauwand, Beton, Glas, etc.).

### 4. Access Points platzieren
APs auf dem Grundriss positionieren. TX-Power und Kanaleinstellungen anpassen.

### 5. Heatmap pruefen
Die Heatmap zeigt die prognostizierte Signalabdeckung. Farbschemata: Viridis, Jet, Inferno.

### 6. Messen (optional)
Gefuehrte Messlaeufe mit iPerf3: Baseline → Optimierung → Verifikation.

### 7. Optimieren
Mixing Console: Kanaele, TX-Power und Kanalbreite interaktiv anpassen. Forecast-Heatmap zeigt erwartete Aenderungen.

### 8. Ergebnisse exportieren
JSON- oder CSV-Export aller Projektdaten und Messungen.

## Konfiguration

### iPerf3 Server
Fuer Messungen wird ein iPerf3-Server im lokalen Netzwerk benoetigt:

```bash
# Auf dem Server
iperf3 -s

# Standard-Port: 5201
```

Die Server-IP wird in den Einstellungen konfiguriert.

### Materialien
12 vordefinierte Wandmaterialien mit kalibrierten Daempfungswerten. Eigene Materialien koennen ueber die Einstellungen hinzugefuegt werden.

## Entwicklung

### Projektstruktur

- `CLAUDE.md` — Projektregeln und Konventionen
- `docs/plans/Implementierungsplan.md` — 103 Tasks in 11 Phasen
- `docs/plans/Test-Report.md` — Vollstaendiger Testbericht
- `docs/plans/Verbesserungen.md` — 18 identifizierte Verbesserungen

### Konventionen

- **Code**: Englisch (Variablen, Funktionen, Kommentare)
- **Dokumentation**: Deutsch
- **Commits**: Deutsch, phasenbezogen

### Test-Abdeckung

| Modul | Coverage |
|-------|----------|
| RF-Engine | 100% |
| Spatial Grid | 100% |
| Color Schemes | 94% |
| Measurement Store | 99% |
| Mixing Store | 99% |

## Lizenz

MIT

## Mitwirkende

Dieses Projekt wurde mit [Claude Code](https://claude.com/claude-code) entwickelt.
