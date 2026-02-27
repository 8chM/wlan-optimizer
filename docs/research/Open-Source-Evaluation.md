# Open-Source-Evaluation: WLAN-Planungs- und Analyse-Tools

> Phase 3b: Systematische Recherche und Bewertung existierender Open-Source-Loesungen
> Erstellt: 2026-02-27
> Status: Abgeschlossen

---

## Inhaltsverzeichnis

1. [WLAN-Planungstools (Open Source)](#1-wlan-planungstools-open-source)
2. [RF-Modellierungs-Libraries](#2-rf-modellierungs-libraries)
3. [Geometrie-Libraries (Ray Casting, Intersections)](#3-geometrie-libraries)
4. [iPerf-Wrapper Libraries](#4-iperf-wrapper-libraries)
5. [SNMP Libraries (AP-Steuerung)](#5-snmp-libraries)
6. [i18n Libraries (EN/DE)](#6-i18n-libraries)
7. [Heatmap/Visualisierungs-Libraries](#7-heatmapvisualisierungs-libraries)
8. [Zusammenfassung & Empfehlung](#8-zusammenfassung--empfehlung)

---

## 1. WLAN-Planungstools (Open Source)

### 1.1 wifi-planner (crazyman62) - WICHTIGSTER FUND

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/crazyman62/wifi-planner |
| **Stars** | 29 |
| **Sprache** | Python 100% |
| **Tech-Stack** | PySide6 (GUI), NumPy, OpenCV, ReportLab |
| **Lizenz** | Nicht spezifiziert (Achtung!) |
| **Letzte Aktivitaet** | 2025 (aktiv, Phase 3) |

**Features:**
- Multi-Floor-Support mit Signalausbreitungsmodellierung
- Grundriss-Import und Skalierungskalibrierung
- Wandzeichnung mit materialspezifischer Daempfung
- AP-Platzierung aus Hardware-Datenbank mit 3D-Antennenmustern
- Echtzeit-Heatmap mit Log-Distance Path Loss Modell
- Support fuer 2,4 / 5 / 6 GHz Baender
- Automatische Kanal-/Leistungszuweisung zur Interferenzminimierung
- PDF-Berichterstellung mit Bill of Materials
- Projekt speichern/laden (.wifi Dateien)
- Zoom, Pan, Undo/Redo, Snap-to-Grid

**Relevanz fuer unser Projekt: SEHR HOCH**
- Deckt fast identischen Funktionsumfang ab (Grundriss, Waende, APs, Heatmap)
- Gleicher Algorithmus (Log-Distance Path Loss)
- Kann als Referenzimplementierung fuer RF-Modell und Heatmap-Berechnung dienen
- **ABER**: Python/PySide6 - wir bauen eine Web/Desktop-App (Tauri/Svelte-Kandidat)
- **ABER**: Lizenz unklar - Wiederverwendung riskant ohne Klaerung

**Was koennen wir lernen:**
- Wanddaempfungs-Datenbank und Materialmodelle
- AP-Hardware-Datenbank-Struktur
- Heatmap-Berechnungsalgorithmus und Rasterung
- UI/UX fuer Grundriss-Editor (Zoom, Snap, Ghost Floor)
- PDF-Report-Generierung

---

### 1.2 python-wifi-survey-heatmap (jantman)

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/jantman/python-wifi-survey-heatmap |
| **Stars** | 466 (hoechste in dieser Kategorie) |
| **Sprache** | Python |
| **Tech-Stack** | wxPython, iperf3, libnl3, Docker |
| **Lizenz** | AGPL-3.0 (NICHT MIT-kompatibel!) |
| **Status** | Inaktiv - stabil, keine aktive Entwicklung |
| **Plattform** | Nur Linux |

**Features:**
- Interaktive Survey-Datenerfassung auf Grundriss
- Multi-Metrik-Heatmaps (Signalstaerke, Bandbreite, Jitter, Kanalauslastung)
- TCP/UDP-Messungen via iperf3
- AP-Scanning und Kanalanalyse
- Unterbrochene Surveys wieder aufnehmen
- Audio-Benachrichtigung bei Messabschluss

**Relevanz fuer unser Projekt: MITTEL**
- Reines Mess-Tool (keine Vorhersage/Simulation)
- AGPL-Lizenz schliesst direkte Code-Uebernahme aus
- Kann als Referenz fuer iPerf3-Integration und Messpunkt-Logik dienen
- Messpunkt-Platzierungs-UI ist relevant

---

### 1.3 wifi-heat-mapper / whm (Nischay-Pro)

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/Nischay-Pro/wifi-heat-mapper |
| **Stars** | 236 |
| **Sprache** | Python 100% |
| **Tech-Stack** | iperf3, matplotlib, NumPy, SciPy, PySimpleGUI |
| **Lizenz** | GPLv3 (NICHT MIT-kompatibel!) |

**Features:**
- GUI fuer Grundriss-Annotation und Datenerfassung
- Mehrere Diagrammtypen (automatisch gewaehlt)
- Heatmap mit konfigurierbaren Konturlevels und DPI
- Batch-Benchmarking ueber mehrere Standorte
- Konfigurationspersistenz via JSON
- Export: PNG, PDF, PS, EPS, SVG

**Relevanz fuer unser Projekt: NIEDRIG-MITTEL**
- Reines Mess-Tool, keine Vorhersage
- GPLv3 schliesst Code-Uebernahme aus
- SciPy-basierte Interpolation ist algorithmisch interessant

---

### 1.4 wifi-heatmapper (hnykda)

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/hnykda/wifi-heatmapper |
| **Stars** | 165 |
| **Sprache** | TypeScript 98,5% |
| **Tech-Stack** | Next.js, React, Tailwind CSS, Node.js v23+ |
| **Lizenz** | MIT (KOMPATIBEL!) |

**Features:**
- Browser-basierte Heatmap-Visualisierung
- WiFi-Signalstaerke-Messung an mehreren Orten
- Optionale Durchsatzmessung via iperf3
- Grundriss-Upload
- Cross-Platform (Windows, macOS, Linux)
- Lokale Datenhaltung (JSON)

**Relevanz fuer unser Projekt: MITTEL-HOCH**
- MIT-Lizenz erlaubt Wiederverwendung
- TypeScript/Next.js - nahe an unserem potentiellen Tech-Stack
- Web-basiertes UI-Konzept als Referenz
- Zeigt, dass iperf3-Integration in JS-Umgebung funktioniert

---

### 1.5 WiFiSurveyor (ecoAPM)

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/ecoAPM/WiFiSurveyor |
| **Stars** | 64 |
| **Sprache** | TypeScript 51,7%, C# 30,9% |
| **Tech-Stack** | Vue.js, WebGL, .NET SDK, SignalR, Vite |
| **Lizenz** | GPL-3.0 (NICHT MIT-kompatibel!) |

**Features:**
- Interaktive Grundriss-Overlays fuer Signalmapping
- Multi-SSID mit Frequenzfilterung (2,4/5 GHz)
- AP-Gruppierung
- JSON-basierte Datenpersistenz
- Cross-Platform
- WebGL-Visualisierung

**Relevanz fuer unser Projekt: NIEDRIG-MITTEL**
- GPL-Lizenz schliesst Code-Uebernahme aus
- WebGL-Heatmap-Ansatz ist interessant
- Vue.js/Vite-Architektur als Referenz

---

### 1.6 Weitere Tools (Kurzuebersicht)

| Tool | Stars | Sprache | Lizenz | Besonderheit |
|------|-------|---------|--------|-------------|
| [wifi-heatmap (benmwebb)](https://github.com/benmwebb/wifi-heatmap) | 35 | Python | GPL-3.0 | Minimal, macOS-only |
| [wifiheatmap (weimens)](https://github.com/weimens/wifiheatmap) | 9 | C++/QML | GPL-2.0 | CGAL-basiert, iperf3-Support |
| [wifi-planner-ga (rizkidoank)](https://github.com/rizkidoank/wifi-planner-ga) | 1 | N/A | GPL-3.0 | Genetischer Algorithmus fuer AP-Platzierung |
| [Wifi-Signal-Prediction (AadarshMishraa)](https://github.com/AadarshMishraa/Wifi-Signal-Prediction-and-Automatic-AP-Placement) | ~5 | Python | MIT | ML + Genetischer Algorithmus |

---

### 1.7 Zusammenfassung WLAN-Tools

**Kernerkenntnisse:**
1. **Kein Tool deckt unseren vollen Scope ab** - Alle existierenden Tools sind entweder reine Mess-Tools ODER reine Planungs-Tools, keines kombiniert beides mit einer Mixing Console
2. **wifi-planner (crazyman62) ist die naechste Referenz** - Fast identischer Planungsteil, aber Python/Desktop statt Web/Tauri
3. **Lizenzproblem**: Die meisten Tools sind GPL/AGPL - nur wifi-heatmapper (hnykda) und Wifi-Signal-Prediction sind MIT
4. **Unsere Alleinstellungsmerkmale bleiben bestehen**: Mixing Console, 3-Run-Messverfahren, Live-Forecast, iPerf3-Integration mit Heatmap-Kalibrierung

---

## 2. RF-Modellierungs-Libraries

### 2.1 Python-Oekosystem

#### PyLayers
| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/pylayers/pylayers |
| **Stars** | 201 |
| **Lizenz** | MIT |
| **Sprache** | Python (Jupyter Notebooks 93%, Python 7%) |
| **Status** | Akademisch, letztes Release 2014, aber 4.289 Commits |

**Features:**
- UWB Ray-Tracing (Verzoegerungen, DOA, DOD)
- Indoor-Radio-Coverage-Simulation
- Menschliche Mobilitaetssimulation
- Antennenmuster-Beschreibungen
- Heterogene Netzwerke

**Bewertung:** Akademisch exzellent, aber extrem komplex und nicht als Library nutzbar. Python-only. Fuer unseren Use Case (einfaches Log-Distance-Modell) massiv ueberdimensioniert.

#### scikit-rf
| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/scikit-rf/scikit-rf |
| **Lizenz** | BSD |
| **Fokus** | RF/Microwave Network Analysis |

**Bewertung:** **Nicht relevant.** Fokussiert auf Netzwerkanalyse (S-Parameter, VNA-Kalibrierung), nicht auf Indoor-Propagation.

#### RP-Sim (MatheusFerraroni)
| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/MatheusFerraroni/RP-Sim |
| **Stars** | 13 |
| **Lizenz** | AGPL-3.0 |
| **Sprache** | JavaScript 47,7%, SCSS/Less/CSS |

**Unterstuetzte Modelle:**
- SUI, Egli, Ericsson, Nakagami-m, Free Space, Okumura-Hata, Two Ray Ground
- Hindernisdaempfung und signalunterbrechende Hindernisse
- Modulare Modell-Architektur (leicht erweiterbar)

**Bewertung:** Interessant wegen JavaScript-Implementierung und modularer Architektur. AGPL-Lizenz verhindert direkte Nutzung, aber die Formelimplementierungen koennen als Referenz dienen. Kein ITU-R P.1238 Modell enthalten.

### 2.2 JavaScript/TypeScript-Oekosystem

**Ergebnis: Keine dedizierte Library gefunden.**

Es existiert keine npm-Bibliothek fuer Indoor-Pathloss-Berechnung. Die Formeln (ITU-R P.1238, Log-Distance) sind aber mathematisch einfach genug, um sie selbst zu implementieren:

```typescript
// Log-Distance Path Loss Model
function pathLoss(distance: number, frequency: number, n: number, wallLosses: number[]): number {
  const lambda = 299792458 / (frequency * 1e6); // Wellenlaenge in m
  const PL_1m = 20 * Math.log10(4 * Math.PI / lambda); // Freiraum bei 1m
  const PL_distance = PL_1m + 10 * n * Math.log10(distance);
  const wallAttenuation = wallLosses.reduce((sum, loss) => sum + loss, 0);
  return PL_distance + wallAttenuation;
}
```

### 2.3 Rust-Oekosystem

#### rf-signals (thebracket)
| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/thebracket/rf-signals |
| **Stars** | 29 |
| **Lizenz** | GPL-2.0 (NICHT MIT-kompatibel!) |
| **Sprache** | JavaScript 84,8%, Rust 11,6% |
| **Status** | Letzter Commit: Feb 2021 (inaktiv) |

**Modelle:** ITM3/Longley-Rice, HATA+COST123, ECC33, EGLI, Plane Earth, SOIL, SUI

**Bewertung:** Outdoor-fokussiert (WISP-Planung), GPL-Lizenz, inaktiv. Nicht nutzbar.

### 2.4 Empfehlung RF-Modellierung

**Selbst implementieren.** Gruende:
1. Keine passende Library in JavaScript/TypeScript vorhanden
2. Unser Modell (ITU-R P.1238 / Log-Distance) ist mathematisch trivial (~50 Zeilen Code)
3. Wandintersektions-Test ist der komplexe Teil (siehe Geometrie-Libraries)
4. Referenzimplementierung: wifi-planner (crazyman62) Python-Code als Algorithmus-Vorlage
5. Volle Kontrolle ueber Performance-Optimierung (Web Workers, WASM)

---

## 3. Geometrie-Libraries (Ray Casting, Intersections)

Fuer die Heatmap-Berechnung muessen wir fuer jeden Pixel den Signalweg vom AP zum Punkt berechnen und dabei alle durchquerten Waende identifizieren. Das erfordert effiziente Segment-Intersection-Tests.

### 3.1 flatten-js (@flatten-js/core)

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/alexbol99/flatten-js |
| **npm** | `@flatten-js/core` |
| **Stars** | 643 |
| **Lizenz** | MIT |
| **Version** | 1.6.10 (aktiv, letzte Veroeffentlichung vor 2 Monaten) |
| **TypeScript** | Ja (eingebaute Type Definitions) |
| **Formate** | CommonJS, UMD, ES6 Modules |

**Relevante Features:**
- Grundformen: Point, Vector, Line, Ray, Segment, Arc, Circle, Box, Polygon
- **Intersection Detection**: `.intersect(otherShape)` - Array von Intersection Points
- **DE-9IM Spatial Relations**: disjoint, equal, touch, inside, contain
- **Boolean Operations**: unify, subtract, intersect, innerClip, outerClip
- **Affine Transformations**: translate, rotate, scale
- **Planar Set**: Suchbarer Container mit Spatial Queries (R-Tree intern)
- SVG-Visualisierung

**Bewertung: ERSTE WAHL fuer unseren Use Case.**
- Ray-Segment-Intersection ist Kernfunktion
- Eingebauter Spatial Index (kein separates rbush noetig)
- MIT-Lizenz
- Aktiv maintained
- TypeScript-Support
- Alles-in-einem: Geometrie + Spatial Index + Intersections

### 3.2 rbush

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/mourner/rbush |
| **npm** | `rbush` |
| **Stars** | 2.700 |
| **Lizenz** | MIT |
| **Version** | 4.0.1 (August 2024) |

**Performance (1M Rechtecke):**
| Operation | Zeit |
|-----------|------|
| Insert 1M einzeln | 3,18s |
| 1000 Suchen (0,01% Flaeche) | 0,03s |
| Bulk-Insert 1M | 1,25s |

**Bewertung: NUR NOETIG falls flatten-js zu langsam.**
- flatten-js hat internen Spatial Index
- rbush ist optimaler fuer reine Bounding-Box-Queries
- Sinnvoll als Fallback fuer Performance-Optimierung

### 3.3 isect

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/anvaka/isect |
| **npm** | `isect` |
| **Stars** | 279 |
| **Lizenz** | MIT |
| **Version** | 3.0.2 |

**Algorithmen:**
1. **Bentley-Ottmann Sweep Line**: O(n*log(n) + k*log(n))
2. **Brute Force**: O(n^2) - erstaunlich schnell bei dichten Graphen
3. **Bush**: Spatial-Index-basiert mit flatbush

**Bewertung: NICHT NOETIG.**
- isect findet ALLE Intersections in einem Segment-Set
- Wir brauchen Ray-vs-Wall-Intersections (1 Ray gegen N Waende)
- flatten-js `.intersect()` ist dafuer besser geeignet

### 3.4 turf.js

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/Turfjs/turf |
| **npm** | `@turf/turf` |
| **Stars** | ~9.000 |
| **Lizenz** | MIT |
| **Version** | 7.3.4 |

**Bewertung: OVERKILL.**
- Geospatial-fokussiert (GeoJSON, Koordinatensysteme)
- Wir arbeiten mit Pixel-/Meter-Koordinaten, nicht mit Geo-Koordinaten
- Modularer Aufbau ist gut, aber unnoetige Abstraktion fuer unseren Fall
- Koennte fuer spaetere Features (Multi-Site, GPS-Referenzierung) relevant werden

### 3.5 Clipper2 (clipper2-ts)

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/countertype/clipper2-ts |
| **npm** | `@countertype/clipper2-ts` |
| **Lizenz** | Boost Software License (MIT-kompatibel) |

**Bewertung: NICHT NOETIG fuer MVP.**
- Polygon Clipping (Union, Intersection, Difference, XOR)
- Relevant wenn wir Raeume als Polygone modellieren wollen
- Fuer die Heatmap-Berechnung nicht erforderlich

### 3.6 Empfehlung Geometrie

| Prioritaet | Library | Zweck |
|------------|---------|-------|
| **Primaer** | `@flatten-js/core` | Alles: Geometrie, Intersections, Spatial Index |
| **Reserve** | `rbush` | Falls Performance-Bottleneck bei Spatial Queries |
| **Spaeter** | `@countertype/clipper2-ts` | Wenn Raum-Polygone benoetigt werden |

---

## 4. iPerf-Wrapper Libraries

### 4.1 Situation

Die Recherche zeigt: **Es gibt keinen etablierten, gut gewarteten npm-Wrapper fuer iperf3.**

| Ansatz | Status |
|--------|--------|
| Dedizierter npm-Wrapper | Nicht vorhanden / nicht gewartet |
| Python iperf3-Wrapper | `iperf3` auf PyPI (funktioniert, aber Python) |
| Rust riperf3 | Reimplementierung in Rust (experimentell) |
| Kubernetes iperf3 | Wrapper fuer K8s-Cluster (nicht relevant) |

### 4.2 Referenzprojekte mit iperf3-Integration

- **python-wifi-survey-heatmap**: Ruft iperf3 als Subprocess auf
- **wifi-heatmapper (hnykda)**: Node.js + iperf3 als externer Prozess
- **wifiheatmap (weimens)**: C++ + iperf3 direkt

### 4.3 Empfehlung iPerf-Integration

**Eigenen Wrapper schreiben.** Strategie:

```
Option A (Tauri/Rust Backend):
  - iperf3 als Subprocess aus Rust spawnen
  - JSON-Output parsen (iperf3 --json)
  - Ergebnisse ueber Tauri-Commands ans Frontend melden

Option B (Node.js Backend):
  - child_process.spawn('iperf3', [...args])
  - iperf3 --json Output streamen und parsen
  - Ergebnisse via WebSocket an Frontend

Empfohlen: Option A (Tauri)
  - Bessere Prozess-Kontrolle
  - Kein zusaetzlicher Node.js-Server noetig
  - iperf3 Binary kann mitgebundelt werden
```

**iperf3 JSON-Output-Format** ist gut dokumentiert und stabil. Der Wrapper ist einfach (~100 Zeilen).

---

## 5. SNMP Libraries (AP-Steuerung)

### 5.1 Node.js / JavaScript

#### net-snmp
| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/markabrahams/node-net-snmp |
| **npm** | `net-snmp` |
| **Stars** | 231 |
| **Lizenz** | MIT |
| **Version** | 3.26.1 (letzte Veroeffentlichung: ~Jan 2026) |
| **Downloads** | 52 abhaengige Projekte im npm-Registry |

**Features:**
- SNMPv1, v2c, v3
- Alle Operationen: Get, GetNext, GetBulk, Set, Trap, Inform
- SNMPv3 Auth (MD5/SHA) und Privacy (DES/AES)
- MIB-Parsing und OID-Uebersetzung
- Agent mit MIB-Management
- AgentX Subagent
- IPv4 und IPv6

**Bewertung: KLARE ERSTE WAHL.**
- Aktiv maintained (letzte Version vor ~1 Monat)
- Vollstaendige SNMP-Implementierung
- MIT-Lizenz
- Einzige ernsthafte Option im Node.js-Oekosystem

#### snmp-native
| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://github.com/calmh/node-snmp-native |
| **npm** | `snmp-native` |
| **Version** | 1.2.0 (letzte Veroeffentlichung: ~2018) |

**Bewertung: NICHT EMPFOHLEN.** 7 Jahre ohne Update, keine SNMPv3-Unterstuetzung.

### 5.2 Rust

| Crate | Beschreibung | Status |
|-------|-------------|--------|
| `rasn-snmp` | Pure Rust SNMP (v0.28.8, 79 Versionen) | **Aktiv** - 2024 Edition |
| `modern_snmp` | Pure Rust SNMPv3 | Experimentell |
| `netsnmp-sys` | FFI-Bindings zu libnetsnmp | Low-level |
| `snmp2` | Fork des Original-snmp-Crates | Teil von RoboPLC |

**Empfehlung Rust:** `rasn-snmp` ist die beste Option - aktiv gewartet, pure Rust, safe.

### 5.3 Empfehlung SNMP

| Szenario | Empfehlung |
|----------|-----------|
| **Tauri + Rust Backend** | `rasn-snmp` (pure Rust, aktiv) |
| **Node.js Backend** | `net-snmp` (MIT, vollstaendig, aktiv) |
| **Hybrid** | SNMP im Rust-Backend via rasn-snmp, Ergebnisse ans Frontend |

---

## 6. i18n Libraries (EN/DE)

### 6.1 Vergleich fuer Svelte 5

| Kriterium | paraglide-js | svelte-i18n | typesafe-i18n |
|-----------|-------------|-------------|---------------|
| **URL** | [GitHub](https://github.com/opral/paraglide-js) | [GitHub](https://github.com/kaisermann/svelte-i18n) | [GitHub](https://github.com/codingcommons/typesafe-i18n) |
| **Stars** | 250 | ~1.800 | ~2.000 |
| **Lizenz** | MIT | MIT | MIT |
| **Ansatz** | Compile-time | Runtime | Compile-time |
| **Bundle Size** | ~47 KB (70% kleiner) | ~205 KB | Aehnlich paraglide |
| **TypeScript** | Voll typesafe | Teilweise | Voll typesafe |
| **Svelte 5** | Offiziell unterstuetzt | Funktioniert (mit Einschraenkungen) | Nicht getestet |
| **Maintenance** | Aktiv (42 Contributors) | Eingeschraenkt aktiv | **UNMAINTAINED** (Autor verstorben) |
| **SvelteKit** | Offizielle Integration | Community-Integration | Community-Integration |

### 6.2 Detail-Analyse

#### paraglide-js (Inlang)
- **Offiziell von SvelteKit empfohlen** (`svelte.dev/docs/cli/paraglide`)
- Compiler-basiert: Generiert tree-shakable Funktionen
- Autocomplete fuer Message-Keys und Parameter
- Tippfehler werden zu Compile-Errors
- i18n-Routing mit URL-basierter Locale-Erkennung
- Integration mit Inlang-Oekosystem (Sherlock VS Code Extension, Fink Editor)
- Unterstuetzt ICU MessageFormat

#### svelte-i18n
- Runtime-basiert mit Svelte Stores
- ICU Message Syntax (via formatjs)
- Svelte 5 Peer-Dependency nur fuer v3/v4 deklariert
- Funktioniert in Praxis mit Svelte 5 (`npm i --force`)
- Singleton-Architektur (geplante Umstellung auf Instanzen)

#### typesafe-i18n
- **UNMAINTAINED** - Autor Ivan Hofer ist verstorben
- War technisch exzellent (100% typesafe, compile-time)
- paraglide-js ist der geistige Nachfolger
- Kann noch funktionieren, aber keine Bugfixes oder Updates

### 6.3 Empfehlung i18n

**Klare Empfehlung: paraglide-js**

Gruende:
1. Offiziell von SvelteKit empfohlen
2. Compile-time = kleinstes Bundle, beste Performance
3. Voll typesafe mit Autocomplete
4. Aktiv maintained mit 42 Contributors
5. MIT-Lizenz
6. Svelte 5 kompatibel

---

## 7. Heatmap/Visualisierungs-Libraries

### 7.1 Vergleich

| Kriterium | simpleheat | heatmap.js (h337) | deck.gl |
|-----------|-----------|-------------------|---------|
| **URL** | [GitHub](https://github.com/mourner/simpleheat) | [GitHub](https://github.com/pa7/heatmap.js) | [GitHub](https://github.com/visgl/deck.gl) |
| **Stars** | 952 | 6.400 | ~12.000 |
| **Lizenz** | BSD-2-Clause | MIT | MIT |
| **Groesse** | ~2 KB (winzig) | ~15 KB | ~1 MB+ |
| **Rendering** | Canvas 2D | Canvas 2D | WebGL (GPU) |
| **Dependencies** | Keine | Keine | Viele (React, luma.gl, ...) |
| **Letzte Aktivitaet** | Stabil (nicht aktiv entwickelt) | Letzte Release 2016 | Sehr aktiv |
| **Genutzt von** | 1.200 Repos (Leaflet.heat) | Community-Plugins | Enterprise/GIS |

### 7.2 Detail-Analyse

#### simpleheat
- **Winzig** - Single-File-Implementierung
- API: `data()`, `max()`, `add()`, `clear()`, `radius()`, `gradient()`, `draw()`
- Canvas-basiert, konfigurierbare Punkt-/Blur-Radien
- Basis fuer Leaflet.heat (weit verbreitet)
- Vom gleichen Autor wie rbush (Vladimir Agafonkin / Mapbox)

#### heatmap.js (h337)
- Feature-reicher als simpleheat
- Plugins fuer Google Maps, Leaflet, OpenLayers
- Konfigurierbar: Container, Background, Gradient, Radius, Opacity
- Letztes Release 2016 - de facto nicht mehr aktiv maintained
- Community-Forks existieren

#### deck.gl
- **WebGL-basiert** (GPU-beschleunigt)
- HeatmapLayer mit Gaussian Kernel Density Estimation
- Fuer grosse Datensaetze optimiert
- **OVERKILL** fuer unseren Use Case
- Abhaengigkeit von React und vielen Sub-Libraries
- iOS Safari limitiert (partielles WebGL)

### 7.3 Unser spezifischer Use Case

Fuer die WLAN-Heatmap brauchen wir KEINE klassische Heatmap-Library, denn:

1. Wir berechnen Signal fuer JEDEN Pixel (oder Rasterpunkt) einzeln
2. Klassische Heatmap-Libraries interpolieren zwischen Punkten (Kernel Density)
3. Wir kennen den exakten Wert an jedem Punkt (aus dem RF-Modell)
4. Wir brauchen: Farbcodierung eines 2D-Arrays auf Canvas

**Effektivster Ansatz:**
```typescript
// Direkt auf Canvas zeichnen - keine Library noetig
const imageData = ctx.createImageData(width, height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const signalStrength = calculateSignal(x, y, aps, walls);
    const color = signalToColor(signalStrength); // -30dBm=gruen ... -90dBm=rot
    const idx = (y * width + x) * 4;
    imageData.data[idx] = color.r;
    imageData.data[idx + 1] = color.g;
    imageData.data[idx + 2] = color.b;
    imageData.data[idx + 3] = color.a; // Transparenz
  }
}
ctx.putImageData(imageData, 0, 0);
```

### 7.4 ABER: Fuer Mess-Heatmaps (nach Survey)

Fuer die Mess-Heatmap (interpolierte Werte zwischen Messpunkten) IST eine Heatmap-Library sinnvoll:

**Empfehlung: simpleheat**
- Winzig, keine Dependencies
- Genau richtig fuer interpolierte Messpunkte
- BSD-2-Clause (MIT-kompatibel)
- Kann modifiziert/geforkt werden bei Bedarf

### 7.5 Alternative: Eigene Implementierung mit Gaussian Blur

Fuer die Vorhersage-Heatmap koennen wir Gaussian Blur auf dem berechneten Raster anwenden, um weichere Uebergaenge zu erzielen. Das ist ein Post-Processing-Schritt auf dem Canvas.

### 7.6 Empfehlung Heatmap

| Anwendung | Empfehlung |
|-----------|-----------|
| **Vorhersage-Heatmap** (RF-Modell) | Selbst implementieren (Canvas ImageData) |
| **Mess-Heatmap** (Survey-Daten) | `simpleheat` (fuer Punkt-Interpolation) |
| **Ueberblendung** | Canvas Compositing (globalAlpha, globalCompositeOperation) |

---

## 8. Zusammenfassung & Empfehlung

### 8.1 Empfohlene Dependency-Matrix

| Kategorie | Library | npm Package | Version | Lizenz | Zweck |
|-----------|---------|-------------|---------|--------|-------|
| **Geometrie** | flatten-js | `@flatten-js/core` | 1.6.x | MIT | Wand-Intersection, Spatial Index |
| **Heatmap (Survey)** | simpleheat | `simpleheat` | 0.4.x | BSD-2 | Messpunkt-Interpolation |
| **i18n** | paraglide-js | `@inlang/paraglide-js` | latest | MIT | Internationalisierung EN/DE |
| **SNMP (Node)** | net-snmp | `net-snmp` | 3.x | MIT | AP-Steuerung via SNMP |
| **SNMP (Rust)** | rasn-snmp | `rasn-snmp` | 0.28.x | MIT* | AP-Steuerung im Rust-Backend |
| **Spatial (Reserve)** | rbush | `rbush` | 4.x | MIT | Performance-Fallback |

*Lizenz von rasn-snmp ist Apache-2.0/MIT dual - MIT-kompatibel.

### 8.2 Selbst zu implementieren

| Komponente | Grund | Geschaetzter Aufwand |
|-----------|-------|---------------------|
| **RF-Modell (Path Loss)** | Keine passende JS-Library, triviale Formel | ~50-100 Zeilen |
| **iPerf3-Wrapper** | Kein npm-Wrapper vorhanden, einfacher Subprocess | ~100-150 Zeilen |
| **Vorhersage-Heatmap Renderer** | Canvas ImageData direkt, keine Library noetig | ~200-300 Zeilen |
| **Farbskala (Signal-zu-Farbe)** | Spezifisch fuer WLAN (dBm zu RGB) | ~30 Zeilen |
| **Wandeditor** | Spezifische Anforderungen (Material, Dicke) | ~500+ Zeilen |

### 8.3 Lizenz-Kompatibilitaet

Alle empfohlenen Libraries sind MIT-kompatibel:

| Library | Lizenz | Kompatibel mit MIT? |
|---------|--------|-------------------|
| @flatten-js/core | MIT | Ja |
| simpleheat | BSD-2-Clause | Ja |
| paraglide-js | MIT | Ja |
| net-snmp | MIT | Ja |
| rasn-snmp | Apache-2.0/MIT | Ja |
| rbush | MIT | Ja |

**NICHT verwendbar (GPL/AGPL):**
- python-wifi-survey-heatmap (AGPL-3.0)
- wifi-heat-mapper (GPL-3.0)
- WiFiSurveyor (GPL-3.0)
- wifiheatmap (GPL-2.0)
- rf-signals (GPL-2.0)
- RP-Sim (AGPL-3.0)

### 8.4 Was wir von existierenden Tools lernen koennen

| Quelle | Learning | Aktion |
|--------|---------|--------|
| **wifi-planner (crazyman62)** | RF-Modell-Implementierung, Wanddatenbank, Heatmap-Rasterung | Algorithmus studieren (nicht Code kopieren - Lizenz unklar) |
| **wifi-heatmapper (hnykda)** | iperf3 in TypeScript/Node.js, MIT-Lizenz | Code direkt als Referenz nutzen |
| **RP-Sim** | Modulare Propagation-Modell-Architektur in JS | Architektur-Pattern uebernehmen |
| **WiFiSurveyor** | WebGL-Heatmap-Rendering | WebGL-Ansatz evaluieren falls Canvas zu langsam |
| **python-wifi-survey-heatmap** | Messpunkt-Logik, Survey-Workflow, Multi-Metrik | Konzept/UX uebernehmen (nicht Code) |

### 8.5 Dependency-Graph

```
wlan-optimizer
├── @flatten-js/core          # Geometrie, Ray-Wall-Intersection
│   └── (keine Dependencies)
├── simpleheat                # Messpunkt-Heatmap
│   └── (keine Dependencies)
├── @inlang/paraglide-js      # i18n (compile-time)
│   └── (Build-Dependency, kein Runtime-Overhead)
├── net-snmp                  # SNMP AP-Steuerung
│   └── (keine externen Dependencies)
└── [Rust Backend / Tauri]
    ├── rasn-snmp             # SNMP (Alternative zu net-snmp)
    └── iperf3 Binary         # Subprocess, kein Crate noetig
```

### 8.6 Risiken und Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|-----------|
| flatten-js zu langsam fuer Echtzeit-Heatmap | Mittel | rbush als Fallback, Web Workers, WASM |
| simpleheat zu limitiert fuer Survey-Heatmap | Niedrig | Eigene Canvas-Implementierung als Backup |
| paraglide-js Breaking Changes bei Svelte 5 | Niedrig | Offiziell supported, grosses Team |
| net-snmp Node.js v22+ Kompatibilitaet | Niedrig | Letzte Version ist aktuell |
| iperf3 Binary-Bundling in Tauri | Mittel | Tauri Sidecar-Feature, oder User installiert selbst |

### 8.7 Offene Entscheidungen fuer Phase 4/5

1. **SNMP via Rust oder Node.js?** - Abhaengig von Tauri-Architekturentscheidung
2. **Canvas 2D oder WebGL fuer Heatmap?** - Performance-Tests noetig
3. **Heatmap-Aufloesung** - Pixel-genau vs. Raster (z.B. 10cm) - Tradeoff Performance/Genauigkeit
4. **wifi-planner (crazyman62) Lizenz klaeren?** - Issue auf GitHub stellen oder ignorieren

---

## Quellen

### WLAN-Planungstools
- [wifi-planner (crazyman62)](https://github.com/crazyman62/wifi-planner)
- [python-wifi-survey-heatmap (jantman)](https://github.com/jantman/python-wifi-survey-heatmap)
- [wifi-heat-mapper (Nischay-Pro)](https://github.com/Nischay-Pro/wifi-heat-mapper)
- [wifi-heatmapper (hnykda)](https://github.com/hnykda/wifi-heatmapper)
- [WiFiSurveyor (ecoAPM)](https://github.com/ecoAPM/WiFiSurveyor)
- [wifi-heatmap (benmwebb)](https://github.com/benmwebb/wifi-heatmap)
- [wifiheatmap (weimens)](https://github.com/weimens/wifiheatmap)
- [Wifi-Signal-Prediction (AadarshMishraa)](https://github.com/AadarshMishraa/Wifi-Signal-Prediction-and-Automatic-AP-Placement)

### RF-Modellierung
- [PyLayers](https://github.com/pylayers/pylayers)
- [scikit-rf](https://github.com/scikit-rf/scikit-rf)
- [RP-Sim](https://github.com/MatheusFerraroni/RP-Sim)
- [rf-signals](https://github.com/thebracket/rf-signals)

### Libraries
- [flatten-js](https://github.com/alexbol99/flatten-js)
- [rbush](https://github.com/mourner/rbush)
- [isect](https://github.com/anvaka/isect)
- [turf.js](https://github.com/Turfjs/turf)
- [clipper2-ts](https://github.com/countertype/clipper2-ts)
- [simpleheat](https://github.com/mourner/simpleheat)
- [heatmap.js](https://github.com/pa7/heatmap.js)
- [deck.gl](https://github.com/visgl/deck.gl)
- [paraglide-js](https://github.com/opral/paraglide-js)
- [net-snmp](https://github.com/markabrahams/node-net-snmp)
- [rasn-snmp](https://crates.io/crates/rasn-snmp)
