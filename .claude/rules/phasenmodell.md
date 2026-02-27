# Phasenmodell (Detail)

Jede Phase hat ein **Quality Gate** das erfuellt sein muss bevor die naechste Phase beginnt.
Fortschritt wird in `docs/plans/progress.json` getrackt.

## Phase 0: Autonomie-Recherche ✅
- Deliverable: `docs/research/Claude-Code-Recherche.md`

## Phase 1: Projektsetup ✅
- Claude Code Tooling (Agents, Skills, Hooks)
- Git-Repository, Permissions

## Phase 2: Deep Dive & Lueckenanalyse ✅
- Deliverable: `docs/research/Wissensluecken.md`

## Phase 3: Recherche & Evaluation 🔄
- 3a: Technische Recherche (Canvas, Heatmap, RF, iPerf)
- 3b: Open-Source-Evaluation
- 3c: Tech-Stack-Evaluation
- Gate: Recherche in `docs/research/` dokumentiert

## Phase 4: Klaerung mit Benutzer
- Offene Fragen aus Wissensluecken klaeren
- Deliverable: `docs/architecture/Entscheidungen.md`

## Phase 5: Architektur & Tech-Stack
- Komponentenarchitektur, ADRs
- Deliverable: Architektur-Dokument

## Phase 6: Orchestrierungsstrategie
- Agenten-Rollen, Modell-Zuordnung
- Deliverable: `docs/plans/Orchestrierung.md`

## Phase 7: Detailplanung
- Task-Planung mit Abhaengigkeiten
- Deliverable: `docs/plans/Implementierungsplan.md`

## Phase 8: Autonome Entwicklung
- 8a: Scaffolding
- 8b: Kernmodul Planung (Grundriss, Waende, APs)
- 8c: Kernmodul Heatmap (RF-Modell, Rendering)
- 8d: Modul Messung (Messpunkte, iPerf)
- 8e: Modul Optimierung (Mixing Console)
- 8f: UI/UX & i18n
- 8g: Integration
- Durchgaengig: Selbsttest, Code-Review, Fortschritt dokumentieren

## Phase 9: Qualitaetssicherung
- Funktions-, Integrations-, Performance-Tests
- Deliverable: `docs/plans/Test-Report.md`

## Phase 10: Uebergabe & Demo
- README, Setup-Anleitung, Quick-Start-Guide
