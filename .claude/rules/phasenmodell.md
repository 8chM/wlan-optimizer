# Phasenmodell

Quality Gate pro Phase erfuellen bevor naechste Phase beginnt.
Fortschritt in `docs/plans/progress.json`.
Entscheidungen als ADR in `docs/architecture/` dokumentieren.

## Autonomie-Prinzip
Ab Phase 7 wird VOLLSTAENDIG AUTONOM gearbeitet.
- Entscheidungen SELBST treffen und als ADR dokumentieren
- Bei Unklarheiten: konservativste Option waehlen, ADR schreiben
- Session-Grenzen planen: Jede Sub-Phase muss in einer Session abschliessbar sein
- Zustand in progress.json + MEMORY.md persistieren fuer naechste Session
- AP-Anbindungen als Provider-Pattern (austauschbare Adapter)

## Phase 0-6: ✅ Abgeschlossen
- Recherche, Setup, Architektur, Orchestrierung fertig
- Deliverables: docs/research/*, docs/architecture/*, docs/plans/Orchestrierung.md

## Phase 7: Detailplanung
- BMAD: `/sprint-planning` + `/create-story`
- Gate: Tasks mit Abhaengigkeiten in `docs/plans/Implementierungsplan.md`

## Phase 8: Autonome Entwicklung
- 8a: Scaffolding + PoC-Benchmarks
- 8b: Kernmodul Planung (Grundriss, Waende, APs)
- 8c: Kernmodul Heatmap (RF-Modell, Web Worker, Rendering)
- 8d: Modul Messung (iPerf3 Sidecar, RSSI, Messpunkt-Wizard)
- 8e: Modul Optimierung (Mixing Console, Assist-Mode)
- 8f: UI/UX & i18n (Layout, Themes, Paraglide-js)
- 8g: Integration (E2E, Fehlerbehebung)
- Gate je Sub-Phase: Tests gruen, Review bestanden, progress.json aktuell

## Phase 9: Qualitaetskontrolle & Verbesserungsidentifikation
- Vollstaendiger Test-Report (Unit, Integration, E2E, Performance)
- Code-Review aller Module
- Verbesserungsliste erstellen: UX, Performance, Robustheit, fehlende Features
- Gate: `docs/plans/Test-Report.md` + `docs/plans/Verbesserungen.md`

## Phase 10: Produktverbesserungen
- Identifizierte Verbesserungen umsetzen (ueber MVP hinaus)
- Ziel: Perfektes, sofort nutzbares Tool
- Provider-Pattern fuer AP-Hersteller verfeinern
- Polish: Animationen, Feedback, Error-Recovery, Edge Cases
- Gate: Alle Verbesserungen umgesetzt oder begruendet zurueckgestellt

## Phase 11: Dokumentation & Uebergabe
- README.md mit Quick-Start, Screenshots, Architektur-Uebersicht
- Setup-Anleitung fuer Entwickler (Contributing Guide)
- Benutzer-Handbuch (in-app oder separate Seite)
- Gate: App laeuft, Dokumentation komplett, GitHub-Release vorbereitet

## Session-Management
- Jede Sub-Phase (8a-8g) = 1 Session
- Phase 9 = 1-2 Sessions
- Phase 10 = 2-3 Sessions (abhaengig von Verbesserungsliste)
- Phase 11 = 1 Session
- Bei Session-Start: progress.json + MEMORY.md lesen
- Bei Session-Ende: progress.json aktualisieren, committen, pushen

## BMAD-Toolbox (global installiert: ~/.claude/commands/bmad/)
| Command | Nutzen | Phase |
|---|---|---|
| `/product-brief` | Produkt-Analyse | 2-3 |
| `/prd` | Product Requirements Document | 3-4 |
| `/tech-spec` | Technische Spezifikation | 5 |
| `/architecture` | Architektur-Design | 5 |
| `/solutioning-gate-check` | Architektur-Validierung | 5 |
| `/sprint-planning` | Sprint-Planung | 7 |
| `/create-story` | User Story erstellen | 7 |
| `/dev-story` | Implementierungs-Story | 8 |
| `/brainstorm` | Brainstorming | beliebig |
| `/research` | Strukturierte Recherche | 3 |
| `/create-ux-design` | UX-Design erstellen | 8f |
