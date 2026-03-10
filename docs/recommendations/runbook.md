# Empfehlungen anwenden — Runbook

Stand: Phase 28bw (2026-03-10)

## Empfohlene Reihenfolge

Empfehlungen sind bereits nach Prioritaet sortiert. Innerhalb gleicher Prioritaet gilt:

```
1. Channel / Width    — loest Interferenz, keine Hardware-Aenderung
2. TX Power           — justiert Reichweite/Overlap, sofort wirksam
3. Roaming TX         — verbessert Uebergaenge zwischen APs
4. Physical/Move      — AP-Position aendern (erfordert physischen Eingriff)
5. Instructional      — Hinweise zum manuellen Umsetzen
6. Infrastructure     — neue Kabel/APs installieren (hoher Aufwand)
```

**Grundregel:** Leichte Aenderungen zuerst. Nach jedem Schritt "Neu analysieren" klicken
— die Engine passt die verbleibenden Empfehlungen automatisch an.

## Was die Kategorien bedeuten

| Kategorie | Im UI | Bedeutung |
|-----------|-------|-----------|
| `actionable_config` | "Anwenden" Button | Sofort per Klick umsetzbar (Kanalwechsel, TX-Power, Width) |
| `actionable_create` | "Anwenden" Button | Erzeugt neuen AP oder verschiebt bestehenden |
| `instructional` | "Als erledigt markieren" | Manuelle Anweisung (z.B. AP-Ausrichtung drehen) |
| `informational` | Nur lesen | Hinweis ohne Aktion (Overlap-Warnung, Coverage-Info) |
| `blocked` | Ausgegraut | Massnahme technisch blockiert (Capability/Policy/Zone) |

## Was Notes/Hinweise bedeuten

### Budget Notes (`channel_deprioritized_note`, `config_budget_note`)

"Es gibt mehr Vorschlaege als sinnvoll gleichzeitig umsetzbar."

**Was tun:** Die wichtigsten 1-2 Vorschlaege pro AP umsetzen. Nach Re-Analyse
koennen weitere erscheinen, falls noetig.

### Gap/Sticky/Roaming Notes (`handoff_gap_warning`, `sticky_client_risk`)

"Zwischen zwei APs gibt es ein Roaming-Problem."

- **Gap Warning (Luecke):** Uebergangszone hat Funkloecher. TX-Boost oder neuen AP erwaegen.
- **Sticky Risk:** Clients bleiben am dominanten AP kleben. TX-Power-Reduktion hilft.
- **Roaming Hint:** Allgemeiner Hinweis zur Uebergangsqualitaet.

**Was tun:** Wenn actionable Roaming-Empfehlungen vorhanden sind, diese zuerst anwenden.
Reine Notes (informational) erfordern keine Aktion.

### Uplink/Band Notes (`band_limit_warning`)

"Viele Clients sind durch die Senderichtung (Uplink) limitiert."

**Was tun:** Client-Antennenposition pruefen, ggf. Mesh-Knoten naeher platzieren.
TX-Erhoehung hilft hier NICHT (Problem ist client→AP, nicht AP→client).

### Blocked Recommendations

"Diese Massnahme ist technisch nicht moeglich."

Gruende (im `blockedKind` Feld):
- **1 = Capability:** AP-Modell unterstuetzt die Aenderung nicht
- **2 = Policy:** Kandidaten-Richtlinie verhindert Aktion (z.B. kein Kandidat nahe genug)
- **3 = Constraint:** Position liegt in einer Einschraenkungszone
- **4 = Wall:** Position liegt in einer Wand

**Was tun:** Einschraenkung pruefen. Ggf. Constraint-Zone anpassen oder
andere Kandidaten-Standorte definieren.

## Wann "Neu analysieren"?

| Situation | Aktion |
|-----------|--------|
| Nach "Anwenden" einer Empfehlung | Automatisch: Banner "Ergebnisse veraltet" erscheint |
| Nach manueller AP-Verschiebung im Editor | Re-Analyse starten (Heatmap hat sich geaendert) |
| Nach "Als erledigt markieren" (instructional) | Re-Analyse optional (Engine beruecksichtigt done-Status) |
| Viele Empfehlungen umgesetzt | Definitiv Re-Analyse — Folge-Empfehlungen aendern sich |
| Stale-Banner erscheint | Re-Analyse starten |

## Praxis-Tipps

1. **Nicht alle Empfehlungen umsetzen muessen.** Die Engine zeigt alles Moegliche —
   oft reichen die oberen 2-3 Empfehlungen fuer eine deutliche Verbesserung.

2. **Score beachten.** Der `recommendationScore` (im Debug-Panel sichtbar) zeigt
   die erwartete Verbesserung. Empfehlungen mit Score < 30 bringen wenig.

3. **Notes ignorieren ist OK.** Informational Notes sind Kontext, keine Pflicht.
   Sie erklaeren, warum bestimmte Empfehlungen fehlen oder limitiert sind.

4. **Iterativ arbeiten.** 1-2 Empfehlungen → Re-Analyse → naechste Runde.
   So vermeidet man Wechselwirkungen.

5. **Preview nutzen.** Vor "Anwenden" zeigt die Heatmap-Vorschau die
   erwartete Aenderung. Bei negativem Ergebnis: nicht anwenden.
