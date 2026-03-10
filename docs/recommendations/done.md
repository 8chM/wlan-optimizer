# Recommendation Engine — Definition of Done

Stand: Phase 28bw (2026-03-10)

## Test-Suites

Alle muessen gruen sein (`npx vitest run` → 0 failed):

| Suite | Datei | Prueft |
|-------|-------|--------|
| Generator Core | `generator.test.ts` | 240+ Tests: alle Generatoren, Dedup, Budgets, Invarianten |
| Golden Regression | `golden.test.ts` | 10 Golden Cases (g1..g10): deterministisch erwartete Rec-Counts + Typen |
| Apply Sequence | `apply-sequence.test.ts` | BU-1..4: Ping-Pong Guard, Budget-Stabilitaet, Candidate-Invarianten, Evidence nach Apply |
| Candidate Realism | `candidateRealismIntegrity.test.ts` | CR-1..4, AQ, AS, AV, AW: keine Phantom-Platzierung, Policy-Einhaltung |
| Preview/Apply Consistency | `preview-apply-consistency.test.ts` | BK-1..6: Override → APConfig, Apply → DB-Update, Roundtrip |
| Fixture Round-Trip | `fixture-roundtrip.test.ts` | RT-1..3: Export → JSON → Import → Engine (keine Datenverluste) |
| Rules Integrity | `rulesIntegrity.test.ts` | E1..E9: Types ↔ Maps bidirektional, i18n-Keys, Category-Semantik |
| Rules Catalog | `rulesCatalogIntegrity.test.ts` | RC-1..RC-9: rules.md ↔ Code konsistent, Cluster-Ownership, unique IDs |
| RF-Fixtures | `rf2..rf6, real-fixture.test.ts` | Fixture-spezifische Invarianten (Phantom, Channel, Roaming, Evidence) |
| i18n Integrity | `i18nIntegrity.test.ts` | Alle titleKey/reasonKey existieren in EN + DE |

## Invarianten (alle automatisiert geprueft)

### Candidate Policy
- `required_for_new_ap`: Kein `add_ap` ohne `selectedCandidatePosition`
- `required_for_move_and_new_ap`: Zusaetzlich kein Interpolations-Fallback `move_ap`
- `optional`: Fallback erlaubt, muss `usedFallback=1` tragen
- Mutual Exclusion: `selectedCandidatePosition` XOR `usedFallback`

### Evidence Minimums
- Jeder `RecommendationType` hat definierte Pflicht-Metriken in `EVIDENCE_MINIMUMS`
- Gilt fuer Haupt-Empfehlungen UND `alternativeRecommendations`
- Typ ohne Evidence-Minimum-Eintrag: keine Pruefung (z.B. reine Hinweise)

### Budget Caps
- Max 2 `actionable_config` Recs pro AP (BD-01)
- Max 2 `change_channel` Recs pro Konflikt-Cluster (BC-01)
- Max 1 Budget-Note pro AP (BG-01)
- Max 2 Budget-Notes global (BR-01)
- Max 2 Gap-Notes global, max 1 pro AP (BM-01)
- Max 1 Advice-Note pro Analyse (BP-01)

### Parameter-Dedup
- Max 1 TX-aendernde Rec pro Ziel-AP
- Max 1 Channel/Width-aendernde Rec pro Ziel-AP
- Width gewinnt ueber Channel (gleicher AP → Channel wird Alternative)

### Blocked Recommendations
- Jede `blocked_recommendation` hat `blockedKind` (1-4) + `blockingReasonsCount`
- Jede hat mindestens eine EVIDENCE_MINIMUM-Metrik
- Jede hat nicht-leeres `blockedByConstraints`-Array
- Kein `actionable_config` mit `blockedByConstraints` ohne Typ `blocked_recommendation` oder `feasibilityScore=0`

### Apply Sequence
- Kein Ping-Pong: Eine Empfehlung reverst keinen gerade angewandten Parameter
- Budget-Caps bleiben nach Apply stabil
- Candidate-Invarianten gelten auch nach Apply-Sequenz

### Sortierung
- Blocked Recs am Ende
- Category-Reihenfolge: actionable → instructional → informational
- Keine informational Note vor der letzten instructional Rec
- Gap-Notes deterministisch (pairKey alphabetisch)

## Preview/Apply Konsistenz

Fuer jeden `actionable_config` Typ gilt:

1. `suggestedChange.parameter` → `mapSuggestedChangeToOverrides()` → nicht-leere Override-Liste
2. `suggestedChange.parameter` → `mapSuggestedChangeToApUpdate()` → nicht-leeres DB-Update
3. Override angewandt auf `convertApsToConfig()` → APConfig aendert sich tatsaechlich
4. Beide Pfade aendern denselben Parameter (keine Silent No-Ops)

## Verifikations-Kommando

```bash
# Standard-Pruefung (empfohlen nach jeder Aenderung):
./scripts/report-integrity.sh "phase-XY"

# Release-Pruefung (identisch, explizit benamst):
./scripts/report-integrity.sh "release"
```

Erwartetes Ergebnis: `INTEGRITY_OK` mit 0 failed Tests, 0 svelte-check Errors, Build OK.

## Wann ist eine Phase "done"?

1. Alle Tests gruen (0 failed)
2. `svelte-check --threshold error` → 0 Errors
3. `npm run build` → OK
4. Golden Files aktuell (bei Aenderung: `GOLDEN_UPDATE=1 npx vitest run golden.test.ts`)
5. `rules.md` aktualisiert (Regeln + Cluster-Tabelle + Total)
6. `progress.json` aktualisiert (Phase-Eintrag + currentPhase)
7. Committed + gepusht
