---
name: create-adr
description: Create an Architecture Decision Record
user-invocable: true
allowed-tools: Read, Write, Edit, Glob
argument-hint: "[title]"
---

# Architecture Decision Record: $0

Create an ADR in `docs/architecture/` following this template:

## Steps

1. Determine next ADR number: Count existing `ADR-*.md` files in `docs/architecture/`
2. Create file: `docs/architecture/ADR-{NNN}-{title-kebab-case}.md`
3. Use this structure:

```markdown
# ADR-{NNN}: {Title}

**Status:** Proposed | Accepted | Deprecated | Superseded
**Datum:** {today}
**Kontext-Phase:** {current phase from progress.json}

## Kontext
Was ist die Ausgangslage? Welches Problem wird geloest?

## Entscheidung
Was wurde entschieden?

## Alternativen
| Option | Pro | Contra |
|---|---|---|
| ... | ... | ... |

## Konsequenzen
- Positive Auswirkungen
- Negative Auswirkungen / Trade-offs
- Abhaengigkeiten die entstehen

## Referenzen
- Relevante Recherche-Dokumente
- Wissensluecken-IDs (WL-...)
```

4. Fill all sections from context (autonomous mode - do NOT ask user)
5. Add decision to `docs/plans/progress.json` decisions array
6. Use conservative defaults when uncertain, document reasoning
