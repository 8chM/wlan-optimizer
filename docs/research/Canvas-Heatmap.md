# Canvas-Libraries & Heatmap-Rendering: Recherche

> **Phase 3a Deliverable** | **Datum:** 2026-02-27 | **Status:** Abgeschlossen
>
> Umfassende Evaluation von Canvas-Bibliotheken und Heatmap-Rendering-Strategien
> fuer den WLAN-Optimizer. Kontext: Svelte 5 + Tauri 2 Desktop-App.

---

## Inhaltsverzeichnis

1. [Canvas-Library Evaluation](#1-canvas-library-evaluation)
2. [Grundriss-Zeichnung Implementation](#2-grundriss-zeichnung-implementation)
3. [Heatmap-Rendering](#3-heatmap-rendering)
4. [Performance-Optimierung](#4-performance-optimierung)
5. [Konkrete Code-Patterns](#5-konkrete-code-patterns)
6. [Empfehlung](#6-empfehlung)
7. [Quellen](#7-quellen)

---

## 1. Canvas-Library Evaluation

### 1.1 Konva.js

| Kriterium | Bewertung |
|-----------|-----------|
| **Version** | 10.2.0 (Stand Feb 2026) |
| **Maintenance** | Aktiv, regelmaessige Releases |
| **npm Downloads** | ~830.000/Woche |
| **Bundle Size** | ~55 kB min+gzip |
| **Lizenz** | MIT |

#### Staerken

- **Svelte 5 Integration**: Offizielle `svelte-konva` v1.x Library, vollstaendig auf Svelte 5 Runes migriert (`$state`, `$effect`, `bind:`). Deklarative Komponenten: `<Stage>`, `<Layer>`, `<Rect>`, `<Line>`, `<Circle>`, `<Image>`, `<Text>`, `<Group>` etc.
- **Layer-System**: Jede Layer ist ein separates HTML5 Canvas-Element. Aenderungen an einer Layer erfordern kein Neuzeichnen anderer Layers. Ideal fuer Grundriss (Layer 1) + Heatmap (Layer 2) + UI-Overlays (Layer 3). Empfehlung: maximal 3-5 Layers.
- **Performance bei 100+ Objekten**: Unterstuetzt tausende Shapes. Optimierungen: `shape.cache()` (intern als Bitmap), `layer.listening(false)` fuer statische Layers, `perfectDrawEnabled(false)` fuer weniger Render-Overhead.
- **Hit Detection**: Eingebaute pixelgenaue Hit Detection. Custom `hitFunc` fuer vereinfachte Trefferbereiche (z.B. breitere Klickzone fuer duenne Waende). Separate Hit-Canvas pro Layer.
- **Touch/Gesture**: Native Touch-Events (`touchstart`, `touchmove`, `touchend`). Multi-Touch-Pinch-Zoom ueber eigene Implementierung (Distanzberechnung zwischen zwei Touchpunkten). Hammer.js-Integration moeglich fuer erweiterte Gesten.
- **Zoom/Pan**: Eingebaute `stage.scale()` und `stage.position()` APIs. Scroll-Wheel-Zoom relativ zur Mausposition (Pointer-relative Zoom) dokumentiert. Drag-to-Pan ueber `stage.draggable(true)`.
- **Undo/Redo**: Kein eingebautes System, aber einfach ueber State-History-Pattern implementierbar (JSON-Snapshots via `stage.toJSON()` oder Svelte-State-Array).
- **Export**: `stage.toDataURL()` fuer PNG/JPEG. `pixelRatio`-Parameter fuer hochaufloesende Exporte. Kein SVG-Export (muss manuell implementiert werden). PDF via externe Library (z.B. jsPDF) mit Bild-Einbettung.
- **OffscreenCanvas/WebWorker**: Offiziell dokumentiert. Monkeypatching von `Konva.Util.createCanvasElement` fuer OffscreenCanvas. Event-Proxying vom Main-Thread zum Worker noetig.

#### Schwaechen

- Kein nativer SVG-Export (nur Raster-Export)
- Touch-Gesten muessen manuell oder via Hammer.js implementiert werden
- `svelte-konva` erfordert spezielle SSR-Behandlung in SvelteKit (fuer Tauri irrelevant)
- Gesamtes Konva-Paket wird importiert (kein granulares Tree-Shaking), aber `svelte-konva` optimiert Imports pro Komponente

#### Fazit Konva.js
**Beste Wahl fuer dieses Projekt.** Native Svelte-5-Integration, exzellentes Layer-System, gute Performance, aktive Wartung. Die fehlende SVG-Export-Funktion ist fuer unseren Use Case (Heatmap-Bilder, PDF-Reports) akzeptabel.

---

### 1.2 Fabric.js

| Kriterium | Bewertung |
|-----------|-----------|
| **Version** | 7.2.0 (Stand Feb 2026) |
| **Maintenance** | Aktiv, inkl. Sicherheitspatches (CVE-2026-27013) |
| **npm Downloads** | ~350.000/Woche |
| **Bundle Size** | ~96 kB min+gzip |
| **Lizenz** | MIT |

#### Staerken

- **SVG Import/Export**: Beste SVG-Unterstuetzung aller Canvas-Libraries. `loadSVGFromURL()`, `loadSVGFromString()`, `toSVG()`. Nuetzlich fuer Grundriss-Import aus SVG-Dateien.
- **Objekt-Modell**: Reichhaltiges OOP-Modell mit eingebauten Transformations-Controls (Bounding Boxes, Resize-Handles). Serialisierung via `toJSON()` / `loadFromJSON()`.
- **Touch-Support**: Eingebaute Touch-Unterstuetzung fuer mobile Browser.
- **Undo/Redo**: Nicht eingebaut, aber JSON-basierte State-Snapshots sind gut dokumentiert.

#### Schwaechen

- **Keine offizielle Svelte-Integration**: Kein `svelte-fabric` Pendant. Integration nur ueber imperative API moeglich (weniger deklarativ).
- **Groesserer Bundle**: ~96 kB vs. ~55 kB bei Konva (fast doppelt so gross).
- **Kein echtes Layer-System**: Fabric arbeitet mit einer einzigen Canvas. Mehrere Overlays erfordern mehrere `fabric.Canvas`-Instanzen und manuelle Synchronisation.
- **Performance bei vielen Objekten**: Dokumentierte Probleme bei grosser Objektanzahl. Weniger optimiert fuer haeufige Updates.
- **SVG Import/Export nicht 1:1**: SVG und Canvas sind nicht identisch -- Import und Re-Export koennen Abweichungen aufweisen.

#### Fazit Fabric.js
**Nicht empfohlen fuer dieses Projekt.** Fehlende Svelte-Integration ist ein Dealbreaker. SVG-Staerke ist fuer unseren Hauptanwendungsfall (Heatmap-Rendering) nicht entscheidend. Groesserer Bundle und fehlendes Layer-System sind weitere Nachteile.

---

### 1.3 PixiJS

| Kriterium | Bewertung |
|-----------|-----------|
| **Version** | 8.16.0 (Stand Feb 2026) |
| **Maintenance** | Sehr aktiv, regelmaessige Releases |
| **npm Downloads** | ~300.000/Woche |
| **Bundle Size** | ~120 kB min+gzip (vollstaendig), mit Tree-Shaking deutlich weniger |
| **Lizenz** | MIT |

#### Staerken

- **WebGL/WebGPU-Rendering**: GPU-beschleunigtes Rendering. Theoretisch beste Performance fuer Heatmaps (Fragment-Shader fuer Farbmapping).
- **Performance**: Optimiert fuer 100K+ Objekte (ParticleContainer). Reaktive Render-Loop (zeichnet nur geaenderte Bereiche neu).
- **Tree-Shaking**: v8 bietet granulares Tree-Shaking -- nur benoetigte Module werden gebundelt.
- **Experimenteller Canvas-Renderer**: v8.16.0 bringt Canvas-Fallback fuer Umgebungen ohne WebGL.

#### Schwaechen

- **Overkill fuer 2D-Grundriss**: WebGL/WebGPU-Overhead fuer einfache 2D-Formen (Rechtecke, Linien) nicht gerechtfertigt.
- **Keine Svelte-Integration**: Keine offizielle oder Community-Svelte-Wrapper-Library.
- **Komplexere API**: Auf Spiele/Animationen optimiert, nicht auf interaktive Editoren.
- **Hit Detection**: Weniger ausgereift als Konva fuer interaktive Shape-Selektion.
- **Tauri-Kompatibilitaet**: Potenzielle GPU-Acceleration-Probleme mit Tauri WebView (dokumentiertes Issue: CSS-Filter und Canvas nutzen CPU statt GPU in manchen Tauri-Konfigurationen).

#### Fazit PixiJS
**Nicht empfohlen.** Obwohl GPU-Rendering fuer Heatmaps theoretisch schneller waere, ist der Overhead fuer einen Grundriss-Editor unverhaeeltnismaessig. Fehlende Svelte-Integration und potenzielle Tauri-GPU-Probleme sprechen dagegen. Die Heatmap-Berechnung ist CPU-gebunden (RF-Modell) -- das Rendering selbst ist nicht der Flaschenhals.

---

### 1.4 Native HTML5 Canvas (kein Framework)

#### Wann lohnt sich der Mehraufwand?

- Bei extrem performance-kritischen, spezialisierten Anwendungen
- Wenn nur ein kleiner Teil der Canvas-API benoetigt wird
- Wenn maximale Kontrolle ueber den Render-Loop erforderlich ist

#### Performance-Vorteil

- Kein Framework-Overhead (Kein Objekt-Graph, kein Event-System, kein Hit-Canvas)
- Direkter Zugriff auf `CanvasRenderingContext2D`
- Fuer reine Heatmap-Pixel-Manipulation (ImageData) kein Framework noetig

#### Nachteile

- Event-Handling (Klick auf Wand, Drag von AP) muss komplett selbst implementiert werden
- Hit Detection erfordert eigenes System (z.B. Color-Picking oder geometrische Berechnung)
- Kein Layer-System (nur durch mehrere uebereinander liegende Canvas-Elemente)
- Zoom/Pan mit korrekter Koordinaten-Transformation muss selbst gebaut werden
- Deutlich mehr Code und Fehlerquellen

#### Fazit Native Canvas
**Teilweise empfohlen: Hybrid-Ansatz.** Konva fuer den interaktiven Grundriss-Editor (Layer 1 + 3), native Canvas/ImageData fuer die Heatmap-Berechnung (Layer 2). Die Heatmap wird als `Konva.Image` in eine eigene Layer gerendert, die Pixeldaten aber direkt via ImageData berechnet.

---

### 1.5 Vergleichsmatrix

| Kriterium | Konva.js | Fabric.js | PixiJS | Native Canvas |
|-----------|----------|-----------|--------|---------------|
| Svelte 5 Integration | ++ (offiziell) | -- (keine) | -- (keine) | 0 (manuell) |
| Layer-System | ++ | -- | + | 0 (manuell) |
| Performance (100+ Obj.) | + | 0 | ++ | ++ |
| Hit Detection | ++ | + | 0 | -- (manuell) |
| Touch/Gesture | + | + | 0 | -- (manuell) |
| SVG Import | 0 (als Bild) | ++ | 0 | -- |
| SVG Export | -- | ++ | -- | -- |
| Bundle Size | + (55 kB) | 0 (96 kB) | - (120 kB) | ++ (0 kB) |
| Undo/Redo | 0 (via State) | 0 (via State) | 0 (via State) | -- (manuell) |
| Zoom/Pan | ++ | + | + | - (manuell) |
| Heatmap-Rendering | 0 | 0 | + (GPU) | ++ (ImageData) |
| Tauri-Kompatibilitaet | + | + | 0 (GPU-Issues) | ++ |
| **Gesamt** | **Empfohlen** | Nicht empf. | Nicht empf. | Hybrid-Partner |

**Legende:** ++ = exzellent, + = gut, 0 = neutral, - = schwach, -- = ungeeignet

---

## 2. Grundriss-Zeichnung Implementation

### 2.1 Wand-Zeichnung (Line-Tool mit Snapping)

#### Konzept
Waende werden als `Konva.Line`-Objekte mit zwei Endpunkten gezeichnet. Der Benutzer klickt fuer den Startpunkt und nochmals fuer den Endpunkt.

#### Grid-Snapping (10cm Raster)

```typescript
// Snap-Funktion: Position auf naechsten Rasterpunkt runden
const GRID_SIZE_PX = 10; // 10 Pixel = 10 cm bei 1px/cm Massstab

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE_PX) * GRID_SIZE_PX;
}

// Anwendung bei Mausbewegung
function onMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
  const pos = stage.getPointerPosition()!;
  const snappedX = snapToGrid(pos.x);
  const snappedY = snapToGrid(pos.y);
  // Preview-Linie zum Snap-Punkt zeichnen
}
```

#### Winkelbeschraenkung (optional)
Fuer rechtwinklige Grundrisse: Shift-Taste erzwingt 0/90/45-Grad-Winkel.

```typescript
function constrainAngle(start: Point, end: Point, snapDeg: number = 45): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / (snapDeg * Math.PI / 180))
                       * (snapDeg * Math.PI / 180);
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    x: start.x + Math.cos(snappedAngle) * length,
    y: start.y + Math.sin(snappedAngle) * length,
  };
}
```

#### Endpunkt-Snapping
Wenn der Mauszeiger nahe genug an einem bestehenden Wand-Endpunkt ist (< 15px), snappt der neue Punkt dorthin. Das ermoeglicht geschlossene Raeume.

### 2.2 Raum-Erkennung (Geschlossene Polygone)

#### Algorithmus
1. Alle Wand-Segmente als Kanten eines Graphen modellieren
2. Verbindungspunkte (Nodes) erkennen wo Waende sich treffen
3. Minimale Zyklen im Graph finden (Face Detection)
4. Jeder Zyklus = ein Raum (geschlossenes Polygon)

#### Vereinfachter Ansatz fuer MVP
Statt automatischer Raumerkennung: Benutzer markiert Raeume manuell durch Klick in eine geschlossene Flaeche (Flood-Fill-Logik auf dem Wand-Graph).

#### Implementierung: Cycle Detection

```typescript
interface WallSegment {
  id: string;
  start: Point;
  end: Point;
  material: WallMaterial;
  thickness: number; // cm
}

interface Room {
  id: string;
  walls: WallSegment[];
  polygon: Point[]; // Geschlossener Pfad
  area: number; // m²
  label: string;
}

// Pruefen ob Waende einen geschlossenen Raum bilden
function findRooms(walls: WallSegment[]): Room[] {
  const graph = buildAdjacencyGraph(walls);
  const cycles = findMinimalCycles(graph);
  return cycles.map(cycle => ({
    id: generateId(),
    walls: cycle.edges,
    polygon: cycle.vertices,
    area: calculatePolygonArea(cycle.vertices),
    label: '',
  }));
}
```

### 2.3 Massstab-System (Pixel zu Meter)

#### Referenzlinie-Methode (aus PRD P1)
1. Benutzer laedt Grundriss-Bild hoch
2. Benutzer zeichnet eine Referenzlinie ueber eine bekannte Strecke
3. Benutzer gibt die reale Laenge ein (z.B. "4.5 m")
4. System berechnet: `pixelsPerMeter = lineLengthPx / realLengthM`

```typescript
interface Scale {
  pixelsPerMeter: number;
  // Convenience
  metersPerPixel: number;
  cmPerPixel: number;
}

function calculateScale(lineLengthPx: number, realLengthM: number): Scale {
  const ppm = lineLengthPx / realLengthM;
  return {
    pixelsPerMeter: ppm,
    metersPerPixel: 1 / ppm,
    cmPerPixel: 100 / ppm,
  };
}

// Fuer Freihand-Zeichnung: Default-Massstab
const DEFAULT_SCALE: Scale = {
  pixelsPerMeter: 100, // 1 Pixel = 1 cm
  metersPerPixel: 0.01,
  cmPerPixel: 1,
};
```

### 2.4 Visuelle Darstellung verschiedener Wandtypen

| Material | Farbe | Dicke (px) | Pattern |
|----------|-------|-----------|---------|
| Beton | `#555555` (Dunkelgrau) | 4-6 | Solid |
| Poroton / Mauerwerk | `#CC6633` (Braun) | 3-5 | Solid |
| Leichtbau / Gipskarton | `#AAAAAA` (Hellgrau) | 2-3 | Gestrichelt |
| Glas / Fenster | `#66CCFF` (Hellblau) | 1-2 | Transparent (50% Opacity) |
| Tuer (offen) | `#88BB88` (Gruen) | 1 | Gepunktet |
| Holz | `#996633` (Holzbraun) | 3-4 | Solid |

#### Konva-Implementierung

```typescript
const WALL_STYLES: Record<WallMaterial, WallStyle> = {
  concrete: { stroke: '#555555', strokeWidth: 5, dash: [] },
  brick:    { stroke: '#CC6633', strokeWidth: 4, dash: [] },
  drywall:  { stroke: '#AAAAAA', strokeWidth: 2, dash: [10, 5] },
  glass:    { stroke: '#66CCFF', strokeWidth: 2, dash: [], opacity: 0.5 },
  door:     { stroke: '#88BB88', strokeWidth: 1, dash: [3, 3] },
  wood:     { stroke: '#996633', strokeWidth: 3, dash: [] },
};
```

### 2.5 Import-Moeglichkeiten

| Format | Machbarkeit | Bibliothek | Anmerkungen |
|--------|-------------|------------|-------------|
| **Bild (PNG/JPG)** | Einfach | Konva.Image | Als Hintergrund-Layer. Benutzer zeichnet Waende darueber. |
| **SVG** | Mittel | Konva.Image (als Bild) | SVG wird als Bild geladen, nicht als editierbare Objekte. |
| **DXF** | Komplex | `dxf` npm-Paket | DXF -> SVG-Konvertierung moeglich. Komplexitaet: Verschiedene DXF-Versionen, Layer-Mapping. |
| **PDF** | Komplex | pdf.js -> Canvas | PDF als Bild rendern, dann als Hintergrund verwenden. |

**MVP-Empfehlung:** Nur Bild-Import (PNG/JPG) als Hintergrund. SVG-Import als Post-MVP Feature. DXF-Import als spaetere Erweiterung.

---

## 3. Heatmap-Rendering

### 3.1 Architektur-Ueberblick

```
┌─────────────────────────────────────────────────┐
│                    Main Thread                    │
│                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ Grundriss│   │ Heatmap  │   │ UI-Overlay   │ │
│  │  Layer   │   │  Layer   │   │   Layer      │ │
│  │ (Konva)  │   │(Konva.   │   │  (Konva)     │ │
│  │          │   │ Image)   │   │              │ │
│  └──────────┘   └─────▲────┘   └──────────────┘ │
│                       │                           │
│                  ImageData                        │
│                       │                           │
│  ┌────────────────────┴───────────────────────┐  │
│  │            postMessage(buffer)              │  │
│  │         (Transferable ArrayBuffer)          │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                           │
└───────────────────────┼───────────────────────────┘
                        │
┌───────────────────────┼───────────────────────────┐
│                  Web Worker                        │
│                       │                            │
│  ┌────────────────────▼───────────────────────┐   │
│  │          RF-Berechnungs-Engine              │   │
│  │                                             │   │
│  │  1. Grid erstellen (Aufloesung abhaengig)  │   │
│  │  2. Fuer jeden Gridpunkt:                  │   │
│  │     - Distanz zu jedem AP berechnen        │   │
│  │     - Wand-Intersections zaehlen           │   │
│  │     - Path Loss berechnen (ITU-R P.1238)   │   │
│  │     - RSSI = TX + Gain - PathLoss          │   │
│  │  3. Besten AP pro Punkt waehlen (max RSSI) │   │
│  │  4. RSSI -> Farbe via Lookup-Table         │   │
│  │  5. ImageData befuellen                    │   │
│  │  6. ArrayBuffer zurueck transferieren      │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 3.2 Aufloesung und Grid

#### Empfohlene Aufloesung

| Grundriss-Groesse | Grid-Schritt | Pixel-Aufloesung | Berechnungspunkte | Erwartete Rechenzeit |
|-------------------|-------------|-------------------|-------------------|---------------------|
| 50 m² (7x7m) | 10 cm | 70x70 | 4.900 | < 10 ms |
| 50 m² (7x7m) | 5 cm | 140x140 | 19.600 | < 30 ms |
| 100 m² (10x10m) | 10 cm | 100x100 | 10.000 | < 20 ms |
| 100 m² (10x10m) | 5 cm | 200x200 | 40.000 | < 50 ms |
| 200 m² (14x14m) | 10 cm | 140x140 | 19.600 | < 30 ms |
| 200 m² (14x14m) | 5 cm | 280x280 | 78.400 | < 100 ms |

**Empfehlung:** 10 cm Grid-Schritt fuer Echtzeit-Preview waehrend AP-Verschiebung, 5 cm fuer finale Darstellung. Bei Anzeige auf Bildschirm wird die berechnete Grid-Aufloesung auf Canvas-Pixel hochskaliert (bilineare Interpolation).

#### Bilineare Interpolation fuer Display

Das berechnete Grid (z.B. 100x100 Punkte) wird auf die tatsaechliche Canvas-Groesse (z.B. 1000x1000 Pixel) hochskaliert. Dabei werden Zwischenwerte bilinear interpoliert fuer weiche Uebergaenge.

```typescript
function bilinearInterpolate(
  grid: Float32Array, // RSSI-Werte
  gridW: number, gridH: number,
  x: number, y: number // Normalisierte Koordinaten [0,1]
): number {
  const gx = x * (gridW - 1);
  const gy = y * (gridH - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, gridW - 1);
  const y1 = Math.min(y0 + 1, gridH - 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const idx00 = y0 * gridW + x0;
  const idx10 = y0 * gridW + x1;
  const idx01 = y1 * gridW + x0;
  const idx11 = y1 * gridW + x1;

  const top = grid[idx00] * (1 - fx) + grid[idx10] * fx;
  const bottom = grid[idx01] * (1 - fx) + grid[idx11] * fx;
  return top * (1 - fy) + bottom * fy;
}
```

### 3.3 ImageData Pixel-Manipulation

#### Performance-Technik: Uint32Array statt Uint8ClampedArray

Statt vier einzelne Byte-Operationen pro Pixel (R, G, B, A) wird ein einziger 32-Bit-Schreibvorgang verwendet. Dies ist deutlich schneller.

```typescript
function fillHeatmapImageData(
  imageData: ImageData,
  rssiGrid: Float32Array,
  gridW: number, gridH: number,
  colorLUT: Uint32Array // 256 Eintraege, ABGR-Format
): void {
  const width = imageData.width;
  const height = imageData.height;
  // Uint32Array-View auf die gleichen Daten
  const pixels = new Uint32Array(imageData.data.buffer);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // Normalisierte Koordinaten
      const nx = px / width;
      const ny = py / height;

      // Bilinear interpolierter RSSI-Wert
      const rssi = bilinearInterpolate(rssiGrid, gridW, gridH, nx, ny);

      // RSSI -> LUT-Index (0-255)
      // -30 dBm = 255 (bestes Signal), -100 dBm = 0 (kein Signal)
      const index = Math.max(0, Math.min(255,
        Math.round((rssi + 100) * (255 / 70))
      ));

      // Direkt als 32-Bit-Wert setzen (ABGR wegen Little-Endian)
      pixels[py * width + px] = colorLUT[index];
    }
  }
}
```

#### Endianness-Beachtung

Auf Little-Endian-Systemen (alle modernen x86/ARM) ist die Byte-Reihenfolge im Uint32Array: `[B, G, R, A]` (ABGR). Fuer plattformuebergreifende Sicherheit:

```typescript
function createColorLUT(): Uint32Array {
  const lut = new Uint32Array(256);
  // Endianness-Detection
  const testBuffer = new ArrayBuffer(4);
  const testView8 = new Uint8Array(testBuffer);
  const testView32 = new Uint32Array(testBuffer);
  testView32[0] = 0x01020304;
  const isLittleEndian = testView8[0] === 0x04;

  for (let i = 0; i < 256; i++) {
    const [r, g, b] = rssiToColor(i);
    const a = i > 0 ? 180 : 0; // Transparenz fuer "kein Signal"

    if (isLittleEndian) {
      lut[i] = (a << 24) | (b << 16) | (g << 8) | r; // ABGR
    } else {
      lut[i] = (r << 24) | (g << 16) | (b << 8) | a; // RGBA
    }
  }
  return lut;
}
```

### 3.4 Farbschema: RSSI zu Farbe

#### Gradient-Definition (angepasst an RF-Modell Schwellen)

| RSSI-Bereich | Qualitaet | Farbe | RGB |
|-------------|-----------|-------|-----|
| > -50 dBm | Excellent | Dunkelgruen | (0, 128, 0) |
| -50 bis -65 dBm | Good | Hellgruen | (0, 255, 0) |
| -65 bis -75 dBm | Fair | Gelb | (255, 255, 0) |
| -75 bis -85 dBm | Poor | Orange/Rot | (255, 128, 0) |
| < -85 dBm | No Signal | Rot | (255, 0, 0) |
| Ausserhalb | N/A | Transparent | (0, 0, 0, 0) |

#### Lookup-Table Erzeugung via Canvas-Gradient

```typescript
function buildGradientLUT(): Uint8Array {
  // 1x256 Canvas fuer Gradient
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  // Index 0 = -100 dBm (schlecht), Index 255 = -30 dBm (gut)
  gradient.addColorStop(0.0,  'rgba(128, 0, 0, 0.7)');    // -100 dBm: Dunkelrot
  gradient.addColorStop(0.21, 'rgba(255, 0, 0, 0.7)');    // -85 dBm:  Rot
  gradient.addColorStop(0.36, 'rgba(255, 165, 0, 0.7)');  // -75 dBm:  Orange
  gradient.addColorStop(0.50, 'rgba(255, 255, 0, 0.7)');  // -65 dBm:  Gelb
  gradient.addColorStop(0.71, 'rgba(0, 255, 0, 0.7)');    // -50 dBm:  Gruen
  gradient.addColorStop(1.0,  'rgba(0, 128, 0, 0.7)');    // -30 dBm:  Dunkelgruen

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 1);

  // Pixeldaten als LUT speichern (256 * 4 Bytes = RGBA)
  return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data);
}
```

#### Transparenz-Overlay

Die Heatmap wird mit Alpha-Kanal (~0.6-0.7) ueber den Grundriss gelegt, sodass Waende und Raeume durchscheinen. Der Benutzer kann die Transparenz ueber einen Slider anpassen.

### 3.5 Echtzeit-Update Strategie

#### Debounce bei AP-Verschiebung

```typescript
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastCalcId = 0;

function onAPDragMove() {
  // Sofortige Vorschau: niedrige Aufloesung
  requestLowResPreview();

  // Debounced: hochaufloesende Berechnung
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    requestHighResCalculation();
  }, 150); // 150ms Debounce
}

function requestLowResPreview() {
  const calcId = ++lastCalcId;
  worker.postMessage({
    type: 'calculate',
    id: calcId,
    resolution: 'low', // 10cm Grid
    aps: getAPConfig(),
    walls: getWallData(),
    bounds: getFloorplanBounds(),
  });
}

function requestHighResCalculation() {
  const calcId = ++lastCalcId;
  worker.postMessage({
    type: 'calculate',
    id: calcId,
    resolution: 'high', // 5cm Grid
    aps: getAPConfig(),
    walls: getWallData(),
    bounds: getFloorplanBounds(),
  });
}

// Worker-Antwort: Nur neueste Berechnung anzeigen
worker.onmessage = (e) => {
  if (e.data.id !== lastCalcId) return; // Veraltete Berechnung verwerfen
  updateHeatmapLayer(e.data.imageData);
};
```

#### Zwei-Stufen-Rendering

1. **Waehrend Drag (Echtzeit):** 10cm Grid, sofortige Antwort (< 30ms)
2. **Nach Drag-Ende (150ms Debounce):** 5cm Grid, hochaufloesend (< 100ms)

#### Inkrementelle Updates vs. Neuberechnung

**Empfehlung: Vollstaendige Neuberechnung.** Gruende:
- Bei typischen Grundrissen (< 100m²) dauert die Berechnung < 50ms im WebWorker
- Inkrementelle Updates sind komplex (Abhaengigkeiten zwischen Gridpunkten durch Interpolation)
- Der WebWorker blockiert den Main-Thread nicht
- Die Komplexitaet einer inkrementellen Loesung rechtfertigt den minimalen Zeitgewinn nicht

### 3.6 OffscreenCanvas und WebWorker

#### Verfuegbarkeit (Tauri 2 Kontext)

| Plattform | WebView | OffscreenCanvas | SharedArrayBuffer |
|-----------|---------|-----------------|-------------------|
| macOS | WKWebView (Safari 16.4+) | Ja | Ja (mit COOP/COEP Headers) |
| Windows | Edge WebView2 (Chromium) | Ja | Ja (mit COOP/COEP Headers) |
| Linux | WebKitGTK | Ja (neuere Versionen) | Eingeschraenkt |

#### Empfohlener Ansatz: Transferable ArrayBuffer

```typescript
// --- Worker (heatmap-worker.ts) ---
self.onmessage = (e: MessageEvent) => {
  const { id, width, height, aps, walls, bounds } = e.data;

  // Neuen Buffer erstellen
  const buffer = new ArrayBuffer(width * height * 4);
  const pixels = new Uint32Array(buffer);

  // RF-Berechnung durchfuehren...
  calculateHeatmap(pixels, width, height, aps, walls, bounds);

  // Buffer zurueck transferieren (Zero-Copy)
  self.postMessage(
    { id, buffer, width, height },
    [buffer] // Transferable: Buffer wird verschoben, nicht kopiert
  );
};

// --- Main Thread ---
worker.onmessage = (e) => {
  const { id, buffer, width, height } = e.data;
  if (id !== lastCalcId) return;

  // ImageData aus transferiertem Buffer erstellen
  const clampedArray = new Uint8ClampedArray(buffer);
  const imageData = new ImageData(clampedArray, width, height);

  // Auf Off-Screen Canvas zeichnen, dann als Konva.Image verwenden
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);

  heatmapImage.image(tempCanvas);
  heatmapLayer.batchDraw();
};
```

**Warum Transferable statt SharedArrayBuffer:**
- Einfacheres Programmiermodell (kein Race-Condition-Risiko)
- Keine COOP/COEP-Header noetig (problematisch in manchen Tauri-Konfigurationen)
- Zero-Copy-Transfer: ArrayBuffer wird verschoben, nicht kopiert
- Ausreichend performant fuer unseren Use Case (Transfer < 1ms fuer 200KB Buffer)

### 3.7 Heatmap-Libraries Bewertung

| Library | Typ | Eignung | Anmerkung |
|---------|-----|---------|-----------|
| **simpleheat** | Canvas (Point-based) | Nicht geeignet | Fuer Punkt-Heatmaps (z.B. Click-Maps), nicht fuer Grid-basierte RF-Signalstaerke |
| **heatmap.js** | Canvas (Point-based) | Nicht geeignet | Gleicher Grund wie simpleheat |
| **visual-heatmap** | WebGL (Point-based) | Nicht geeignet | WebGL-basiert, fuer Massendaten (500K+ Punkte), Overkill fuer unser Grid |
| **webgl-heatmap** | WebGL (Point-based) | Nicht geeignet | GPU-Shader-basiert, fuer Live-Telemetrie |
| **Eigene Loesung** | ImageData + LUT | **Empfohlen** | Volle Kontrolle, einfach, performant genug |

**Begruendung:** Alle existierenden Heatmap-Libraries sind fuer *Punkt-basierte* Heatmaps optimiert (viele Datenpunkte, radiale Ausbreitung). Unser Use Case ist *Grid-basiert*: Fuer jeden Punkt im Raster wird ein exakter RSSI-Wert berechnet. Eine eigene Loesung mit ImageData + Farb-Lookup-Table ist einfacher, schneller und passt besser.

---

## 4. Performance-Optimierung

### 4.1 Spatial Index fuer Wand-Intersection-Tests

#### Problem
Fuer jeden Gridpunkt muss geprueft werden, welche Waende zwischen dem Punkt und jedem AP liegen. Naive Loesung: O(gridpoints * APs * walls). Bei 40.000 Gridpunkten, 3 APs und 50 Waenden = 6 Mio. Intersection-Tests.

#### Loesung: Uniform Grid (einfacher als Quadtree)

Fuer typische Grundrisse (< 200m², < 100 Waende) ist ein einfaches Uniform Grid effizienter als ein Quadtree, da der Overhead des Quadtree-Aufbaus den Vorteil bei wenigen Objekten aufwiegt.

```typescript
interface SpatialGrid {
  cellSize: number; // z.B. 1 Meter
  cells: Map<string, WallSegment[]>;
}

function buildSpatialGrid(walls: WallSegment[], cellSize: number): SpatialGrid {
  const grid: SpatialGrid = { cellSize, cells: new Map() };
  for (const wall of walls) {
    // Alle Zellen finden, die die Wand kreuzt (Bresenham-aehnlich)
    const cells = getCellsAlongLine(wall.start, wall.end, cellSize);
    for (const cellKey of cells) {
      if (!grid.cells.has(cellKey)) grid.cells.set(cellKey, []);
      grid.cells.get(cellKey)!.push(wall);
    }
  }
  return grid;
}

function getWallsAlongRay(
  grid: SpatialGrid, from: Point, to: Point
): WallSegment[] {
  // Nur Waende in Zellen pruefen, die der Strahl durchquert
  const cellKeys = getCellsAlongLine(from, to, grid.cellSize);
  const candidateWalls = new Set<WallSegment>();
  for (const key of cellKeys) {
    const walls = grid.cells.get(key);
    if (walls) walls.forEach(w => candidateWalls.add(w));
  }
  return [...candidateWalls];
}
```

#### Performance-Gewinn

| Szenario | Ohne Spatial Index | Mit Spatial Index |
|----------|-------------------|-------------------|
| 50 Waende, 10K Grid, 3 APs | ~1.5M Tests | ~100K Tests |
| 50 Waende, 40K Grid, 3 APs | ~6M Tests | ~400K Tests |
| 100 Waende, 40K Grid, 5 APs | ~20M Tests | ~800K Tests |

Typische Reduktion: 85-95% weniger Intersection-Tests.

### 4.2 Line-Segment-Intersection (Kern-Algorithmus)

```typescript
// Effiziente 2D-Linien-Intersection
function lineSegmentIntersects(
  p1: Point, p2: Point, // Strahl (AP -> Gridpunkt)
  p3: Point, p4: Point  // Wand-Segment
): boolean {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false; // Parallel

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
```

### 4.3 LOD (Level of Detail) bei Zoom

| Zoom-Level | Grid-Schritt | Anwendung |
|-----------|-------------|-----------|
| < 50% | 20 cm | Uebersicht, grobes Bild |
| 50-100% | 10 cm | Normal-Ansicht |
| 100-200% | 5 cm | Detail-Ansicht |
| > 200% | 2.5 cm | Maximale Aufloesung |

```typescript
function getGridStepForZoom(zoomLevel: number): number {
  if (zoomLevel < 0.5) return 0.20; // 20 cm
  if (zoomLevel < 1.0) return 0.10; // 10 cm
  if (zoomLevel < 2.0) return 0.05; // 5 cm
  return 0.025; // 2.5 cm
}
```

### 4.4 Caching-Strategien

#### Wand-Daten Cache
Wand-Konfiguration aendert sich selten. Der Spatial Index und vorberechnete Wand-Daten werden gecacht und nur bei Wand-Aenderungen neu berechnet.

#### Heatmap-Tile-Cache (Post-MVP)
Fuer sehr grosse Grundrisse: Heatmap in Kacheln (Tiles) aufteilen. Nur sichtbare Tiles berechnen. Bei AP-Verschiebung nur betroffene Tiles neu berechnen.

#### Konva Layer-Cache
`heatmapLayer.cache()` nach jedem Heatmap-Update. Konva zeichnet dann das gecachte Bild statt die Shapes neu zu rendern.

### 4.5 Web Worker Architektur

```
Main Thread                       Worker Thread
┌──────────────┐                  ┌──────────────────────┐
│              │   postMessage    │                      │
│  UI Events   │ ───────────────> │  RF Calculation      │
│  (AP drag,   │   {aps, walls,  │  Engine              │
│   wall edit) │    bounds,       │                      │
│              │    resolution}   │  - Spatial Grid      │
│              │                  │  - Path Loss Model   │
│  Heatmap     │   postMessage   │  - Wall Intersection │
│  Layer       │ <─────────────── │  - Color LUT         │
│  Update      │   {imageData}   │  - ImageData Fill    │
│              │   (Transferable) │                      │
└──────────────┘                  └──────────────────────┘
```

**Vorteile des Worker-Ansatzes:**
- Main Thread bleibt fuer UI-Interaktionen frei (kein Ruckeln bei AP-Drag)
- RF-Berechnung kann voll parallelisiert werden
- Transferable ArrayBuffer: Quasi-Zero-Copy-Datentransfer (~0.1ms fuer 320KB)

---

## 5. Konkrete Code-Patterns

### 5.1 Multi-Layer Setup (Svelte 5 + Konva)

```svelte
<!-- FloorplanEditor.svelte -->
<script lang="ts">
  import { Stage, Layer, Image as KonvaImage } from 'svelte-konva';
  import Konva from 'konva';

  // Reactive state (Svelte 5 runes)
  let stageWidth = $state(window.innerWidth);
  let stageHeight = $state(window.innerHeight);
  let stageScale = $state(1);
  let stageX = $state(0);
  let stageY = $state(0);

  // Layer references
  let floorplanLayer: Konva.Layer;
  let heatmapLayer: Konva.Layer;
  let uiLayer: Konva.Layer;

  // Heatmap image source (updated from worker)
  let heatmapCanvas: HTMLCanvasElement | null = $state(null);

  // Zoom handler
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage()!;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.1, Math.min(10, newScale));

    stageScale = clampedScale;
    stageX = pointer.x - mousePointTo.x * clampedScale;
    stageY = pointer.y - mousePointTo.y * clampedScale;
  }
</script>

<Stage
  width={stageWidth}
  height={stageHeight}
  scaleX={stageScale}
  scaleY={stageScale}
  x={stageX}
  y={stageY}
  draggable
  onwheel={handleWheel}
>
  <!-- Layer 1: Grundriss (Waende, Raeume, Hintergrund-Bild) -->
  <Layer bind:handle={floorplanLayer}>
    <BackgroundImage />
    <WallShapes />
    <RoomLabels />
  </Layer>

  <!-- Layer 2: Heatmap (Semi-transparentes Overlay) -->
  <Layer bind:handle={heatmapLayer} listening={false} opacity={0.65}>
    {#if heatmapCanvas}
      <KonvaImage image={heatmapCanvas} x={0} y={0} />
    {/if}
  </Layer>

  <!-- Layer 3: UI-Elemente (APs, Cursor, Messgitter) -->
  <Layer bind:handle={uiLayer}>
    <AccessPointMarkers />
    <DrawingCursor />
    <ScaleIndicator />
  </Layer>
</Stage>
```

### 5.2 Wand-Zeichnung mit Snap

```svelte
<!-- WallDrawingTool.svelte -->
<script lang="ts">
  import { Line, Circle } from 'svelte-konva';
  import type { WallSegment, Point } from '$lib/types';

  interface Props {
    walls: WallSegment[];
    gridSize: number; // Pixel
    snapDistance: number; // Pixel
    isDrawing: boolean;
  }
  let { walls = $bindable(), gridSize, snapDistance, isDrawing } = $props<Props>();

  let currentStart: Point | null = $state(null);
  let previewEnd: Point | null = $state(null);
  let selectedMaterial = $state<WallMaterial>('brick');

  // Snap to grid
  function snapToGrid(pos: Point): Point {
    return {
      x: Math.round(pos.x / gridSize) * gridSize,
      y: Math.round(pos.y / gridSize) * gridSize,
    };
  }

  // Snap to existing endpoint
  function snapToEndpoint(pos: Point, walls: WallSegment[]): Point | null {
    for (const wall of walls) {
      for (const endpoint of [wall.start, wall.end]) {
        const dist = Math.hypot(pos.x - endpoint.x, pos.y - endpoint.y);
        if (dist < snapDistance) {
          return { ...endpoint };
        }
      }
    }
    return null;
  }

  // Best snap position
  function getSnappedPosition(rawPos: Point): Point {
    // Prioritaet 1: Existing endpoint
    const endpointSnap = snapToEndpoint(rawPos, walls);
    if (endpointSnap) return endpointSnap;

    // Prioritaet 2: Grid
    return snapToGrid(rawPos);
  }

  function handleStageClick(pos: Point) {
    if (!isDrawing) return;
    const snapped = getSnappedPosition(pos);

    if (!currentStart) {
      // Erster Klick: Start setzen
      currentStart = snapped;
    } else {
      // Zweiter Klick: Wand fertigstellen
      walls = [...walls, {
        id: crypto.randomUUID(),
        start: currentStart,
        end: snapped,
        material: selectedMaterial,
        thickness: MATERIAL_DEFAULTS[selectedMaterial].thickness,
      }];
      // Naechste Wand startet am Endpunkt
      currentStart = snapped;
    }
  }

  function handleMouseMove(pos: Point) {
    if (!isDrawing || !currentStart) return;
    previewEnd = getSnappedPosition(pos);
  }
</script>

<!-- Bestehende Waende rendern -->
{#each walls as wall (wall.id)}
  <Line
    points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
    stroke={WALL_STYLES[wall.material].stroke}
    strokeWidth={WALL_STYLES[wall.material].strokeWidth}
    dash={WALL_STYLES[wall.material].dash}
    hitStrokeWidth={20}
  />
{/each}

<!-- Preview-Linie waehrend Zeichnung -->
{#if currentStart && previewEnd}
  <Line
    points={[currentStart.x, currentStart.y, previewEnd.x, previewEnd.y]}
    stroke="#0088FF"
    strokeWidth={2}
    dash={[5, 5]}
    listening={false}
  />
  <!-- Snap-Punkt Indikator -->
  <Circle
    x={previewEnd.x}
    y={previewEnd.y}
    radius={4}
    fill="#0088FF"
    listening={false}
  />
{/if}
```

### 5.3 Heatmap-Overlay mit ImageData (Web Worker)

```typescript
// --- heatmap-worker.ts ---
import type { APConfig, WallData, Bounds } from './types';

interface CalcRequest {
  id: number;
  aps: APConfig[];
  walls: WallData[];
  bounds: Bounds;
  gridStep: number; // Meter
  outputWidth: number; // Pixel
  outputHeight: number;
}

// Farb-Lookup-Table (einmal initialisiert)
let colorLUT: Uint32Array;

function initColorLUT(): void {
  colorLUT = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    // i=0 -> -100dBm, i=255 -> -30dBm
    const t = i / 255; // [0, 1]
    let r: number, g: number, b: number, a: number;

    if (t < 0.21) {
      // Dunkelrot -> Rot
      const lt = t / 0.21;
      r = 128 + lt * 127;
      g = 0; b = 0;
    } else if (t < 0.36) {
      // Rot -> Orange
      const lt = (t - 0.21) / 0.15;
      r = 255; g = lt * 165; b = 0;
    } else if (t < 0.50) {
      // Orange -> Gelb
      const lt = (t - 0.36) / 0.14;
      r = 255; g = 165 + lt * 90; b = 0;
    } else if (t < 0.71) {
      // Gelb -> Gruen
      const lt = (t - 0.50) / 0.21;
      r = 255 * (1 - lt); g = 255; b = 0;
    } else {
      // Gruen -> Dunkelgruen
      const lt = (t - 0.71) / 0.29;
      r = 0; g = 255 - lt * 127; b = 0;
    }

    a = i > 5 ? 180 : 0; // Transparent wenn kein Signal

    // Little-Endian ABGR Format
    colorLUT[i] = (a << 24) | (Math.round(b) << 16)
                | (Math.round(g) << 8) | Math.round(r);
  }
}

function calculateHeatmap(request: CalcRequest): void {
  if (!colorLUT) initColorLUT();

  const { id, aps, walls, bounds, gridStep, outputWidth, outputHeight } = request;

  // 1. Grid berechnen
  const gridW = Math.ceil((bounds.maxX - bounds.minX) / gridStep);
  const gridH = Math.ceil((bounds.maxY - bounds.minY) / gridStep);
  const rssiGrid = new Float32Array(gridW * gridH);

  // 2. Spatial Index fuer Waende aufbauen
  const spatialGrid = buildSpatialGrid(walls, 1.0); // 1m Zellen

  // 3. Fuer jeden Gridpunkt RSSI berechnen
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const px = bounds.minX + gx * gridStep; // Meter
      const py = bounds.minY + gy * gridStep;

      let bestRSSI = -200; // Worst case

      for (const ap of aps) {
        const dist = Math.hypot(px - ap.x, py - ap.y);
        if (dist < 0.1) { bestRSSI = ap.txPower + ap.antennaGain; continue; }

        // Wand-Daempfung berechnen
        const intersectingWalls = getWallsAlongRay(
          spatialGrid, { x: ap.x, y: ap.y }, { x: px, y: py }
        );
        let wallLoss = 0;
        for (const w of intersectingWalls) {
          if (lineSegmentIntersects(ap.x, ap.y, px, py,
              w.start.x, w.start.y, w.end.x, w.end.y)) {
            wallLoss += MATERIAL_ATTENUATION[w.material];
          }
        }

        // ITU-R P.1238 Path Loss
        const freq = ap.band === '2.4GHz' ? 2.4 : 5.0;
        const pl1m = freq === 2.4 ? 40.05 : 46.42;
        const n = 3.5; // Pfadverlust-Exponent Wohngebaeude
        const pathLoss = pl1m + 10 * n * Math.log10(dist) + wallLoss;

        const rssi = ap.txPower + ap.antennaGain - 3 - pathLoss; // -3dBi Smartphone
        bestRSSI = Math.max(bestRSSI, rssi);
      }

      rssiGrid[gy * gridW + gx] = bestRSSI;
    }
  }

  // 4. ImageData erzeugen (mit bilinearer Interpolation)
  const buffer = new ArrayBuffer(outputWidth * outputHeight * 4);
  const pixels = new Uint32Array(buffer);

  for (let py = 0; py < outputHeight; py++) {
    for (let px = 0; px < outputWidth; px++) {
      const nx = px / outputWidth;
      const ny = py / outputHeight;
      const rssi = bilinearInterpolate(rssiGrid, gridW, gridH, nx, ny);

      // RSSI -> Index (0-255): -100dBm=0, -30dBm=255
      const idx = Math.max(0, Math.min(255,
        Math.round((rssi + 100) * (255 / 70))
      ));
      pixels[py * outputWidth + px] = colorLUT[idx];
    }
  }

  // 5. Buffer zurueck transferieren
  self.postMessage({ id, buffer, outputWidth, outputHeight }, [buffer]);
}

self.onmessage = (e: MessageEvent<CalcRequest>) => {
  calculateHeatmap(e.data);
};
```

### 5.4 Zoom/Pan Handler (Svelte 5)

```svelte
<!-- ZoomPanController.svelte -->
<script lang="ts">
  import type Konva from 'konva';

  interface Props {
    minScale?: number;
    maxScale?: number;
    scaleStep?: number;
  }
  let { minScale = 0.1, maxScale = 10, scaleStep = 1.05 } = $props<Props>();

  // Exported state (bound to Stage)
  let scale = $state(1);
  let x = $state(0);
  let y = $state(0);

  // Zoom-Level als Prozent (fuer UI-Anzeige)
  let zoomPercent = $derived(Math.round(scale * 100));

  // Scroll-Wheel Zoom
  export function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage()!;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0
      ? oldScale * scaleStep
      : oldScale / scaleStep;

    scale = Math.max(minScale, Math.min(maxScale, newScale));
    x = pointer.x - mousePointTo.x * scale;
    y = pointer.y - mousePointTo.y * scale;
  }

  // Programmatischer Zoom (fuer Toolbar-Buttons)
  export function zoomTo(targetScale: number, centerX?: number, centerY?: number) {
    const cx = centerX ?? window.innerWidth / 2;
    const cy = centerY ?? window.innerHeight / 2;

    const mousePointTo = {
      x: (cx - x) / scale,
      y: (cy - y) / scale,
    };

    scale = Math.max(minScale, Math.min(maxScale, targetScale));
    x = cx - mousePointTo.x * scale;
    y = cy - mousePointTo.y * scale;
  }

  // Zoom auf gesamten Grundriss
  export function fitToScreen(
    boundsWidth: number, boundsHeight: number,
    stageWidth: number, stageHeight: number,
    padding: number = 50
  ) {
    const scaleX = (stageWidth - 2 * padding) / boundsWidth;
    const scaleY = (stageHeight - 2 * padding) / boundsHeight;
    scale = Math.min(scaleX, scaleY, maxScale);
    x = (stageWidth - boundsWidth * scale) / 2;
    y = (stageHeight - boundsHeight * scale) / 2;
  }
</script>
```

---

## 6. Empfehlung

### Gesamtarchitektur

```
┌─────────────────────────────────────────────────────────┐
│                  Svelte 5 + Tauri 2                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              svelte-konva (v1.x)                   │  │
│  │                                                    │  │
│  │  Stage (Zoom/Pan via scale + position)             │  │
│  │  ├── Layer 1: Grundriss                            │  │
│  │  │   ├── Konva.Image (Hintergrund-Bild)           │  │
│  │  │   ├── Konva.Line[] (Waende, styled)            │  │
│  │  │   ├── Konva.Text[] (Raum-Labels)               │  │
│  │  │   └── Konva.Line[] (Tueren/Fenster)            │  │
│  │  │                                                 │  │
│  │  ├── Layer 2: Heatmap (listening=false)            │  │
│  │  │   └── Konva.Image (von WebWorker berechnet)    │  │
│  │  │       Opacity: 0.6-0.7, per Slider anpassbar   │  │
│  │  │                                                 │  │
│  │  └── Layer 3: UI-Overlays                          │  │
│  │      ├── Konva.Group[] (AP-Marker, draggable)     │  │
│  │      ├── Konva.Circle[] (Snap-Indikatoren)        │  │
│  │      ├── Konva.Line (Zeichnungs-Preview)          │  │
│  │      └── Konva.Group (Massstab-Leiste)            │  │
│  └────────────────────────────────────────────────────┘  │
│                         │                                 │
│                    Transferable                           │
│                    ArrayBuffer                            │
│                         │                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Web Worker: RF-Engine                     │  │
│  │                                                     │  │
│  │  - Spatial Grid fuer Wand-Lookups                  │  │
│  │  - ITU-R P.1238 Path Loss Model                    │  │
│  │  - Bilineare Interpolation                         │  │
│  │  - Farb-LUT (Uint32Array)                          │  │
│  │  - ImageData-Generierung                           │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Zusammenfassung der Entscheidungen

| Entscheidung | Wahl | Begruendung |
|-------------|------|-------------|
| Canvas-Library | **Konva.js + svelte-konva** | Beste Svelte-5-Integration, Layer-System, Hit-Detection, aktive Wartung |
| Heatmap-Rendering | **Eigene ImageData + Farb-LUT** | Point-based Libraries ungeeignet, volle Kontrolle, performant |
| Heatmap-Berechnung | **Web Worker + Transferable** | Main Thread frei, Zero-Copy-Transfer, kein COOP/COEP noetig |
| Spatial Index | **Uniform Grid** | Einfacher als Quadtree, ausreichend fuer < 200 Waende |
| Interpolation | **Bilinear** | Guter Kompromiss zwischen Qualitaet und Geschwindigkeit |
| Zoom/Pan | **Konva Stage scale + position** | Eingebaut, pointer-relative, performant |
| Import (MVP) | **Bild als Hintergrund** | Einfachste Loesung, reicht fuer MVP |
| Export | **PNG via toDataURL + PDF via jsPDF** | Kein SVG noetig fuer Heatmaps |

### Risiken und Mitigations

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| Tauri WebView GPU-Probleme | Mittel | Kein WebGL fuer Heatmap, nur Canvas 2D |
| svelte-konva Bugs mit Svelte 5 | Niedrig | Fallback: direkte Konva-API-Nutzung |
| Heatmap zu langsam bei grossen Grundrissen | Niedrig | LOD-System, Tile-basiertes Caching |
| OffscreenCanvas nicht verfuegbar | Sehr niedrig | Fallback: Standard Canvas in Worker |
| Wand-Intersection Performance | Niedrig | Spatial Grid reduziert Tests um 90%+ |

---

## 7. Quellen

### Canvas-Libraries
- [Konva.js Offizielle Dokumentation](https://konvajs.org/docs/index.html)
- [Konva.js GitHub Repository](https://github.com/konvajs/konva)
- [svelte-konva GitHub Repository](https://github.com/konvajs/svelte-konva)
- [Konva.js Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [Konva.js Layer Management](https://konvajs.org/docs/performance/Layer_Management.html)
- [Konva.js Object Snapping](https://konvajs.org/docs/sandbox/Objects_Snapping.html)
- [Konva.js Zoom Relative to Pointer](https://konvajs.org/docs/sandbox/Zooming_Relative_To_Pointer.html)
- [Konva.js OffscreenCanvas/WebWorker](https://konvajs.org/docs/sandbox/Web_Worker.html)
- [Konva.js High Quality Export](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html)
- [Fabric.js Dokumentation](https://fabricjs.com/docs/core-concepts/)
- [Fabric.js GitHub Releases](https://github.com/fabricjs/fabric.js/releases)
- [PixiJS v8 Launch Blog](https://pixijs.com/blog/pixi-v8-launches)
- [PixiJS GitHub Repository](https://github.com/pixijs/pixijs)
- [Konva.js vs Fabric.js Vergleich (DEV Community)](https://dev.to/lico/react-comparison-of-js-canvas-libraries-konvajs-vs-fabricjs-1dan)
- [Konva.js vs Fabric.js (Medium)](https://medium.com/@www.blog4j.com/konva-js-vs-fabric-js-in-depth-technical-comparison-and-use-case-analysis-9c247968dd0f)
- [Best of JS: Konva](https://bestofjs.org/projects/konva)
- [Best of JS: Fabric.js](https://bestofjs.org/projects/fabricjs)

### Heatmap-Rendering
- [simpleheat (GitHub)](https://github.com/mourner/simpleheat)
- [webgl-heatmap (GitHub)](https://github.com/pyalot/webgl-heatmap)
- [visual-heatmap (GitHub)](https://github.com/nswamy14/visual-heatmap)
- [javascript-bilinear-heatmap (GitHub)](https://github.com/26medias/javascript-bilinear-heatmap)
- [heatcanvas (GitHub)](https://github.com/sunng87/heatcanvas)
- [heatmap.js Internals](https://www.patrick-wied.at/blog/the-inner-life-of-heatmap-js)
- [Heatmap Color Gradients (NoskeWiki)](https://www.andrewnoske.com/wiki/Code_-_heatmaps_and_color_gradients)

### Performance & WebWorker
- [OffscreenCanvas (web.dev)](https://web.dev/articles/offscreen-canvas)
- [OffscreenCanvas (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [SharedArrayBuffer (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Faster Canvas Pixel Manipulation with Typed Arrays (Mozilla Hacks)](https://hacks.mozilla.org/2011/12/faster-canvas-pixel-manipulation-with-typed-arrays/)
- [Web Workers for Image Manipulation (SitePoint)](https://www.sitepoint.com/using-web-workers-to-improve-image-manipulation-performance/)
- [ray-quadtree (GitHub)](https://github.com/tmpvar/ray-quadtree)

### Grundriss & Import
- [Snap to Grid with Konva (Medium)](https://medium.com/@pierrebleroux/snap-to-grid-with-konvajs-c41eae97c13f)
- [2D Floor Plans with JavaScript (Coohom)](https://www.coohom.com/article/2d-floor-plan-javascript)
- [dxf NPM Package](https://www.npmjs.com/package/dxf)
- [Canvas-based SVG Designer (DEV Community)](https://dev.to/franksandqvist/making-a-canvas-based-svg-designer-app-that-exports-dxf-files-for-manufacturing-4gjo)

### Tauri
- [Tauri 2 Webview Versions](https://v2.tauri.app/reference/webview-versions/)
- [Tauri Canvas GPU Issues (GitHub #4891)](https://github.com/tauri-apps/tauri/issues/4891)
- [Tauri Architecture](https://v2.tauri.app/concept/architecture/)

### RF-Modellierung
- [Hamina Planner Heatmaps](https://docs.hamina.com/planner/basics/heatmaps)
- [WiFi Heatmapper (GitHub)](https://github.com/hnykda/wifi-heatmapper)
