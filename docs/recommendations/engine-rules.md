# Engine Rules — Ausserhalb von generator.ts

Ergaenzung zu `rules.md` (Generator-Regeln). Dieses Dokument inventarisiert
alle Regeln und Logiken **ausserhalb** von `generator.ts`, die Empfehlungen
beeinflussen: Analyse, Constraints, Simulation, Konvertierung, Typsystem und UI.

---

## 1. Analysis (`analysis.ts`)

### AN-01: Per-AP Metrics Berechnung
- **Datei:** `analysis.ts:31-115`
- **Funktion:** `computeAPMetrics()`
- **Logik:** Iteriert ueber `apIndexGrid`, `deltaGrid`, `overlapCountGrid`.
  Pro AP: primaryCoverageCells, primaryCoverageRatio, overlapCells (delta < 5 AND overlapCount >= 2),
  avgDeltaInPrimary, peakRssi, secondBestCoverageCells, channelConflictScore.
- **Einfluss:** Trigger fuer TX-Power, Move, Disable, Low-Value Regeln

### AN-02: Band Suitability Score
- **Datei:** `analysis.ts:124-142`
- **Funktion:** `computeBandSuitabilityScore()`
- **Logik:** uplinkLimitedRatio × 100 × bandPenalty (2.4GHz=0.5, 5/6GHz=1.0). Score = 100 - penalty.
  Null wenn kein uplinkLimitedGrid vorhanden.
- **Einfluss:** Fliesst in Overall Score, beeinflusst band_limit_warning Trigger

### AN-03: Overall Score Berechnung
- **Datei:** `analysis.ts:156-276`
- **Funktion:** `computeOverallScore()`
- **Formel:** `coverage*w - overlap*w - conflict*w + roaming*w + band*w` (normalisiert 0-100)
- **Sub-Scores:**
  - coverageScore: `(excellent*4 + good*3 + fair*2 + poor*1) / (total*4) * 100`
  - overlapPenalty: `overlapCells / totalCells * 100`
  - conflictPenalty: `sum(conflict scores) / maxPossible * 100`
  - roamingScore: `avgDelta/15*100 - stickyPenalty(30) - gapPenalty(40)`
  - bandSuitabilityScore: von AN-02

### AN-04: PriorityZone Coverage Penalty
- **Datei:** `analysis.ts:175-205`
- **Logik:** Pro PZ: violationRatio × weight × (mustHaveCoverage ? 2.0 : 1.0).
  Max 30% Penalty auf coverageScore.
- **Einfluss:** Senkt Overall Score bei schwacher PZ-Abdeckung

### AN-05: Roaming Score Sticky/Gap Penalties
- **Datei:** `analysis.ts:222-249`
- **Logik:** stickyCount = Zellen mit delta > 15. gapCount = Zellen mit delta < 8 AND rssi < fair.
  stickyPenalty = (stickyCount/count) × 30. gapPenalty = (gapCount/count) × 40.
- **Einfluss:** Senkt roamingScore, beeinflusst sticky_client_risk und handoff_gap_warning

### AN-06: Weak Zone Detection (BFS)
- **Datei:** `analysis.ts:284-381`
- **Funktion:** `findWeakZones()`
- **Logik:** BFS Flood-Fill auf Zellen < poor-Threshold. minArea=5 Zellen, top 10 nach Groesse.
  PZ-Gewichtung: centroid in PZ → weightMultiplier = max(1.0, pz.weight).
  Falls targetMinRssi && avgRssi < target → multiplier × 1.5.
- **Einfluss:** Trigger fuer add_ap, move_ap Empfehlungen

### AN-07: Overlap Zone Detection (BFS)
- **Datei:** `analysis.ts:388-460`
- **Funktion:** `findOverlapZones()`
- **Logik:** BFS auf Zellen mit overlapCount >= 3 AND delta < 5. minArea=5, top 10.
- **Einfluss:** Trigger fuer overlap_warning und TX-Power-Reduktion

### AN-08: Roaming Pair Analysis
- **Datei:** `analysis.ts:493-623`
- **Funktion:** `analyzeRoamingPairs()`
- **Konstanten:** HANDOFF_THRESHOLD=8 dB, STICKY_THRESHOLD=15 dB
- **Logik:** Pro AP-Paar: handoffZoneCells (delta < 8), stickyRatio (delta > 15),
  gapCells (delta < 8 AND rssi < fair), PZ-Relevanz (0.3-1.0 gewichtet).
- **Einfluss:** Trigger fuer roaming_tx_adjustment, sticky_client_risk, handoff_gap_warning

### AN-09: Zone Relevance Score
- **Datei:** `analysis.ts:635-691`
- **Funktion:** `computeZoneRelevance()`
- **Logik:**
  - Strategie 1: PZ-Overlap → `0.3 + overlapRatio × 0.7` (0.3-1.0)
  - Strategie 2: Geometrischer Fallback → Distanz zum Grundriss-Zentrum (0.3-1.0)
- **Einfluss:** Priorisierung von Weak-Zones fuer add_ap/move_ap

### AN-10: AP Role Classification
- **Datei:** `analysis.ts:698-726`
- **Funktion:** `classifyApRole()`
- **Regeln:**
  - central: primaryCoverageRatio > 0.30 ODER hoechster Coverage-Wert
  - roaming_bridge: >= 2 Paare mit handoffZoneCells > 5
  - redundant: < 5% primary AND keine guten Handoff-Paare
  - edge: Default
- **Einfluss:** TX-Power Guards (central vs edge Schwellen), Dedup-Logik

### AN-11: Low-Value AP Detection
- **Datei:** `analysis.ts:733-744`
- **Funktion:** `findLowValueAPs()`
- **Logik:** primaryCoverageRatio < 0.05 (konfigurierbar)
- **Einfluss:** Trigger fuer low_ap_value und disable_ap Empfehlungen

---

## 2. Constraints (`constraints.ts`)

### CO-01: AP Capability Lookup + Defaults
- **Datei:** `constraints.ts:27-34`
- **Funktion:** `getCapabilities()`
- **Logik:** Custom Capabilities aus Context, Fallback auf DEFAULT_AP_CAPABILITIES (alles erlaubt)
- **Einfluss:** Gate fuer alle Empfehlungen (isActionAllowed)

### CO-02: Action Permission Check
- **Datei:** `constraints.ts:39-61`
- **Funktion:** `isActionAllowed()`
- **Regeln:**
  - move_ap → canMove
  - rotate_ap → canRotate
  - change_mounting → canChangeMounting
  - adjust_tx_power → canChangeTxPower24 (2.4GHz) / canChangeTxPower5 (5GHz)
  - change_channel → canChangeChannel24 / canChangeChannel5
  - Default → true (alle anderen Typen immer erlaubt)
- **Einfluss:** Generator prueft vor jeder Empfehlung; bei false → blocked_recommendation

### CO-03: No-Move Zone Check
- **Datei:** `constraints.ts:68-74`
- **Funktion:** `isInNoMoveZone()`
- **Logik:** Delegiert an `getConstraintsAtPoint()`, prueft auf `type === 'no_move'`
- **Einfluss:** move_ap wird zu blocked_recommendation

### CO-04: Constraint Penalty Scoring
- **Datei:** `constraints.ts:79-107`
- **Funktion:** `computeConstraintPenalty()`
- **Regeln:**
  - forbidden → return 100 (Hard Block)
  - discouraged → +30 × weight
  - preferred → -15 × weight (Bonus)
  - low_priority → +10 × weight
  - high_priority → -10 × weight
- **Einfluss:** Feasibility Score Reduktion fuer positionsbasierte Empfehlungen

### CO-05: Feasibility Score
- **Datei:** `constraints.ts:115-156`
- **Funktion:** `computeFeasibilityScore()`
- **Formel:** 100 (Basis) - 80 (Capability-Verletzung) - constraintPenalty - 25 (Infrastruktur) - 20 × Rejections
- **Einfluss:** Recommendation Score, Sortierung, Dedup-Entscheidungen

### CO-06: Effort Score
- **Datei:** `constraints.ts:161-175`
- **Funktion:** `computeEffortScore()`
- **Logik:** EFFORT_SCORES[level] als Basis (config=10, minor=30, major=60, infra=90).
  +max(80) bei Infrastruktur, +min(20) bei Distanz > 3m.
- **Einfluss:** Recommendation Score Berechnung

### CO-07: Risk Score
- **Datei:** `constraints.ts:181-209`
- **Funktion:** `computeRiskScore()`
- **Regeln pro Typ:**
  - move_ap=30, add_ap=20, adjust_tx_power=15, change_channel=5, rotate_ap=10, change_mounting=25
  - Sim-Regression: excellent drop > 5 → +15, good drop > 5 → +10, none increase > 5 → +20, any none increase → +10
- **Einfluss:** Recommendation Score Berechnung (10% Gewicht)

### CO-08: Infrastructure Cost Score
- **Datei:** `constraints.ts:214-223`
- **Funktion:** `computeInfrastructureCostScore()`
- **Logik:** 50 Basis bei Infrastruktur, +30 bei add_ap, +10 bei Distanz > 5m
- **Einfluss:** Recommendation Score Berechnung (10% Gewicht)

### CO-09: Recommendation Score (Kombi)
- **Datei:** `constraints.ts:229-248`
- **Funktion:** `computeRecommendationScore()`
- **Formel:** `benefit×0.40 + feasibility×0.25 - effort×0.15 - risk×0.10 - infraCost×0.10`
  + Severity Boost (critical=+8, warning=+4) + Priority Boost (high=+5, medium=+2)
- **Einfluss:** Sortierung aller Empfehlungen, Dedup-Entscheidungen

### CO-10: Rejection → Constraint Derivation
- **Datei:** `constraints.ts:256-328`
- **Funktion:** `deriveConstraintsFromRejection()`
- **Mapping:**
  - no_lan / no_poe → forbid_candidate (Position)
  - mounting_not_possible → forbid_mounting (AP)
  - position_forbidden → forbid_position (Position)
  - ap_cannot_move → forbid_move (AP)
  - ap_cannot_rotate → forbid_rotate (AP)
  - not_desired → forbid_position
  - other → forbid_move + forbid_position
- **Einfluss:** Naechster Analyse-Lauf beruecksichtigt abgeleitete Constraints

### CO-11: Rejection Application
- **Datei:** `constraints.ts:334-426`
- **Funktion:** `applyRejection()`
- **Logik:** Erstellt neuen Context mit:
  - forbid_move → canMove=false
  - forbid_rotate → canRotate=false
  - forbid_mounting → canChangeMounting=false
  - forbid_position → Neue forbidden Zone (1×1m)
  - forbid_candidate → candidate.forbidden=true (naechster < 2m)
- **Einfluss:** Re-Run des Generators mit angepasstem Context

### CO-12: Blocking Reason Check
- **Datei:** `constraints.ts:432-485`
- **Funktion:** `getBlockingReasons()`
- **Logik:** Prueft AP Capabilities (move, rotate, mounting, TX, channel) + Position in forbidden Zone
- **Einfluss:** blocked_recommendation Generierung in generator.ts

---

## 3. Simulator (`simulator.ts`)

### SM-01: Coarse Grid Simulation
- **Datei:** `simulator.ts:24`
- **Konstante:** `SIM_GRID_STEP = 1.0` (Meter)
- **Einfluss:** Alle before/after Vergleiche nutzen 1m-Raster (schnell, ~5ms)

### SM-02: Before-Grid Cache
- **Datei:** `simulator.ts:28-58`
- **Logik:** Key = alle AP-Positionen + TX + Band + Bounds. Cache invalidiert bei Aenderung.
- **Einfluss:** Performance — before-Grid nur 1× pro Analyse-Lauf berechnet

### SM-03: Score From Bins
- **Datei:** `simulator.ts:64-72`
- **Funktion:** `scoreFromBins()`
- **Formel:** `(excellent*4 + good*3 + fair*2 + poor*1) / (total*4) * 100`
- **Einfluss:** Identische Formel wie AN-03 coverageScore — Konsistenz gesichert

### SM-04: Full Grid Simulation
- **Datei:** `simulator.ts:77-131`
- **Funktion:** `simulateGrid()`
- **Logik:** Pro Rasterpunkt: computeRSSI + computeUplinkRSSI, effective = min(downlink, uplink).
  Nur enabled APs. Ergebnis: CoverageBinPercents (Prozent).
- **Einfluss:** Grundlage aller simulierten Deltas

### SM-05: Change Simulation
- **Datei:** `simulator.ts:156-185`
- **Funktion:** `simulateChange()`
- **Logik:** before(cached) vs after(modified), changePercent = ((after-before)/before)*100
- **Modifikationen:** position, orientationDeg, mounting, txPowerDbm
- **Einfluss:** TX-Power, Rotate, Mount, Move Guards (z.B. "nur wenn >3% Verbesserung")

### SM-06: Add AP Simulation
- **Datei:** `simulator.ts:190-229`
- **Funktion:** `simulateAddAP()`
- **Logik:** Template-AP ('__sim_new_ap__') mit defaults (TX=20, gain=4.0, ceiling, height=2.5)
- **Einfluss:** add_ap Benefit-Berechnung und min-Threshold-Guards

---

## 4. Konvertierung (`convert.ts`)

### CV-01: AP Config Konvertierung
- **Datei:** `convert.ts:18-85`
- **Funktion:** `convertApsToConfig()`
- **Regeln:**
  - Filter: enabled-Override 'false' → ausgeschlossen, sonst ap.enabled
  - TX Power: Band-spezifisch (2.4/5/6 GHz), Override hat Vorrang
  - Antenna Gain: Band-spezifisch aus ap_model
  - Position: Override position_x/y hat Vorrang
  - Orientation: Override orientationDeg hat Vorrang
  - Mounting: Override mounting hat Vorrang
- **Einfluss:** Mixing Console Preview — Overrides steuern Forecast-Heatmap

### CV-02: Wall Data Konvertierung
- **Datei:** `convert.ts:90-121`
- **Funktion:** `convertWallsToData()`
- **Logik:** Band-spezifische Daempfung (2.4/5/6 GHz), Override hat Vorrang vor Material-Default
- **Einfluss:** RF-Simulation Genauigkeit

### CV-03: Fehlende Override-Typen
- **Datei:** `convert.ts:18-85`
- **Status:** `channel_width` wird NICHT als Override behandelt.
  Heatmap-Berechnung nutzt kein channel_width (nur RF-Propagation, keine Throughput-Modellierung).
  Preview fuer adjust_channel_width zeigt daher korrekt keine visuelle Aenderung.

---

## 5. Typsystem (`types.ts`)

### TY-01: RecommendationType Union
- **Datei:** `types.ts:14-34`
- **Umfang:** 20 Typen
- **Vollstaendige Liste:**
  move_ap, rotate_ap, change_mounting, adjust_tx_power, change_channel, add_ap,
  disable_ap, roaming_hint, band_limit_warning, low_ap_value, coverage_warning,
  overlap_warning, constraint_conflict, infrastructure_required, preferred_candidate_location,
  blocked_recommendation, roaming_tx_adjustment, sticky_client_risk, handoff_gap_warning,
  adjust_channel_width

### TY-02: Category Mapping
- **Datei:** `types.ts:352-380`
- **Vollstaendiges Mapping:** Jeder der 20 Typen hat eine Kategorie:
  - actionable_config (5): change_channel, adjust_tx_power, disable_ap, roaming_tx_adjustment, adjust_channel_width
  - actionable_create (2): add_ap, preferred_candidate_location
  - instructional (4): move_ap, rotate_ap, change_mounting, infrastructure_required
  - informational (9): coverage_warning, overlap_warning, roaming_hint, band_limit_warning,
    low_ap_value, constraint_conflict, blocked_recommendation, sticky_client_risk, handoff_gap_warning

### TY-03: Effort Level Mapping
- **Datei:** `types.ts:313-334`
- **Vollstaendiges Mapping:** Jeder der 20 Typen hat ein Effort Level:
  - config (14): change_channel, adjust_tx_power, disable_ap, roaming_hint, band_limit_warning,
    low_ap_value, coverage_warning, overlap_warning, constraint_conflict, blocked_recommendation,
    roaming_tx_adjustment, sticky_client_risk, handoff_gap_warning, adjust_channel_width
  - minor_physical (1): rotate_ap
  - major_physical (2): move_ap, change_mounting
  - infrastructure (3): add_ap, infrastructure_required, preferred_candidate_location

### TY-04: Effort Score Values
- **Datei:** `types.ts:337-342`
- **Werte:** config=10, minor_physical=30, major_physical=60, infrastructure=90

### TY-05: Expert Profiles
- **Datei:** `types.ts:303-307`
- **Profile:** conservative, balanced, aggressive — je 5 Gewichte (coverage, overlap, conflict, roaming, band)

### TY-06: Constraint Zone Types
- **Datei:** `types.ts:70-79`
- **9 Typen:** forbidden, discouraged, preferred, no_new_ap, no_ceiling_mount, no_wall_mount,
  no_move, high_priority, low_priority

### TY-07: AP Capabilities Model
- **Datei:** `types.ts:99-119`
- **7 Flags:** canMove, canRotate, canChangeMounting, canChangeTxPower24, canChangeTxPower5,
  canChangeChannel24, canChangeChannel5
- **Default:** Alles erlaubt

### TY-08: Rejection Reasons
- **Datei:** `types.ts:145-153`
- **8 Gruende:** no_lan, no_poe, mounting_not_possible, position_forbidden, ap_cannot_move,
  ap_cannot_rotate, not_desired, other

---

## 6. UI-Workflow (`RecommendationStep.svelte` + `mixing/+page.svelte`)

### UI-01: Category-basierte Button-Logik
- **Datei:** `RecommendationStep.svelte`
- **Regeln:**
  - actionable_config / actionable_create → "Apply" Button
  - informational → "Acknowledge" Button
  - instructional → "Instruction Only" Button
  - blocked_recommendation → kein Action Button

### UI-02: Preview Verfuegbarkeit
- **Datei:** `RecommendationStep.svelte`
- **Regel:** Preview-Button nur wenn `rec.suggestedChange?.apId` vorhanden UND `onPreview` Callback

### UI-03: Reject Verfuegbarkeit
- **Datei:** `RecommendationStep.svelte`
- **Regel:** Reject-Dropdown fuer alle nicht-informational Typen (category-basiert)

### UI-04: Apply Workflow — Direct Write
- **Datei:** `mixing/+page.svelte:214-251`
- **Funktion:** `applyRecommendationToAP()`
- **Behandelte Parameter:**
  - position → x, y (Regex-Parsing)
  - orientationDeg → orientation_deg
  - mounting → mounting
  - txPowerDbm → tx_power_X_dbm (band-spezifisch)
  - tx_power_24ghz / tx_power_5ghz / tx_power_6ghz → direkt
  - channel → channel_Xghz (band-spezifisch)
  - channel_24ghz / channel_5ghz → direkt
- **LUECKE:** `channel_width` wird NICHT behandelt → Apply tut nichts (BEHOBEN in Phase 28e)

### UI-05: Apply Workflow — Special Cases
- **Datei:** `mixing/+page.svelte:257-281`
- **Funktion:** `handleStepApply()`
- **Regeln:**
  - disable_ap → `updateAccessPoint(id, { enabled: false })`
  - add_ap / preferred_candidate_location → `addApCommand(floorId, x, y)`
  - Andere mit suggestedChange → `applyRecommendationToAP()`

### UI-06: Stale Flag
- **Datei:** `mixing/+page.svelte:277-280`
- **Regel:** Stale=true wenn actionable_config oder actionable_create angewendet wird
- **Einfluss:** Banner "Empfehlungen veraltet — neu analysieren"

### UI-07: Preview Workflow
- **Datei:** `mixing/+page.svelte:302-330`
- **Funktion:** `handleStepPreview()`
- **Logik:** Schreibt Overrides in mixingStore (position, TX, channel, generisch)
  → Forecast-Heatmap zeigt vorhergesagte Aenderung
- **Hinweis:** channel_width faellt durch zum generischen else-Branch, wird als Override geschrieben,
  hat aber keinen visuellen Effekt (RF-Modell nutzt kein channel_width)

### UI-08: Reject + Re-Compute
- **Datei:** `mixing/+page.svelte:287-290`
- **Funktion:** `handleStepReject()`
- **Logik:** `recommendationStore.rejectAndRecompute(id, reason)` → deriveConstraints → neuer Analyse-Lauf

---

## Zusammenfassung

| Datei | Regel-IDs | Anzahl |
|-------|-----------|--------|
| analysis.ts | AN-01 bis AN-11 | 11 |
| constraints.ts | CO-01 bis CO-12 | 12 |
| simulator.ts | SM-01 bis SM-06 | 6 |
| convert.ts | CV-01 bis CV-03 | 3 |
| types.ts | TY-01 bis TY-08 | 8 |
| UI (Svelte) | UI-01 bis UI-08 | 8 |
| **Gesamt** | | **48** |

Zusammen mit den 64 Regeln aus `rules.md` (generator.ts) ergibt sich ein
**Gesamtinventar von 112 Regeln** im Recommendation-System.
