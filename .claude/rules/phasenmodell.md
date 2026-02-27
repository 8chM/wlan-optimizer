# Phasenmodell (Detail)

Jede Phase hat ein **Quality Gate** das erfuellt sein muss bevor die naechste Phase beginnt.
Fortschritt wird in `docs/plans/progress.json` getrackt.

## Phase 0: Autonomie-Recherche ✅
- Deliverable: `docs/research/Claude-Code-Recherche.md`
- Gate: Recherche zu MCPs, BMAD, Agents, Skills, Hooks dokumentiert

## Phase 1: Projektsetup ✅
- MCPs installiert (Context7, Sequential Thinking, ESLint)
- BMAD v6 Skills global installiert
- Claude Code Tooling (Agents, Skills, Hooks, Permissions)
- Git-Repository konfiguriert
- Gate: Alle Tools konfiguriert, `claude mcp list` zeigt MCPs

## Phase 2: Deep Dive & Lueckenanalyse ✅
- Deliverable: `docs/research/Wissensluecken.md`
- BMAD-Referenz: Aehnlich `/product-brief` (Analyse-Phase)
- Gate: Alle Wissensluecken identifiziert, priorisiert, dokumentiert
- Ergebnis: 52 Luecken (22 HOCH, 19 MITTEL, 11 NIEDRIG), 2 Dokument-Widersprueche

## Phase 3: Recherche & Evaluation
- 3a: Technische Recherche (Canvas, Heatmap, RF, iPerf, AP-Steuerung)
- 3b: Open-Source-Evaluation
- 3c: Tech-Stack-Evaluation
- BMAD-Referenz: `/research` Command fuer strukturierte Recherche
- Gate: Recherche in `docs/research/` dokumentiert, Tech-Stack-Empfehlung

## Phase 4: Klaerung mit Benutzer
- Offene Fragen aus Wissensluecken klaeren
- Deliverable: `docs/architecture/Entscheidungen.md`
- Gate: Alle offenen Fragen beantwortet

## Phase 5: Architektur & Tech-Stack
- Komponentenarchitektur, ADRs
- BMAD-Referenz: `/architecture` + `/solutioning-gate-check`
- Deliverable: Architektur-Dokument in `docs/architecture/`
- Gate: ADRs dokumentiert, Komponentendiagramm, Tech-Stack festgelegt

## Phase 6: Orchestrierungsstrategie
- Agenten-Rollen, Modell-Zuordnung, Task-Verteilung
- Deliverable: `docs/plans/Orchestrierung.md`
- Gate: Agenten-Plan, Modell-Matrix, Parallelisierungsstrategie

## Phase 7: Detailplanung
- Task-Planung mit Abhaengigkeiten
- BMAD-Referenz: `/sprint-planning` + `/create-story`
- Deliverable: `docs/plans/Implementierungsplan.md`
- Gate: Alle Tasks definiert, Abhaengigkeiten klar, Schaetzungen

## Phase 8: Autonome Entwicklung
- 8a: Scaffolding (Projekt-Template, Build, CI)
- 8b: Kernmodul Planung (Grundriss, Waende, APs)
- 8c: Kernmodul Heatmap (RF-Modell, Rendering)
- 8d: Modul Messung (Messpunkte, iPerf)
- 8e: Modul Optimierung (Mixing Console)
- 8f: UI/UX & i18n
- 8g: Integration
- BMAD-Referenz: `/dev-story` fuer jedes Modul
- Durchgaengig: Selbsttest, Code-Review, Fortschritt dokumentieren
- Gate je Sub-Phase: Tests gruen, Review bestanden

## Phase 9: Qualitaetssicherung
- Funktions-, Integrations-, Performance-Tests
- Deliverable: `docs/plans/Test-Report.md`
- Gate: Alle Tests gruen, keine kritischen Issues

## Phase 10: Uebergabe & Demo
- README, Setup-Anleitung, Quick-Start-Guide
- Gate: Anwendung laeuft, Dokumentation komplett

## Verfuegbare BMAD-Commands (selektiv nutzbar)
- `/product-brief` - Produkt-Analyse
- `/prd` - Product Requirements Document
- `/tech-spec` - Technische Spezifikation
- `/architecture` - Architektur-Design
- `/solutioning-gate-check` - Architektur-Validierung
- `/sprint-planning` - Sprint-Planung
- `/create-story` - User Story erstellen
- `/dev-story` - Implementierungs-Story
- `/brainstorm` - Brainstorming-Sessions
- `/research` - Strukturierte Recherche

## Verfuegbare MCPs
- **Context7**: Aktuelle Library-Dokumentation im LLM-Kontext
- **Sequential Thinking**: Strukturierte Problemloesung
- **ESLint**: Echtzeit-Linting (aktiv sobald ESLint konfiguriert)
