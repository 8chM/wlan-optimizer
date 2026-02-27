# WLAN-Optimizer

WLAN-Planungs- und Optimierungstool fuer Heimnetzwerke (lokal, Open Source, MIT).
Grundriss + Waende + APs -> Heatmap via RF-Modell (ITU-R P.1238).

## Sprache
- Code: Englisch (Variablen, Funktionen, Kommentare)
- Dokumentation & Kommunikation: Deutsch
- UI: Zweisprachig (EN/DE), Key-basierte Uebersetzungen

## Arbeitsweise
- IMMER `docs/plans/progress.json` lesen um aktuelle Phase zu ermitteln
- Nicht-triviale Aenderungen: Erst planen, dann ausfuehren
- Aenderungen durch Tests verifizieren
- `docs/plans/progress.json` nach jedem Meilenstein aktualisieren
- Regelmaessig committen und zu GitHub pushen
- Quality Gates einhalten - keine Phase ueberspringen

## Autonomie (ab Phase 7)
- Entscheidungen SELBST treffen, als ADR dokumentieren (`docs/architecture/ADR-*.md`)
- Bei Unklarheiten: konservativste Option waehlen
- Session-Grenzen planen: progress.json + MEMORY.md am Ende aktualisieren
- AP-Anbindungen als Provider-Pattern (austauschbare Adapter pro Hersteller)

## NICHT
- Keine Annahmen ohne ADR-Dokumentation
- Keine neuen Abhaengigkeiten ohne Begruendung
- Keine Phase ueberspringen (siehe `.claude/rules/phasenmodell.md`)
- Keine hardcodierten UI-Strings - immer i18n-Keys verwenden

## Tech-Stack (Phase 5 festgelegt)
- Frontend: Svelte 5 (Runes) + Konva.js (svelte-konva) + Paraglide-js
- Desktop: Tauri 2
- Backend: Rust (rusqlite, reqwest, rasn-snmp)
- Heatmap: TypeScript Web Worker + Canvas ImageData
- Tests: Vitest + cargo test + WebdriverIO
- Linting: Biome + eslint-plugin-svelte
- Architektur: `docs/architecture/Architektur.md`

## Verzeichnisse
- `docs/prd/` - Anforderungen (PRD, Funktionsliste)
- `docs/research/` - Recherche, Evaluationen, Wissensluecken
- `docs/architecture/` - ADRs, Architektur
- `docs/plans/` - Implementierungsplan, Backlog, progress.json
- `.claude/rules/` - RF-Modell, Phasenmodell
