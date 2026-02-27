# PRD: Home-Netzwerk-Planungs- und Optimierungstool

> **Version:** 1.0 | **Status:** Entwurf | **Datum:** 27.02.2026

## 1. Zusammenfassung

Open-Source-Tool zur Planung, Messung und Optimierung von WLAN-Infrastrukturen in Heimnetzwerken. Richtet sich an Nutzer ohne tiefes Netzwerk-Fachwissen. Herstellerunabhängig, lokal betrieben, keine Cloud-Abhängigkeit.

**Kernidee:** Grundriss hochladen, Wände einzeichnen, APs platzieren, Heatmap berechnen. Optional: geführte Messungen mit realen Daten und automatische Optimierungsvorschläge.

## 2. Projektziel & Motivation

Heimnetzwerke werden zunehmend komplex (VLANs, mehrere APs, Mesh-Repeater, verschiedene Hersteller). Bestehende Tools sind proprietär und setzen Expertenwissen voraus.

**Ziel:** Herstellerunabhängige, einfach bedienbare Software mit:
- **Planung** - Grundriss + Wände + APs = konservative Heatmap
- **Optimierung** - Geführte Messläufe + Analyse + Konfigurationsvorschläge
- **Benutzerführung** - Schritt-für-Schritt-Assistent, Undo jederzeit möglich
- **Internationalisierung** - Code englisch, UI deutsch + englisch

## 3. Zielgruppe

- Besitzer großer Heimnetze / Home-Labs (mehrere APs, VLANs, zentrale Firewall z.B. OPNsense)
- Technikaffine Nutzer, die professionelle Ergebnisse ohne Komplexität wünschen
- Open-Source-Enthusiasten

## 4. Funktionale Anforderungen

### 4.1 Grundriss-Import & Maßstab
- Import von Grundrissen (Bild/PDF)
- Maßstabsdefinition via Referenzlinie mit bekannter Länge
- Wände als gerade Linien zeichnen (keine Kurven)
- Pro Wand: Material (z.B. Poroton, Beton) und Dicke wählbar
- Türen/Fenster als Öffnungen definierbar

### 4.2 AP-Bibliothek & Platzierung
- Datenblätter bekannter Modelle (z.B. D-Link DAP-X2810)
- Parameter: Sendeleistung, Antennengewinn, Montagearten
- Drag-and-Drop Platzierung im Grundriss
- Montage-Optionen: Decke/Wand, Höhe, Ausrichtung
- Automatische Vorschläge für AP-Anzahl und -Position

### 4.3 Heatmap-Berechnung
- Konservative Abdeckungsprognosen für 2,4 GHz und 5 GHz
- Indoor-Log-Distance-Modell mit Wanddämpfung
- Berücksichtigung von Material, Wandstärke, Montageort
- Echtzeit-Aktualisierung bei Parameteränderungen

### 4.4 Optimierungsassistent (Freischalt-Feature)

**Drei Messläufe:**

| Lauf | Beschreibung | Zweck |
|------|-------------|-------|
| **Run 1** | Pro AP eine Test-SSID | Abdeckung & Überlappung pro AP bestimmen |
| **Run 2** | Gemeinsame Test-SSID | Roaming-Verhalten & Interferenz erkennen |
| **Run 3** | Verifikation im Produktivnetz | Wirkung der Änderungen prüfen |

**Messwerte:** RSSI/SNR, Durchsatz (iPerf), Latenz, Jitter, Paketverlust, Roaming-Eigenschaften

**Analyse:** Überschneidungen, Funklöcher, Sticky Clients, Konfigurationsvorschläge mit Confidence-Level

### 4.5 Live-Konsole (Mixing Console)
- Schieberegler: TX-Power je AP und Band, Kanalbreite, Kanalwahl
- Sofortige Visualisierung als Forecast-Heatmap
- Änderungen anwenden / rückgängig machen

### 4.6 Berichte & Export
- Export: Projektdateien (JSON), Heatmaps (PNG/PDF)
- Vorher-/Nachher-Vergleich mit angewandten Optimierungen

### 4.7 Lokalisierung
- Key-basierte Übersetzungsdateien (EN/DE)
- Infrastruktur für weitere Sprachen

## 5. Nicht-funktionale Anforderungen

| Anforderung | Details |
|-------------|---------|
| **Datenschutz** | Alle Daten bleiben lokal, keine Cloud-Abhängigkeit |
| **Erweiterbarkeit** | Modularer Aufbau (AP-Modelle, Materialien, Messverfahren) |
| **Benutzerfreundlichkeit** | Visuell ansprechend, intuitiv, auch ohne Fachwissen bedienbar |

## 6. Abhängigkeiten & Annahmen

- Eigener iPerf-Server und Mess-Agent werden mitgeliefert
- AP-Modelle müssen in Bibliothek integriert werden (TX-Power, Antennengewinn etc.)
- Messungen sind OS-abhängig (iOS kann z.B. keine BSSID auslesen)
- Agent-Software auf Notebook liefert erweiterte Daten

## 7. MVP-Scope

**Enthalten im MVP:**
- Grundriss-Import + Maßstab (Req 4.1)
- Wandeditor (Req 4.1)
- AP-Bibliothek + Platzierung (Req 4.2)
- Heatmap-Berechnung (Req 4.3)
- Basisfunktionen Optimierungsassistent: Run 1 + Run 3 (Req 4.4 teilweise)

**Spätere Erweiterungen:**
- Vollständiger Optimierungsassistent (Run 2)
- Live-Konsole / Mixing Console
- Berichte & Export
- Mess-Agent
