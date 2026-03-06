# Recommendation Engine — Rule Catalog

Complete inventory of all recommendation rules in `src/lib/recommendations/generator.ts`.
Each entry documents: ID, description, category, trigger, guards, action, dedup, code reference, and test coverage.

Last updated: 2026-03-06 (Phase 28f)

---

## Source of Truth & Guarantees

### Single Source of Truth

- **`RecommendationType`** (types.ts:14-34) — definiert alle erlaubten Empfehlungstypen als Union.
- **`RECOMMENDATION_CATEGORIES`** (types.ts:352-380) — Single Source of Truth fuer die UI-Kategorie
  jedes Typs (actionable_config, actionable_create, instructional, informational).
- **`EFFORT_LEVELS`** (types.ts:313-334) — Single Source of Truth fuer das Aufwandsniveau jedes Typs.

### Automatische Absicherung (`rulesIntegrity.test.ts`)

Die folgenden Garantien werden durch automatisierte Tests durchgesetzt:

| Test-Gruppe | Garantie |
|-------------|----------|
| E1 | Jeder `RecommendationType` hat einen Eintrag in `RECOMMENDATION_CATEGORIES` — keine Luecken, keine Extras |
| E2 | Jeder `RecommendationType` hat einen Eintrag in `EFFORT_LEVELS` — keine Luecken, keine Extras |
| E3 | `EFFORT_SCORES` ist vollstaendig, monoton steigend, und im Bereich 0-100 |
| E4 | Kategorie-Semantik: actionable_config ≠ physical effort, informational = config effort, actionable_create = infrastructure |
| E5 | Schluesselmengen von `RECOMMENDATION_CATEGORIES`, `EFFORT_LEVELS` und `ALL_RECOMMENDATION_TYPES` sind identisch |
| E6 | Jeder `RecommendationType`-Wert der Union ist in `RECOMMENDATION_CATEGORIES` vorhanden (bidirektional) |
| E7 | Alle im Generator per `recs.push({ type: ... })` emittierten Typen sind in `GENERATOR_EMITTED_TYPES` erfasst — verhindert heimliche neue Typen ohne Dokumentation |

### Vorgehen bei neuem RecommendationType

Wenn ein neuer Typ eingefuehrt wird, muessen folgende Stellen aktualisiert werden:

1. **`types.ts`** — `RecommendationType` Union erweitern
2. **`types.ts`** — `RECOMMENDATION_CATEGORIES` Eintrag hinzufuegen
3. **`types.ts`** — `EFFORT_LEVELS` Eintrag hinzufuegen
4. **`rulesIntegrity.test.ts`** — `ALL_RECOMMENDATION_TYPES` Liste erweitern
5. **`rulesIntegrity.test.ts`** — `GENERATOR_EMITTED_TYPES` Liste erweitern (falls Generator den Typ emittiert)
6. **`rulesIntegrity.test.ts`** — Zaehler in E1/E2 ("exactly N entries") anpassen
7. **`rules.md`** (dieses Dokument) — Regel-Eintrag mit ID, Trigger, Guards, Beleg hinzufuegen
8. **`engine-rules.md`** — Falls Regeln ausserhalb von generator.ts betroffen sind
9. **i18n** — Titel/Reason Keys in EN + DE
10. **mixing/+page.svelte** — Apply/Preview Handling (falls actionable_config)

Wird einer dieser Schritte vergessen, schlaegt `npx vitest run` fehl.

---

## 1. Channel Rules

Generator: `generateChannelRecommendations()` (generator.ts:1194-1389)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CH-01 | Greedy channel assignment | conflict.score >= 0.3 | — | Collect conflicting APs, sort by worstScore, greedy-assign lowest-conflict channel | :1207-1208 |
| CH-02 | B1: Max 3 recs + unique target channel dedup | channelChanges.size > 3 or duplicate target channels | Dedup by target channel (keep best worstScore), then limit to top 3 | Remove excess recs | :1288-1311 |
| CH-03 | B2: Distance filter | worstConflict.distanceM > 12 AND worstScore < 0.5 | — | Skip rec (conflict too mild at that distance) | :1325 |
| CH-04 | B3: 6GHz informational note | band === '6ghz' | — | Emit band_limit_warning with sixGhzChannelNote keys | :1373-1389 |
| CH-05 | isActionAllowed gate | — | `isActionAllowed(apId, 'change_channel', band, ctx)` returns false | Skip AP | :1235 |
| CH-06 | Priority/severity tiers | worstScore >= 0.6 | — | high/critical, else medium/warning | :1345-1346 |
| CH-07 | TX-alternative annotation | Both conflicting APs have worstScore > 0.2 | — | Use `changeChannelTxAlternativeReason` key | :1333-1339 |

### Tests
- Basic channel recommendation: generator.test.ts "should recommend channel change for co-channel APs"
- D4b: distant APs, low conflict → skipped (Phase 28c)
- D4c: 4 APs ch36 → max 3 recs, unique targets (Phase 28c)
- D9: channel pool exhaustion graceful degrade (Phase 28d)

---

## 2. TX-Power Rules

Generator: `generateTxPowerSuggestions()` (generator.ts:1071-1183)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| TX-01 | Overlap-based reduction | overlapRatio > threshold (central 25%, edge 15%) | — | Suggest txPower - 3 dBm | :1098-1102 |
| TX-02 | Step size | — | — | Always ±3 dBm per step | :1103, :1145 |
| TX-03 | Floor/ceiling | lowerPower < 10 or higherPower > 30 | — | Skip (hard limits) | :1104, :1146 |
| TX-04 | Gap check for reduction | coverageAfter.none > coverageBefore.none + 10 | — | Skip (would create coverage hole) | :1109 |
| TX-05 | Increase for low-coverage APs | primaryCoverageRatio < 0.15 | Reduction not already suggested | Suggest txPower + 3 dBm | :1144 |
| TX-06 | Quality gate for increase | changePercent <= 2 OR newGoodCells < 5 | — | Skip (insufficient improvement) | :1153 |
| TX-07 | isActionAllowed gate | — | `isActionAllowed(apId, 'adjust_tx_power', band, ctx)` false | Skip AP | :1088 |
| TX-08 | Priority tiers | absImprove > 15 → high/critical, > 8 → medium/warning, else low/info | — | Set priority + severity | :1116-1117 |

### Tests
- TX power increase for low coverage: generator.test.ts "should suggest TX power adjustment for overlapping APs"
- W2: sim-based priority (Phase 27b)

---

## 3. Roaming Rules

Generator: `generateRoamingTxAdjustments()` (generator.ts:1439-1598)
Also: `generateStickyClientWarnings()` (:1601-1646), `generateHandoffGapWarnings()` (:1649-1694)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| RM-01 | A1: Score guard | bestDelta.scoreAfter < scoreBefore | — | Skip (would worsen score) | :1556 |
| RM-02 | A2: Minimum handoff zone | handoffZoneCells < 50 AND handoffZoneRatio < 0.01 | — | Skip (trivial pair) | :1472 |
| RM-03 | A3: Critical gap rate probe | gapRatio >= 0.40 | probeDelta.changePercent < 0 | Skip (simulation worsens) | :1518-1527 |
| RM-04 | A4: Trigger thresholds | stickyRatio < 0.30 AND gapRatio < 0.20 | — | Skip (no meaningful signal) | :1474-1476 |
| RM-05 | A5: Adaptive TX steps | — | reducedPower < ROAMING_TX_MIN_DBM (10) | Try [-3, -6, -9], pick best positive delta | :1534-1550 |
| RM-06 | A6: Capability check | isActionAllowed returns false | — | Emit blocked_recommendation | :1492-1515 |
| RM-07 | C2: Uplink block | uplinkLimitedRatio > 0.70 AND changePercent < 2 | — | Skip (marginal benefit under uplink limitation) | :1559 |
| RM-08 | Cross-type dedup | AP already has adjust_tx_power rec | — | Skip (avoid duplicate TX changes) | :1489 |
| RM-09 | PZ-weighted priority | pzFactor >= 0.7 | — | high/warning, else medium/info | :1562-1564 |
| RM-10 | Sticky client warning | stickyRatio > 0.50 AND handoffZoneCells/totalCells < 0.05 | — | Emit sticky_client_risk | :1615-1617 |
| RM-11 | Handoff gap warning | gapCells > 10 AND gapRatio > 0.20 | handoffZoneCells > 0 | Emit handoff_gap_warning | :1659-1662 |
| RM-12 | Sticky suppressed by gap | handoff_gap_warning exists for this pair | — | Skip sticky_client_risk | :1621 |
| RM-13 | Roaming hint suppression | sticky_client_risk, handoff_gap_warning, or roaming_tx_adjustment exists | — | Skip roaming_hint generation | :201-206 |

### Tests
- D1: roaming TX A5 adaptive steps (Phase 28b)
- D2: roaming TX blocked when A2 guard fails (Phase 28b)
- D3: roaming TX A1 score guard (Phase 28b)
- D6: uplink blocks roaming_tx when ratio > 0.7 and benefit < 2% (Phase 28b)
- D7: A3 gap priorisierung (Phase 28c)
- D8: roaming_tx allowed when uplink high but benefit >= 2% (Phase 28d)
- B1: handoff_gap_warning test (Phase 26d-fix)
- B2/B3: capability blocked roaming_tx (Phase 26d-fix)
- Sticky client / gap warning: analysis.test.ts (Phase 26d)
- W4: roaming_hint suppression (Phase 27b)
- W5: cross-type dedup (Phase 27b)

---

## 4. Add/Move/Rotate/Mounting Rules

### Add AP — `generateAddApSuggestions()` (generator.ts:400-623)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-01 | Minimum zone size | zone.cellCount < 20 | — | Filter out small zones | :418 |
| AM-02 | Zone uplink check | >50% of zone cells uplink-limited | — | Skip zone (add_ap won't help) | :444-449 |
| AM-03 | Band mismatch | PZ targetBand !== band AND !== 'either' | — | Skip zone | :462 |
| AM-04 | Stacking penalty | 2nd/3rd add_ap | — | Reduce priority/severity | :488-492 |
| AM-05 | Multi-zone top 3 | — | — | Process top 3 zones by cellCount × relevance | :435 |
| AM-06 | RF-weighted target | — | — | computeWeightedTarget instead of geometric centroid | :453 |
| AM-07 | Candidate matching + infrastructure | candidates available | Physical validation | Match to candidate, set infrastructure_required flag | :472-484 |

### Move AP — `generateMoveApSuggestions()` (generator.ts:626-870)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-08 | Coverage threshold | primaryCoverageRatio > 0.25 | — | Skip (AP has sufficient coverage) | :646 |
| AM-09 | No-move zone | isInNoMoveZone returns true | — | Emit blocked_recommendation | :650 |
| AM-10 | Zone scoring | — | — | Score top 3 zones by distance + PZ weight + size × relevance | :695-702 |
| AM-11 | Physical validation | — | isPhysicallyValidApPosition false | Skip position (inside wall) | :731 |
| AM-12 | 2-strategy approach | — | — | Strategy 1: candidates, Strategy 2: interpolation fallback | :718-781 |

### Rotate AP — `generateRotateApSuggestions()` (generator.ts:920-983)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-13 | Wall-mount only | ap.mounting !== 'wall' | — | Skip (ceiling APs have no orientation effect) | :933 |
| AM-14 | Improvement threshold | changePercent <= 3 | hasWallInFrontSector skip | Require >3% improvement | :959 |

### Mounting — `generateMountingSuggestions()` (generator.ts:985-1068)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-15 | Ceiling↔wall switch | changePercent > 5 | isActionAllowed, mounting zone constraints | Suggest alternative mounting | :1040 |

### Tests
- "should recommend adding AP for poor coverage areas" (generator.test.ts)
- "should detect and recommend for overlapping APs" (generator.test.ts)
- move_ap targetBand test (Phase 26d)
- W1: move_ap coverage threshold 25% (Phase 27b)
- B4: preferred_candidate uses selectTemplateAp (Phase 27b)

---

## 5. Uplink Rules

Constants: `UPLINK_SUPPRESS_ADD_MOVE=0.60`, `UPLINK_ADD_MOVE_MIN_BENEFIT=10`, `UPLINK_BLOCK_ROAMING=0.70` (generator.ts:68-69)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| UL-01 | Band limit warning | limitedPct > 30 | — | 3-tier: >30% info, >60% warning, >80% critical | :1901-1904 |
| UL-02 | Suppress add_ap | uplinkLimitedRatio > 0.60 | mustHaveCoverage PZ exception | Require min 10% benefit | :466-470 |
| UL-03 | Suppress move_ap | uplinkLimitedRatio > 0.60 | — | Require min 10% benefit | :785-788 |
| UL-04 | mustHaveCoverage exception | PZ.mustHaveCoverage === true | — | Keep normal 2% threshold | :468-470 |

### Tests
- D5a: 0.59 ratio → info (Phase 28c)
- D5b: 0.61 ratio → warning (Phase 28c)
- D5c: 0.85 ratio → critical (Phase 28c)
- D5d: add_ap suppression at >0.60 (Phase 28c)
- D10: mustHaveCoverage PZ exception (Phase 28d)

---

## 6. Disable AP Rules

Generator: `generateDisableApSuggestions()` (generator.ts:1818-1884)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| DA-01 | Low primary coverage | primaryCoverageRatio < 0.05 | — | Consider disabling AP | :1831 |
| DA-02 | Presence check | secondBestCoverageCells/totalCells >= 0.05 | — | Require AP is "present but not best" | :1834-1835 |
| DA-03 | Simulation guard | changePercent >= -2 | — | Only suggest if coverage drop <= 2% | :1848 |
| DA-04 | low_ap_value suppression | disable_ap exists for this AP | — | Suppress low_ap_value warning | :212-216 |

### Tests
- "should flag low-value APs with disable_ap or low_ap_value" (generator.test.ts)
- W3: disable_ap threshold 5%, low_ap_value suppression (Phase 27b)

---

## 7. Constraint/Blocked Rules

Generator: `generateConstraintConflictWarnings()` (generator.ts:1925-2050)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CB-01 | Forbidden zone | AP in forbidden zone | — | high/critical constraint_conflict | :1937-1941 |
| CB-02 | Discouraged zone | AP in discouraged zone | — | medium/warning constraint_conflict | :1937-1942 |
| CB-03 | mustHaveCoverage violation | violationRatio > 0.30 | RSSI grid available | constraint_conflict with coverage details | :2022 |
| CB-04 | Blocked recommendation | Capability violation (move, TX, channel) | — | Emit blocked_recommendation with reason | :1492-1515, :650-677 |
| CB-05 | Preferred candidate | candidate.preferred && !candidate.forbidden | Physical validation, distance check | Emit preferred_candidate_location or infrastructure_required | :2063-2131 |

### Tests
- constraint_conflict score=0 test (Phase 26g)
- blocked_recommendation test (Phase 26g)
- infrastructure_required not in AP_CREATION_TYPES (Phase 26g)
- mustHaveCoverage RSSI-based test (Phase 26c)

---

## 8. Sorting Rules

Location: `generateRecommendations()` sort block (generator.ts:247-272)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| SO-01 | Blocked last | blockedByConstraints.length > 0 | — | Push to end | :254-256 |
| SO-02 | Category tier | — | — | actionable(0) > instructional(1) > informational(2) | :259-261 |
| SO-03 | Recommendation score | abs(aScore - bScore) > 5 | — | Higher score first | :264-266 |
| SO-04 | Priority fallback | — | — | high > medium > low | :269-270 |
| SO-05 | Severity fallback | — | — | critical > warning > info | :271 |

### Tests
- Sorting order test (Phase 26g)

---

## 9. Deduplication Rules

Function: `deduplicateRecommendations()` (generator.ts:2135-2182)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| DD-01 | Group by AP | Multiple recs for same AP | — | Max 1 primary rec per AP group | :2136-2149 |
| DD-02 | Effort-first sort | — | — | config < minor < major < infra | :2160-2173 |
| DD-03 | Dominance override | Higher-effort has 3× improvement AND >10% absolute | — | Prefer higher-effort rec | :2166-2168 |
| DD-04 | Alternatives | Remaining recs in group | — | Stored in alternativeRecommendations | :2177 |

### Tests
- Dedup tests in generator.test.ts (Phase 26)

---

## Additional Rules

### Channel Width — `generateChannelWidthRecommendations()` (generator.ts:2194-2263)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CW-01 | Width reduction | nearbyCount >= 2 + width >= 80 → suggest 40; veryCloseCount >= 3 + width > 20 → suggest 20 | band !== '2.4ghz' | Emit reduce_channel_width | :2228-2232 |

### Overlap Warning — `generateOverlapWarnings()` (generator.ts:1726-1758)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| OV-01 | Overlap warning | overlapPercent > 20 | — | medium/warning overlap_warning | :1738 |

### Coverage Warning — `generateCoverageWarnings()` (generator.ts:331-366)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CV-01 | Coverage warning | weakPercent > 10 | — | >30% → high/critical, else medium/warning | :344-348 |

### Low-Value AP — `generateLowValueWarnings()` (generator.ts:1696-1724)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| LV-01 | Low-value AP | AP in lowValueApIds list | Not in disabledApIds | low/info low_ap_value warning | :1703-1723 |

### Roaming Hints — `generateRoamingHints()` (referenced at :204-206)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| RH-01 | Roaming hint | No specific roaming warnings exist | sticky/gap/roaming_tx absent | Informational roaming hint | :200-206 |

---

## Summary

| Cluster | Rules | Generator Function | Lines |
|---------|-------|--------------------|-------|
| Channel | CH-01..CH-07 | generateChannelRecommendations | 1194-1389 |
| TX-Power | TX-01..TX-08 | generateTxPowerSuggestions | 1071-1183 |
| Roaming | RM-01..RM-13 | generateRoamingTxAdjustments + Sticky + Gap | 1439-1694 |
| Add/Move/Rotate/Mount | AM-01..AM-15 | 4 generators | 400-1068 |
| Uplink | UL-01..UL-04 | generateBandLimitWarnings + gating | 1886-1923, :68-69 |
| Disable AP | DA-01..DA-04 | generateDisableApSuggestions | 1818-1884 |
| Constraint/Blocked | CB-01..CB-05 | generateConstraintConflictWarnings + Preferred | 1925-2131 |
| Sorting | SO-01..SO-05 | sort block in main function | 247-272 |
| Dedup | DD-01..DD-04 | deduplicateRecommendations | 2135-2182 |
| Channel Width | CW-01 | generateChannelWidthRecommendations | 2194-2263 |
| Overlap | OV-01 | generateOverlapWarnings | 1726-1758 |
| Coverage | CV-01 | generateCoverageWarnings | 331-366 |
| Low-Value | LV-01 | generateLowValueWarnings | 1696-1724 |
| Roaming Hint | RH-01 | generateRoamingHints | 200-206 |

**Total: 64 rules across 14 clusters.**

All rules have code references. No "not implemented" rules identified — every documented rule has a corresponding code path.
