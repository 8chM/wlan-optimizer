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

## Vorhandene Fixtures

| Name | Quelle | Beschreibung | Golden |
|---|---|---|---|
| RF1 | `create-rf1.ts` | Home-Office (3 APs, 2 Waende, 1 PZ) | g9 |
| RF2 | `create-rf2.ts` + `rf2-user-house-5ghz.json` | User House (4 APs, 3 Waende, 2 PZ, ch36-Konflikt) | g10 |
| RF3 | `create-rf3.ts` + `rf3-my-house-5ghz.json` | My House (3 APs, 6 Waende, 3 PZ, strict policy, ch36-Konflikt) | g11 |
| F1-F8 | `regression-fixtures.ts` | Synthetische Szenarien | g1-g8 |
