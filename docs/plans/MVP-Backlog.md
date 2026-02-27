# MVP-Backlog: WLAN-Optimizer

> User Stories mit Akzeptanzkriterien und Priorisierung

## User Stories

### Hohe Priorität (MVP-Kern)

| ID | User Story | Akzeptanzkriterien |
|----|-----------|-------------------|
| **US-01** | Als Benutzer möchte ich einen Grundriss hochladen und eine Referenzlinie zeichnen, um den Maßstab zu bestimmen. | Bild/PDF Upload funktioniert. Nach Zeichnen einer Linie und Eingabe der realen Länge wird der Maßstab korrekt berechnet und angezeigt. |
| **US-02** | Als Benutzer möchte ich Wände auf dem Plan einzeichnen, damit das Tool Wandverluste berechnen kann. | Wände können als Linien gezeichnet werden. Wanddicke (17/36 cm) und Material (Poroton) sind wählbar. |
| **US-03** | Als Benutzer möchte ich Access Points aus einer Bibliothek auswählen und im Plan positionieren. | AP-Modelle mit Parametern stehen zur Auswahl. Drag-and-Drop Platzierung. Bearbeitung möglich. |
| **US-04** | Als Benutzer möchte ich eine Vorhersage-Heatmap sehen, nachdem ich die APs platziert habe. | Konservative Heatmap für 2,4 und 5 GHz wird angezeigt. Legende und Confidence-Info vorhanden. |
| **US-06** | Als Benutzer möchte ich Messpunkte generieren und messen können. | Tool erzeugt Messpunkte (anpassbar). Geführte Messtour (Run 1 + Run 3). |
| **US-07** | Als Benutzer möchte ich eine interaktive Konsole, um AP-Konfigurationen anzupassen und sofort eine neue Heatmap zu sehen. | Schieberegler für TX-Power, Dropdown für Kanalbreite. Heatmap aktualisiert sich sofort. |
| **US-11** | Als Administrator möchte ich die UI auf Englisch und Deutsch bereitstellen. | Alle Texte über Übersetzungsdateien. Sprachwechsel möglich. |
| **US-12** | Als Entwickler möchte ich den Code englisch verfassen mit separaten Übersetzungstabellen. | Codebasis englisch. Übersetzungen via Keys. |

### Mittlere Priorität (MVP-Erweiterung)

| ID | User Story | Akzeptanzkriterien |
|----|-----------|-------------------|
| **US-05** | Als Benutzer möchte ich ein Optimierungsmodul freischalten, das mich durch Messungen führt. | Freischaltung mit Laufzeitanzeige (z.B. 30 Tage). Assistent startet. |
| **US-08** | Als Benutzer möchte ich Konfigurationsvorschläge mit Risikobewertung erhalten. | Vorschläge nach Messungen. Confidence-Level (hoch/mittel/niedrig). Annehmen/Ablehnen möglich. |
| **US-09** | Als Benutzer möchte ich Einstellungen übernehmen und die Leistung verifizieren. | Verifikationslauf nach Änderungen. Heatmap + Qualitätsmetriken. |
| **US-13** | Als Benutzer möchte ich einen optionalen Mess-Agent installieren können. | Agent für Notebook: RSSI/BSSID/Channel/Scanlisten. Browser-Fallback auf Basic-Metriken. |

### Niedrige Priorität (Post-MVP)

| ID | User Story | Akzeptanzkriterien |
|----|-----------|-------------------|
| **US-10** | Als Benutzer möchte ich das Projekt speichern und exportieren. | JSON-Export. Heatmaps als PDF/PNG. |

## Technische Umsetzungshinweise

| Thema | Details |
|-------|---------|
| **Mess-Service** | Lokaler iPerf3-Server. Smartphones: HTTP-Basistests. Agent: erweiterte Metriken. |
| **RF-Modellierung** | Log-Distance-Modell für Forecast. Nach Messungen: Differenzwerte (Measured + Delta). |
| **Sicherheit** | Jede Änderung muss rückgängig machbar sein. Warnhinweise bei Unterschreitung von Mindestabdeckung. |
| **Erweiterbarkeit** | Post-MVP: Min-RSSI, 802.11k/r/v, Multi-Site, gerätespezifische Profile. |
