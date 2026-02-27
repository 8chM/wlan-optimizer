# Phase 4: Konsolidierter Fragenkatalog

> **Datum:** 2026-02-27 | **Status:** Bereit fuer Klaerung
>
> Alle Fragen, die NUR durch den Benutzer beantwortet werden koennen.
> Recherche-Ergebnisse aus Phase 3 sind eingearbeitet. Jede Frage enthaelt
> Kontext, Optionen, Empfehlung und Auswirkung auf das Projekt.
>
> **Hinweis:** Fragen die durch Phase-3-Recherche bereits beantwortet werden
> konnten, sind NICHT enthalten. Nur echte Benutzer-Entscheidungen.

---

## Uebersicht

| Bereich | Anzahl Fragen |
|---------|---------------|
| A. Produkt-Entscheidungen | 7 |
| B. Hardware & Setup | 4 |
| C. Tech-Stack Bestaetigung | 3 |
| D. Design & UX | 3 |
| E. Geschaeftsmodell | 2 |
| **Gesamt** | **19** |

---

## A. Produkt-Entscheidungen

### F-01: MVP-Scope der Mixing Console
**Kontext:** Das PRD (Abschnitt 7) listet die Mixing Console als "spaetere Erweiterung", aber der MVP-Backlog (US-07) und die Funktionsliste (M3) listen sie mit Prioritaet "Hoch" als MVP-Kern. Die Phase-3-Recherche (Tech-Stack-Evaluation, Canvas-Heatmap) hat gezeigt, dass die technische Umsetzung machbar ist (Konva.js + Web Workers fuer Echtzeit-Heatmap, AP-Steuerung ueber Web-Interface-Scraping). Run 3 (Verifikation) ergibt ohne Mixing Console wenig Sinn.

**Optionen:**
- **A: Mixing Console im MVP (Forecast-Only)** - Schieberegler aendern nur die berechnete Heatmap (reine Simulation). Kein AP wird angesteuert. Pro: Schnell umsetzbar, kein Risiko. Contra: Kein echter Mehrwert gegenueber manueller Parameteraenderung.
- **B: Mixing Console im MVP (Forecast + Live)** - Forecast wie A, plus optionale Live-Steuerung des AP. Pro: Vollstaendiges Feature, groesster Nutzen. Contra: Abhaengig von AP-Steuerbarkeit (Web-Scraping muss funktionieren), hoeherer Aufwand.
- **C: Mixing Console NICHT im MVP** - Nur Heatmap-Berechnung mit festen Parametern. Pro: Kleinerer MVP-Scope. Contra: Run 3 sinnlos, Kernfeature fehlt.

**Empfehlung:** Option A (Forecast-Only) als MVP, Option B als schnelle Erweiterung nach AP-Verifizierung. Begruendung: Forecast-Only benoetigt keine AP-Steuerung und ist rein frontend-seitig umsetzbar. Live-Steuerung kann nachgeliefert werden sobald Web-Interface-Scraping am echten Geraet verifiziert ist.

**Auswirkung:** Bei Option C entfallen Phase 8e und Teile von Phase 8d. Bei Option B muss die AP-Verifizierung (Abschnitt 8 in AP-Steuerung.md) VOR der Implementierung abgeschlossen sein.

---

### F-02: Freischalt-Feature vs. Open Source
**Kontext:** US-05 erwaehnt "Freischaltung mit Laufzeitanzeige (z.B. 30 Tage)". Das Projekt ist MIT-lizenziert und Open Source. Die Open-Source-Evaluation hat gezeigt, dass KEIN vergleichbares Open-Source-Tool existiert, das Planung UND Messung kombiniert -- unser USP. Ein Bezahlmodell widerspricht nicht der MIT-Lizenz, waere aber bei Open Source unueblich und technisch leicht zu umgehen (Fork).

**Optionen:**
- **A: Kein Freischaltmechanismus** - Alle Features sofort verfuegbar. Pro: Einfachste Implementierung, Community-freundlich. Contra: Kein Monetarisierungspfad.
- **B: UI-gestuftes Freischalten** - Planungsfeatures zuerst, Messfeatures als "naechster Schritt" freigeschaltet durch einen "Start Optimierung"-Button (kein Lizenzschluessel, keine Zeitbegrenzung). Pro: Gute UX-Fuehrung, kein Paywall-Eindruck. Contra: Kein Monetarisierungspfad.
- **C: Sponsorware** - Messung/Optimierung fuer Sponsoren (GitHub Sponsors) frueher verfuegbar, nach X Monaten fuer alle. Pro: Fairer Open-Source-Kompromiss. Contra: Komplex, Community-Spaltung.
- **D: Feature-Gate mit Lizenzschluessel** - Messmodul erfordert Lizenz. Pro: Einnahmen moeglich. Contra: Technisch trivial zu umgehen (MIT-Lizenz), Community-feindlich.

**Empfehlung:** Option B. Alle Features von Anfang an verfuegbar, aber UI-gestuftes Onboarding (Planung zuerst, Messung als bewusster naechster Schritt). Kein Paywall, kein Lizenzschluessel. Falls spaeter Monetarisierung gewuenscht: Support/Consulting statt Feature-Gates.

**Auswirkung:** Bei Option A/B: Kein Feature-Gate-Code noetig, einfachere Architektur. Bei Option C/D: Feature-Gate-Infrastruktur, Lizenz-Validierungslogik, UI fuer Lizenzschluessel-Eingabe.

---

### F-03: Materialumfang im MVP
**Kontext:** Die RF-Materialien-Recherche hat 27 Wandmaterialien und 4 Deckentypen mit konservativen Daempfungswerten dokumentiert (W01-W27, F01-F04). Zusaetzlich gibt es 3 vereinfachte Kategorien (leicht/mittel/schwer). Die Recherche empfiehlt 10-12 Materialien fuer den MVP und alle 27 fuer V1.1.

**Optionen:**
- **A: Nur 3 Kategorien (leicht/mittel/schwer)** - Simpleste Auswahl. Pro: Schnell, benutzerfreundlich fuer Anfaenger. Contra: Ungenau, fortgeschrittene Benutzer werden unzufrieden.
- **B: 10-12 Kernmaterialien (wie empfohlen)** - W01-W06 (Leichtbau), W11-W13 (Ziegel), W18-W21 (Beton). Pro: Gute Balance, deckt 90% der Anwendungsfaelle. Contra: Nicht alle deutschen Bautypen.
- **C: Alle 27 Materialien sofort** - Vollstaendige Datenbank von Anfang an. Pro: Vollstaendig, professionell. Contra: Ueberfordert Anfaenger, mehr UI-Aufwand.

**Empfehlung:** Option B fuer den MVP, mit den 3 Kategorien als "Schnellauswahl" und der vollen Materialliste als "Erweitert". So bedienen wir beide Zielgruppen.

**Auswirkung:** Bei Option A: Weniger UI-Arbeit, aber Materialdatenbank muss trotzdem vorbereitet sein. Bei Option C: Materialauswahl-UI muss durchdachter sein (Gruppierung, Suche, Favoriten).

---

### F-04: Multi-Floor im MVP?
**Kontext:** Das PRD sagt "nicht im MVP". Die RF-Materialien-Recherche dokumentiert Geschossdecken-Daempfung (F01-F04: 15-55 dB) und Floor Attenuation Factors nach ITU-R P.1238. Die Tech-Stack-Evaluation zeigt ein DB-Schema mit `floors`-Tabelle. wifi-planner (Open-Source-Referenz) hat Multi-Floor-Support bereits.

**Optionen:**
- **A: Kein Multi-Floor im MVP** - Ein Stockwerk pro Projekt. Pro: Weniger Komplexitaet. Contra: Viele Heimnetzwerke sind mehrstoeckig.
- **B: Multi-Floor Datenstruktur vorbereiten, aber UI-seitig nicht freischalten** - DB-Schema und Modell sind Multi-Floor-faehig, aber die UI zeigt nur ein Stockwerk. Pro: Zukunftssicher, wenig Mehraufwand bei Planung. Contra: Feature ist da aber nicht nutzbar.
- **C: Basis-Multi-Floor im MVP** - Mehrere Stockwerke mit einfacher Daempfung (FAF-Additionsmodell). Pro: Sofort nutzbar fuer Einfamilienhaeuser. Contra: Mehr UI-Aufwand (Stockwerk-Tabs, Deckentyp-Auswahl).

**Empfehlung:** Option B. Die Datenstruktur wird von Anfang an Multi-Floor-faehig gebaut (wie im DB-Schema der Tech-Stack-Evaluation). Die UI zeigt zunaechst nur ein Stockwerk. Freischaltung in V1.1.

**Auswirkung:** Option B erfordert ~10% mehr Aufwand bei der Datenmodellierung, spart aber potenziell einen kompletten Rewrite spaeter. Option C wuerde den MVP-Scope um ca. 2-3 Wochen vergroessern.

---

### F-05: 6 GHz (WiFi 6E/7) Support planen?
**Kontext:** Der Referenz-AP DAP-X2810 unterstuetzt KEIN 6 GHz. Die RF-Materialien-Recherche enthaelt bereits 6-GHz-Daempfungswerte fuer alle 27 Materialien (extrapoliert mit Faktor 1.15-1.30 aus 5-GHz-Werten). WiFi 7 (802.11be) nutzt ebenfalls 6 GHz und wird zunehmend relevant.

**Optionen:**
- **A: Nur 2.4 + 5 GHz** - Kein 6 GHz. Pro: Ausreichend fuer DAP-X2810, einfacher. Contra: Veraltet bei neueren APs.
- **B: 6 GHz in Datenstruktur vorbereiten, UI-seitig deaktiviert** - Materialdatenbank hat 6-GHz-Werte (bereits vorhanden), aber UI zeigt nur 2.4/5 GHz Toggle. Pro: Zukunftssicher, nahezu kein Mehraufwand. Contra: Feature ist "versteckt".
- **C: 6 GHz von Anfang an verfuegbar** - Drei Frequenzbaender in der Heatmap. Pro: Zukunftssicher, professionell. Contra: Kein Referenz-AP zum Testen, Extrapolationswerte unsicher.

**Empfehlung:** Option B. Die 6-GHz-Daempfungswerte sind bereits in RF-Materialien.md dokumentiert. Die Datenstruktur (WallMaterial.attenuation) hat bereits Felder fuer 2.4/5/6 GHz. Die UI zeigt 2.4 + 5 GHz, 6 GHz wird freigeschaltet sobald ein 6-GHz-AP getestet werden kann.

**Auswirkung:** Nahezu kein Mehraufwand bei Option B, da die Daten bereits existieren. Option C erfordert UI-Anpassung des Frequenzband-Toggles und zusaetzliche Heatmap-Berechnung.

---

### F-06: Optimierungsalgorithmus: Regelbasiert oder fortgeschritten?
**Kontext:** Die Wissensluecke WL-MC-02 fragt nach dem Optimierungsalgorithmus. Brute-Force ist unmoeglich (60 Milliarden Kombinationen bei 3 APs). Die Recherche hat gezeigt, dass wifi-planner (Open-Source) einen genetischen Algorithmus fuer automatische AP-Platzierung verwendet. Fuer den MVP reicht ein regelbasierter Ansatz.

**Optionen:**
- **A: Regelbasiert (MVP)** - Faustregeln wie "Wenn RSSI am Nachbar-AP > -50 dBm: TX-Power reduzieren", "Nicht-ueberlappende Kanaele waehlen". Pro: Einfach, erklaerbar, schnell implementiert. Contra: Nicht optimal.
- **B: Regelbasiert + Greedy-Optimierung** - Wie A, aber mit iterativer Verbesserung (Parameter aendern, der groesste Verbesserung bringt). Pro: Bessere Ergebnisse. Contra: Mehr Implementierungsaufwand.

**Empfehlung:** Option A fuer MVP, Option B als V1.1-Erweiterung. Regelbasierte Vorschlaege sind fuer Heimnetzwerke voellig ausreichend und fuer den Benutzer nachvollziehbar (keine "Black Box").

**Auswirkung:** Option A: ~200-300 Zeilen Code. Option B: ~500-800 Zeilen, benoetigt iterative Heatmap-Neuberechnung (Performance-kritisch).

---

### F-07: Minimale Messpunkte erzwingen?
**Kontext:** Die Messung-Kalibrierung-Recherche empfiehlt mindestens 5 Messpunkte fuer eine sinnvolle Kalibrierung (RMSE < 6 dB). Bei weniger als 5 Punkten wird nur ein globaler Korrektur-Offset berechnet, keine differenzierte Kalibrierung.

**Optionen:**
- **A: Mindestens 5 Messpunkte erzwingen** - App laesst Run nicht starten ohne 5 Punkte. Pro: Qualitaetssicherung. Contra: Einschraenkend, Benutzer koennten frustriert sein.
- **B: Empfehlung, kein Zwang** - App empfiehlt 5+ Punkte, zeigt Warnung bei weniger, laesst aber Start zu. Pro: Benutzerfreundlich. Contra: Schlechte Kalibrierung bei zu wenigen Punkten.
- **C: Adaptive Empfehlung** - Empfohlene Punktanzahl basierend auf Grundrissgroesse (5-8 fuer < 60 m2, 8-15 fuer 60-120 m2, 15-25 fuer > 120 m2). Pro: Intelligenter. Contra: Komplexere UI.

**Empfehlung:** Option B mit C-Element. Empfehlung basierend auf Grundrissgroesse, Warnung bei Unterschreitung, aber kein harter Zwang. Kalibrierungsqualitaet (RMSE, Konfidenz) wird nach der Messung transparent angezeigt.

**Auswirkung:** Option A ist am einfachsten zu implementieren, Option C erfordert Grundrissgroessen-Berechnung als Voraussetzung.

---

## B. Hardware & Setup

### F-08: Primaere Entwicklungs- und Zielplattform
**Kontext:** Die Entwicklungsumgebung ist macOS (Darwin 25.2.0). Tauri 2 unterstuetzt macOS, Windows und Linux. Die RSSI-Messung ist plattformspezifisch: macOS (CoreWLAN/objc2-core-wlan), Windows (WlanApi/wifi_scan), Linux (nl80211/iw). Die Messung-Kalibrierung-Recherche empfiehlt macOS-First.

**Optionen:**
- **A: macOS-First** - Volle Funktionalitaet zuerst auf macOS, Windows/Linux spaeter. Pro: Schnellste Entwicklung, Entwicklermaschine = Testmaschine. Contra: Eingeschraenkte Zielgruppe anfangs.
- **B: macOS + Windows gleichzeitig** - Beide Plattformen von Anfang an. Pro: Groessere Zielgruppe. Contra: ~30% mehr Aufwand durch plattformspezifischen RSSI/WiFi-Code.
- **C: Alle drei gleichzeitig** - macOS, Windows, Linux ab Tag 1. Pro: Maximale Reichweite. Contra: Signifikant mehr Testaufwand, Linux-WebView (WebKitGTK) hat Eigenheiten.

**Empfehlung:** Option A. macOS-First, Windows in V1.1, Linux in V1.2. Die plattformunabhaengige Architektur (Trait-basierte RSSI-Abstraktion, wie in Messung-Kalibrierung.md beschrieben) wird von Anfang an implementiert, aber nur macOS wird initial gefuellt. CI/CD-Pipeline baut fuer alle Plattformen (Tauri Cross-Platform-Build), aber Windows/Linux sind "experimentell" bis zur aktiven RSSI-Implementierung.

**Auswirkung:** Option A spart ~2-3 Wochen Entwicklungszeit. Option C verdreifacht den Testaufwand bei Messungen.

---

### F-09: iPerf3-Server-Setup
**Kontext:** Die Messung-Kalibrierung-Recherche beschreibt vier Server-Optionen: Desktop-PC (LAN), Raspberry Pi 4/5, NAS/Homeserver, Router. Der iPerf3-Server MUSS per Ethernet angebunden sein. Die App kann iPerf3 als Sidecar (CLI-Wrapper) bundlen (BSD-3-Clause-kompatibel).

**Fragen an den Benutzer:**
1. Haben Sie einen zweiten Rechner oder Raspberry Pi, der als iPerf3-Server dienen kann?
2. Ist Ihr iPerf3-Server per Ethernet (Kabel) mit dem Netzwerk verbunden?
3. Welche Plattform laeuft darauf? (Windows, Linux, macOS)

**Empfehlung:** Die App bundelt den iPerf3-Client als Sidecar. Der Server muss separat eingerichtet werden. Wir liefern:
- Setup-Anleitung fuer Raspberry Pi, Docker, und manuelle Installation
- Setup-Wizard in der App der den Server erkennt (IP + Port pruefen)
- Fehlermeldungen mit konkreten Hilfestellungen

**Auswirkung:** Wenn kein separater Server vorhanden ist, kann die Messfunktion nicht genutzt werden. Die Planungsfunktion (Heatmap) funktioniert ohne iPerf3.

---

### F-10: AP-Zugang und Credentials
**Kontext:** Die AP-Steuerung-Recherche zeigt, dass der DAP-X2810 ueber Web-Interface (HTTP/HTTPS, CGI-basiert), SNMP (basic settings) und CLI (basic settings, seriell 115200 8N1) erreichbar ist. Web-Interface-Scraping ist der empfohlene Primaer-Ansatz. Fuer die Verifizierung (Abschnitt 8 in AP-Steuerung.md) werden konkrete Zugangsdaten benoetigt.

**Fragen an den Benutzer:**
1. Wie ist die IP-Adresse des DAP-X2810? (Standard: 192.168.0.50 oder DHCP)
2. Haben Sie die Standard-Zugangsdaten geaendert? (Standard: admin/admin)
3. Welche Firmware-Version ist installiert? (Empfohlen: v1.25.053)
4. Ist SNMP im Web-Interface aktiviert? Falls ja: Community Strings?
5. Haben Sie ein USB-to-Serial-Kabel fuer den Konsolen-Port? (Fuer CLI-Test)

**Empfehlung:** Vor Phase 8 die AP-Verifizierung durchfuehren (Web-Interface reverse-engineeren, SNMP testen, CLI testen). Dies ist ein BLOCKER fuer die Live-Steuerung der Mixing Console.

**Auswirkung:** Ohne AP-Zugang funktioniert nur der Forecast-Modus der Mixing Console (keine Live-Steuerung). Die Planungsfunktion ist davon nicht betroffen.

---

### F-11: iPerf3-Binary bundlen oder Benutzer-Installation?
**Kontext:** iPerf3 ist BSD-3-Clause-lizenziert (kompatibel mit MIT). Die Messung-Kalibrierung-Recherche empfiehlt Tauri Sidecar (CLI-Wrapper). Die Binary ist ~1-2 MB pro Plattform.

**Optionen:**
- **A: Binary bundlen (Sidecar)** - iPerf3-Binary fuer jede Plattform in der App eingebettet. Pro: Funktioniert sofort, kein Setup noetig. Contra: Groessere App (~2 MB pro Plattform), Binary-Pflege bei iPerf3-Updates.
- **B: Benutzer installiert selbst** - App erwartet `iperf3` im PATH. Pro: Kleinere App, aktuellste Version. Contra: Zusaetzlicher Setup-Schritt, Fehlermeldungen wenn nicht installiert.
- **C: Hybrid** - App prueft ob iperf3 installiert ist, bietet Download-Link wenn nicht. Pro: Beste UX. Contra: Mehr Logik im Installer/Setup.

**Empfehlung:** Option A (Sidecar). Die Lizenz erlaubt es, die UX ist optimal (funktioniert sofort), und 2 MB Groessenzuwachs ist bei einer 5-10 MB Tauri-App vernachlaessigbar.

**Auswirkung:** Option A erfordert Cross-Platform-Binaries im Build-Prozess (macOS ARM/Intel, Windows x64, Linux x64). Option B ist einfacher im Build aber schlechter in der UX.

---

## C. Tech-Stack Bestaetigung

### F-12: Svelte 5 + Tauri 2 als Tech-Stack
**Kontext:** Die Tech-Stack-Evaluation empfiehlt Svelte 5 (Runes) + Tauri 2 + Konva.js. Begruendung zusammengefasst:
- Svelte 5: 39% schneller als React 19, 2.5x kleineres Bundle, Runes als eingebautes State Management, svelte-konva (Svelte 5 nativ), Paraglide-js als ideale i18n-Loesung
- Tauri 2: 10x kleiner als Electron (5-10 MB vs. 80-150 MB), 5x weniger RAM (30-50 MB vs. 150-300 MB), Rust-Backend fuer RF-Berechnung und AP-Steuerung
- Konva.js: Layer-System ideal fuer Grundriss + Heatmap Overlay, offizielle Svelte 5 Integration

**Frage:** Sind Sie mit diesem Tech-Stack einverstanden? Haben Sie Bedenken oder Praeferenzen?

**Risiken (transparent):**
- Svelte 5: Kleineres Oekosystem als React/Vue (7.2% vs. 44.7% Marktanteil)
- Tauri 2: Rust-Lernkurve fuer Backend-Code (RF-Berechnung, AP-Steuerung, SQLite)
- Tauri 2: Windows IPC-Latenz bei grossen Payloads (~200ms fuer 10MB), Mitigation: Heatmap im Frontend berechnen

**Auswirkung:** Der Tech-Stack bestimmt ALLE weiteren Entscheidungen. Eine Aenderung nach Phase 5 erfordert einen kompletten Neustart.

---

### F-13: Rust im Backend akzeptabel?
**Kontext:** Tauri 2 erfordert Rust fuer Backend-Logik (AP-Steuerung via HTTP/SNMP, SQLite via rusqlite, iPerf3-Sidecar-Management, RSSI-Messung via plattformspezifische APIs). Die Alternative waere Electron mit Node.js-Backend.

**Optionen:**
- **A: Rust-Backend (Tauri 2)** - RF-Modell kann in TypeScript (Web Worker) ODER Rust implementiert werden. AP-Steuerung, DB, Netzwerk in Rust. Pro: Performance, Sicherheit, kleine App. Contra: Rust-Lernkurve.
- **B: Node.js-Backend (Electron)** - Alles in JavaScript/TypeScript. Pro: Einfacher, groesseres npm-Oekosystem (net-snmp, better-sqlite3, ssh2). Contra: 80-150 MB App, 150-300 MB RAM, langsamerer Start.

**Empfehlung:** Option A. Die Backend-Logik ist ueberschaubar: HTTP-Client (reqwest), SNMP (rasn-snmp), SQLite (rusqlite), Prozess-Management (Tauri Shell). Claude Code kann Rust-Code generieren. Die Performance-Vorteile (besonders fuer RF-Berechnung falls spaeter nach Rust portiert) ueberwiegen die Lernkurve.

**Auswirkung:** Bei Option B: Gesamter Tech-Stack aendert sich (Electron statt Tauri, npm statt Cargo, better-sqlite3 statt rusqlite). Die Recherche-Dokumente zu Canvas/Heatmap und i18n bleiben gueltig.

---

### F-14: Heatmap-Berechnung: Frontend (Web Worker) oder Backend (Rust)?
**Kontext:** Die Canvas-Heatmap-Recherche und Tech-Stack-Evaluation empfehlen einen Hybrid-Ansatz: Konva.js fuer interaktive Elemente (Grundriss, APs, Waende), nativer Canvas fuer die Heatmap (ImageData + putImageData), Berechnung in Web Workers (nicht-blockierend). Alternative: Rust-Backend fuer Berechnung, Ergebnis per IPC ans Frontend. Die Recherche zeigt: Bei typischen Grundrissen (100 m2, 25cm Raster, 5 APs, 50 Waende) sind ca. 16.000 Rasterpunkte zu berechnen -- in JavaScript mit Web Workers innerhalb von 100-500ms machbar.

**Optionen:**
- **A: Frontend (TypeScript + Web Worker)** - Berechnung laeuft im Browser-Thread. Pro: Kein IPC-Overhead, direkter Canvas-Zugriff, einfachere Entwicklung. Contra: JavaScript ist langsamer als Rust.
- **B: Backend (Rust via Tauri IPC)** - Berechnung in Rust, Ergebnis als Array per IPC. Pro: 10-100x schneller. Contra: IPC-Serialisierung fuer grosse Arrays, Windows-IPC-Latenz.
- **C: WASM im Web Worker** - Rust zu WASM kompiliert, laeuft im Frontend. Pro: Rust-Performance ohne IPC. Contra: Komplexerer Build-Prozess.

**Empfehlung:** Option A fuer MVP, Option C fuer V1.1 falls Performance nicht reicht. JavaScript ist fuer 16.000 Punkte mit flatten-js Spatial Index schnell genug. Die Architektur (Worker-basiert) erlaubt spaetere WASM-Migration ohne UI-Aenderung.

**Auswirkung:** Bei Option A: RF-Modell in TypeScript implementieren (einfacher zu testen mit Vitest). Bei Option B: RF-Modell in Rust (cargo test), zusaetzliche IPC-Commands, Serialisierung des Heatmap-Arrays. Bei Option C: Dual-Build (Rust fuer Backend-Logik + WASM fuer RF-Modell).

---

## D. Design & UX

### F-15: Grundriss-Import: Bild reicht oder DXF/SVG noetig?
**Kontext:** Das PRD spricht von "Bild/PDF". Die Canvas-Heatmap-Recherche beschreibt den Import-Flow (Bild laden, Referenzlinie zeichnen, Massstab berechnen). wifi-planner (Open-Source-Referenz) unterstuetzt nur Bild-Import mit Skalierungskalibrierung. DXF/SVG-Import wuerde automatische Wanderkennung ermoeglichen, ist aber signifikant aufwaendiger.

**Optionen:**
- **A: Nur Bild (PNG, JPG) + PDF** - Benutzer zeichnet Waende manuell auf dem importierten Bild. Pro: Einfach, deckt 90% der Faelle ab. Contra: Manuelles Wand-Zeichnen ist zeitaufwaendig.
- **B: Bild + PDF + SVG** - SVG-Import ermoeglicht potenzielle automatische Linienerkennung. Pro: SVG-Grundrisse sind haeufig (Architekten, Online-Tools). Contra: SVG-Parsing komplex, Wanderkennung unsicher.
- **C: Bild + PDF + DXF** - CAD-Import. Pro: Professionelle Grundrisse. Contra: DXF-Parser komplex, Zielgruppe hat selten DXF-Dateien.

**Empfehlung:** Option A fuer MVP. Bild/PDF reicht fuer die Heimanwender-Zielgruppe voellig aus. PDF-Import ueber pdf.js im Frontend oder Rust-Library im Backend. SVG-Import als V1.1-Erweiterung.

**Auswirkung:** Option A: Standard-Bildimport + pdf.js. Option B/C: Zusaetzliche Parser, Wanderkennungs-Algorithmus, deutlich mehr Aufwand.

---

### F-16: Heatmap-Farbschema
**Kontext:** Die Wissensluecke WL-HM-04 fragt nach dem Farbschema. Die Recherche (Canvas-Heatmap.md Abschnitt 3.2) beschreibt verschiedene Faerbestrategien. Viridis ist farbenblind-freundlich und wissenschaftlich empfohlen. Jet (Rot-Gelb-Gruen) ist der "klassische" WLAN-Heatmap-Look.

**Optionen:**
- **A: Standard-Schema (nicht aenderbar)** - Ein festes Schema (z.B. Viridis oder Jet). Pro: Einfach. Contra: Nicht anpassbar.
- **B: Waehlbar (2-3 Schemata)** - Viridis (farbenblind-freundlich), Jet (klassisch), Inferno. Pro: Flexibel, inklusiv. Contra: Mehr UI-Arbeit.
- **C: Frei konfigurierbar** - Benutzer definiert Farben und Schwellenwerte. Pro: Maximale Flexibilitaet. Contra: Ueberengineering.

**Empfehlung:** Option B. Drei vordefinierte Schemata mit Viridis als Default (farbenblind-freundlich, wissenschaftlich anerkannt). Jet als Alternative fuer Benutzer die den "klassischen" Look bevorzugen.

**Auswirkung:** Option A: ~30 Zeilen Code (Farbskala-Funktion). Option B: ~100 Zeilen (3 Schemata + Auswahl-UI). Option C: Eigene Farbeditor-UI, signifikant mehr Aufwand.

---

### F-17: Sprache der UI beim ersten Start
**Kontext:** Paraglide-js (empfohlene i18n-Loesung) unterstuetzt URL-basierte und Cookie-basierte Locale-Erkennung. Die App soll EN/DE unterstuetzen (CLAUDE.md: "UI: Zweisprachig EN/DE").

**Optionen:**
- **A: System-Sprache erkennen** - Automatisch DE wenn macOS/Windows auf Deutsch, sonst EN. Pro: Beste UX. Contra: Erkennung kann fehlschlagen.
- **B: Sprache beim ersten Start waehlen** - Willkommensdialog mit Sprachauswahl. Pro: Explizit, benutzergesteuert. Contra: Ein Klick mehr beim Erststart.
- **C: Immer Englisch starten, Sprachwechsel im Menue** - Pro: Einfachste Implementierung. Contra: Schlechte UX fuer deutschsprachige Benutzer.

**Empfehlung:** Option A mit Fallback auf B. System-Sprache erkennen (Tauri hat Zugriff auf OS-Locale), bei Unsicherheit kurzen Sprach-Dialog zeigen. Sprachwechsel jederzeit ueber Menue moeglich.

**Auswirkung:** Minimal, alle Optionen sind mit Paraglide-js einfach umsetzbar. Option A erfordert einen Tauri-Command fuer OS-Locale-Abfrage.

---

## E. Geschaeftsmodell & Sonstiges

### F-18: Code-Signing und Zertifikate
**Kontext:** Die Tech-Stack-Evaluation erwaehnt Code-Signing als Voraussetzung fuer Auto-Updates (Tauri Updater). Ohne Code-Signing zeigt macOS eine Gatekeeper-Warnung ("App von unbekanntem Entwickler") und Windows eine SmartScreen-Warnung. Apple Developer Account kostet $99/Jahr, Windows Code-Signing-Zertifikat ~$200/Jahr.

**Frage:** Sollen wir in Code-Signing investieren? Oder reicht eine Installationsanleitung fuer unsignierte Builds?

**Empfehlung:** Fuer den MVP: Unsigned mit Installationsanleitung. Fuer V1.0-Release: Apple Developer Account ($99/Jahr) fuer macOS Notarization. Windows-Signing kann warten (SmartScreen-Warnung ist weniger abschreckend als macOS Gatekeeper).

**Auswirkung:** Ohne Signing: 5-10% der potenziellen Benutzer scheitern an der Installation. Mit Signing: Jaehrliche Kosten, aber professionellerer Eindruck.

---

### F-19: Herstellerunabhaengigkeit: Scope
**Kontext:** Das PRD spricht von "herstellerunabhaengig". Die AP-Steuerung-Recherche fokussiert auf D-Link DAP-X2810 mit einer Abstraktionsschicht (APControllerTrait). Die Heatmap-Berechnung ist bereits herstellerunabhaengig (nutzt nur TX-Power und Antennengewinn). Die AP-Bibliothek (ap_models-Tabelle) kann beliebige APs aufnehmen.

**Optionen:**
- **A: Nur DAP-X2810 im MVP, erweiterbar** - Nur ein AP-Profil, aber Architektur fuer weitere Hersteller (Adapter-Pattern fuer Steuerung, JSON-Profile fuer AP-Daten). Pro: Fokus, schneller. Contra: Eingeschraenkte Zielgruppe.
- **B: DAP-X2810 + generisches Profil** - Wie A, plus ein "Generic WiFi 6 AP"-Profil mit manuell einstellbaren Parametern (TX-Power, Antennengewinn). Pro: Sofort fuer JEDEN AP nutzbar (Heatmap), nur Live-Steuerung ist D-Link-spezifisch. Contra: Generisches Profil ist weniger praezise.
- **C: Mehrere Hersteller von Anfang an** - D-Link + UniFi + TP-Link Omada. Pro: Groesste Zielgruppe. Contra: Massiver Mehraufwand (3x Web-Interface-Scraping).

**Empfehlung:** Option B. Die Heatmap-Berechnung braucht nur TX-Power und Antennengewinn -- das kann der Benutzer fuer jeden AP manuell eingeben. Live-Steuerung bleibt DAP-X2810-spezifisch. Spaetere Hersteller-Adapter koennen als Community-Contributions kommen.

**Auswirkung:** Option B erfordert nur eine zusaetzliche UI-Maske ("AP manuell konfigurieren") und ein generisches AP-Modell in der Datenbank. Option C wuerde den MVP-Scope verdreifachen.

---

## Cross-Check-Ergebnisse (Aufgabe 1)

Die folgenden Widersprueche und Inkonsistenzen wurden zwischen den Dokumenten gefunden:

### Widersprueche

| # | Dokument A | Dokument B | Widerspruch | Empfehlung |
|---|-----------|-----------|-------------|------------|
| W1 | PRD Abschnitt 7 ("Mixing Console = spaetere Erweiterung") | MVP-Backlog US-07 + Funktionsliste M3 ("Mixing Console = Hoch/MVP-Kern") | MVP-Scope der Mixing Console unklar | Klaerung via F-01 |
| W2 | PRD ("herstellerunabhaengig") | AP-Steuerung.md (nur DAP-X2810) | Herstellerunabhaengigkeit vs. Einzelgeraet-Fokus | Klaerung via F-19. Empfehlung: Planung herstellerunabhaengig, Steuerung AP-spezifisch mit Adapter-Pattern |
| W3 | PRD Abschnitt 6 ("iPerf-Server und Mess-Agent werden mitgeliefert") | Messung-Kalibrierung.md ("Server extern, Ethernet-angebunden, Benutzer muss einrichten") | Wer betreibt den iPerf3-Server? PRD impliziert "alles dabei", Recherche zeigt separates Setup. | Klaerung via F-09. Empfehlung: Client bundlen, Server-Setup-Anleitung liefern |
| W4 | PRD Abschnitt 4.4 ("Run 1: Pro AP eine Test-SSID") | AP-Steuerung.md ("SSID-Erstellung programmatisch unsicher") | Automatische SSID-Erstellung unklar ob technisch moeglich | SSID-Erstellung haengt von AP-Verifizierung ab. Fallback: Benutzer erstellt Test-SSIDs manuell im Web-Interface |
| W5 | Funktionsliste M3 ("Sofortige Forecast-Heatmap") | Canvas-Heatmap.md ("Progressive Berechnung: erst grob, dann fein") | "Sofort" vs. progressive Berechnung | Kein echter Widerspruch: Progressive Berechnung IST "sofort" (grobe Version in <100ms, feine in <2s). Terminologie in Funktionsliste praezisieren. |

### Redundanzen

| # | Thema | Dokumente | Empfehlung |
|---|-------|-----------|------------|
| R1 | Konva.js Bewertung | Tech-Stack-Evaluation (Abschnitt 3), Canvas-Heatmap.md (Abschnitt 1), Open-Source-Evaluation (Abschnitt 7) | Drei separate Bewertungen mit leicht unterschiedlicher Tiefe. Tech-Stack-Evaluation ist die magebliche. |
| R2 | iPerf3-Integration | Messung-Kalibrierung.md (Abschnitt 1), Open-Source-Evaluation (Abschnitt 4), Tech-Stack-Evaluation (Abschnitt 2.1) | iPerf3 wird in 3 Dokumenten behandelt. Messung-Kalibrierung.md ist die detaillierteste und massgebliche Quelle. |
| R3 | i18n-Loesung | Tech-Stack-Evaluation (Abschnitt 1.1), Open-Source-Evaluation (Abschnitt 6) | Beide empfehlen Paraglide-js. Open-Source-Evaluation hat den detaillierteren Vergleich (3 Optionen). |
| R4 | SNMP-Libraries | Open-Source-Evaluation (Abschnitt 5), AP-Steuerung.md (Abschnitt 2) | Beides behandelt SNMP, aber aus unterschiedlicher Perspektive (Library-Auswahl vs. AP-spezifische MIBs). Kein echter Widerspruch, aber Verweis fehlt. |
| R5 | DB-Schema | Tech-Stack-Evaluation (Abschnitt 4.1), Messung-Kalibrierung.md (Abschnitt 3.2) | Beide definieren Datenstrukturen. Tech-Stack-Eval hat SQL-Schema, Messung-Kalibrierung hat Rust-Structs. Muessen in Phase 5 konsolidiert werden. |
| R6 | Materialien/Wanddaempfung | RF-Materialien.md (27 Materialien), Canvas-Heatmap.md (Abschnitt 5.3 Material-Interface) | Beide definieren Materialdatenbank-Strukturen. RF-Materialien.md ist die massgebliche Quelle fuer Werte, Canvas-Heatmap.md fuer die TypeScript-Datenstruktur. |

### Inkonsistente Terminologie

| # | Begriff A | Wo | Begriff B | Wo | Empfehlung |
|---|----------|-----|----------|-----|------------|
| T1 | "Mixing Console" | PRD, Funktionsliste, MVP-Backlog | "Live-Konsole" | PRD Abschnitt 7 | Vereinheitlichen auf "Mixing Console" |
| T2 | "Optimierungsassistent" | PRD | "Optimierungsmodul" | MVP-Backlog US-05 | Vereinheitlichen auf "Optimierungsassistent" |
| T3 | "Freischalt-Feature" | PRD Abschnitt 4.4 | "Freischaltung" | MVP-Backlog US-05 | Klaerung via F-02, danach einheitliche Bezeichnung |
| T4 | "Run 1/2/3" | PRD | "Baseline/PostOptimization/Verification" | Messung-Kalibrierung.md | Beides verwenden: "Run 1 (Baseline)", "Run 2 (Post-Optimierung)", "Run 3 (Verifikation)" |
| T5 | "Confidence-Level" | PRD, Funktionsliste | "Confidence" / "RMSE" / "Qualitaet" | Messung-Kalibrierung.md | "Confidence" fuer Benutzer-UI, "RMSE" fuer technische Dokumentation |

### Veraltete Informationen

| # | Information | Wo | Aktualisierung |
|---|-----------|-----|---------------|
| V1 | "Tech-Stack wird in Phase 5 festgelegt" | CLAUDE.md | Tech-Stack-Evaluation ist bereits abgeschlossen. CLAUDE.md aktualisieren auf: "Empfohlen: Svelte 5 + Tauri 2 + Konva.js (Bestaetigung in Phase 4)" |
| V2 | "Nur vier Materialien" | Wissensluecken.md WL-RF-01 | RF-Materialien.md hat jetzt 27 Materialien + 4 Decken. WL-RF-01 ist BEANTWORTET. |
| V3 | "Canvas-Library nicht gewaehlt" | Wissensluecken.md WL-UI-01 | Canvas-Heatmap.md empfiehlt Konva.js + svelte-konva. WL-UI-01 ist BEANTWORTET. |

### Fehlende Verknuepfungen

| # | Dokument A | Sollte verweisen auf | Dokument B |
|---|-----------|---------------------|-----------|
| L1 | PRD (Materialien: "Poroton, Beton") | Vollstaendige Materialdatenbank | RF-Materialien.md |
| L2 | MVP-Backlog (US-07: "Schieberegler") | Technische Machbarkeit der Steuerung | AP-Steuerung.md |
| L3 | Funktionsliste (M1: "Automatische Messpunkt-Generierung") | Messpunkt-Algorithmus | Messung-Kalibrierung.md Abschnitt 3 |
| L4 | AP-Steuerung.md (SNMP-Libraries) | Evaluierte Libraries | Open-Source-Evaluation.md Abschnitt 5 |
| L5 | Canvas-Heatmap.md (Performance) | Benchmark-Zahlen | Tech-Stack-Evaluation.md Abschnitt 2 (IPC-Performance) |

---

## Neue Wissensluecken (aus Phase 3 aufgetaucht)

Durch die Recherche sind folgende NEUE Fragen aufgetaucht, die vorher nicht identifiziert waren:

### NEU-01: macOS Location Services fuer SSID/BSSID
- **Quelle:** Messung-Kalibrierung.md Abschnitt 2.1
- **Problem:** Ab macOS Sonoma erfordert das Auslesen von SSID und BSSID eine Location Services Authorization. RSSI und Noise funktionieren ohne.
- **Frage:** Brauchen wir SSID/BSSID (erfordert Standortfreigabe) oder reicht RSSI allein?
- **Empfehlung:** SSID/BSSID werden benoetigt (um zu wissen an welchem AP gemessen wird). Location Services Permission muss angefragt werden.

### NEU-02: Tauri Windows IPC-Latenz
- **Quelle:** Tech-Stack-Evaluation Abschnitt 2.1
- **Problem:** Tauri IPC auf Windows hat ~200ms Latenz fuer 10 MB Daten (WebView2-Bug). Heatmap-Daten (16.000 Punkte * 4 Bytes RGBA = 64 KB) sind klein genug, aber groessere Payloads koennten problematisch sein.
- **Auswirkung:** Kein Problem fuer MVP (Heatmap-Berechnung im Frontend). Relevant wenn RF-Modell nach Rust portiert wird.

### NEU-03: wifi-planner Lizenz unklar
- **Quelle:** Open-Source-Evaluation Abschnitt 1.1
- **Problem:** wifi-planner (crazyman62) hat keine spezifizierte Lizenz. Ist die naechste Referenzimplementierung fuer unser Projekt, aber Code-Uebernahme riskant.
- **Empfehlung:** Algorithmen als Referenz nutzen (Konzepte sind nicht urheberrechtlich geschuetzt), keinen Code kopieren.

### NEU-04: Biome Svelte-Support lueckenhaft
- **Quelle:** Tech-Stack-Evaluation Abschnitt 6.2
- **Problem:** Biome hat keinen vollstaendigen Svelte-Support. Fuer .svelte-Dateien wird zusaetzlich eslint-plugin-svelte benoetigt.
- **Auswirkung:** Zwei Linting-Tools statt einem. Kein Blocker, aber erhoehte Konfigurationskomplexitaet.

---

## Priorisierte Reihenfolge fuer die Benutzer-Session

Empfohlene Reihenfolge der Beantwortung (kritischste zuerst):

1. **F-01** - Mixing Console MVP-Scope (BLOCKER fuer Phase-8-Planung)
2. **F-02** - Freischalt-Feature (beeinflusst App-Architektur)
3. **F-12** - Tech-Stack Bestaetigung (BLOCKER fuer Phase 5)
4. **F-13** - Rust im Backend (BLOCKER fuer Phase 5)
5. **F-08** - Primaere Plattform (beeinflusst Entwicklungsreihenfolge)
6. **F-10** - AP-Zugang (BLOCKER fuer AP-Verifizierung)
7. **F-14** - Heatmap Frontend/Backend (Architektur-Entscheidung)
8. **F-03** - Materialumfang (beeinflusst UI-Design)
9. **F-04** - Multi-Floor (beeinflusst Datenmodell)
10. **F-05** - 6 GHz (beeinflusst Datenmodell)
11. **F-19** - Herstellerunabhaengigkeit (beeinflusst Architektur)
12. **F-15** - Grundriss-Import (beeinflusst Phase 8b)
13. **F-09** - iPerf3-Server (Setup-Voraussetzung)
14. **F-11** - iPerf3 bundlen (Build-Entscheidung)
15. **F-06** - Optimierungsalgorithmus (Phase 8e)
16. **F-07** - Minimale Messpunkte (UX-Entscheidung)
17. **F-16** - Heatmap-Farbschema (Design-Entscheidung)
18. **F-17** - Sprache beim Start (i18n-Detail)
19. **F-18** - Code-Signing (Deployment-Detail)
