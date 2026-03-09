# Regression Fixtures — Export, Import, Golden

## How to capture a real fixture

1. **Dev-Server starten:** `npm run dev` (Port 5175)
2. **Projekt oeffnen** → Optimierung-Seite → Analyse ausfuehren (Button "Analysieren")
3. **DEV-Button klicken:** Unten links erscheint "Export Regression Fixture (DEV)".
   Klick erzeugt einen JSON-Download (`regression-fixture-<timestamp>.json`).
4. **Datei ablegen:** Die heruntergeladene JSON-Datei nach
   `src/lib/recommendations/__tests__/real-fixtures/` kopieren.
5. **Test schreiben:** Die Datei per `loadExportedFixture()` laden und `generateRecommendations()` aufrufen:

```typescript
import { readFileSync } from 'fs';
import { loadExportedFixture } from './fixtures/load-exported-fixture';
import { generateRecommendations } from '../generator';
import type { ExportedFixture } from '../fixture-export';

const data = JSON.parse(readFileSync('...path.json', 'utf-8')) as ExportedFixture;
const loaded = loadExportedFixture(data);
const result = generateRecommendations(
  loaded.aps, loaded.accessPoints, loaded.walls, loaded.bounds,
  loaded.band, loaded.stats, loaded.rfConfig, loaded.profile, loaded.ctx,
);
```

## Datenfluss

```
App (Mixing-Seite)
  → exportRegressionFixture()        # TypedArray→Array, Map→entries
  → JSON.stringify → .json Datei
  → JSON.parse
  → loadExportedFixture()            # Array→TypedArray, entries→Map
  → generateRecommendations()        # Identisches Ergebnis
```

Round-Trip ist durch `fixture-roundtrip.test.ts` (RT-1, RT-2) bewiesen.

## How to update golden files

Nach einer beabsichtigten Engine-Aenderung:

```bash
GOLDEN_UPDATE=1 npx vitest run golden.test.ts
```

Dies ueberschreibt alle `expected.json` Dateien unter `__tests__/golden/g*-*/`.
Die Aenderungen sind im Git-Diff reviewbar.

## Neue Fixture anlegen (Schritt-fuer-Schritt)

### Variante A: Programmatischer Generator

1. `create-rfN.ts` in `__tests__/fixtures/` anlegen (Muster: `create-rf3.ts`)
2. `createRfNName()` exportieren — liefert `{ aps, apResps, walls, bounds, stats, ctx }`
3. Optional: JSON per Script exportieren nach `real-fixtures/rfN-name-5ghz.json`
4. `rfN-name.test.ts` schreiben (JSON via `loadExportedFixture` laden)
5. Golden: Import in `golden.test.ts`, neuen Eintrag in `GOLDEN_CASES` einfuegen
6. `GOLDEN_UPDATE=1 npx vitest run golden.test.ts` — generiert `expected.json`

### Variante B: DEV Export direkt nutzen

1. DEV Export im Browser herunterladen (siehe "How to capture")
2. JSON nach `real-fixtures/` kopieren und umbenennen
3. Test-Datei schreiben (Muster: `rf2-user-house.test.ts`)
4. Kein `create-rfN.ts` noetig — Golden Case benoetigt aber einen Generator

## Vorhandene Fixtures

| Name | Quelle | Beschreibung | Golden |
|---|---|---|---|
| RF1 | `create-rf1.ts` | Home-Office (3 APs, 2 Waende, 1 PZ) | g9 |
| RF2 | `create-rf2.ts` + `rf2-user-house-5ghz.json` | User House (4 APs, 3 Waende, 2 PZ, ch36-Konflikt) | g10 |
| RF3 | `create-rf3.ts` + `rf3-my-house-5ghz.json` | My House (3 APs, 6 Waende, 3 PZ, strict policy, ch36-Konflikt) | g11 |
| RF4 | `create-rf4.ts` + `rf4-user-live-5ghz.json` | User Live (5 APs, 5 Waende, 2 PZ, optional policy, 2 Kanal-Konflikte) | g12 |
| RF5 | `create-rf5.ts` + `rf5-user-live-5ghz.json` | User Live v2 (6 APs, 6 Waende, 2 PZ, required_for_new_ap, 47% uplink-limited) | g13 |
| RF6 | `create-rf6-user-myhouse.ts` | User My House (4 APs, 6 Waende, 3 PZ, 3 Cand, 1 CZ, required_for_new_ap, ch36-Konflikt) | g14 |
| F1-F8 | `regression-fixtures.ts` | Synthetische Szenarien | g1-g8 |
