# Funktionsliste: WLAN-Optimizer

> Vollständige Funktionsübersicht aller Module

## Modul 1: Planung

| # | Funktion | Beschreibung | Priorität |
|---|----------|-------------|-----------|
| P1 | **Grundrissimport** | Upload von Bild/PDF. Referenzlinie mit bekannter Länge zur Maßstabsberechnung. | Hoch |
| P2 | **Wandeditor** | Wände als Linien zeichnen. Dicke (17cm / 36cm) und Material (Poroton) wählbar. Türen/Fenster als Öffnungen. | Hoch |
| P3 | **AP-Bibliothek** | AP-Modelle mit hinterlegten Parametern: Sendeleistung, Antennengewinn, Montagearten. Erweiterbar via Konfigurationsdateien. | Hoch |
| P4 | **AP-Platzierung** | Drag-and-Drop. Konfigurierbar: Position, Montageart (Decke/Wand), Höhe, Ausrichtung. | Hoch |
| P5 | **Vorhersage-Heatmap** | Konservative Heatmap (2,4 + 5 GHz) basierend auf Log-Distance-Modell + Wanddämpfung. Smartphone-Limit als Annahme. | Hoch |

## Modul 2: Messung & Optimierung (Freischalt-Feature)

| # | Funktion | Beschreibung | Priorität |
|---|----------|-------------|-----------|
| M1 | **Messpunkt-Generierung** | Automatische Platzierung strategischer Messpunkte (Ränder, Durchgänge). Manuell verschiebbar. | Hoch |
| M2 | **Run 1: Per-AP-Messung** | Pro AP eine Test-SSID. Messung: RSSI/SNR, Jitter, Paketverlust, Durchsatz (iPerf). | Hoch |
| M3 | **Mixing Console** | Interaktive Schieberegler: TX-Power (je AP/Band), Kanalbreite, Kanalwahl. Sofortige Forecast-Heatmap. | Hoch |
| M4 | **Run 2: Gemeinsame SSID** | Alle APs auf einer Test-SSID. Roaming-Verhalten und Interferenz identifizieren. | Mittel |
| M5 | **Konfigurationsvorschläge** | Automatische Vorschläge (Sendeleistung, Kanalbreite, Kanalwahl) mit Confidence-Level (hoch/mittel/niedrig). | Mittel |
| M6 | **Run 3: Verifikation** | Kurze Messung nach Anwendung der Einstellungen. Vorher-/Nachher-Vergleich. | Mittel |
| M7 | **Berichte & Export** | PDF/PNG Heatmaps, Vorher-/Nachher-Vergleich. Projektexport als JSON. | Niedrig |

## Modul 3: Mess-Agent (optional)

| # | Funktion | Beschreibung | Priorität |
|---|----------|-------------|-----------|
| A1 | **Agent-Software** | Für Notebook/Android. Liefert: BSSID, Kanal, Nachbarschaftsscans. | Mittel |
| A2 | **Browser-Fallback** | Ohne Agent: nur Basic-Metriken (HTTP-basierte Tests). | Mittel |

## Modul 4: Infrastruktur

| # | Funktion | Beschreibung | Priorität |
|---|----------|-------------|-----------|
| I1 | **Mehrsprachige UI** | Key-basierte Übersetzungsdateien (EN/DE). Sprachewechsel zur Laufzeit. | Hoch |
| I2 | **Lokaler Mess-Server** | iPerf3-Server oder ähnlich. Lokal gehostet, keine Cloud. | Hoch |
| I3 | **Projekt-Persistenz** | Speichern/Laden von Projekten. Alle Daten lokal. | Hoch |

## Erweiterungen (Post-MVP)

- Min-RSSI-Kick
- 802.11k/r/v-Tuning
- Automatische Kanalhops
- Multi-Site-Management
- Gerätespezifische Profile
