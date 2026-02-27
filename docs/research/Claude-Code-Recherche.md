# Claude Code Recherche - Phase 0 Deliverable

> Konsolidierte Ergebnisse der Autonomie-Recherche (Feb 2026)
> Basis fuer alle Folgephasen: Orchestrierung, Monitoring, Entwicklungsstrategie
> **v2**: Erweitert um BMAD-Methode und fortschrittliche MCP-Server

---

## 1. Claude Code - Modellvergleich

### Opus 4.6 vs Sonnet 4.6

| Aspekt | Opus 4.6 | Sonnet 4.6 |
|--------|----------|------------|
| **Kosten** | $15/$75 pro 1M Tokens | $3/$15 pro 1M Tokens |
| **Context Window** | 200K (1M Beta) | 200K (1M Beta) |
| **Max Output** | 128K Tokens | 64K Tokens |
| **SWE-bench** | Hoechste Punktzahl | Nur 1,2% weniger |
| **Reasoning (GPQA)** | 91,3% | 74,1% |
| **Adaptive Thinking** | Ja | Nein |
| **Agent Teams** | Ja | Nein |

### Modell-Zuordnungsstrategie fuer WLAN-Optimizer

| Aufgabe | Modell | Begruendung |
|---------|--------|-------------|
| Architektur-Design | Opus 4.6 | Komplexe Entscheidungen, Multi-File |
| RF-Modell-Algorithmen | Opus 4.6 | Mathematik, wissenschaftliches Reasoning |
| Team Lead / Orchestrierung | Opus 4.6 | Agent Teams nur mit Opus |
| Feature-Implementierung | Sonnet 4.6 | 66% guenstiger, nahezu gleiche Code-Qualitaet |
| Tests schreiben | Sonnet 4.6 | Standard-Task, Kostenoptimierung |
| Bug-Fixes | Sonnet 4.6 | Schnell, fokussiert |
| Code-Review (Subagent) | Haiku 4.5 | Schnell, Read-only |

---

## 2. Verfuegbare Tools

### Integrierte Tools

| Tool | Funktion | Permission |
|------|----------|------------|
| Read | Dateien lesen | Keine |
| Write | Neue Dateien erstellen | Ja |
| Edit | Dateien bearbeiten | Ja |
| Glob | Dateien nach Pattern suchen | Keine |
| Grep | Dateiinhalte mit Regex durchsuchen | Keine |
| Bash | Shell-Befehle ausfuehren | Ja |
| Task | Subagent spawnen | Ja |
| WebFetch | Web-Seiten abrufen | Keine |
| WebSearch | Web-Suche | Keine |

### Parallelitaet

- Unabhaengige Tool-Calls koennen in einer Nachricht parallel laufen
- Abhaengige Calls muessen sequentiell sein
- **Vorsicht**: Parallele Write/Edit auf gleiche Datei koennen fehlschlagen

---

## 3. Multi-Agent & Teams

### Aktivierung

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Bereits in unserer settings.json aktiviert.

### Architektur

- **Team Lead**: Hauptsession, koordiniert, weist Tasks zu, synthetisiert Ergebnisse
- **Teammates**: Separate Claude-Code-Instanzen, je eigenes Context Window
- **Shared Task List**: In `~/.claude/tasks/{team-name}/` gespeichert
- **Messaging**: Direct Message, Broadcast, automatische Idle-Notifications

### Subagent-Typen

| Typ | Modell | Tools | Einsatz |
|-----|--------|-------|---------|
| **Explore** | Haiku | Read-only | Codebase-Suche, Analyse |
| **Plan** | Erbt | Read-only | Architektur-Planung |
| **general-purpose** | Erbt | Alle | Implementierung, komplexe Tasks |
| **Bash** | Erbt | Nur Bash | Terminal-Operationen |
| **Custom** | Konfigurierbar | Konfigurierbar | Projektspezifisch |

### Custom Subagents (.claude/agents/)

```markdown
---
name: rf-calculator
description: RF-Modellierungs-Experte fuer Heatmap-Berechnungen
tools: Read, Grep, Glob, Bash
model: sonnet
maxTurns: 15
---

Du bist ein Experte fuer Indoor-RF-Modellierung...
```

### Praktische Grenzen

| Parameter | Empfehlung |
|-----------|------------|
| Team-Groesse | 3-5 Teammates |
| Tasks pro Teammate | 5-6 optimal |
| Token-Skalierung | Linear (5 Agents = 5x Kosten) |
| Dateikonflikte | Vermeiden: Jeder Teammate andere Dateien |
| Nested Teams | Nicht moeglich |
| Session Resume | In-Process Teammates nicht wiederherstellbar |

---

## 4. MCP-Server (Model Context Protocol)

### Bereits konfiguriert (global)

- Supabase (Datenbank)
- Atlassian (Jira/Confluence)
- Google Calendar
- Gmail

### Erweiterte MCP-Recherche (v2)

#### Hoechste Prioritaet - Sofort installieren

| MCP-Server | Was es tut | Stars | Installation |
|------------|-----------|-------|-------------|
| **[Context7](https://github.com/upstash/context7)** | Aktuelle, versionsspezifische Bibliotheks-Docs direkt im LLM-Kontext. Eliminiert halluzinierte APIs. | ~47.1k | `claude mcp add context7 -- npx -y @upstash/context7-mcp` |
| **[Sequential Thinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking)** | Strukturiertes Problemloesen mit Revision und Verzweigung. Ideal fuer Architektur und RF-Algorithmen. | Offiziell | `claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking` |
| **[ESLint MCP](https://eslint.org/docs/latest/use/mcp)** | Echtzeit-Linting waehrend Code-Generierung. | Offiziell | `npx @eslint/mcp@latest` |

#### Hohe Prioritaet - Ab Phase 5/7

| MCP-Server | Was es tut | Nutzen |
|------------|-----------|--------|
| **[Design Patterns](https://github.com/apolosan/design_patterns_mcp)** | 685+ Patterns in 12 Kategorien (GoF, Architektur, React, Concurrency). Semantische Suche. | Architektur-Entscheidungen |
| **[Mermaid/Sailor](https://github.com/aj-geddes/sailor)** | Diagramm-Generierung mit Live-Reload in Claude Code. | Architektur-Visualisierung |
| **[Vitest MCP](https://github.com/djankies/vitest-mcp)** | KI-optimierter Vitest-Runner mit strukturiertem Output und Coverage. | TDD ab Phase 8 |
| **[Playwright MCP](https://github.com/executeautomation/mcp-playwright)** | Browser-Automatisierung, Accessibility-Tree-Snapshots, 143 Geraete-Emulationen. | E2E-Tests |

#### Mittlere Prioritaet - Kontextabhaengig

| MCP-Server | Was es tut | Nutzen |
|------------|-----------|--------|
| **[Tauri Plugin MCP](https://github.com/P3GLEG/tauri-plugin-mcp)** | Debugging von Tauri-v2-Apps: Screenshots, DOM-Zugriff, JS-Ausfuehrung. | Falls Tauri gewaehlt wird |
| **[Figma MCP](https://developers.figma.com/docs/figma-mcp-server)** | Design-zu-Code-Konvertierung, Zugriff auf Designvariablen. | Falls Figma-Designs existieren |
| **[Sentry MCP](https://github.com/getsentry/sentry-mcp)** | Fehler-Tracking, Stack-Traces aus Produktion. | Post-Release |
| **[Memory MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)** | Persistenter Wissensgraph (JSONL). | Ergaenzend zu MEMORY.md |

#### Referenz-Listen

| Liste | URL |
|-------|-----|
| Official MCP Servers | [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) |
| wong2/awesome-mcp-servers | [github.com/wong2/awesome-mcp-servers](https://github.com/wong2/awesome-mcp-servers) |
| punkpeye/awesome-mcp-servers | [github.com/punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) |
| TensorBlock (7.260+ Server) | [github.com/TensorBlock/awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers) |

### MCP Scopes

| Scope | Datei | Zugriff |
|-------|-------|---------|
| Local | `~/.claude.json` | Nur dieses Projekt |
| Project | `.mcp.json` | Team (Git versioniert) |
| User | `~/.claude.json` (global) | Alle Projekte |

---

## 5. Skills & Hooks

### Skills (.claude/skills/)

Skills sind Markdown-Dateien mit YAML-Frontmatter. Sie geben Claude neue Faehigkeiten.

```markdown
---
name: review-code
description: Code-Review mit Fokus auf Sicherheit und Performance
tools: Read, Grep, Glob
model: sonnet
---

# Code Review

Pruefe $0 auf:
1. Sicherheitsprobleme
2. Performance
3. Code-Standards
```

**Aufruf**: `/review-code src/heatmap.ts`

### Hooks (settings.json)

Hooks sind automatische Befehle zu bestimmten Zeitpunkten im Claude-Code-Lifecycle.

#### Alle Hook-Events

| Event | Zeitpunkt | Einsatz |
|-------|-----------|---------|
| SessionStart | Session startet | Env-Check |
| PreToolUse | Vor Tool-Ausfuehrung | Sicherheitscheck, Blockierung |
| PostToolUse | Nach Tool-Ausfuehrung | Formatierung, Linting |
| PostToolUseFailure | Nach fehlgeschlagenem Tool | Error-Logging |
| Stop | Claude beendet Antwort | Quality Gate |
| SubagentStart | Subagent startet | Logging |
| SubagentStop | Subagent endet | Ergebnis-Validierung |
| TeammateIdle | Teammate idle | Keep-Working-Check |
| TaskCompleted | Task abgeschlossen | Abnahme-Check |
| Notification | Benachrichtigung | Desktop-Alert |

#### Hook-Typen

| Typ | Beschreibung | Einsatz |
|-----|-------------|---------|
| `command` | Shell-Befehl | Linting, Tests, Format |
| `prompt` | LLM-Entscheidung (Ja/Nein) | Quality Gates |
| `agent` | Subagent mit Tool-Zugriff | Komplexe Pruefungen |

#### Exit-Codes

| Code | Bedeutung |
|------|-----------|
| 0 | Erlauben |
| 2 | Blockieren (stderr → Claude) |
| Andere | Erlauben (stderr nur verbose) |

---

## 6. Best Practices fuer autonome Entwicklung

### Two-Agent Pattern (Anthropic-Empfehlung)

```
Session 1 - Initializer:
├── Liest Spezifikation
├── Erstellt Feature-Liste mit Test Cases
├── Setzt Projektstruktur auf
└── Initialisiert Git

Sessions 2+ - Coding Agent:
├── Nimmt naechste Task aus feature_list.json
├── Implementiert und testet
├── Markiert Fortschritt
└── Committed
```

### Task-Groessen

| Groesse | Dateien | Erfolgsrate | Empfehlung |
|---------|---------|-------------|------------|
| Micro | 1-2 | 95% | Ideal fuer Subagents |
| Small | 3-5 | 90% | Standard-Tasks |
| Medium | 5-10 | 85% | Mit Plan Mode |
| Large | >10 | 70% | Aufteilen! |

### Context-Management

- Performance degradiert ab 60% Context-Auslastung
- `/clear` zwischen unabhaengigen Tasks
- Subagenten fuer Recherche nutzen (schont Main-Context)
- Nach 2 fehlgeschlagenen Korrekturen: `/clear` + besserer Prompt
- `feature_list.json` und Git als persistenter Kontext zwischen Sessions

### Qualitaetssicherung ohne menschlichen Review

1. **Tests zuerst** (TDD): Claude schreibt Test, dann Implementierung
2. **Hooks fuer automatische Validierung**: Lint/Type-Check nach jedem Edit
3. **Quality Gate bei Stop**: Prompt-Hook prueft ob alles erfuellt
4. **Verification Run**: Claude fuehrt Tests aus und repariert bis sie bestehen
5. **Explizite Stop-Kriterien**: Nie "done" ohne gruene Tests

### Typische Fehler vermeiden

| Fehler | Loesung |
|--------|---------|
| Kitchen-Sink-Session | `/clear` zwischen Tasks |
| Over-Correcting (>2x) | `/clear` + besserer Prompt |
| Aufgeblasene CLAUDE.md | Radikal kuerzen, max 30 Zeilen Kern |
| Trust-Verify Gap | Verifikation ERZWINGEN |
| Endlose Exploration | Subagenten nutzen |
| Incomplete Feature | Explizit: nur "done" wenn Tests grueen |

---

## 7. Orchestrierungs- und Monitoringstrategie

> **Kernfrage**: Wie orchestrieren und monitoren wir die vollstaendig autonome
> Entwicklung des WLAN-Optimizers ueber alle Module hinweg?

### 7.1 Architektur der Orchestrierung

```
                    ┌─────────────────────┐
                    │   Haupt-Session      │
                    │   (Opus 4.6)         │
                    │   = ORCHESTRATOR     │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼─────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │  Agent Team   │ │  Subagents  │ │   Hooks     │
    │  (Phase 8)    │ │  (jederzeit)│ │  (immer)    │
    │               │ │             │ │             │
    │  3-4 Workers  │ │  Explore    │ │  PostEdit   │
    │  je Modul     │ │  Review     │ │  Stop Gate  │
    │  parallelisiert│ │  Test      │ │  Format     │
    └───────────────┘ └─────────────┘ └─────────────┘
```

### 7.2 Drei Ebenen der Orchestrierung

#### Ebene 1: Session-Orchestrierung (Makro)

Die Haupt-Session (Opus 4.6) fungiert als Orchestrator ueber alle Phasen:

- Verwaltet `docs/plans/progress.json` als zentrale Fortschrittsdatei
- Prueft Quality Gates vor Phasenuebergang
- Entscheidet wann Agent Teams eingesetzt werden
- Delegiert Recherche an Explore-Subagents
- Delegiert Implementierung an general-purpose-Subagents oder Agent Teams

**Progress-Tracking via JSON:**

```json
{
  "currentPhase": 1,
  "phases": {
    "0": { "status": "completed", "gate": "passed" },
    "1": { "status": "in_progress", "tasks": [...] }
  },
  "blockers": [],
  "decisions": []
}
```

#### Ebene 2: Modul-Orchestrierung (Meso)

Pro Entwicklungsmodul (8a-8g) wird entschieden:

| Modul | Strategie | Begruendung |
|-------|-----------|-------------|
| 8a Scaffolding | Einzelsession | Sequenziell, Abhaengigkeiten |
| 8b Kernmodul Planung | Agent Team (3) | Unabhaengige Teilkomponenten |
| 8c Heatmap | Einzelsession Opus | Mathematisch komplex |
| 8d Messung | Agent Team (2) | Frontend + Backend parallel |
| 8e Optimierung | Einzelsession | Abhaengig von 8c+8d |
| 8f UI/i18n | Subagents | Viele kleine Tasks |
| 8g Integration | Einzelsession | Koordination erforderlich |

#### Ebene 3: Task-Orchestrierung (Mikro)

Innerhalb eines Moduls:

1. **Task-Erstellung** via TaskCreate mit Abhaengigkeiten
2. **Task-Zuweisung** an Teammates oder Subagents
3. **Fortschritt** via TaskUpdate (pending → in_progress → completed)
4. **Blockierungen** erkennen und loesen
5. **Quality Gate** am Ende jedes Moduls

### 7.3 Monitoring-Strategie

#### Automatisches Monitoring via Hooks

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "npx tsc --noEmit 2>&1 | head -20",
        "timeout": 30000
      }]
    }],
    "Stop": [{
      "matcher": ".*",
      "hooks": [{
        "type": "prompt",
        "prompt": "QUALITY GATE: Pruefe ob alle geaenderten Dateien kompilieren und Tests bestehen. Wenn nicht, repariere sofort."
      }]
    }],
    "TaskCompleted": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "echo 'Task completed' >> /tmp/wlan-optimizer-progress.log"
      }]
    }]
  }
}
```

#### Fortschritts-Tracking

| Mechanismus | Was wird getrackt | Wo |
|-------------|-------------------|----|
| `progress.json` | Phasen, Module, Gates | `docs/plans/progress.json` |
| TaskList | Einzelne Tasks + Status | `~/.claude/tasks/{team}/` |
| Git Commits | Code-Aenderungen | Git-History |
| Test-Ergebnisse | Funktionalitaet | CI-Pipeline / Hooks |
| CLAUDE.md | Aktive Phase | Projektroot |

#### Selbst-Monitoring Regeln (in CLAUDE.md)

```markdown
# Monitoring-Regeln
- Nach jedem Modul: progress.json aktualisieren
- Vor Phasenuebergang: Quality Gate explizit pruefen
- Bei Blocker: In progress.json dokumentieren, alternatives Vorgehen planen
- Nach 3 fehlgeschlagenen Versuchen: Ansatz wechseln, nicht wiederholen
- Regelmaessig: Git Status pruefen, uncommitted Changes committen
```

### 7.4 Quality Gates - Konkrete Implementierung

| Phase | Gate-Bedingung | Pruefmethode |
|-------|---------------|--------------|
| 0 | Recherche dokumentiert | Datei existiert + nicht leer |
| 1 | Tooling konfiguriert | npm install + build laeuft |
| 2 | Luecken dokumentiert | Datei existiert |
| 5 | Architektur steht | ADRs vorhanden |
| 8x | Modul funktioniert | Tests bestanden |
| 9 | Alle Features ok | Alle Akzeptanzkriterien erfuellt |

### 7.5 Agenten-Rollen fuer WLAN-Optimizer

| Rolle | Typ | Modell | Aufgabe |
|-------|-----|--------|---------|
| **Orchestrator** | Hauptsession | Opus 4.6 | Koordination, Architektur, Gates |
| **Implementierer** | general-purpose | Sonnet 4.6 | Feature-Entwicklung |
| **Researcher** | Explore | Haiku 4.5 | Codebase-Analyse, Recherche |
| **Reviewer** | Custom Agent | Sonnet 4.6 | Code-Review nach Implementierung |
| **Tester** | Custom Agent | Sonnet 4.6 | Tests schreiben und ausfuehren |

### 7.6 Skills fuer WLAN-Optimizer

Geplante projektspezifische Skills:

| Skill | Zweck | Wann erstellen |
|-------|-------|----------------|
| `/review-module` | Code-Review eines Moduls | Phase 1 |
| `/run-tests` | Tests ausfuehren und Ergebnis berichten | Phase 1 |
| `/update-progress` | progress.json aktualisieren | Phase 1 |
| `/check-gate` | Quality Gate einer Phase pruefen | Phase 1 |
| `/rf-validate` | RF-Modell-Berechnung validieren | Phase 8c |

---

## 8. BMAD - Breakthrough Method for Agile AI-Driven Development

### Was ist BMAD?

BMAD ist ein Open-Source-Framework (MIT, ~38.3k GitHub Stars), das Softwareentwicklung durch spezialisierte KI-Agenten strukturiert. Jeder Agent uebernimmt eine Rolle: Analyst, Product Manager, Architekt, Scrum Master, Developer, QA, UX Designer.

**Kernphilosophie**: "Structure beats chaos" -- Dokumentation als primaere Wahrheitsquelle. Durch PRDs, Architektur-Dokumente und User Stories **vor** Implementierung werden KI-Halluzinationen reduziert.

### Repositories

| Repository | Beschreibung | Version |
|---|---|---|
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | Offizielle Referenz | v6.0.3 (Feb 2026) |
| [claude-code-bmad-skills](https://github.com/aj-geddes/claude-code-bmad-skills) | Native Claude Code Skills | v6 |
| [bmad-mcp-server](https://github.com/cexll/bmad-mcp-server) | MCP-Server-Variante | - |
| [Dokumentation](https://docs.bmad-method.org/) | Offizielle Docs | - |

### BMAD-Agenten (12+ Spezialisten)

1. **BMad Master** -- Orchestrator, koordiniert alle Agenten
2. **Business Analyst** -- Produktentdeckung, Marktanalyse
3. **Product Manager** -- PRD-Erstellung, Anforderungsdokumentation
4. **System Architect** -- Systemdesign, technische Spezifikationen
5. **Scrum Master** -- Sprint-Planung, Koordination
6. **Developer** -- Implementierung, Code-Generierung
7. **UX Designer** -- Barrierefreiheit, WCAG-Compliance
8. **Builder** -- Erstellung benutzerdefinierter Agenten
9. **Creative Intelligence** -- Brainstorming (8 Techniken: 5 Whys, SCAMPER, Mind Mapping etc.)
10. **QA Engineer** -- Test-Strategie, Qualitaetssicherung
11. **Test Architect** -- Risikobasiertes Testen (TEA-Modul)

### BMAD-Workflow (15 Slash-Commands)

| Phase | Command | Funktion |
|-------|---------|----------|
| Analyse | `/workflow-init` | BMAD im Projekt initialisieren |
| Analyse | `/workflow-status` | Status + Empfehlungen |
| Analyse | `/product-brief` | Produktentdeckungsdokument |
| Planung | `/prd` | Umfassendes PRD |
| Planung | `/tech-spec` | Leichtgewichtige Anforderungen |
| Solutioning | `/architecture` | Systemdesign-Dokument |
| Solutioning | `/solutioning-gate-check` | Design-Qualitaet validieren (>=90%) |
| Impl. | `/sprint-planning` | Sprint-Iterationen planen |
| Impl. | `/create-story` | Atomare User Stories |
| Impl. | `/dev-story` | Stories mit Tests implementieren |
| Erweiterung | `/create-agent` | Benutzerdefinierte Agenten |
| Erweiterung | `/brainstorm` | Strukturierte Ideenfindung |
| Erweiterung | `/research` | Markt-/Technik-Recherche |

### Installation fuer Claude Code

```bash
# Option A: npm (Node.js v20+ erforderlich)
npx bmad-method install

# Option B: Native Skills (keine Abhaengigkeiten)
cd /tmp && git clone https://github.com/aj-geddes/claude-code-bmad-skills.git
cd claude-code-bmad-skills && chmod +x install-v6.sh && ./install-v6.sh
```

### Token-Optimierung

Die Skills-Variante reduziert den Token-Verbrauch um **70-85%** (15-25KB statt 60-100KB pro Konversation) durch ein Helper-Pattern mit referenzierten Abschnitten.

### BMAD vs. Alternativen

| Aspekt | BMAD | Claude Flow | Gas Town |
|---|---|---|---|
| **Agenten** | 26 Personas, sequenziell | 54+, parallel (Schwarm) | 7 Rollen, ephemer |
| **Persistenz** | Dokumente im Repo | AgentDB + SQLite | Git-Commits (JSONL) |
| **Staerke** | Audit-Trails, Governance | Schnelle Parallelisierung | Crash-Recovery |
| **Schwaeche** | ~3h Planungsphase | Speicher-Overhead | ~100$/h Kosten |
| **Bester Einsatz** | Greenfield mit Doku-Disziplin | Komplexe parallele Tasks | Langfrist-Projekte |

### Relevanz fuer WLAN-Optimizer

BMAD ist **hochrelevant**. Unser Phasenmodell entspricht dem BMAD-Workflow:

| Unsere Phase | BMAD-Equivalent |
|---|---|
| Phase 3 (Recherche) | `/product-brief` + `/research` |
| Phase 5 (Architektur) | `/architecture` + `/solutioning-gate-check` |
| Phase 7 (Detailplanung) | `/sprint-planning` + `/create-story` |
| Phase 8 (Entwicklung) | `/dev-story` |

**Empfehlung**: BMAD als ergaenzende Methodologie adoptieren, insbesondere die Agent-Personas, Slash-Commands und das Gate-Check-System. Nicht als Ersatz fuer unser Phasenmodell, sondern als **Qualitaetsverstaerker** innerhalb der existierenden Phasen.

Quelle: [Multi-Agent Orchestration: BMAD, Claude Flow, Gas Town](https://re-cinq.com/blog/multi-agent-orchestration-bmad-claude-flow-gastown)

---

## 9. Konkrete naechste Schritte (Phase 1)

Phase 0 (Recherche) ist mit diesem Dokument abgeschlossen. Phase 1 (Projektsetup) umfasst:

1. **MCPs installieren**: Context7, Sequential Thinking, ESLint MCP
2. **BMAD evaluieren**: `npx bmad-method install` oder Skills-Variante testen
3. **Skills erstellen/erweitern**: `.claude/skills/` mit BMAD-inspirierten Skills
4. **Hooks konfigurieren**: settings.json mit Lint/Test/Gate-Hooks
5. **Custom Agents definieren**: `.claude/agents/` fuer Reviewer und Tester
6. **progress.json pflegen**: Fortschritts-Tracking aktiv halten
7. **Permissions optimieren**: Allow-Listen fuer vertrauenswuerdige Commands

---

## Quellen

- [Claude Code Overview](https://code.claude.com/docs/en/overview)
- [Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams)
- [Custom Subagents](https://code.claude.com/docs/en/sub-agents)
- [MCP Documentation](https://code.claude.com/docs/en/mcp)
- [Skills Documentation](https://code.claude.com/docs/en/skills)
- [Hooks Guide](https://code.claude.com/docs/en/hooks-guide)
- [Best Practices](https://code.claude.com/docs/en/best-practices)
- [Permissions](https://code.claude.com/docs/en/permissions)
- [Anthropic Autonomous Coding Demo](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)
- [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)
- [BMAD-METHOD GitHub](https://github.com/bmad-code-org/BMAD-METHOD)
- [BMAD Dokumentation](https://docs.bmad-method.org/)
- [claude-code-bmad-skills](https://github.com/aj-geddes/claude-code-bmad-skills)
- [Context7 MCP](https://github.com/upstash/context7)
- [Sequential Thinking MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking)
- [Design Patterns MCP](https://github.com/apolosan/design_patterns_mcp)
- [Tauri Plugin MCP](https://github.com/P3GLEG/tauri-plugin-mcp)
- [Multi-Agent Orchestration: BMAD, Claude Flow, Gas Town](https://re-cinq.com/blog/multi-agent-orchestration-bmad-claude-flow-gastown)
- [awesome-mcp-servers](https://github.com/wong2/awesome-mcp-servers)
