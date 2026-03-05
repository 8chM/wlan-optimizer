# Recommendation Engine — Vollstaendige Ist-Analyse & Zielregelwerk

Phase 27b: Produktreife-Audit (erstellt 2026-03-05)

## 1. Vollstaendige Regelsammlung (20 Typen)

### Kategorie: actionable_config (5 Typen)

#### 1.1 change_channel
- **Generator**: `generateChannelRecommendations()` (generator.ts:1063)
- **Trigger**: AP in Kanal-Konflikt mit score >= 0.3
- **Algorithmus**: Greedy Assignment — sortiert APs nach Konfliktschwere, weist Kanal mit geringstem Restkonflikt zu
- **Schwellenwerte**: score >= 0.3; 2.4 GHz Range 35m, 5 GHz Range 20m
- **Kanalpool**: ALLOWED_CHANNELS: 2.4 GHz [1,6,11], 5 GHz [36,40,44,48]
- **Ausschluss**: !canChangeChannel24/5
- **Simulation**: Nein (nur Konfliktscore)
- **Bewertung**: priority=high/medium (score >= 0.6 → high)
- **Kategorie**: actionable_config

#### 1.2 adjust_tx_power
- **Generator**: `generateTxPowerSuggestions()` (generator.ts:952)
- **Trigger Reduce**: overlapRatio > 15% → -3 dBm (min 10 dBm, Sim-Drop max -5%)
- **Trigger Increase**: primaryCoverageRatio < 15% → +3 dBm (max 30 dBm, Sim > +2%)
- **Ausschluss**: !canChangeTxPower24/5
- **Simulation**: Ja
- **Bewertung**: Immer priority=low, severity=info
- **Parameter**: band-spezifisch (tx_power_24ghz / tx_power_5ghz / tx_power_6ghz)

#### 1.3 disable_ap
- **Generator**: `generateDisableApSuggestions()` (generator.ts:1552)
- **Trigger**: primaryCoverageRatio < 2% UND secondBestCoverage/total > 10% UND Score-Drop < 2%
- **Simulation**: Ja (simulateGrid vorher/nachher)
- **Bewertung**: Immer priority=low, severity=info

#### 1.4 roaming_tx_adjustment
- **Generator**: `generateRoamingTxAdjustments()` (generator.ts:1249)
- **Trigger**: stickyRatio > 30% in Roaming-Paar → dominanten AP um 3 dBm reduzieren
- **Ausschluss**: !canChangeTxPower, reducedPower < 10 dBm, Sim-Drop > -5%
- **Simulation**: Ja
- **Bewertung**: priority=medium, severity=warning
- **Blocked**: Erzeugt blocked_recommendation wenn TX nicht aenderbar

#### 1.5 adjust_channel_width
- **Generator**: `generateChannelWidthRecommendations()` (generator.ts:1921)
- **Trigger**: 80+ MHz mit 2+ Nachbarn (< 20m) → 40 MHz; 40+ MHz mit 3+ sehr nah (< 10m) → 20 MHz
- **Ausschluss**: 2.4 GHz Band
- **Simulation**: Nein
- **Bewertung**: priority=high wenn 80MHz + 3 Nachbarn

### Kategorie: actionable_create (2 Typen)

#### 1.6 add_ap
- **Generator**: `generateAddApSuggestions()` (generator.ts:323)
- **Trigger**: Schwache Zone mit >= 20 Zellen, Sim > +2%
- **Algorithmus**: RF-gewichteter Schwerpunkt, Kandidaten-Matching, Multi-Zone (top 3)
- **Template**: Bester AP nach Coverage-Ratio
- **Ausschluss**: PriorityZone-Band-Mismatch, forbidden/no_new_ap Zones

#### 1.7 preferred_candidate_location
- **Generator**: `generatePreferredCandidateSuggestions()` (generator.ts:1781)
- **Trigger**: User-preferred Kandidat, kein AP < 3m, Sim > +1%
- **Template**: Erster AP im Array (aps[0])

### Kategorie: instructional (4 Typen)

#### 1.8 move_ap
- **Generator**: `generateMoveApSuggestions()` (generator.ts:513)
- **Trigger**: primaryCoverageRatio < 40%, Zone-basierte Positionssuche
- **Sim-Schwelle**: changePercent > 3%
- **Blocked**: Erzeugt blocked_recommendation bei !canMove / no_move Zone
- **Alternativen**: Bis zu 3 alternative Positionen

#### 1.9 rotate_ap
- **Generator**: `generateRotateApSuggestions()` (generator.ts:801)
- **Trigger**: Wandmontage, Sim > +3% bei anderer Orientierung (0/90/180/270)
- **Wandpruefung**: hasWallInFrontSector() — Front-Sektor-Kollision

#### 1.10 change_mounting
- **Generator**: `generateMountingSuggestions()` (generator.ts:866)
- **Trigger**: Sim > +5% bei Montagewechsel (ceiling ↔ wall)
- **Ausschluss**: Capabilities, no_ceiling_mount/no_wall_mount Zones

#### 1.11 infrastructure_required
- **Generator**: Kein eigenstaendiger Generator — Seiteneffekt von add_ap und preferred_candidate
- **Trigger**: Kandidat braucht Infrastruktur (kein LAN/PoE) oder kein gueltiger Kandidat

### Kategorie: informational (9 Typen)

#### 1.12 coverage_warning
- **Generator**: `generateCoverageWarnings()` (generator.ts:286)
- **Trigger**: Schwache Abdeckung > 10% (> 30% → critical)

#### 1.13 overlap_warning
- **Generator**: `generateOverlapWarnings()` (generator.ts:1460)
- **Trigger**: Ueberlappung > 20%

#### 1.14 roaming_hint
- **Generator**: `generateRoamingHints()` (generator.ts:1202)
- **Trigger**: Low-Delta-Zellen > 15%

#### 1.15 band_limit_warning
- **Generator**: `generateBandLimitWarnings()` (generator.ts:1620)
- **Trigger**: Uplink-Limited > 30% (> 50% → critical)

#### 1.16 low_ap_value
- **Generator**: `generateLowValueWarnings()` (generator.ts:1430)
- **Trigger**: primaryCoverageRatio < 5%

#### 1.17 constraint_conflict
- **Generator**: `generateConstraintConflictWarnings()` (generator.ts:1654)
- **Trigger**: AP in forbidden/discouraged Zone ODER PriorityZone mustHaveCoverage verletzt (> 30%)

#### 1.18 blocked_recommendation
- **Generator**: Kein eigenstaendiger Generator — Seiteneffekt von move_ap und roaming_tx_adjustment
- **Trigger**: Aktion durch Capability oder Constraint blockiert

#### 1.19 sticky_client_risk
- **Generator**: `generateStickyClientWarnings()` (generator.ts:1350)
- **Trigger**: stickyRatio > 50% UND handoffZone < 5% of total cells

#### 1.20 handoff_gap_warning
- **Generator**: `generateHandoffGapWarnings()` (generator.ts:1389)
- **Trigger**: gapCells > 10 UND gapCells/handoffZoneCells > 20%

---

## 2. Identifizierte Widersprueche & Luecken

### 2.1 Echte Bugs

| # | Problem | Datei:Zeile | Schwere |
|---|---------|-------------|---------|
| B1 | `Math.max(20, 20)` — sinnlose Berechnung, sollte `20` sein | generator.ts:1121 | niedrig |
| B2 | `isConfigType()` in RecommendationPanel.svelte:144-146 nur fuer change_channel + adjust_tx_power — fehlt disable_ap, roaming_tx_adjustment, adjust_channel_width | RecommendationPanel.svelte | mittel |
| B3 | adjust_channel_width hat keinen Capability-Check | generator.ts:1921 | mittel |
| B4 | preferred_candidate_location nutzt `aps[0]` statt besten AP als Template | generator.ts:1809 | niedrig |

### 2.2 Fachliche Widersprueche

| # | Problem | Auswirkung |
|---|---------|------------|
| W1 | move_ap Trigger bei < 40% Coverage — in 4-AP-Szenario hat jeder ~25%, ALLE triggern | Rauschen: zu viele move_ap Empfehlungen |
| W2 | adjust_tx_power immer priority=low/severity=info, egal wie gross der Effekt | Gute TX-Empfehlungen werden unter-priorisiert |
| W3 | low_ap_value (< 5%) und disable_ap (< 2%) — Luecke bei 2-5%: User bekommt Warning aber keine Aktion | Frustration |
| W4 | roaming_hint und sticky_client_risk/handoff_gap_warning ueberlappen semantisch | Redundante Meldungen |
| W5 | adjust_tx_power (-3 Overlap) und roaming_tx_adjustment (-3 Sticky) koennen fuer gleichen AP feuern — verschiedene Typen, Dedup greift nicht | Doppelte TX-Reduktion empfohlen |

### 2.3 Fehlende Funktionen

| # | Luecke | Prioritaet |
|---|--------|-----------|
| L1 | Kein 6 GHz Kanalpool in ALLOWED_CHANNELS | niedrig (MVP nur 2.4/5) |
| L2 | adjust_channel_width ohne Simulation | mittel |
| L3 | preferred_candidate: Kein PriorityZone-Awareness | niedrig |
| L4 | Kein konsistenter Blocked-Handling fuer alle Typen (nur move_ap und roaming_tx) | mittel |

---

## 3. Zielregelwerk — Korrekturen

### Fix B1: Math.max Bug
- `Math.max(20, 20)` → `20` (trivial)

### Fix B2: isConfigType() erweitern
- Alle actionable_config Typen muessen dynamisch aus RECOMMENDATION_CATEGORIES abgeleitet werden

### Fix B3: Channel-Width Capability
- Pruefen ob adjustChannel sinnvoll ist — da APCapabilities kein `canChangeChannelWidth` hat, vorerst ueberspringen (keine Breaking Change)
- Stattdessen: channelWidth-Empfehlung nur wenn AP tatsaechlich > 20 MHz nutzt (bereits gegeben)

### Fix B4: Template-AP in preferred_candidate
- `selectTemplateAp()` statt `aps[0]` nutzen

### Fix W1: move_ap Coverage-Schwelle
- Von < 40% auf < 25% reduzieren (realistisch fuer Multi-AP)

### Fix W2: TX Power Prioritaet
- Sim-basierte Prioritaet: changePercent > 8% → medium/warning, > 15% → high/critical

### Fix W3: low_ap_value → disable_ap Luecke
- disable_ap Schwelle von 2% auf 5% anheben (= gleich wie low_ap_value)
- low_ap_value nur emittieren wenn disable_ap NICHT feuert

### Fix W4: Roaming-Duplikate
- roaming_hint nur emittieren wenn KEINE sticky_client_risk oder handoff_gap_warning vorhanden
- Pruefen NACH allen Roaming-Generatoren

### Fix W5: TX Dedup Cross-Type
- Vor roaming_tx_adjustment pruefen ob schon adjust_tx_power fuer gleichen AP existiert
