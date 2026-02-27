# WLAN-Optimizer - Projektregeln

## Sprache
- **Code**: Englisch (Variablen, Funktionen, Kommentare im Code)
- **Dokumentation**: Deutsch (PRD, Architektur, Pläne, README)
- **Kommunikation**: Deutsch (Antworten, Fragen, Erklärungen)
- **UI/UX**: Zweisprachig (EN/DE), Key-basierte Übersetzungsdateien

## Phasenmodell

Jede Phase hat ein **Quality Gate** - ein Abschlusskriterium, das erfüllt sein muss, bevor die nächste Phase beginnt.

### Phase 0: Autonomie-Recherche ✅ ABGESCHLOSSEN
Erste und kritischste Phase - bestimmt wie ALLE Folgephasen ausgefuehrt werden.

- **0a - Claude Code Deep Dive:** Aktuelle Fähigkeiten von Claude Code (Stand Feb 2026). Opus 4.6 vs. Sonnet 4.6 - Stärken, Schwächen, Einsatzgebiete. Context-Window, Tool-Nutzung, Multi-File-Editing, Parallelität.
- **0b - Multi-Agent & Teams:** Team-Features, Task-Delegation, parallele Agenten. Agenten-Typen (Bash, Explore, Plan, general-purpose). Kommunikation zwischen Agenten.
- **0c - MCPs & Erweiterungen:** Verfügbare MCP-Server (Filesystem, Git, Testing, Linting, etc.). Relevanz für unser Projekt. Claude Code Erweiterungen/Plugins.
- **0d - Skills & Hooks:** Custom Skills (.claude/skills/), Hooks-System, CLAUDE.md-Steuerung. Projektspezifische Automatisierungen.
- **0e - Best Practices:** Strategien für autonome Softwareentwicklung mit LLM-Agenten. Task-Strukturierung, Kontextverlust-Vermeidung, Qualitätssicherung ohne menschlichen Review.
- **Gate:** Recherche-Ergebnisse vollständig dokumentiert
- **Deliverable:** `docs/research/Claude-Code-Recherche.md`

### Phase 1: Projektsetup
Optimiert basierend auf den Erkenntnissen aus Phase 0. MCPs, Skills, Hooks und Projektstruktur einrichten.

- Ordnerstruktur, Regeln, Dokumente aufbereiten
- Relevante MCPs installieren und konfigurieren
- Projektspezifische Skills und Hooks einrichten
- Git-Repository initialisieren
- **Gate:** Struktur steht, Tooling konfiguriert, Regeln definiert
- **Deliverable:** Einsatzbereites Projekt mit konfiguriertem Tooling

### Phase 2: Deep Dive & Lückenanalyse
- PRD, Funktionsliste, RF-Modellierung, Backlog vollständig durchdringen
- Zusammenhänge zwischen Modulen verstehen
- Konkrete Wissenslücken identifizieren und als Liste dokumentieren
- **Gate:** Lückenliste in `docs/research/Wissensluecken.md` abgelegt
- **Deliverable:** Dokumentierte Lückenliste mit Kategorisierung

### Phase 3: Recherche & Evaluation
- **3a - Technische Recherche:** RF-Modellierung (Algorithmen, Bibliotheken), Canvas/Zeichenfläche, iPerf-Integration, WLAN-APIs pro OS, Heatmap-Rendering
- **3b - Open-Source-Evaluation:** Bestehende WLAN-Planungstools, Heatmap-Bibliotheken, RF-Simulatoren. Entscheidung: nutzen, integrieren oder selbst bauen?
- **3c - Tech-Stack-Evaluation:** Frontend-Framework, Backend, Datenbank/Persistenz, Build-Tooling
- **Gate:** Recherche-Ergebnisse in `docs/research/` dokumentiert. Jede Lücke geschlossen oder als Frage für Phase 4 markiert.
- **Deliverables:** Technologie-Evaluationsdokumente, Open-Source-Bewertungsmatrix

### Phase 4: Klärung mit Benutzer
- Alle offenen Fragen gesammelt in einer Session stellen
- Entscheidungen herbeiführen, die ich nicht eigenständig treffen kann
- **Gate:** Alle Fragen beantwortet, keine offenen Blocker
- **Deliverable:** Entscheidungsprotokoll in `docs/architecture/Entscheidungen.md`

### Phase 5: Architektur & Tech-Stack
- Finale Tech-Stack-Entscheidung treffen und dokumentieren
- Komponentenarchitektur definieren (Module, Schnittstellen, Datenfluss)
- Architecture Decision Records (ADRs) für jede wichtige Entscheidung
- **Gate:** Architektur-Dokument abgenommen, Tech-Stack steht fest
- **Deliverables:** Architektur-Dokument, Komponentendiagramm, ADRs

### Phase 6: Orchestrierungsstrategie
Basierend auf Phase-0-Recherche + Phase-5-Architektur die konkrete Entwicklungsstrategie festlegen.

- Agenten-Rollen definieren und dem Projekt zuordnen
- Modell-Zuordnung: Opus 4.6 vs. Sonnet 4.6 pro Rolle
- MCPs projektspezifisch konfigurieren
- Custom Skills für wiederkehrende Aufgaben erstellen
- Monitoring- und Qualitätssicherungsplan
- **Gate:** Vollständige Orchestrierungsstrategie dokumentiert und validiert
- **Deliverable:** `docs/plans/Orchestrierung.md`

### Phase 7: Detailplanung
- Modulare Task-Planung mit Abhängigkeiten
- Tasks den definierten Agenten-Rollen zuordnen
- Entwicklungsreihenfolge bestimmen (kritischer Pfad)
- Parallelisierungspotenzial identifizieren
- Akzeptanzkriterien pro Task definieren
- **Gate:** Vollständiger Implementierungsplan mit Tasks, Abhängigkeiten, Agenten-Zuordnung und Akzeptanzkriterien
- **Deliverable:** `docs/plans/Implementierungsplan.md`

### Phase 8: Autonome Entwicklung
Vollständig autonom, ohne Benutzer-Interaktion. Orchestriert nach Phase-6-Strategie.

- **8a - Scaffolding:** Projektstruktur, Dependencies, Build-Pipeline, Basis-Konfiguration
- **8b - Kernmodul Planung:** Grundriss-Import, Wandeditor, AP-Bibliothek, AP-Platzierung
- **8c - Kernmodul Heatmap:** RF-Modell, Heatmap-Berechnung, Echtzeit-Rendering
- **8d - Modul Messung:** Messpunkt-Generierung, Mess-Assistent, iPerf-Integration
- **8e - Modul Optimierung:** Mixing Console, Konfigurationsvorschläge, Verifikation
- **8f - UI/UX & i18n:** Gesamtlayout, Benutzerführung, Übersetzungen
- **8g - Integration:** Module zusammenführen, Datenfluss sicherstellen

**Durchgängig in Phase 8:**
- Nach jedem Teilmodul: Selbsttest und Code-Review
- Fehler sofort beheben, nicht aufschieben
- Fortschritt in Task-Liste dokumentieren

- **Gate:** Alle Module implementiert, alle Selbsttests bestanden
- **Deliverable:** Funktionierender Prototyp

### Phase 9: Qualitätssicherung
- Funktionstest aller Features gegen Akzeptanzkriterien (MVP-Backlog)
- Integrationstests (Module zusammen)
- UX-Review: Benutzerführung nachvollziehbar?
- Edge Cases und Fehlerbehandlung prüfen
- Performance-Check (Heatmap-Rendering, große Grundrisse)
- **Gate:** Alle Akzeptanzkriterien erfüllt, keine kritischen Bugs
- **Deliverable:** `docs/plans/Test-Report.md`

### Phase 10: Übergabe & Demo
- Dokumentation finalisieren (README, Setup-Anleitung)
- Benutzer informieren: "Fertig, bitte testen"
- Bekannte Einschränkungen dokumentieren
- Quick-Start-Guide erstellen
- **Gate:** Benutzer kann das Tool starten und nutzen
- **Deliverable:** Lauffähiges Tool mit vollständiger Dokumentation

## Prinzipien
- **Vollständig autonom** ab Phase 8 - Entwicklung ohne Benutzer-Interaktion
- **Quality Gates** - Keine Phase überspringen, kein Gate umgehen
- **Selbstkontrolle** - Regelmäßig eigene Arbeit prüfen und korrigieren
- **Keine Annahmen** - Recherchieren oder nachfragen, nie raten
- **UX/UI-Verbesserungen** sind erwünscht und eigenständig umzusetzen
- **Einfachheit vor Komplexität**
- **Entscheidungen dokumentieren** - Jede wichtige Entscheidung als ADR
- **Vollständiger Funktionsumfang** - Alles muss funktionieren

## Dokumentationsstruktur
```
docs/
├── prd/           # Product Requirements (PRD, Funktionsliste)
├── research/      # Recherche, Technologie-Evaluationen, Wissenslücken
├── architecture/  # Architektur-Entscheidungen (ADRs), Komponentendiagramm
├── plans/         # Implementierungspläne, MVP-Backlog, Roadmap
└── archive/       # Originale Quelldokumente
```

## Hardware-Kontext
- Referenz-AP: D-Link DAP-X2810 (Wi-Fi 6, 2x2 MU-MIMO)
- 2,4 GHz: 23 dBm TX, 3,2 dBi Gewinn
- 5 GHz: 26 dBm TX, 4,3 dBi Gewinn
- Features: 802.11k/r, Band Steering, Airtime Fairness
- Verwaltung: Nuclias Connect

## Tech-Stack
- (wird in Phase 5 festgelegt und hier eingetragen)
