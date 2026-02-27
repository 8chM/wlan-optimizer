# Wissensluecken & offene Fragen

> Phase 2 Deliverable - Vollstaendige Analyse aller Luecken und Widersprueche

## 1. Widersprueche zwischen Dokumenten

### W-01: MVP-Scope der Mixing Console

- **PRD Abschnitt 7** listet "Live-Konsole / Mixing Console" als **spaetere Erweiterung** (nicht MVP)
- **MVP-Backlog US-07** listet Mixing Console als **Hohe Prioritaet (MVP-Kern)**
- **Funktionsliste M3** listet Mixing Console mit Prioritaet **Hoch**
- **Frage an Benutzer:** Gehoert die Mixing Console in den MVP oder nicht?

### W-02: Run 3 ohne Mixing Console

- PRD sagt MVP enthaelt "Run 1 + Run 3"
- Run 3 ist Verifikation **nach** Aenderungen. Aber wie aendert man ohne Mixing Console?
- Wenn Mixing Console nicht im MVP ist, ist Run 3 sinnlos
- **Frage an Benutzer:** Entweder Mixing Console IN MVP oder Run 3 RAUS aus MVP

### W-03: Freischalt-Feature und Open Source

- US-05 erwaehnt "Freischaltung mit Laufzeitanzeige (z.B. 30 Tage)"
- Projekt ist MIT-lizenziert (Open Source)
- **Frage an Benutzer:** Ist das ein Freemium-Modell? Oder nur ein UI-Flow (freigeschaltet = Nutzer hat gemessen)?

---

## 2. Technische Luecken - Muss recherchiert werden (Phase 3)

### T-01: Canvas/Zeichentechnologie

- Grundriss-Editor braucht: Bild-Anzeige, Zoom/Pan, Linien zeichnen, Drag-and-Drop
- **Optionen:** HTML5 Canvas (Fabric.js, Konva.js), SVG, WebGL
- **Zu recherchieren:** Welche Bibliothek passt am besten? Performance bei grossen Grundrissen?

### T-02: Heatmap-Rendering

- Heatmap muss ueber den Grundriss gerendert werden
- Echtzeit-Update bei Parameteraenderung (Mixing Console)
- **Optionen:** Canvas-Overlay, WebGL Shader, vorberechnete Tiles
- **Zu recherchieren:** Performance bei typischer Grundrissgroesse (z.B. 200m2)?

### T-03: Wand-Durchdringungserkennung (Ray Tracing)

- Fuer jeden Rasterpunkt muss bestimmt werden: Welche Waende liegen zwischen AP und Punkt?
- Erfordert Linien-Segment-Schnittberechnung (Ray Casting)
- **Zu recherchieren:** Effiziente Algorithmen (z.B. Spatial Hashing, BVH)

### T-04: Raster-Aufloesung

- Heatmap-Grid: Wie fein? 0.5m? 0.25m? 0.1m?
- Trade-off: Genauigkeit vs. Rechenzeit
- Bei 200m2 und 0.25m Raster: ~3200 Punkte pro AP - machbar
- **Entscheidung noetig in Phase 5**

### T-05: iPerf-Integration

- Browser kann iPerf3 nicht direkt ausfuehren
- Braucht lokalen Server/Dienst der iPerf startet
- **Optionen:** Node.js Backend, Electron mit child_process, Docker
- **Haengt ab von:** Deployment-Entscheidung (T-09)

### T-06: RSSI/BSSID-Messung im Browser

- Browser JavaScript hat keinen Zugriff auf RSSI oder BSSID
- Network Information API ist sehr limitiert
- **Optionen:**
  - Manuell: Nutzer gibt Werte ein (z.B. von WLAN-App abgelesen)
  - Agent: Lokale Software liefert Daten ueber HTTP/WebSocket
  - Electron: Native APIs verfuegbar
- **Frage an Benutzer:** Welcher Ansatz? (beeinflusst Architektur massiv)

### T-07: PDF-Import

- Mehrseitige PDFs: Nur erste Seite? Seite waehlbar?
- PDF-Rendering im Browser: pdf.js? Serverseitig?
- **Zu recherchieren:** pdf.js Capabilities und Performance

### T-08: Antennen-Strahlungsdiagramme

- PRD erwaehnt Decke vs. Wand mit unterschiedlichen Diagrammen
- RF-Modell ist aktuell omnidirektional (keine Richtcharakteristik)
- **Frage:** MVP mit vereinfachter 2D-Isotropie? Oder zumindest Daempfung nach oben/unten?
- **Empfehlung:** MVP mit Isotropie (2D), spaeter erweiterbar

### T-09: Deployment-Modell

- **Web-App:** Reiner Browser, braucht Server fuer iPerf und Agent
- **Electron:** Desktop-App, native APIs, iPerf integrierbar
- **Docker:** Self-hosted, alle Services gebundelt
- **Frage an Benutzer:** Bevorzugtes Deployment?
- **Empfehlung:** Web-App (Frontend) + lokaler Server (Backend fuer iPerf/Agent)

### T-10: Projekt-Persistenz

- Wie werden Projekte gespeichert?
- **Optionen:** LocalStorage, IndexedDB, File System Access API, Server-Dateisystem
- **Haengt ab von:** Deployment-Entscheidung (T-09)

---

## 3. RF-Modell-Luecken

### R-01: Daempfungswerte als Bereiche

- Wanddaempfung ist als Bereich angegeben (z.B. 4-6 dB)
- Welchen Wert verwenden? Minimum (optimistisch)? Maximum (konservativ)? Mittelwert?
- PRD sagt "konservativ" → Maximum verwenden
- **Empfehlung:** Maximum als Default, konfigurierbar pro Material

### R-02: Umgebungsdaempfungsfaktor (n)

- Bereich 3,0 - 3,8 fuer Wohngebaeude
- **Empfehlung:** n=3,5 als Default, konfigurierbar

### R-03: Empfaenger-Empfindlichkeit (Schwellenwerte)

- Nicht im Dokument definiert: Ab wann gilt ein Punkt als "abgedeckt"?
- Typische Schwellen:
  - Excellent: > -50 dBm
  - Good: -50 bis -65 dBm
  - Fair: -65 bis -75 dBm
  - Poor: -75 bis -85 dBm
  - No signal: < -85 dBm
- **Empfehlung:** Diese Schwellen als Default, anpassbar

### R-04: Freiraum-Pfadverlust PL(1m)

- Dokument sagt "~40 dB (2,4 GHz), ~47 dB (5 GHz)"
- Exakte Berechnung mit Friis-Formel:
  - 2,4 GHz: 20*log10(4*pi*1/0.125) = 40,05 dB ✓
  - 5 GHz: 20*log10(4*pi*1/0.06) = 46,42 dB ✓
- **Ergebnis:** Werte sind korrekt, koennen so uebernommen werden

### R-05: Signalstaerke-Berechnung (komplett)

- Formel: `RSSI = TX_Power + Antenna_Gain - PL(d) - Sum(Wall_Loss)`
- **Zu klaeren:** Smartphone-Antennengewinn als Offset?
- PRD erwaehnt "Smartphone-Limit als Annahme"
- **Empfehlung:** -3 dBi als Default fuer Smartphone-Empfaenger

---

## 4. UX-Luecken

### U-01: Positions-Markierung bei Messungen

- Wie markiert der Nutzer seine aktuelle Position waehrend der Messtour?
- **Optionen:** Tap auf Grundriss, GPS (ungenau indoor), Schrittzaehler
- **Empfehlung:** Tap auf Grundriss (einfach, genau genug)

### U-02: Undo/Redo im Editor

- PRD erwaehnt "Undo jederzeit moeglich"
- Braucht Command-Pattern oder State-History
- **Muss in Architektur beruecksichtigt werden**

### U-03: Navigierung grosser Grundrisse

- Zoom, Pan, Pinch-to-Zoom auf Touch
- Minimap fuer Uebersicht?
- **Standard-Feature, muss aber in Canvas-Bibliothek unterstuetzt werden**

### U-04: Mehrere Stockwerke

- Explizit aus MVP ausgeschlossen
- UI muss trotzdem darauf vorbereitet sein (Tab/Dropdown fuer Stockwerk)
- **Empfehlung:** UI-Platzhalter, Logik spaeter

---

## 5. Fehlende Informationen

### F-01: Weitere AP-Modelle

- Nur D-Link DAP-X2810 dokumentiert
- Wie werden weitere Modelle hinzugefuegt? JSON-Format?
- **Empfehlung:** JSON-Konfigurationsdatei fuer AP-Bibliothek

### F-02: Kanalplanung

- Welche Kanaele sind verfuegbar? (Laenderabhaengig!)
- 2,4 GHz: Kanal 1-13 (EU), 1-11 (US)
- 5 GHz: Kanaele mit DFS-Pflicht?
- **Empfehlung:** EU als Default, konfigurierbar

### F-03: Band Steering / 802.11k/r

- Dokumentiert als Feature des DAP-X2810
- Wie wird das im Tool abgebildet? Nur als Info? Oder aktiv konfiguriert?
- **Post-MVP laut Funktionsliste**

---

## 6. Zusammenfassung: Fragen fuer Phase 4 (Klaerung)

| # | Frage | Kategorie | Empfehlung |
|---|-------|-----------|------------|
| 1 | Mixing Console im MVP? | Widerspruch W-01 | Ja, sonst Run 3 sinnlos |
| 2 | Was bedeutet "Freischaltung"? | Widerspruch W-03 | UI-Flow, kein Paywall |
| 3 | Deployment: Web-App, Electron oder Docker? | Technik T-09 | Web-App + lokaler Server |
| 4 | RSSI-Messung: Manuell, Agent oder Electron? | Technik T-06 | Agent + manueller Fallback |
| 5 | Bevorzugtes Frontend-Framework? | Technik | React + TypeScript |
| 6 | Weitere AP-Modelle gewuenscht? | Feature F-01 | Erweiterbar via JSON |
| 7 | Kanalplanung EU-only oder international? | Feature F-02 | EU Default |
