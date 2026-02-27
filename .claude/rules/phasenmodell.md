# Phasenmodell

Quality Gate pro Phase erfuellen bevor naechste Phase beginnt.
Fortschritt in `docs/plans/progress.json`.

## Phase 0: Autonomie-Recherche ✅
## Phase 1: Projektsetup ✅
## Phase 2: Deep Dive & Lueckenanalyse ✅

## Phase 3: Recherche & Evaluation ✅
## Phase 4: Klaerung mit Benutzer ✅
## Phase 5: Architektur & Tech-Stack ✅
- Deliverable: `docs/architecture/Architektur.md`

## Phase 6: Orchestrierungsstrategie
- Gate: Agenten-Plan, Modell-Matrix in `docs/plans/Orchestrierung.md`

## Phase 7: Detailplanung
- BMAD: `/sprint-planning` + `/create-story`
- Gate: Tasks mit Abhaengigkeiten in `docs/plans/Implementierungsplan.md`

## Phase 8: Autonome Entwicklung
- 8a: Scaffolding | 8b: Planung | 8c: Heatmap | 8d: Messung
- 8e: Optimierung | 8f: UI/UX & i18n | 8g: Integration
- BMAD: `/dev-story` pro Modul, `/create-ux-design` fuer UI
- Gate je Sub-Phase: Tests gruen, Review bestanden

## Phase 9: Qualitaetssicherung
- Gate: Alle Tests gruen, `docs/plans/Test-Report.md`

## Phase 10: Uebergabe & Demo
- Gate: App laeuft, README + Setup-Anleitung komplett

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
