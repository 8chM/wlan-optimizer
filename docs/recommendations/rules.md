# Recommendation Engine — Rule Catalog

Complete inventory of all recommendation rules in `src/lib/recommendations/generator.ts`.
Each entry documents: ID, description, category, trigger, guards, action, dedup, code reference, and test coverage.

Last updated: 2026-03-09 (Phase 28ai — CI Guardrails)

---

## CI Guardrails

### Golden tests are gating

Golden file tests (`golden.test.ts`) run on every push and PR via GitHub Actions.
If the recommendation engine output changes, the golden tests **fail** with a detailed diff showing exactly what changed (added/removed/changed recs).

### How to update goldens

After an **intentional** engine change that alters recommendations:

```bash
GOLDEN_UPDATE=1 npx vitest run src/lib/recommendations/__tests__/golden.test.ts
```

This regenerates all `expected.json` files. Review the diffs in git before committing.

### Integrity script

```bash
./scripts/report-integrity.sh "phase-name"
```

Runs: svelte-check, vitest (all tests), golden tests (separately for visibility), and build.
Exit code 1 if any step fails. Report saved to `scripts/.last-report.txt`.

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
| E8 | Jeder `RecommendationType` hat einen dokumentierten i18n Title Key (TYPE_TO_TITLE_KEY Map) |
| E9 | Kategorie-Effort Kreuz-Constraints: instructional → physical/infra effort, actionable_config ≠ infrastructure |

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

Generator: `generateChannelRecommendations()` (generator.ts:1149-1345)

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

Generator: `generateTxPowerSuggestions()` (generator.ts:1026-1147)

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
| TX-09 | PZ guard (Zone-safe TX) | wouldHurtPriorityZone() returns hurts=true for TX reduction | — | Emit sticky_client_risk note with pzBlockedTxTitle/Reason (no longer silent skip). Phase 28af. | Phase 28ad/28af |

### Tests
- TX power increase for low coverage: generator.test.ts "should suggest TX power adjustment for overlapping APs"
- W2: sim-based priority (Phase 27b)

---

## 3. Roaming Rules

Constants (Phase 28ad): `PZ_MAX_RSSI_DROP_DBM=3`, `PHYSICAL_GAP_RATIO=0.30`, `PHYSICAL_GAP_RSSI_OFFSET=7`

Helper: `wouldHurtPriorityZone()` — Samples 5 points per mustHaveCoverage PZ, computes RSSI before/after TX change. Returns `hurts=true` if any PZ drops more than PZ_MAX_RSSI_DROP_DBM.

### 3a. Dominant TX Down — `generateRoamingTxAdjustments()` (generator.ts:1481-1645)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| RM-01 | A1: Score guard / Z2 demotion | bestDelta.scoreAfter < scoreBefore OR changePercent < ROAMING_MIN_OVERALL_BENEFIT (0.5) | — | Downgrade to sticky_client_risk (informational, severity=info, priority=low, keys: stickyClientRiskTitle/Reason, overallRegression=1 or marginalBenefit=1). No suggestedChange emitted. | :1829-1866 |
| RM-02 | A2: Minimum handoff zone | handoffZoneCells < 50 AND handoffZoneRatio < 0.01 | — | Skip (trivial pair) | :1514 |
| RM-03 | A3: Critical gap rate probe | gapRatio >= 0.40 | probeDelta.changePercent < 0 | Skip (simulation worsens) | :1560-1568 |
| RM-04 | A4: Trigger thresholds | stickyRatio < 0.30 AND gapRatio < 0.20 | — | Skip (no meaningful signal) | :1516-1517 |
| RM-05 | A5: Adaptive TX steps | — | reducedPower < ROAMING_TX_MIN_DBM (10) | Try [-3, -6, -9], pick best positive delta | :1576-1592 |
| RM-06 | A6: Capability check | isActionAllowed returns false | — | Emit blocked_recommendation | :1534-1556 |
| RM-07 | C2: Uplink block | uplinkLimitedRatio > 0.70 AND changePercent < 2 | — | Skip (marginal benefit under uplink limitation) | :1601 |
| RM-07b | A7: Gap-too-high guard | gapRatio >= 0.20 | — | Skip (use boost instead) | :1520 |
| RM-08 | Cross-type dedup | AP already has adjust_tx_power rec | — | Skip (avoid duplicate TX changes) | :1498 |
| RM-09 | PZ-weighted priority | pzFactor >= 0.7 | — | high/warning, else medium/info | :1605-1606 |
| RM-14 | PZ guard (Zone-safe TX) | wouldHurtPriorityZone() returns hurts=true for mustHaveCoverage PZ | — | Emit sticky_client_risk note with pzBlockedTxTitle/Reason (informational, wouldHurtPriorityZone=1, pzDropDb). Explains why TX-down was not applied. Phase 28af: no longer silent skip. | Phase 28ad/28af |
| RM-15 | Physical gap guard | gapRatio > PHYSICAL_GAP_RATIO (0.30) AND avgRssiInZone < fair - PHYSICAL_GAP_RSSI_OFFSET (7dB) | — | Emit sticky_client_risk note with physicalGapNotEffectiveTitle/Reason (informational, physicalGap=1, suggestMove=1, avgRssiInZone). Explains that gap is wall/distance-caused. Phase 28af: specific keys + suggestMove. | Phase 28ad/28af |

### 3b. Weaker AP TX Boost — `generateRoamingTxBoosts()` (generator.ts:1646-1779)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| RB-01 | Gap trigger | gapRatio >= 0.25 AND handoffZoneCells >= 50 | — | Enter boost path | :1664-1665 |
| RB-02 | Weaker AP selection | m1.primaryCoverageRatio <= m2.primaryCoverageRatio | — | Target weaker AP for TX increase | :1670-1671 |
| RB-03 | Cross-type dedup | AP already has adjust_tx_power or roaming_tx_adjustment rec | — | Skip | :1660 |
| RB-04 | Capability check | isActionAllowed returns false | — | Emit blocked_recommendation (blockedRoamingTxBoostTitle) | :1680-1699 |
| RB-05 | TX boost steps | — | boostedPower > 30 dBm | Try [+3, +6], pick best positive delta | :1705-1717 |
| RB-06 | Score + changePercent guard | scoreAfter < scoreBefore OR changePercent < 0 | — | Skip (worsens) | :1712 |
| RB-07 | PZ-weighted priority | pzFactor >= 0.7 | — | high/warning, else medium/info | :1723-1724 |
| RB-08 | Physical gap guard (boost) | gapRatio > PHYSICAL_GAP_RATIO (0.30) AND avgRssiInZone < fair - PHYSICAL_GAP_RSSI_OFFSET (7dB) | — | Emit sticky_client_risk with physicalGapNotEffectiveTitle/Reason (informational, physicalGap=1, suggestMove=1). Phase 28af: specific keys. | Phase 28ad/28af |

### 3c. Warnings — `generateStickyClientWarnings()` (:1780-1825), `generateHandoffGapWarnings()` (:1828-1873)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| RM-10 | Sticky client warning | stickyRatio > 0.50 AND handoffZoneCells/totalCells < 0.05 | — | Emit sticky_client_risk | :1797 |
| RM-11 | Handoff gap warning | gapCells > 10 AND gapRatio > 0.20 | handoffZoneCells > 0 | Emit handoff_gap_warning | :1848-1850 |
| RM-12 | Sticky suppressed by existing note | Pair already has handoff_gap_warning, sticky_client_risk, roaming_tx_adjustment, or roaming_tx_boost | — | Skip sticky_client_risk (max 1 informational per pair). Phase 28af: extended from gap-only to all roaming types. | :2260-2264 |
| RM-13 | Roaming hint suppression | sticky_client_risk, handoff_gap_warning, roaming_tx_adjustment, or roaming_tx_boost exists | — | Skip roaming_hint generation | :218-221 |

### Tests
- D1: roaming TX A5 adaptive steps (Phase 28b)
- D2: roaming TX blocked when A2 guard fails (Phase 28b)
- D3: roaming TX A1 score guard (Phase 28b)
- D6: uplink blocks roaming_tx when ratio > 0.7 and benefit < 2% (Phase 28b)
- D7: A3 gap priorisierung (Phase 28c)
- D8: roaming_tx allowed when uplink high but benefit >= 2% (Phase 28d)
- B1: handoff_gap_warning test (Phase 26d-fix)
- B2/B3: capability blocked roaming_tx (Phase 26d-fix)
- **Z2: overall regression → sticky_client_risk informational instead of roaming_tx_adjustment (Phase 28z)**
- **T1: high gapRatio → roaming_tx_boost, not adjustment (Phase 28m)**
- **T2: canChangeTxPower=false → blocked_recommendation for boost (Phase 28m)**
- **T3: boost worsens score → skipped (Phase 28m)**
- Sticky client / gap warning: analysis.test.ts (Phase 26d)
- W4: roaming_hint suppression (Phase 27b)
- W5: cross-type dedup (Phase 27b)
- **AD-A1: PZ guard — TX-down skipped when mustHaveCoverage PZ would lose signal (Phase 28ad)**
- **AD-A2: PZ guard — TX-down proceeds when PZ not affected (Phase 28ad)**
- **AD-B1: small handoff zone — no actionable rec when handoffZoneCells < MIN_HANDOFF_CELLS (Phase 28ad)**
- **AD-C1: physical gap — roaming_tx_boost downgraded to sticky_client_risk when gap is wall-caused (Phase 28ad)**
- **AF-1a: PZ guard → pzBlockedTxTitle note emitted, no actionable roaming_tx (Phase 28af)**
- **AF-2a: physical gap → physicalGapNotEffectiveTitle note with suggestMove=1 (Phase 28af)**
- **AF-3a: cross-type suppression — max 1 informational per pair (Phase 28af)**

---

## 4. Add/Move/Rotate/Mounting Rules

### Add AP — `generateAddApSuggestions()` (generator.ts:400-578)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-01 | Minimum zone size | zone.cellCount < 20 | — | Filter out small zones | :418 |
| AM-02 | Zone uplink check | >50% of zone cells uplink-limited | — | Skip zone (add_ap won't help) | :444-449 |
| AM-03 | Band mismatch | PZ targetBand !== band AND !== 'either' | — | Skip zone | :462 |
| AM-04 | Stacking penalty | 2nd/3rd add_ap | — | Reduce priority/severity | :488-492 |
| AM-05 | Multi-zone top 3 | — | — | Process top 3 zones by cellCount × relevance | :435 |
| AM-06 | RF-weighted target | — | — | computeWeightedTarget instead of geometric centroid | :453 |
| AM-07 | Candidate matching + infrastructure | candidates available | Physical validation | Match to candidate, set infrastructure_required flag | :472-484 |
| AM-07a2 | Candidate too far — specific reason | candidates.length > 0, all rejected as too_far | — | infrastructure_required with infraNoCandidateCloseEnoughReason (maxDistance + nearestDistance) | :621-658 |
| AM-07b | Candidate policy gate (add_ap) | candidatePolicy !== 'optional' AND no candidates defined | — | Emit infrastructure_required with infraNoCandidatesDefinedReason | :455-465 |
| AM-07c | Candidate policy fallback (add_ap) | candidatePolicy === 'optional' AND no candidates defined | — | Place at RF-weighted ideal position with addApFallbackReason (marked as "ohne Kandidat") | :467-475 |
| AM-07d | Zone quality filter (Coverage Impact First) | zone.avgRssi > -80 AND zone.cellCount/totalCells < 0.05 | — | Skip marginally weak small zones — only add AP for critically weak or significant zones | :523-527 |

### Move AP — `generateMoveApSuggestions()` (generator.ts:580-825)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-08 | Coverage threshold | primaryCoverageRatio > 0.25 | — | Skip (AP has sufficient coverage) | :646 |
| AM-09 | No-move zone | isInNoMoveZone returns true | — | Emit blocked_recommendation | :650 |
| AM-10 | Zone scoring | — | — | Score top 3 zones by distance + PZ weight + size × relevance | :695-702 |
| AM-11 | Physical validation | — | isPhysicallyValidApPosition false | Skip position (inside wall) | :731 |
| AM-12 | 2-strategy approach | — | ctx.candidates.length === 0 for Strategy 2 | Strategy 1: candidates only. Strategy 2: interpolation fallback (only when no candidates defined) | :672-735 |
| AM-12b | Candidate policy gate (move_ap) | candidatePolicy === 'required_for_move_and_new_ap' | — | Block Strategy 2 interpolation fallback | :865-868 |
| AM-12c | Move blocked — no candidate close enough | bestDelta === null AND candidates.length > 0 AND movePolicy === 'required_for_move_and_new_ap' | — | Emit blocked_recommendation with reason 'no_candidate_close_enough' | :909-928 |

### Rotate AP (`rotate_ap`) — `generateRotateApSuggestions()` (generator.ts:875-938)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-13 | Wall-mount only | ap.mounting !== 'wall' | — | Skip (ceiling APs have no orientation effect) | :933 |
| AM-14 | Improvement threshold | changePercent <= 3 | hasWallInFrontSector skip | Require >3% improvement | :959 |

### Mounting (`change_mounting`) — `generateMountingSuggestions()` (generator.ts:940-1024)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| AM-15 | Ceiling↔wall switch | changePercent > 5 | isActionAllowed, mounting zone constraints | Suggest alternative mounting | :1040 |

### Tests
- "should recommend adding AP for poor coverage areas" (generator.test.ts)
- "should detect and recommend for overlapping APs" (generator.test.ts)
- move_ap targetBand test (Phase 26d)
- W1: move_ap coverage threshold 25% (Phase 27b)
- B4: preferred_candidate uses selectTemplateAp (Phase 27b)
- **P1: required_for_new_ap + empty candidates → infrastructure_required (Phase 28p)**
- **P2: optional + empty candidates → add_ap fallback (Phase 28p)**
- **P3: required_for_move_and_new_ap blocks move_ap interpolation (Phase 28p)**
- **U1a: required_for_new_ap + no candidates → no add_ap, only infrastructure_required (Phase 28u)**
- **U2a: required_for_move_and_new_ap + distant candidates → blocked_recommendation no_candidate_close_enough (Phase 28u)**
- **U4a: marginally weak zone (avgRssi > -80, < 5% cells) skipped for add_ap (Phase 28u)**
- **V1a: required_for_new_ap + candidates >8m → infraNoCandidateCloseEnoughReason (Phase 28v)**
- **V2a: optional policy fallback → addApFallbackReason (Phase 28v)**

---

## 5. Uplink Rules

Constants: `UPLINK_SUPPRESS_ADD_MOVE=0.60`, `UPLINK_ADD_MOVE_MIN_BENEFIT=10`, `UPLINK_BLOCK_ROAMING=0.70` (generator.ts:68-69)

Generator: `generateBandLimitWarnings()` (generator.ts:1841-1878)

**What is `uplinkLimitedGrid`?** A per-cell boolean array indicating whether a cell is uplink-limited (device antenna placement limits effective throughput regardless of AP signal strength). The ratio of limited cells to total cells determines `uplinkLimitedRatio`.

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| UL-01 | Band limit warning | limitedPct > 30 | — | 3-tier: >30% info, >60% warning, >80% critical | :1857-1859 |
| UL-02 | Suppress add_ap | uplinkLimitedRatio > 0.60 | mustHaveCoverage PZ exception | Require min 10% benefit | :466-470 |
| UL-03 | Suppress move_ap | uplinkLimitedRatio > 0.60 | — | Require min 10% benefit | :785-788 |
| UL-04 | mustHaveCoverage exception | PZ.mustHaveCoverage === true | — | Keep normal 2% threshold | :468-470 |
| UL-05 | Client-side advice | limitedRatio > 0.60 | Only when main band_limit_warning is severity >= warning | Additional informational band_limit_warning with device-side mitigation advice | :2283-2298 |

### Tests
- D5a: 0.59 ratio → info (Phase 28c)
- D5b: 0.61 ratio → warning (Phase 28c)
- D5c: 0.85 ratio → critical (Phase 28c)
- D5d: add_ap suppression at >0.60 (Phase 28c)
- D10: mustHaveCoverage PZ exception (Phase 28d)
- U3a: high uplink (65%) suppresses add_ap unless benefit >= 10% (Phase 28u)
- U5a: high uplink (>60%) generates client-advice (Phase 28u)
- U5b: moderate uplink (35-60%) does NOT generate client-advice (Phase 28u)

---

## 6. Disable AP Rules

Generator: `generateDisableApSuggestions()` (generator.ts:1773-1839)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| DA-01 | Low primary coverage | primaryCoverageRatio < 0.05 | — | Consider disabling AP | :1786 |
| DA-02 | Presence check | secondBestCoverageCells/totalCells >= 0.05 | — | Require AP is "present but not best" | :1789-1790 |
| DA-03 | Simulation guard | changePercent >= -2 | — | Only suggest if coverage drop <= 2% | :1803 |
| DA-04 | low_ap_value suppression | disable_ap exists for this AP | — | Suppress low_ap_value warning | :212-216 |

### Tests
- "should flag low-value APs with disable_ap or low_ap_value" (generator.test.ts)
- W3: disable_ap threshold 5%, low_ap_value suppression (Phase 27b)

---

## 7. Constraint/Blocked Rules

Generator: `generateConstraintConflictWarnings()` (generator.ts:1880-2005)
Also: `generatePreferredCandidateSuggestions()` (generator.ts:2007-2086)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CB-01 | Forbidden zone | AP in forbidden zone | — | high/critical constraint_conflict | :1892-1916 |
| CB-02 | Discouraged zone | AP in discouraged zone | — | medium/warning constraint_conflict | :1892-1916 |
| CB-03 | mustHaveCoverage violation | violationRatio > 0.30 | RSSI grid available | constraint_conflict with coverage details | :1977-2003 |
| CB-04 | Blocked recommendation | Capability violation (move, TX, channel) | — | Emit blocked_recommendation with reason | :1492-1515, :650-677 |
| CB-05 | Preferred candidate | candidate.preferred && !candidate.forbidden | Physical validation, distance check | Emit preferred_candidate_location or infrastructure_required | :2018-2086 |

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

Function: `deduplicateRecommendations()` (generator.ts:2090-2137)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| DD-01 | Group by AP | Multiple recs for same AP | — | Max 1 primary rec per AP group | :2092-2104 |
| DD-02 | Effort-first sort | — | — | config < minor < major < infra | :2115-2128 |
| DD-03 | Dominance override | Higher-effort has 3× improvement AND >10% absolute | — | Prefer higher-effort rec | :2122-2123 |
| DD-04 | Alternatives | Remaining recs in group | — | Stored in alternativeRecommendations | :2132 |

### Tests
- Dedup tests in generator.test.ts (Phase 26)

---

## Additional Rules

### Channel Width — `generateChannelWidthRecommendations()` (generator.ts:2149-2218)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CW-01 | Width reduction | nearbyCount >= 2 + width >= 80 → suggest 40; veryCloseCount >= 3 + width > 20 → suggest 20 | band !== '2.4ghz' | Emit adjust_channel_width | :2183-2187 |

### Overlap Warning — `generateOverlapWarnings()` (generator.ts:1681-1713)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| OV-01 | Overlap warning | overlapPercent > 20 | — | medium/warning overlap_warning | :1693 |

### Coverage Warning (`coverage_warning`) — `generateCoverageWarnings()` (generator.ts:331-366)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CV-01 | Coverage warning | weakPercent > 10 | — | >30% → high/critical, else medium/warning | :344-349 |

### Low-Value AP — `generateLowValueWarnings()` (generator.ts:1651-1679)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| LV-01 | Low-value AP | AP in lowValueApIds list | Not in disabledApIds | low/info low_ap_value warning | :1658-1678 |

### Roaming Hints — `generateRoamingHints()` (generator.ts:1434-1477)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| RH-01 | Roaming hint | lowDeltaPercent > 15 | No specific roaming warnings exist (sticky/gap/roaming_tx/boost absent, checked at :218-221) | Informational roaming hint | :1455-1476 |

### 17. Cross-Type Prioritization (generator.ts)

| ID | Description | Trigger | Guards | Action | Reference |
|----|-------------|---------|--------|--------|-----------|
| CT-01 | Infra demotes roaming hints | infrastructure_required exists in batch | — | sticky_client_risk + handoff_gap_warning → priority=low, severity=info | :349-356 |

---

## Candidate-Only Guarantee (Phase 28aw)

### Invariant: No Phantom Placement

Every `add_ap`, `move_ap`, or `preferred_candidate_location` recommendation with a `selectedCandidatePosition` is **guaranteed** to point to an actual `CandidateLocation` defined by the user. The engine never invents coordinates.

### Enforcement

| Policy | add_ap | move_ap | preferred_candidate |
|--------|--------|---------|---------------------|
| `required_for_new_ap` | Only with candidate match; else `infrastructure_required` | Interpolation allowed (no candidate needed) | Only with candidate match |
| `required_for_move_and_new_ap` | Only with candidate match | Only with candidate match; else `blocked_recommendation` | Only with candidate match |
| `optional` | Candidate match preferred; fallback (RF-weighted centroid) carries `usedFallback=1` + `candidateCount=0` + no `selectedCandidatePosition` | Interpolation allowed | Only with candidate match |

### Verification

- **`matchesAnyCandidate(pos, candidates, epsM=0.05)`** — helper in `candidates.ts` verifies position-to-candidate match within 5cm tolerance.
- **Tests CR-A** — Cross-fixture (RF1, RF2, RF3, RF5): every `selectedCandidatePosition` matches a real candidate.
- **Tests CR-B** — Optional policy (RF4): mutual exclusion `selectedCandidatePosition` XOR `usedFallback`.
- **Tests CR-C** — Golden hard guard: required-policy golden outputs contain no `usedFallback` add_ap.

---

## Summary

| Cluster | Rules | Count | Generator Function |
|---------|-------|-------|--------------------|
| Channel | CH-01..CH-07 | 7 | generateChannelRecommendations |
| TX-Power | TX-01..TX-09 | 9 | generateTxPowerSuggestions |
| Roaming (Down) | RM-01..RM-09, RM-07b, RM-14, RM-15 | 12 | generateRoamingTxAdjustments |
| Roaming (Boost) | RB-01..RB-08 | 8 | generateRoamingTxBoosts |
| Roaming (Warnings) | RM-10..RM-13 | 4 | generateStickyClientWarnings + Gap |
| Add/Move/Rotate/Mount | AM-01..AM-15 + 6 sub-rules | 21 | 4 generators |
| Uplink | UL-01..UL-05 | 5 | generateBandLimitWarnings + gating |
| Disable AP | DA-01..DA-04 | 4 | generateDisableApSuggestions |
| Constraint/Blocked | CB-01..CB-05 | 5 | generateConstraintConflictWarnings + Preferred |
| Sorting | SO-01..SO-05 | 5 | sort block in main function |
| Dedup | DD-01..DD-04 | 4 | deduplicateRecommendations |
| Channel Width | CW-01 | 1 | generateChannelWidthRecommendations |
| Overlap | OV-01 | 1 | generateOverlapWarnings |
| Coverage | CV-01 | 1 | generateCoverageWarnings |
| Low-Value | LV-01 | 1 | generateLowValueWarnings |
| Roaming Hint | RH-01 | 1 | generateRoamingHints |
| Cross-Type | CT-01 | 1 | post-processing in main function |

**Total: 90 rules across 17 clusters. 21 RecommendationType values.**

All rules have code references. Every documented rule has a corresponding code path.

### Auto-Verification

```
Total rules:  89  (counted by regex ^| [A-Z]{2}-\d+ in this document)
Total types:  21  (RecommendationType union in types.ts)
Last verified: scripts/report-integrity.sh "phase-28ag"
Drift-proof:  rulesIntegrity.test.ts (E1-E9) + rulesCatalogIntegrity.test.ts (RC-1..RC-4)
```

---

## Was die Engine bewusst NICHT weiss

Die folgenden Aspekte sind **nicht modelliert** und werden bewusst nicht beruecksichtigt:

| Aspekt | Grund | Auswirkung |
|--------|-------|------------|
| **Externe Nachbar-WLANs** | Kein WLAN-Scan, nur lokale AP-Konfiguration bekannt | Channel-Empfehlungen basieren nur auf eigenen APs; in der Praxis kann der reale Co-Channel-Conflict hoeher sein |
| **Echte Client-Roaming-Hysterese** | Roaming-Verhalten ist client-spezifisch (IEEE 802.11k/v/r Unterstuetzung variiert) | Sticky-Client- und Handoff-Gap-Warnungen sind heuristisch, nicht gemessen |
| **Multi-AP Global Optimization** | Kein globaler Solver (z.B. ILP); Empfehlungen werden pro AP generiert | Optimierung eines APs kann die Situation eines anderen verschlechtern; Dedup mildert dies teilweise |
| **Reale Messdaten** | Engine arbeitet mit ITU-R P.1238 Modell, nicht mit Messungen | Modell-Vorhersagen koennen von realen Bedingungen abweichen (Moebel, Reflexionen, Menschen) |
| **DFS-Radar-Events** | Kanaele im DFS-Bereich werden empfohlen, aber Radar-Events nicht simuliert | AP kann nach Channel-Wechsel durch DFS gezwungen werden, erneut zu wechseln |
| **Band Steering** | Client-seitige Bandwahl (2.4/5/6 GHz) wird nicht modelliert | Empfehlungen gehen von Einzelband-Nutzung aus; dual-band Clients verteilen sich anders |

### Candidate-Only Gating (implizit)

Die Engine kennt kein explizites `placementMode` Flag. Stattdessen wird Candidate-Only-Verhalten implizit ueber `ctx.candidates.length > 0` gesteuert:
- **add_ap**: Wenn Candidates definiert sind, werden nur Candidate-Positionen verwendet. Ohne Candidates wird `add_ap` uebersprungen (generator.ts:637-639).
- **move_ap**: Strategy 2 (Interpolation-Fallback) wird nur ausgefuehrt, wenn `ctx.candidates.length === 0` (generator.ts:770-771).

### Candidate Rejection Analysis (Phase 28k)

Wenn kein Candidate die Hard-Filter besteht, analysiert `collectCandidateRejectionReasons()` (generator.ts:346-386) alle Candidates und liefert Top-3 Ablehnungsgruende:
- `forbidden` — Candidate hat `forbidden: true` oder liegt in forbidden/no_new_ap Zone
- `wall_invalid` — Candidate liegt in einer Wand (isPhysicallyValidApPosition false)
- `too_far` — Candidate ist > MAX_IDEAL_DISTANCE_ADD_AP_M (8m) vom RF-Ziel entfernt

Das Ergebnis wird als `infrastructure_required` mit `reasonParams.no_candidate_valid: 1` und `reasonParams.reasons` emittiert.

### Real-Project Regression Fixtures (Phase 28aj/28ak)

Realistische Fixtures koennen ueber den DEV-only "Export Regression Fixture" Button auf der Mixing-Seite exportiert werden. Der Export erzeugt eine JSON-Datei mit TypedArray→Array und Map→Array Serialisierung, die ueber `loadExportedFixture()` (load-exported-fixture.ts) zurueck in typisierte Objekte deserialisiert wird.

- **RF1** (`create-rf1.ts`): Home-Office (3 APs, 2 Waende, 1 PZ, 1 Candidate) — Golden g9
- **RF2** (`create-rf2.ts`, JSON: `real-fixtures/rf2-user-house-5ghz.json`): User House (4 APs, 3 Waende, 2 PZ, 2 Candidates, Channel-Konflikt ch36) — Golden g10, 5 Invarianz-Tests
