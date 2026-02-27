# Wissensluecken-Analyse: WLAN-Optimizer

> **Phase 2 Deliverable** | **Datum:** 2026-02-27 | **Aktualisiert:** 2026-02-27 (Phase 4 Review)
> **Status:** Aktualisiert mit Phase-3-Recherche-Ergebnissen
>
> Systematische Identifikation aller offenen Fragen, fehlenden Informationen und
> Entscheidungen, die vor der Implementierung geklaert werden muessen.
>
> Jede Luecke hat eine eindeutige ID, Prioritaet und Art.
>
> **Legende Status:**
> - BEANTWORTET = Durch Phase-3-Recherche vollstaendig geklaert
> - TEILWEISE = Durch Recherche teilweise geklaert, Details offen
> - OFFEN = Noch ungeklaert, erfordert Benutzer-Entscheidung oder weitere Arbeit
> - OFFEN (Benutzer) = Kann nur der Benutzer beantworten (Phase 4)

---

## Widersprueche zwischen bestehenden Dokumenten

Vor der eigentlichen Lueckenanalyse: Diese Inkonsistenzen muessen in Phase 4 geklaert werden.

### WID-01: MVP-Scope der Mixing Console
- **Prioritaet:** HOCH
- **Art:** Benutzer fragen
- **Status:** OFFEN (Benutzer) -- siehe Phase4-Fragenkatalog.md F-01
- **Beschreibung:** Das PRD (Abschnitt 7) listet "Live-Konsole / Mixing Console" als **spaetere Erweiterung** (nicht MVP). Gleichzeitig listet der MVP-Backlog (US-07) die Mixing Console als **Hohe Prioritaet (MVP-Kern)**, und die Funktionsliste (M3) ebenfalls mit Prioritaet **Hoch**. Da Run 3 (Verifikation nach Aenderungen) ohne Mixing Console keinen Sinn ergibt, muss geklaert werden: Gehoert die Mixing Console in den MVP?
- **Phase-3-Ergebnis:** Technische Machbarkeit bestaetigt (Canvas-Heatmap.md: Echtzeit-Heatmap mit Web Workers moeglich, AP-Steuerung.md: Web-Interface-Scraping als Steuerungsweg). Empfehlung: Forecast-Only im MVP, Live-Steuerung als Erweiterung.

### WID-02: Freischalt-Feature vs. Open Source
- **Prioritaet:** HOCH
- **Art:** Benutzer fragen
- **Status:** OFFEN (Benutzer) -- siehe Phase4-Fragenkatalog.md F-02
- **Beschreibung:** US-05 erwaehnt "Freischaltung mit Laufzeitanzeige (z.B. 30 Tage)". Das Projekt ist MIT-lizenziert. Ist das ein Bezahlmodell (Freemium)? Ein License-Key-System? Oder nur ein UI-Flow, bei dem der Nutzer das Optimierungsmodul "aktiviert"? Ein Bezahlmodell widerspricht nicht der MIT-Lizenz, waere aber bei Open Source unueblich.
- **Phase-3-Ergebnis:** Open-Source-Evaluation zeigt: Kein vergleichbares MIT-lizenziertes Tool existiert. Feature-Gates bei MIT-Lizenz sind trivial zu umgehen (Fork). Empfehlung: UI-gestuftes Onboarding ohne Paywall.

---

## 1. RF-Modellierung & Physik

### WL-RF-01: Unvollstaendige Materialdatenbank
- **Prioritaet:** HOCH
- **Art:** Recherche noetig
- **Status:** BEANTWORTET -- siehe `docs/research/RF-Materialien.md`
- **Ergebnis:** 27 Wandmaterialien (W01-W27) und 4 Deckentypen (F01-F04) mit konservativen Daempfungswerten fuer 2.4/5/6 GHz dokumentiert. Basierend auf NIST-1997, ITU-R P.1238, ITU-R P.2040, iBwave, wlan-blog.com und weiteren Quellen. Drei vereinfachte Kategorien (leicht/mittel/schwer) als Schnellauswahl.
- **Beschreibung:** Die aktuelle Wanddaempfungstabelle enthaelt nur vier Materialien (Poroton duenn/dick, Beton, Trockenbauwand). Fuer ein praxistaugliches Tool fehlen zahlreiche gaengige Baumaterialien:
  - Kalksandstein (KS, sehr verbreitet in DE)
  - Ziegel/Klinker (Altbauten)
  - Holz/Fachwerk
  - Glas (Fenster: einfach/doppelt/dreifach verglast, Waermeschutzglas mit Metallbeschichtung)
  - Metall (Aufzugschacht, Stahltraeger, Brandschutztueren)
  - Gasbeton/Porenbeton (Ytong)
  - Stahlbeton mit Armierung (vs. unbewehrt -- Armierung erhoeht Daempfung signifikant)
  - Leichtbauwand mit Daemmung (Mineralwolle, Styropor, unterschiedliche Dicken)
  - Tueren (Holz, Metall, Glas -- offen vs. geschlossen)
  - Fensterfronten (grosse Glasflaechen, typisch in modernen Wohnungen)
- **Warum wichtig:** Ohne realistische Materialwerte sind die Heatmap-Prognosen unbrauchbar. Poroton allein deckt nur einen Bruchteil deutscher Wohngebaeude ab. Kalksandstein ist in Norddeutschland extrem verbreitet, Altbauten haben Ziegelmauerwerk, Neubauten oft Porenbeton.

### WL-RF-02: Daempfungswerte haben grosse Bandbreiten
- **Prioritaet:** HOCH
- **Art:** Recherche noetig + Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/RF-Materialien.md` Abschnitt 2
- **Ergebnis:** Konservatives Prinzip angewendet: Bei Daempfungsbereichen wird der obere Wert als Default verwendet. Jedes Material hat Default-Wert UND Bereich (attenuationRange). 6-GHz-Werte durch Extrapolation (Faktor 1.15-1.30) berechnet. Freie Dickeneingabe: Lineare Skalierung in dB empfohlen, aber Fixe Presets priorisiert (Benutzer kennen selten exakte Wanddicke).
- **Beschreibung:** Die dokumentierten Daempfungswerte haben breite Bereiche (z.B. Poroton duenn: 4-6 dB bei 2.4 GHz). Offene Fragen:
  - Welcher Default-Wert wird verwendet? Das rf-modell.md sagt "oberer Wert" (konservativ), aber die RF-Modellierung.md gibt nur Bereiche an -- wo ist der verbindliche Default?
  - Sollen Benutzer die Daempfung pro Wand manuell feintunen koennen?
  - Wie verhaelt sich die Daempfung bei schraegem Einfallswinkel? (ITU-R P.1238 beruecksichtigt das nicht explizit, reale Daempfung kann um Faktor 2-3 steigen)
  - Frequenzabhaengigkeit: Die Daempfung ist nicht-linear zwischen 2.4 und 5 GHz -- reichen zwei Tabellenwerte oder brauchen wir eine Interpolationsfunktion fuer zukuenftige 6-GHz-Erweiterungen (Wi-Fi 6E/7)?
- **Warum wichtig:** Die Qualitaet der Heatmap steht und faellt mit realistischen Daempfungswerten. Eine falsche Entscheidung hier macht alle Heatmaps systematisch falsch.

### WL-RF-03: Multi-Floor-Modellierung nicht spezifiziert
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Physik/Daempfung dokumentiert in `docs/research/RF-Materialien.md` Abschnitt 5, MVP-Scope noch OFFEN (Benutzer) -- siehe F-04
- **Ergebnis:** FAF-Werte nach ITU-R P.1238 dokumentiert. 4 Deckentypen (F01-F04) mit Daempfungswerten. Additionsmodell empfohlen fuer MVP. DB-Schema hat bereits floors-Tabelle. Offene Benutzer-Frage: Multi-Floor im MVP oder spaeter?
- **Beschreibung:** Die Formel enthaelt `L_Stockwerke`, aber das PRD sagt "nicht im MVP". Offene Fragen:
  - Wird Multi-Floor ueberhaupt unterstuetzt (auch post-MVP)?
  - Falls ja: Wie modelliert man die Daempfung zwischen Stockwerken? (Betondecke 15-25 cm mit Estrich, Holzbalkendecke, Altbau vs. Neubau)
  - Wie stellt man mehrere Stockwerke in der UI dar? (Tabs? Layer? Separate Projekte?)
  - Vertikale AP-Abdeckung: Ein Decken-montierter AP strahlt auch nach oben/unten durch die Decke
  - Muss die Datenarchitektur von Anfang an Multi-Floor-faehig sein?
- **Warum wichtig:** Viele Heimnetzwerke erstrecken sich ueber mehrere Stockwerke. Ohne zumindest eine Konzeptidee wird die Architektur moeglicherweise nicht erweiterbar.

### WL-RF-04: Reflexionen und Multipath werden ignoriert
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- bewusste Entscheidung, vereinfachtes Modell zu verwenden
- **Ergebnis:** Dokumentiert in RF-Materialien.md Abschnitt 7: Unkalibriertes Modell hat RMSE 8-12 dB, kalibriert 3-6 dB. Die Varianz innerhalb eines Raumes (Shadow Fading: 3-8 dB) ist eine fundamentale physikalische Grenze. Branchenueblich (auch Ekahau nutzt aehnliche Vereinfachungen). Wird transparent dokumentiert.
- **Beschreibung:** Das Log-Distance-Modell mit Wanddaempfung modelliert nur den direkten Pfad. In der Realitaet gibt es:
  - Reflexionen an Metalloberflaechen, Spiegeln, Fenstern
  - Multipath-Effekte (konstruktive/destruktive Interferenz)
  - Beugung an Kanten und Tueroeffnungen
  - Streuung an Moebeln und anderen Objekten
- **Warum wichtig:** Fuer den MVP ist eine vereinfachte Modellierung akzeptabel und branchenueblich (auch kommerzielle Tools wie Ekahau nutzen aehnliche Vereinfachungen). Es sollte aber transparent dokumentiert werden, dass das Modell diese Effekte nicht beruecksichtigt, und ein Confidence-Level angezeigt werden.

### WL-RF-05: Antennen-Strahlungsdiagramm nicht modelliert
- **Prioritaet:** HOCH
- **Art:** Recherche noetig
- **Status:** TEILWEISE -- Grunddaten vorhanden, detaillierte Pattern-Daten fehlen
- **Ergebnis:** AP-Steuerung.md dokumentiert TX-Power-Stufen und Antennengewinn (2.4 GHz: 23 dBm TX / 3.2 dBi, 5 GHz: 26 dBm TX / 4.3 dBi). FCC-Filing wurde nicht geprueft (erfordert Zugang zur FCC-Datenbank). Fuer den MVP reicht der pauschale Gewinn mit einem Montageart-Faktor (z.B. -3 dB fuer Deckenmontage in 2D-Projektion). Detaillierte 3D-Pattern koennen post-MVP ergaenzt werden.
- **Beschreibung:** Der DAP-X2810 hat lt. Datenblatt unterschiedliche Strahlungsdiagramme fuer Decken- und Wandmontage. Die aktuelle Formel nutzt nur einen pauschalen Antennengewinn (3.2/4.3 dBi). Es fehlt:
  - 3D-Strahlungsdiagramm-Daten (oder zumindest H-Plane/E-Plane Schnitte)
  - Wie wirkt sich die Montagehoehe aus? (Decke 2.5m vs. Wand 1.5m -- das Tool berechnet 2D, aber die Empfangshoehe ist ~1m bei Smartphone-Nutzung)
  - Wie modelliert man den Gewinn richtungsabhaengig im 2D-Modell?
  - Vereinfachung: Reicht ein einfacher Daempfungsfaktor basierend auf Montageart (z.B. -3 dB unterhalb des AP bei Deckenmontage fuer 2D-Projektion)?
  - Wo bekommt man die Antennen-Pattern-Daten? (D-Link Datenblatt? FCC Filing?)
- **Warum wichtig:** Ein Decken-AP strahlt anders als ein Wand-AP. Bei Deckenmontage ist der Gewinn in der Horizontalebene (wo die 2D-Heatmap berechnet wird) typischerweise 3-6 dB niedriger als der Maximalgewinn.

### WL-RF-06: Co-Channel-Interferenz zwischen APs nicht berechnet
- **Prioritaet:** MITTEL
- **Art:** Recherche noetig + Technisches Experiment
- **Status:** TEILWEISE -- Konzept dokumentiert, Implementierung offen
- **Ergebnis:** Canvas-Heatmap.md (Abschnitt 5.3) beschreibt die Berechnung fuer Multi-AP-Szenarien (bester AP pro Punkt, RSSI-Vergleich). SINR-Berechnung und CCI sind im RF-Modell noch nicht spezifiziert. Fuer den MVP reicht RSSI-basierte "bester AP"-Zuweisung. SINR-Berechnung ist Post-MVP.
- **Beschreibung:** Bei mehreren APs auf demselben oder ueberlappenden Kanal entsteht Co-Channel-Interferenz (CCI). Die aktuelle Heatmap beruecksichtigt nur RSSI, nicht:
  - Signal-to-Interference-plus-Noise Ratio (SINR) statt nur RSSI
  - CCI-Berechnung bei gleichen Kanaelen (Signal vom gewuenschten AP vs. Stoersignal von anderen APs)
  - Adjacent Channel Interference (ACI) bei ueberlappenden Kanaelen (z.B. Kanal 1 und 3 bei 2.4 GHz)
  - Einfluss auf den effektiven Durchsatz (Shannon-Kapazitaet: C = B * log2(1 + SINR))
  - Nachbar-WLANs (die kennt man nicht, aber man koennte einen "Noise Floor" konfigurierbar machen)
- **Warum wichtig:** Ein Benutzer mit 3 APs auf Kanal 1 sieht vielleicht ueberall eine gruene Heatmap, hat aber tatsaechlich schlechte Performance durch Interferenz. Ohne SINR-Berechnung koennen wir keine sinnvolle Kanalplanung anbieten.

### WL-RF-07: Freiraum-Pfadverlust PL(1m) -- Frequenzband-Details
- **Prioritaet:** NIEDRIG
- **Art:** Recherche noetig
- **Status:** BEANTWORTET -- siehe `docs/research/RF-Materialien.md` Abschnitt 6
- **Ergebnis:** FSPL-Werte dokumentiert: 2.4 GHz = 40.05 dB, 5.0 GHz = 46.42 dB, 6.0 GHz = 47.96 dB. Die Differenz innerhalb eines Bandes betraegt max. 1.5 dB -- vernachlaessigbar fuer unser Modell. Kanalabhaengige Berechnung ist moeglich aber nicht noetig fuer den MVP.
- **Beschreibung:** Die rf-modell.md gibt feste Werte an (40.05 dB bei 2.4 GHz, 46.42 dB bei 5 GHz). Offene Fragen:
  - Fuer welche exakte Frequenz gelten diese Werte? (2.4 GHz Band hat 2.412-2.484 GHz, 5 GHz hat 5.15-5.85 GHz -- die Differenz betraegt bis zu 1.5 dB innerhalb des Bandes)
  - Sollte der Wert je nach konfiguriertem Kanal leicht variieren?
  - Die Berechnung ist konsistent mit der Friis-Formel (verifiziert: 20*log10(4*pi*1/0.125) = 40.05 dB)
- **Warum wichtig:** Geringer praktischer Einfluss (< 1.5 dB Unterschied), aber fuer die Transparenz und Korrektheit der Berechnung relevant.

---

## 2. AP-Steuerung & Hardware

### WL-AP-01: AP-Zugriffsmethode vollkommen ungeklaert
- **Prioritaet:** HOCH
- **Art:** Recherche noetig + Technisches Experiment
- **Status:** TEILWEISE -- Recherche abgeschlossen, empirische Verifizierung am Geraet noch ausstehend
- **Ergebnis:** Umfassend dokumentiert in `docs/research/AP-Steuerung.md`. Vier Steuerungsansaetze identifiziert: (1) Web-Interface Scraping (HOCH Machbarkeit, Primaer-Ansatz), (2) SNMP v1/v2c (MITTEL, Sekundaer), (3) CLI ueber Seriell/Telnet (MITTEL, Fallback), (4) Nuclias Connect API (NICHT empfohlen). OpenWrt NICHT kompatibel. Firmware v1.25.053 empfohlen. Verifizierungsplan dokumentiert (Abschnitt 8). NOCH OFFEN: Empirischer Test am echten Geraet (Web-Interface reverse-engineeren, SNMP-Walk, CLI-Test).
- **Beschreibung:** Die Entscheidung D-01 besagt "Direkter AP-Zugriff statt Nuclias Connect". Aber WIE genau auf den AP zugegriffen wird, ist voellig ungeklaert. Der DAP-X2810 ist ein Business-AP, der primaer fuer Nuclias Connect konzipiert ist. Es muss experimentell geprueft werden:
  - **REST-API**: Hat der AP eine dokumentierte oder undokumentierte HTTP-API? D-Link Business-APs haben manchmal eine interne API, die das Web-Interface nutzt.
  - **SNMP**: Welche MIBs werden unterstuetzt? Welche OIDs fuer TX-Power, Channel, SSID, Client-Liste? SNMP v2c oder v3?
  - **SSH/Telnet**: Ist das aktivierbar? Gibt es eine CLI? Welche Befehle?
  - **Web-Interface-Scraping**: Als Fallback -- HTTP-POST-Analyse des Admin-Panels. Fragil, bricht bei Firmware-Updates.
  - **UPnP/TR-069**: Moeglicherweise fuer automatische Erkennung nutzbar?
  - **Firmware-Version**: Ab welcher Version sind welche Schnittstellen verfuegbar?
  - **Gibt es eine offizielle D-Link API-Dokumentation** fuer Business-APs (nicht Nuclias Cloud)?
- **Warum wichtig:** KRITISCH. Dies ist die groesste einzelne Unbekannte im Projekt. Ohne eine funktionierende AP-Steuerung koennen wir keine Test-SSIDs erstellen, keine TX-Power aendern, und der gesamte Optimierungsassistent sowie die Mixing Console funktionieren nicht. Falls keine programmatische Steuerung moeglich ist, muss das Konzept grundlegend ueberarbeitet werden.

### WL-AP-02: SSID-Erstellung und -Management
- **Prioritaet:** HOCH
- **Art:** Technisches Experiment
- **Status:** TEILWEISE -- Web-Interface hat SSID-Verwaltung, programmatischer Zugriff nicht verifiziert
- **Ergebnis:** AP-Steuerung.md listet SSID und SSID-Hidden als steuerbare Parameter im Web-Interface. Bis zu 8 SSIDs pro Radio sind bei D-Link Business-APs ueblich (nicht verifiziert fuer DAP-X2810). Programmatische Erstellung haengt von Web-Interface-Scraping ab (noch nicht am Geraet getestet). Fallback: Benutzer erstellt Test-SSIDs manuell.
- **Beschreibung:** Fuer Run 1 muss pro AP eine eigene Test-SSID erstellt werden. Offene Fragen:
  - Wie viele SSIDs kann der DAP-X2810 gleichzeitig? (typisch 8-16 pro Radio, also 16-32 gesamt)
  - Koennen SSIDs programmatisch erstellt/geloescht werden? (haengt von WL-AP-01 ab)
  - Welches VLAN-Mapping brauchen die Test-SSIDs? (muessen sie Internet-Zugang haben fuer iPerf?)
  - Wie lange dauert ein SSID-Wechsel? (Clients muessen sich neu verbinden)
  - Was passiert mit bestehenden Clients waehrend des Tests? (Disconnect? Koexistenz?)
  - Sicherheitseinstellungen der Test-SSID (WPA2/3? Open? PSK?)
- **Warum wichtig:** Ohne programmatische SSID-Steuerung muss der Benutzer alles manuell am AP konfigurieren, was den Optimierungsassistenten massiv entwertet.

### WL-AP-03: TX-Power-Steuerung in Echtzeit
- **Prioritaet:** HOCH
- **Art:** Technisches Experiment
- **Status:** TEILWEISE -- Steuerungswege dokumentiert, Echtzeit-Verhalten nicht verifiziert
- **Ergebnis:** AP-Steuerung.md: TX-Power ist im Web-Interface steuerbar (vermutlich Dropdown mit Stufen). SNMP IEEE802dot11-MIB hat dot11CurrentTxPowerLevel als Read-Write OID (nicht verifiziert ob DAP-X2810 das implementiert). Erwartete TX-Stufen: 8 Stufen (Full bis Min). Ob TX-Power-Aenderung einen Radio-Restart erfordert, ist NICHT bekannt. NOCH OFFEN: Empirischer Test.
- **Beschreibung:** Die Mixing Console erfordert Live-Aenderung der Sendeleistung. Offene Fragen:
  - In welchen Stufen kann die TX-Power geaendert werden? (1 dBm Schritte? Nur vordefinierte Levels wie Low/Medium/High/Full?)
  - Wie lange dauert eine TX-Power-Aenderung? (sofort wirksam, oder Reboot/Radio-Restart noetig?)
  - Trennt eine TX-Power-Aenderung bestehende Client-Verbindungen?
  - Koennen 2.4 GHz und 5 GHz Radio getrennt gesteuert werden?
  - Gibt es ein Minimum fuer TX-Power? (z.B. 3 dBm als untere Grenze)
- **Warum wichtig:** Wenn eine TX-Power-Aenderung einen AP-Reboot erfordert (30-60 Sekunden), ist die "Live"-Mixing-Console kein Echtzeit-Feature sondern ein langwieriger Prozess.

### WL-AP-04: Kanalwahl und Bandbreitensteuerung
- **Prioritaet:** MITTEL
- **Art:** Technisches Experiment
- **Status:** TEILWEISE -- Kanaele/Bandbreite im Web-Interface sichtbar, Details nicht verifiziert
- **Ergebnis:** AP-Steuerung.md: Kanalauswahl (Auto oder manuell), Kanalbreite (20/40/80 MHz, Annahme), DFS nicht explizit dokumentiert. Parametermatrix (Abschnitt 3.1) zeigt: Channel per Web-GUI (Ja), SNMP (Moeglich), CLI (Moeglich). NOCH OFFEN: Welche Kanaele genau? DFS-Verhalten? Kanalwechsel-Dauer?
- **Beschreibung:** Offene Fragen zur Kanalsteuerung:
  - Welche Kanaele sind am DAP-X2810 konfigurierbar? (Laenderabhaengig: EU hat Kanal 1-13 bei 2.4 GHz)
  - DFS-Kanaele bei 5 GHz: Unterstuetzt? Radar-Erkennung?
  - Kanalbreite: 20/40/80 MHz einstellbar? 160 MHz?
  - Automatischer Kanalwechsel bei DFS-Radar-Erkennung -- stoert das unsere Messungen?
  - Kanalwechsel-Dauer und Auswirkung auf verbundene Clients?
  - Regionskonfiguration: Muss am AP separat eingestellt werden?
- **Warum wichtig:** Kanalwahl ist ein Kernaspekt der Optimierung. Ohne Verstaendnis der Moeglichkeiten koennen wir keine sinnvollen Vorschlaege machen.

### WL-AP-05: Herstellerunabhaengigkeit und Abstraktionsschicht
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Architektur empfohlen, Scope-Entscheidung OFFEN (Benutzer) -- siehe F-19
- **Ergebnis:** AP-Steuerung.md Abschnitt 9: APControllerTrait mit WebGUIDriver/SNMPDriver/CLIDriver als Adapter-Pattern empfohlen. Architektur ist erweiterbar. Offene Benutzer-Frage: Nur DAP-X2810 oder auch generisches Profil?
- **Beschreibung:** Das PRD spricht von "herstellerunabhaengig", aber die aktuelle Planung fokussiert ausschliesslich auf D-Link DAP-X2810. Offene Fragen:
  - Wird eine AP-Abstraktionsschicht (Interface/Adapter-Pattern) implementiert?
  - Welche weiteren AP-Hersteller sollen mittel-/langfristig unterstuetzt werden? (UniFi ist bei Heimnutzern sehr verbreitet, TP-Link Omada bei preisbewussten Nutzern)
  - Gibt es herstelleruebergreifende Standards fuer AP-Steuerung? (SNMP ist am universellsten, aber MIBs sind herstellerspezifisch)
  - MVP: Nur D-Link, aber Architektur erweiterbar?
  - Wie modular muss die AP-Bibliothek sein? (JSON-Config pro Hersteller/Modell?)
- **Warum wichtig:** Falls langfristig nur D-Link unterstuetzt wird, ist die Zielgruppe stark eingeschraenkt. Die Architektur muss von Anfang an auf Erweiterbarkeit ausgelegt sein.

### WL-AP-06: Sicherheit bei AP-Zugriff
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Risiken dokumentiert, konkrete Implementierung offen
- **Ergebnis:** AP-Steuerung.md: SNMP v2c nutzt Community Strings im Klartext, Web-Interface HTTP (unverschluesselt) oder HTTPS (self-signed). Firmware-Kompatibilitaetspruefung empfohlen. Automatisches Backup vor Aenderungen empfohlen. Credential-Speicherung (Keychain vs. DB) ist Architektur-Entscheidung fuer Phase 5.
- **Beschreibung:** Wenn das Tool AP-Konfigurationen aendert, ergeben sich Sicherheitsfragen:
  - Wie werden AP-Zugangsdaten (Admin-Passwort, SNMP Community String) gespeichert? (Klartext in SQLite? Verschluesselt? Betriebssystem-Keychain?)
  - HTTPS fuer Web-Interface-Zugriff oder unsicheres HTTP? (Self-signed Zertifikate?)
  - SNMP v2c (Community String im Klartext auf dem Netzwerk) vs. v3 (verschluesselt)
  - Berechtigungskonzept: Mehrere Benutzer? (vermutlich nicht relevant fuer Heimnetzwerk)
  - Automatisches Backup der AP-Konfiguration VOR Aenderungen (fuer Rollback)?
  - Timeout-Handling: Was wenn der AP waehrend einer Konfigurationsaenderung nicht antwortet?
- **Warum wichtig:** Ein Tool das AP-Konfigurationen aendert, kann bei Fehlern das Netzwerk unbrauchbar machen. Sicherer Umgang mit Zugangsdaten und robustes Rollback sind essentiell.

---

## 3. Canvas & UI

### WL-UI-01: Canvas-Library-Auswahl nicht getroffen
- **Prioritaet:** HOCH
- **Art:** Recherche noetig + Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` und `docs/research/Tech-Stack-Evaluation.md`
- **Ergebnis:** Konva.js mit svelte-konva empfohlen. Gruende: Offizielle Svelte 5 Runes Integration, Layer-System ideal fuer Grundriss + Heatmap Overlay, MIT-Lizenz, aktiv maintained (~830k npm Downloads/Woche). Hybrid-Ansatz: Konva fuer interaktive Elemente, nativer Canvas fuer Heatmap (ImageData + putImageData). Fabric.js als Alternative evaluiert und verworfen (keine Svelte-Integration).
- **Beschreibung:** Fuer die Grundriss-Zeichnung und Heatmap-Darstellung wird eine Canvas-Loesung benoetigt. Kandidaten mit ihren Trade-offs:
  - **Konva.js** (+ svelte-konva): 2D-Canvas-Framework, Objekt-basiert, gute Event-Handling, solide Community. Nachteil: Rein Canvas-basiert, keine WebGL-Beschleunigung.
  - **Fabric.js**: Aehnlich wie Konva, staerkerer SVG-Support, gutes Undo/Redo. Nachteil: Svelte-Integration unklar.
  - **PixiJS**: WebGL-basiert, deutlich performanter fuer grosse Heatmaps (GPU-Rendering). Nachteil: Komplexer, primaer fuer Games, Overkill fuer Grundriss-Zeichnung.
  - **Native Canvas API**: Maximale Kontrolle, kein Framework-Overhead. Nachteil: Alles selbst bauen (Event-Handling, Hit-Detection, etc.)
  - **SVG**: Besser fuer Vektorgrafik (Waende), skaliert besser. Nachteil: Performance bei tausenden SVG-Elementen (Heatmap-Zellen)
  - **Hybrid-Ansatz**: SVG fuer Grundriss-Elemente (Waende, APs) + Canvas/WebGL fuer Heatmap-Overlay
  - Relevante Evaluationskriterien: Svelte-5-Kompatibilitaet, Tauri-WebView-Performance (WKWebView auf macOS, Edge WebView2 auf Windows), Touch-Events, Zoom/Pan, Hit-Detection, Memory-Footprint
- **Warum wichtig:** Die Canvas-Library bestimmt die gesamte UI-Architektur des Planungsmoduls und ist spaeter nur mit grossem Aufwand austauschbar.

### WL-UI-02: Grundriss-Zeichenlogik im Detail
- **Prioritaet:** HOCH
- **Art:** Technisches Experiment
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` Abschnitt 2 und 5
- **Ergebnis:** Detaillierte Implementierungs-Patterns dokumentiert: Snap-to-Grid (konfigurierbar), Wand-Darstellung als Linie mit Breite (Konva Line + strokeWidth basierend auf Material), Drag-and-Drop, Undo/Redo (Command-Pattern mit $state-Array), Zoom/Pan (Konva Stage draggable + Wheel-Event), Selection/Multi-Edit, Wand-Labels. Code-Beispiele in Svelte 5 + svelte-konva vorhanden.
- **Beschreibung:** Das Zeichnen von Waenden auf einem importierten Grundriss erfordert erhebliche Implementierungsarbeit:
  - **Snapping**: Waende an Endpunkten einrasten (Snap-to-Grid, Snap-to-Endpoint, Snap-to-Edge)
  - **Wand-Darstellung**: Linie mit Breite (Dicke visuell darstellen) oder nur Mittellinie? Farbcodierung nach Material?
  - **Wand-Kreuzungen**: T-Stuecke, L-Stuecke und Kreuzungen korrekt zeichnen (Eckenbereinigung)
  - **Editier-Modus**: Waende nachtraeglich aendern (verschieben, Material aendern, loeschen)
  - **Undo/Redo**: Command-Pattern fuer alle Zeichenaktionen
  - **Zoom und Pan**: Mausrad-Zoom, Mittelklick-Pan, Trackpad-Gesten
  - **Wand-Labels**: Material und Dicke an der Wand anzeigen (bei Hover oder permanent)
  - **Oeffnungen**: Tueren/Fenster als Luecken in Waenden modellieren
  - **Selection und Multi-Edit**: Mehrere Waende gleichzeitig auswaehlen und bearbeiten
- **Warum wichtig:** Die Zeichenerfahrung bestimmt massgeblich die Benutzerfreundlichkeit und ist das Erste was der Benutzer sieht.

### WL-UI-03: Grundriss-Bildverarbeitung und Import
- **Prioritaet:** MITTEL
- **Art:** Recherche noetig
- **Status:** TEILWEISE -- Bild-Import dokumentiert, PDF-Import-Technologie offen
- **Ergebnis:** Canvas-Heatmap.md Abschnitt 2.4: Grundriss als Konva.Image auf Background-Layer. Unterstuetzte Formate: PNG, JPG (nativ). PDF-Import: pdf.js im Frontend oder Rust-Library (poppler-rs, pdf-extract) im Backend -- noch nicht entschieden. Referenzlinie fuer Massstab: Zwei-Punkt-Klick + Laengeneingabe. OFFEN: PDF-Strategie, maximale Bildgroesse/Aufloesung.
- **Beschreibung:** Beim Import von Grundrissbildern/-PDFs gibt es offene Fragen:
  - Unterstuetzte Bildformate: PNG, JPG, SVG, TIFF, BMP?
  - **PDF-Import**: Wie wird ein PDF in ein Canvas-Bild umgewandelt? (pdf.js im Frontend? Rust-Library im Tauri-Backend? Nur erste Seite oder Seite waehlbar?)
  - Bildoptimierung: Kontrast/Helligkeit anpassen fuer bessere Sichtbarkeit unter der Heatmap?
  - Maximale Bildgroesse und -aufloesung? (Performance-Grenzen der Canvas/WebView)
  - Grundriss drehen und skalieren (nach Import)?
  - DPI-Erkennung aus Bild-Metadaten (fuer automatische Massstabs-Schaetzung)?
- **Warum wichtig:** Ein schlechter Import-Workflow frustriert Benutzer von Anfang an. PDF-Grundrisse sind der haeufigste Fall (Bauplaene vom Architekten).

### WL-UI-04: Touch- und Mobile-Support
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** OFFEN (Benutzer) -- siehe Phase4-Fragenkatalog.md F-14
- **Ergebnis:** Keine spezifische Recherche in Phase 3. Konva.js unterstuetzt Touch-Events nativ. Kernfrage: Reicht Desktop-UI fuer Messungen oder wird Companion-App/Web-UI benoetigt? Benutzer-Entscheidung erforderlich.
- **Beschreibung:** Das Tool ist als Desktop-App (Tauri) geplant. Offene Fragen:
  - Wird Touchscreen-Bedienung auf Laptops/2-in-1-Geraeten unterstuetzt?
  - Pinch-to-Zoom, Zwei-Finger-Pan auf Trackpads?
  - Responsive Design oder feste Mindestgroesse des Fensters?
  - Waehrend Messungen laeuft man durch die Wohnung -- reicht ein Desktop-UI oder braucht man eine Companion-App/Web-Interface fuer Smartphones?
  - Falls Companion-App: Wie kommuniziert sie mit der Desktop-App? (WebSocket? REST? mDNS Discovery?)
- **Warum wichtig:** Fuer die Planungsphase ist Desktop ausreichend, aber die Messphase erfordert Mobilitaet. Zumindest ein Konzept fuer mobile Messung sollte existieren.

### WL-UI-05: Barrierefreiheit (Accessibility)
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Farbschema-Empfehlung vorhanden, weitere A11y-Details offen
- **Ergebnis:** Canvas-Heatmap.md und Open-Source-Evaluation.md empfehlen Viridis als farbenblind-freundliches Farbschema. WCAG-Konformitaetsziel und Tastatur-Navigation fuer Canvas-Elemente sind Architektur-Entscheidungen fuer Phase 5.
- **Beschreibung:** Farbheatmaps sind fuer farbenblinde Benutzer (8% aller Maenner) problematisch:
  - Alternatives Farbschema fuer Rot-Gruen-Blindheit? (Viridis ist farbenblind-freundlich)
  - Tastatur-Navigation fuer Canvas-Elemente moeglich?
  - Screen-Reader-Unterstuetzung mindestens fuer Nicht-Canvas-Bereiche (Menuees, Dialoge)?
  - WCAG-Konformitaetsziel (AA oder AAA)?
- **Warum wichtig:** Open-Source-Tools sollten inklusiv sein. Zumindest ein farbenblind-freundliches Farbschema ist mit geringem Aufwand umsetzbar.

---

## 4. Heatmap-Berechnung & Rendering

### WL-HM-01: Rasteraufloesung und Performance-Balance
- **Prioritaet:** HOCH
- **Art:** Technisches Experiment
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` Abschnitt 4
- **Ergebnis:** Detaillierte Benchmarks dokumentiert: 25 cm Default-Aufloesung (16.000 Punkte bei 100 m^2), progressive Berechnung (erst 1m grob, dann 25cm fein). Web Worker + OffscreenCanvas fuer non-blocking. Adaptive Aufloesung waehrend Drag (1m) vs. nach Loslassen (25cm). Ziel-Rechenzeiten: <100ms fuer Drag-Preview, <500ms fuer volle Qualitaet.
- **Beschreibung:** Die Heatmap muss auf einem Raster berechnet werden. Konkrete Zahlen:
  - 100 m^2 Wohnung bei 10 cm Aufloesung = 100.000 Rasterpunkte
  - 100 m^2 Wohnung bei 25 cm Aufloesung = 16.000 Rasterpunkte
  - 100 m^2 Wohnung bei 50 cm Aufloesung = 4.000 Rasterpunkte
  - Pro Punkt: Pfadverlust zu JEDEM AP berechnen (bei 5 APs und 50 Wandsegmenten: 5 Ray-Casts mit je ~50 Schnittberechnungen)
  - Zwei Frequenzbaender (2.4 + 5 GHz) verdoppeln die Berechnung
  - **Benchmarks noetig**: Wie lange dauert die vollstaendige Berechnung fuer typische Grundrisse (80-200 m^2, 3-5 APs, 30-80 Wandsegmente)?
  - Ist adaptive Aufloesung sinnvoll? (feiner in Wandnaehe, grober in offenem Bereich)
  - Was ist die Ziel-Rechenzeit? (< 500ms fuer "Echtzeit-Gefuehl", < 2s fuer akzeptabel)
- **Warum wichtig:** Zu grobe Aufloesung sieht pixelig aus, zu feine Aufloesung ist zu langsam fuer interaktive Updates. Ohne Benchmarks ist die richtige Balance nicht findbar.

### WL-HM-02: Ray-Casting-Algorithmus fuer Wanderkennung
- **Prioritaet:** HOCH
- **Art:** Technisches Experiment
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` Abschnitt 4.2 und `docs/research/Open-Source-Evaluation.md`
- **Ergebnis:** flatten-js (MIT-Lizenz, 160k+ Downloads/Woche) empfohlen fuer Ray-Segment-Intersection. Unterstuetzt Punkt, Segment, Polygon, Ray-Queries. Alternative: eigene Implementierung mit Spatial Hashing (Grid-basiert) fuer O(1) Lookup statt O(n) Wandsegmente. Edge Cases (Wand als Linie, Ecken-Streifung) in Canvas-Heatmap.md adressiert.
- **Beschreibung:** Fuer jeden Rasterpunkt muss berechnet werden, welche Waende zwischen dem Punkt und jedem AP liegen. Das erfordert:
  - **Algorithmus**: Linie-Segment-Schnitttest (fuer jedes Wandsegment pruefen ob es den Strahl AP→Punkt schneidet)
  - **Naive Komplexitaet**: O(Rasterpunkte * APs * Wandsegmente) -- bei 16.000 * 5 * 50 = 4.000.000 Schnittberechnungen
  - **Optimierungen**: Spatial Index (Quadtree, R-Tree, Grid-based Spatial Hashing) um nur relevante Waende zu pruefen
  - **Edge Cases**: Punkt liegt genau auf einer Wand (zaehlt die als Durchdringung?), Ray streift Wandecke (1 oder 2 Durchdringungen?), Wand-Oeffnungen (Tueren/Fenster)
  - **Wand-Dicke**: Wird die Wand als Linie oder als Rechteck modelliert? (Bei Linien-Modell: eine Durchdringung. Bei Rechteck: koennte zweimal den Ray schneiden)
- **Warum wichtig:** Der Ray-Casting-Algorithmus ist das Herztueck der Heatmap-Berechnung und muss sowohl korrekt als auch performant sein. Falsche Wanderkennung fuehrt zu voellig falschen Heatmaps.

### WL-HM-03: Berechnung im Hintergrund (Worker/Backend)
- **Prioritaet:** HOCH
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` Abschnitt 4 und `docs/research/Tech-Stack-Evaluation.md`
- **Ergebnis:** Empfehlung: Web Worker + OffscreenCanvas als primaerer Ansatz (kein IPC-Overhead, kein SharedArrayBuffer-Header noetig). Progressive Berechnung: erst grob (1m), dann fein (25cm). Tauri-Rust-Backend als optionale Beschleunigung fuer sehr grosse Grundrisse (>200 m^2). WASM als Mittelweg evaluiert aber zunaechst nicht empfohlen (Komplexitaet vs. Nutzen).
- **Beschreibung:** Die Heatmap-Berechnung blockiert den UI-Thread. Loesungsansaetze:
  - **WebWorker** (JavaScript): Berechnung im separaten Thread, Ergebnis per postMessage zurueck. Einfach, aber JS-Performance.
  - **WebWorker + SharedArrayBuffer**: Heatmap-Daten im geteilten Speicher, kein Kopieren noetig. Erfordert spezielle HTTP-Header (COOP/COEP).
  - **Tauri-Backend (Rust)**: Berechnung in Rust, Ergebnis per IPC zurueck. Deutlich schneller (10-100x), aber IPC-Serialisierung.
  - **WASM**: Rust/C++ zu WebAssembly kompilieren, laeuft im Browser. Schneller als JS, kein IPC.
  - **Progressive Berechnung**: Erst grob (z.B. 1m), dann verfeinern (25cm) -- sofortiges Feedback, volle Qualitaet nach Sekunden.
  - Kombination moeglich: WASM im WebWorker fuer beste Performance ohne IPC-Overhead.
- **Warum wichtig:** Ohne Offloading der Berechnung friert die UI bei jeder Parameteraenderung ein. Die Wahl beeinflusst die gesamte Architektur (wo liegt die Berechnungslogik?).

### WL-HM-04: Farbschema und Visualisierungsoptionen
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Viridis empfohlen, Detail-Entscheidungen offen
- **Ergebnis:** Canvas-Heatmap.md: Viridis als Default (farbenblind-freundlich, perceptually uniform). Kontinuierlicher Gradient empfohlen, diskrete Stufen als Option. Heatmap als ImageData auf nativem Canvas (nicht Konva), Alpha einstellbar. OFFEN: Isolinien ja/nein (Benutzer-Entscheidung F-16), separate vs. Toggle-Ansicht fuer 2.4/5 GHz, Durchsatz-Schaetzungsansicht.
- **Beschreibung:** Die Signal-Schwellen sind in rf-modell.md definiert. Offene Designfragen:
  - Welches Farbschema? Standard-Optionen: Viridis (farbenblind-freundlich), Jet (klassisch, aber problematisch), Inferno, Plasma, oder Custom-Schema
  - Diskrete Farbstufen (5 Farben, wie in rf-modell.md) oder kontinuierlicher Gradient?
  - Transparenz der Heatmap ueber dem Grundriss? (Alpha-Wert einstellbar?)
  - Soll die Legende konfigurierbar sein? (Schwellenwerte verschieben)
  - Isolinien (Konturlinien) zusaetzlich zur Farbflaeche? (z.B. -65 dBm Linie)
  - Separate Heatmaps fuer 2.4/5 GHz oder Overlay? Toggle oder Side-by-Side?
  - Umschaltbar zwischen RSSI-Ansicht, Durchsatz-Schaetzung, Coverage-Ansicht?
  - Wie rendert man die Heatmap? (ImageData auf Canvas? WebGL Texture? SVG Rectangles?)
- **Warum wichtig:** Die Heatmap ist das visuelle Kernprodukt. Ein schlechtes Farbschema macht gute Daten unlesbar. Viridis wuerde sowohl Aesthetik als auch Barrierefreiheit abdecken.

### WL-HM-05: Echtzeit-Update bei AP-Verschiebung
- **Prioritaet:** MITTEL
- **Art:** Technisches Experiment
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` Abschnitt 4.3
- **Ergebnis:** Progressive Rendering-Strategie: Waehrend Drag niedrige Aufloesung (1m, ~400 Punkte bei 100 m^2, <50ms), nach Loslassen volle Aufloesung (25cm, 16.000 Punkte, <500ms). Debouncing bei 100-200ms waehrend Drag. Inkrementelles Update: nur betroffenen AP-Beitrag neu berechnen, Rest cachen. Web Worker verhindert UI-Blocking.
- **Beschreibung:** Wenn ein AP per Drag-and-Drop verschoben wird, soll die Heatmap sich "sofort" aktualisieren. Offene Fragen:
  - Was ist "sofort" akzeptabel? (< 100ms fuer fluessiges Drag, < 500ms fuer responsives Gefuehl, < 2s fuer akzeptabel)
  - Debouncing/Throttling waehrend des Draggings? (z.B. Neuberechnung max. alle 200ms)
  - Inkrementelles Update: Nur die vom verschobenen AP betroffene Region neu berechnen? (Setzt voraus, dass man weiss welche Region sich aendert)
  - Niedrigere Aufloesung waehrend des Draggings (z.B. 1m), volle Aufloesung (25cm) nach Loslassen?
  - Bei mehreren APs: Nur den Beitrag des verschobenen AP neu berechnen, Rest cachen
- **Warum wichtig:** Echtzeit-Feedback beim Platzieren von APs ist eines der attraktivsten Features und ein starkes Differenzierungsmerkmal gegenueber statischen Tools.

---

## 5. Messung & Kalibrierung

### WL-MS-01: iPerf3-Integration technisch ungeklaert
- **Prioritaet:** HOCH
- **Art:** Recherche noetig + Technisches Experiment
- **Status:** BEANTWORTET -- siehe `docs/research/Messung-Kalibrierung.md` Abschnitt 1
- **Ergebnis:** iPerf3 als Tauri Sidecar (gebundelte Binary pro Plattform). Server auf kabelgebundenem Host, Client auf WLAN-Geraet. JSON-Output-Parsing (`-J` Flag) dokumentiert mit Rust-Structs. Parameter: TCP, 10s Dauer, 4 parallele Streams, bidirektional (`--bidir`). Fehlerbehandlung: Timeout 15s, Retry 1x, Fallback auf HTTP-Speedtest. Smartphone: kein iPerf3 auf iOS, HTTP-basierter Fallback-Test empfohlen.
- **Beschreibung:** iPerf3 wird fuer Durchsatzmessungen verwendet. Voellig ungeklaert:
  - **Server-Seite**: Wo laeuft der iPerf3-Server? Auf dem Host-Rechner (via Kabel angebunden)? Auf einem separaten Geraet (Raspberry Pi)? Auf dem Router?
  - **Client-Seite**: Wird iPerf3 als separater Prozess gestartet? (Tauri Sidecar? Rust child_process?)
  - **Binary-Distribution**: iPerf3-Binary fuer jede Plattform mitliefern (macOS Intel/ARM, Windows, Linux) oder als Abhaengigkeit voraussetzen?
  - **Parameter**: TCP oder UDP? (TCP fuer Durchsatz, UDP fuer Latenz/Jitter). Testdauer (5s? 10s? 30s?). Parallele Streams? Bidirektional?
  - **Output-Parsing**: iPerf3 hat einen JSON-Output-Modus (`-J`) -- wie wird das geparst?
  - **Fehlerbehandlung**: Server nicht erreichbar, Timeout, Firewall blockiert, unvollstaendiger Test
  - **Alternative**: Eigener HTTP-basierter Speedtest als Fallback fuer Geraete ohne iPerf3-Client?
  - **Smartphone-Messung**: Es gibt keine iPerf3-App fuer iOS. Wie messen Smartphones? (HTTP-Download-Test? WebSocket-Throughput?)
- **Warum wichtig:** iPerf3 ist die primaere Messmethode fuer den Durchsatz. Ohne klare Integrationsstrategie ist der Optimierungsassistent nicht implementierbar.

### WL-MS-02: RSSI/BSSID-Messung pro Betriebssystem
- **Prioritaet:** HOCH
- **Art:** Recherche noetig
- **Status:** BEANTWORTET -- siehe `docs/research/Messung-Kalibrierung.md` Abschnitt 2
- **Ergebnis:** Plattform-spezifische Loesung dokumentiert: macOS via CoreWLAN (objc2-core-wlan Rust Crate), Windows via WlanApi (windows-rs Crate), Linux via nl80211 (neli Crate). Polling: 1x/Sekunde waehrend Messung. RSSI-Werte zwischen Plattformen nicht direkt vergleichbar (3-10 dB Offset). iOS/Android nicht direkt unterstuetzt (Tauri Desktop-only), BSSID ab iOS 13 blockiert. macOS Location Services erforderlich (NEU-01).
- **Beschreibung:** Signalstaerke und verbundener AP muessen ausgelesen werden. Das ist hochgradig OS-abhaengig:
  - **macOS**: `airport -I` (deprecated aber funktioniert) oder CoreWLAN Framework (`CWInterface`) -- liefert RSSI, BSSID, Channel, Noise. In Tauri via Rust-Binding oder Shell-Command.
  - **Windows**: `netsh wlan show interfaces` oder Native WiFi API (`WlanQueryInterface`). RSSI, BSSID, Channel verfuegbar.
  - **Linux**: `iw dev wlan0 link` oder `iwconfig` oder nl80211 Netlink-Interface. Vollstaendigste Daten.
  - **iOS**: Apple blockiert BSSID-Zugriff seit iOS 13 (Privacy). Nur ueber NEHotspotConfiguration mit spezieller Entitlement. Praktisch nicht nutzbar.
  - **Android**: `WifiManager.getScanResults()` liefert RSSI, BSSID, Channel. Ab Android 10 Throttling (4 Scans pro 2 Minuten im Vordergrund).
  - **Polling-Intervall**: Wie oft messen? (1x/Sekunde? Nur bei Knopfdruck?)
  - **Kalibrierung**: RSSI-Werte verschiedener Betriebssysteme/Chipsets sind nicht direkt vergleichbar (Offset von 3-10 dB moeglich)
- **Warum wichtig:** Ohne OS-spezifische Signalmessung koennen keine gemessenen Heatmaps erstellt werden. Die iOS-Einschraenkung ist besonders problematisch, da viele Nutzer iPhones haben.

### WL-MS-03: Messpunkt-Lokalisierung im Grundriss
- **Prioritaet:** HOCH
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Messung-Kalibrierung.md` Abschnitt 3
- **Ergebnis:** Empfohlen: Hybrid-Ansatz. Automatische Messpunkt-Generierung (Raster + intelligente Platzierung an Waenden/Durchgaengen), Benutzer kann anpassen. Sequentielle Navigation ("Gehen Sie zu Punkt 3") mit Marker auf Grundriss, Bestaetigung per Klick. Genauigkeit +/- 0.5m ausreichend. Mindestanzahl: 8-12 Punkte fuer sinnvolle Kalibrierung (abhaengig von Grundrissgroesse und Wandanzahl).
- **Beschreibung:** Der Benutzer geht Messpunkte ab. Aber wie weiss das Tool, wo der Benutzer gerade steht?
  - **Manueller Klick**: Benutzer tippt/klickt seine aktuelle Position auf dem Grundriss. Einfach, aber erfordert Blick auf den Bildschirm.
  - **Sequentielle Navigation**: "Gehen Sie jetzt zu Punkt 3" mit Marker auf dem Grundriss -- Benutzer bestaetigt Ankunft. Strukturierter, weniger fehleranfaellig.
  - **Automatische Messpunkt-Generierung**: Tool platziert Messpunkte automatisch (z.B. Raster, oder intelligent an Raendern/Durchgaengen). Benutzer kann anpassen.
  - **Genauigkeit**: Wie genau muss die Position sein? (+/- 0.5m? +/- 1m? +/- 2m?)
  - **Mindestanzahl Messpunkte**: Fuer sinnvolle Kalibrierung (5? 10? 20 pro AP?)
- **Warum wichtig:** Die Zuordnung von Messwerten zu Positionen ist fundamental fuer die gemessene Heatmap und die Kalibrierung.

### WL-MS-04: Kalibrierungsalgorithmus
- **Prioritaet:** MITTEL
- **Art:** Recherche noetig
- **Status:** BEANTWORTET -- siehe `docs/research/Messung-Kalibrierung.md` Abschnitt 4
- **Ergebnis:** Least-Squares-Fitting empfohlen fuer Pfadverlustexponent n und PL(1m). Wanddaempfungen werden NICHT individuell kalibriert (zu wenige Datenpunkte), nur globaler Korrekturfaktor. Minimale Datenmenge: 8 Punkte fuer stabile Regression. Regularisierung: Priors aus Literaturwerten (n=2.8 fuer Indoor), Outlier-Erkennung via IQR-Methode. Unkalibriert: RMSE 8-12 dB, kalibriert: RMSE 3-6 dB.
- **Beschreibung:** Messdaten sollen das RF-Modell kalibrieren ("Measured + Delta" laut Backlog). Offene Fragen:
  - **Welche Parameter kalibrieren?** Daempfungsfaktor n? Wanddaempfungen individuell? PL(1m)? Alles zusammen?
  - **Mathematischer Ansatz**: Least-Squares-Fit der Modellparameter an die Messdaten? Bayes'sche Schaetzung mit Priors (konservative Defaults als Prior)?
  - **Minimale Datenmenge**: Wie viele Messpunkte braucht man fuer eine sinnvolle Kalibrierung? (Unterbestimmtes Problem bei wenigen Punkten und vielen Parametern)
  - **Overfitting**: Bei nur 10 Messpunkten und 30 Wandparametern ist Overfitting unvermeidlich. Regularisierung noetig?
  - **Ausreisser**: Wie werden Messfehler behandelt? (z.B. Messung neben einer laufenden Mikrowelle, temporaere Stoerung)
  - **Differenzial-Ansatz**: Statt absolute Kalibrierung nur Korrekturfaktor (gemessen vs. vorhergesagt) als Offset auf die Heatmap?
- **Warum wichtig:** Die Kalibrierung ist der Uebergang von "konservativer Schaetzung" zu "realistischer Vorhersage" und damit der Kernwert des Mess-Features.

### WL-MS-05: Statistische Auswertung der Messungen
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Messung-Kalibrierung.md` Abschnitt 3.3 und 4
- **Ergebnis:** Empfohlen: 3x10s iPerf-Runs pro Messpunkt, Median als Aggregation (robuster als Mittelwert). Standardabweichung anzeigen (hohe Varianz = instabile Verbindung). Outlier-Erkennung via IQR-Methode (1.5*IQR). Confidence-Intervall aus Residuen der Kalibrierung ableitbar. Vergleichbarkeit Run 1/2/3: Zeitstempel speichern, Warnung bei >30min Zeitversatz.
- **Beschreibung:** Pro Messpunkt gibt es mehrere Messwerte. Statistische Fragen:
  - Wie viele Einzelmessungen pro Messpunkt? (3x10s iPerf? 5x5s? 10x Ping?)
  - Aggregation: Mittelwert, Median (robuster gegen Ausreisser), oder Perzentile (p5 fuer Worst-Case)?
  - Varianz/Standardabweichung anzeigen? (Hohe Varianz = instabile Verbindung)
  - Ausreisser-Erkennung: IQR-Methode? Z-Score? Automatisch oder manuell?
  - Confidence-Intervall fuer die kalibrierte Heatmap berechnen und visualisieren?
  - Vergleichbarkeit zwischen Run 1, 2 und 3: Zeitversatz, unterschiedliche Bedingungen (andere Clients im Netz, Tageszeit)
- **Warum wichtig:** Einzelne WLAN-Messwerte schwanken stark (5-15 dB innerhalb von Sekunden). Ohne statistische Robustheit sind Optimierungsvorschlaege Zufallsergebnisse.

### WL-MS-06: Mess-Agent-Architektur
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** OFFEN -- Post-MVP, keine Recherche in Phase 3
- **Ergebnis:** Nicht in Phase 3 adressiert. Messung-Kalibrierung.md fokussiert auf Desktop-basierte Messung. WebSocket-Server-Architektur fuer spaetere Agent-Anbindung sollte in Phase 5 als Extension Point eingeplant werden. Benutzer-Entscheidung F-14 (Companion-App) beeinflusst Prioritaet.
- **Beschreibung:** Das PRD erwaehnt einen optionalen "Mess-Agent" fuer Notebook/Android. Voellig unspezifiziert:
  - Kommunikationsprotokoll: WebSocket (bidirektional, echtzeitfaehig) oder REST (einfacher, Request-Response)?
  - Automatische Erkennung des Agents: mDNS/Bonjour? Manuell IP eingeben?
  - Agent-Software-Stack: Native App (Swift/Kotlin)? Electron? React Native?
  - Welche erweiterten Daten liefert der Agent? (BSSID, Kanal, Nachbar-Scans, RSSI der Nachbar-APs)
  - Muss der Agent-Quellcode auch unter MIT stehen?
- **Warum wichtig:** Post-MVP, aber die Kommunikationsarchitektur (WebSocket-Server) muss von Anfang an eingeplant werden, damit der Agent spaeter angebunden werden kann.

---

## 6. Mixing Console & Optimierung

### WL-MC-01: Live-Parameter vs. Forecast-Parameter
- **Prioritaet:** HOCH
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Empfehlung vorhanden, Benutzer-Entscheidung noetig
- **Ergebnis:** AP-Steuerung.md: Web-Interface-Scraping ermoeglicht Live-Steuerung (TX-Power, Channel, Bandwidth aenderbar). Empfehlung: Forecast-Only im MVP, Live-Modus als Erweiterung. Begruendung: Forecast ist sicherer, Web-Interface-Scraping ist fragil (Firmware-Abhaengigkeit). Benutzer-Entscheidung F-01 (MVP-Scope Mixing Console) bestimmt ob Live-Modus relevant ist.
- **Beschreibung:** Die Mixing Console hat zwei potentielle Modi:
  1. **Forecast-Modus**: Schieberegler aendern nur die berechnete Heatmap (reine Simulation, kein AP wird angesteuert)
  2. **Live-Modus**: Schieberegler aendern tatsaechlich die AP-Konfiguration UND die Heatmap
  - Welcher Modus ist der Default? (Forecast ist sicherer fuer Anfaenger)
  - Kann der Benutzer zwischen beiden wechseln?
  - Im Live-Modus: Wie schnell reagiert der AP auf Aenderungen? (abhaengig von WL-AP-03)
  - "Apply"-Button zum Uebertragen oder automatisches Senden bei Slider-Aenderung?
  - Rollback: Wie werden die urspruenglichen AP-Einstellungen gesichert? Automatischer Snapshot vor jeder Aenderung?
  - Visuelle Unterscheidung: Forecast-Heatmap (gestrichelt/halbtransparent?) vs. letzte gemessene Heatmap
- **Warum wichtig:** Die Mixing Console ist ein zentrales Feature. Die UX muss unmissverstaendlich zwischen "nur Simulation" und "echte Aenderung am AP" unterscheiden, um versehentliche Konfigurationsaenderungen zu vermeiden.

### WL-MC-02: Optimierungsalgorithmus
- **Prioritaet:** MITTEL
- **Art:** Recherche noetig
- **Status:** TEILWEISE -- Heuristischer Ansatz empfohlen, Details offen
- **Ergebnis:** Keine dedizierte Recherche in Phase 3. Empfehlung aus Cross-Check: Regelbasierter/heuristischer Ansatz fuer MVP (IF-THEN-Regeln: "Wenn RSSI <-75 dBm: TX-Power erhoehen", "Wenn Co-Channel-Interferenz: Kanal wechseln"). Greedy-Algorithmus als Stufe 2. Brute-Force und genetischer Algorithmus sind Post-MVP. Optimierungsziel und Multi-Objective-Gewichtung sind Benutzer-Entscheidungen.
- **Beschreibung:** Das Tool soll Konfigurationsvorschlaege mit Confidence-Level generieren. Aber welcher Algorithmus?
  - **Brute-Force**: Alle Kombinationen von TX-Power (z.B. 10 Stufen) * Channel (13 Kanaele) * Bandwidth (3 Optionen) pro AP -- bei 3 APs = (10*13*3)^3 = ~60 Milliarden Kombinationen. Unmoeglich.
  - **Heuristik/Regelbasiert**: "Wenn RSSI am Nachbar-AP > -50 dBm: TX-Power reduzieren", "Wenn Kanal-Ueberlappung: anderen Kanal waehlen". Einfach, erklaerbar, aber nicht optimal.
  - **Greedy-Algorithmus**: Iterativ den Parameter aendern, der die groesste Verbesserung bringt.
  - **Genetischer Algorithmus**: Zufaellige Startpopulation, Selektion, Crossover, Mutation ueber Generationen.
  - **Optimierungsziel**: Maximale Mindestabdeckung? Minimale Interferenz? Maximaler Durchsatz? Bestes Roaming?
  - **Multi-Objective**: Gewichtung verschiedener Ziele (Coverage vs. Durchsatz vs. Roaming)?
  - **Confidence-Level**: Basierend auf was? (Anzahl Messpunkte? Differenz Vorhersage-Messung? Heuristischer Score?)
- **Warum wichtig:** Ohne definierten Algorithmus sind "Optimierungsvorschlaege" nur Ratschlaege auf Basis von Faustregeln. Fuer den MVP ist ein regelbasierter Ansatz wahrscheinlich ausreichend, aber die Entscheidung muss dokumentiert werden.

### WL-MC-03: Roaming-Analyse und Sticky-Client-Erkennung
- **Prioritaet:** MITTEL
- **Art:** Recherche noetig
- **Status:** TEILWEISE -- RSSI-Messung geklaert, Roaming-Logik offen
- **Ergebnis:** Messung-Kalibrierung.md: BSSID-Tracking pro Messpunkt moeglich (RSSI + BSSID gleichzeitig erfassen). Sticky-Client-Erkennung: Vergleich RSSI des verbundenen AP vs. bester verfuegbarer AP (Delta >15 dB = sticky). OFFEN: 802.11k/r/v Unterstuetzungserkennung, Client-spezifische Roaming-Empfehlungen, Min-RSSI-Kick-Konfiguration (Post-MVP, abhaengig von AP-Steuerung).
- **Beschreibung:** Run 2 soll Roaming-Probleme erkennen. Offene Fragen:
  - **Sticky-Client-Definition**: Ab wann ist ein Client "sticky"? (z.B. verbunden mit AP bei -80 dBm, obwohl anderer AP -55 dBm liefert)
  - **Metriken**: RSSI-Differenz zwischen verbundenem und bestem AP, Disconnect-Haeufigkeit, Roaming-Dauer
  - **Datenerfassung**: BSSID-Wechsel waehrend der Messung erkennen (erfordert permanentes Polling, siehe WL-MS-02)
  - **Empfehlungen**: Was kann das Tool empfehlen? (TX-Power senken, Min-RSSI-Kick aktivieren -- aber das ist Post-MVP)
  - **Client-Abhaengigkeit**: Roaming-Verhalten haengt stark vom Endgeraet ab (iOS roamt aggressiver als manche Android-Geraete). Wie damit umgehen? Warnung an den Benutzer?
  - **802.11k/r/v**: Muss das Tool diese Standards verstehen, um die Analyse zu verbessern?
- **Warum wichtig:** Roaming-Probleme sind eine der haeufigsten Beschwerden in Multi-AP-Setups und ein Hauptgrund fuer die Existenz dieses Tools.

---

## 7. Datenhaltung & Persistenz

### WL-DB-01: Datenbankschema nicht definiert
- **Prioritaet:** HOCH
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` Abschnitt 4
- **Ergebnis:** Vollstaendiges SQLite-Schema mit rusqlite dokumentiert: projects, floor_plans, walls, openings, access_points, ap_models, materials, measurement_points, measurement_results, config_history. Grundrissbild als BLOB in DB (einfacher Export). rusqlite mit bundled-Feature (SQLite kompiliert in Binary, keine externe Abhaengigkeit). Migrationen via PRAGMA user_version.
- **Beschreibung:** SQLite ist als Kandidat erwaehnt. Aber das Schema fehlt komplett. Benoetigte Entitaeten:
  - **Projects**: Name, Erstellungsdatum, Grundrissbild-Referenz, Massstab
  - **FloorPlans**: Bild-Daten oder Pfad, Rotation, Offset, DPI
  - **Walls**: Start-/Endkoordinaten, Material-ID, Dicke, Daempfungswerte (2.4/5 GHz)
  - **Openings**: Position auf Wand, Typ (Tuer/Fenster), Breite
  - **AccessPoints**: Position (x,y), Modell-ID, aktuelle Konfiguration (TX-Power, Channel, Bandwidth)
  - **APModels**: Herstellerdaten (TX-Power, Antennengewinn, unterstuetzte Features)
  - **Materials**: Name, Standarddaempfung pro Frequenzband, Farbe fuer UI
  - **MeasurementPoints**: Position (x,y), Projekt-ID
  - **MeasurementResults**: Messpunkt-ID, Run-Nummer, Zeitstempel, RSSI, Durchsatz, Latenz, Jitter, BSSID
  - **ConfigHistory**: Zeitstempel, AP-ID, alte Konfiguration, neue Konfiguration (fuer Undo)
  - **Binaerdaten**: Grundrissbild in DB (BLOB) oder Dateisystem? (DB einfacher fuer Export, Dateisystem besser fuer grosse Bilder)
  - Alternative: Dokumenten-basierter Ansatz (JSON-Files statt SQLite)? Einfacher, aber keine Transaktionen.
- **Warum wichtig:** Das Schema bestimmt die gesamte Datenarchitektur und muss frueh festgelegt werden. Spaetere Aenderungen am Schema erfordern Datenmigration.

### WL-DB-02: Undo/Redo-Mechanismus
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Canvas-Heatmap.md` Abschnitt 2.6
- **Ergebnis:** Command-Pattern empfohlen: Jede Aktion als Command-Objekt mit execute()/undo(). Svelte 5 $state-Array fuer Undo-Stack. Undo-Tiefe: 100 Aktionen (konfigurierbar). Redo-Stack bei neuer Aktion verwerfen. Persistenz ueber Session-Grenzen: Letzte Aktion automatisch gespeichert (Auto-Save), aber Undo-History nicht persistent. AP-Konfiguration-Undo: Separater Mechanismus ueber config_history-Tabelle.
- **Beschreibung:** Das PRD fordert "Undo jederzeit moeglich". Offene Architektur-Fragen:
  - **Granularitaet**: Undo pro Einzelaktion (Wand zeichnen, AP verschieben) oder pro logischem Schritt?
  - **Command-Pattern**: Jede Aktion als Command-Objekt mit `execute()` und `undo()`?
  - **State-Snapshot**: Oder alternativ: Kompletten State vor jeder Aktion speichern? (Einfacher, aber speicherintensiv)
  - **Undo-Tiefe**: Unbegrenzt? Letzte 50/100 Aktionen? Konfigurierbar?
  - **Undo fuer AP-Konfiguration**: Wenn eine TX-Power-Aenderung am realen AP angewendet wurde, muss auch das rueckgaengig gemacht werden (AP-Kommunikation noetig)
  - **Persistenz**: Undo-Historie ueber Session-Grenzen hinweg? Oder bei App-Neustart verloren?
  - **Redo**: Vollstaendiges Redo nach Undo? Redo-Stack bei neuer Aktion verwerfen?
- **Warum wichtig:** Undo ist eine explizite PRD-Anforderung und erfordert fruehe architektonische Planung. Nachtraegliches Hinzufuegen ist sehr aufwaendig.

### WL-DB-03: Projekt-Import/Export-Format
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** OFFEN -- Nicht in Phase 3 adressiert, Post-MVP
- **Ergebnis:** Keine dedizierte Recherche. Empfehlung aus Tech-Stack-Evaluation: ZIP-Container (.wlanopt) mit JSON-Schema + Bild-Dateien. Schema-Versionierung ueber Version-Feld im JSON. Detail-Spezifikation in Phase 5 (Architektur).
- **Beschreibung:** Export als JSON ist geplant. Offene Fragen:
  - JSON-Schema definieren (fuer Validierung bei Import)
  - Grundrissbild eingebettet (Base64 im JSON) oder separate Datei?
  - ZIP-Container? (Bild + JSON + Messdaten als `.wlanopt`-Datei)
  - Versionierung des Export-Formats (Schema-Version-Feld fuer Rueckwaertskompatibilitaet)
  - Import: Validierung, Fehlerbehandlung bei inkompatiblem Format, Migration von alten Versionen
  - Teilexport: Nur Grundriss, nur Messdaten, nur Konfiguration?
- **Warum wichtig:** Niedrige Prioritaet im MVP, aber das Datenformat sollte frueh durchdacht werden um spaetere Breaking Changes zu vermeiden.

---

## 8. Tech-Stack Entscheidungen (offen)

### WL-TS-01: Frontend-Framework
- **Prioritaet:** HOCH
- **Art:** Recherche noetig + Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` Abschnitt 1
- **Ergebnis:** Svelte 5 (Runes) empfohlen. Gruende: Kleinste Runtime (~5 KB), granulare Reaktivitaet ohne VDOM, exzellente Tauri-2-Integration, offizielle svelte-konva Bindings mit Runes-Support, Paraglide-js fuer i18n (Svelte-nativ). Nachteil: Kleineres Oekosystem als React, aber alle benoetigten Libraries vorhanden. Bewertungsmatrix: Svelte 5 (91/100) > React 19 (82/100) > Vue 3.5 (75/100).
- **Beschreibung:** Svelte 5 ist als Kandidat erwaehnt, aber die Entscheidung ist nicht getroffen. Zu evaluieren:
  - **Svelte 5 (Runes)**: Kleine Bundle-Size (~5 KB Runtime), granulare Reaktivitaet ohne VDOM, exzellente DX. Nachteil: Kleineres Oekosystem als React, weniger Canvas-Libraries, weniger LLM-Trainingsdaten (relevant fuer Code-Generierung in Phase 8).
  - **React 19**: Groesstes Oekosystem, viele Canvas-Libraries (react-konva, react-pixi, react-three-fiber). Server Components irrelevant fuer Desktop-App. Nachteil: VDOM-Overhead, groessere Bundle-Size.
  - **SolidJS**: Svelte-aehnliche Performance, JSX-Syntax (vertraut fuer React-Entwickler). Nachteil: Deutlich kleinstes Oekosystem.
  - **Vue 3.5+**: Gute Balance, grosse Community. Nachteil: Kein klarer Vorteil gegenueber Svelte oder React.
  - **Bewertungskriterien**: Canvas-Integration, i18n-Support, Tauri-2-Kompatibilitaet, Community-Groesse, TypeScript-Support, Qualitaet der LLM-Trainingsdaten fuer autonome Code-Generierung.
- **Warum wichtig:** Framework-Wahl beeinflusst ALLE UI-Entscheidungen, die Auswahl an Canvas-Libraries, den Testing-Stack, die i18n-Loesung, und ist spaeter nur mit komplettem Rewrite aenderbar.

### WL-TS-02: Desktop-Framework
- **Prioritaet:** HOCH
- **Art:** Recherche noetig + Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` Abschnitt 2
- **Ergebnis:** Tauri 2 empfohlen. Gruende: Kleine Bundle-Size (~10-15 MB vs. ~200 MB Electron), Rust-Backend ideal fuer rechenintensive Heatmap und OS-spezifische APIs (RSSI, WLAN), nativer Sidecar-Support fuer iPerf3, Capabilities-basiertes Sicherheitsmodell. WebView-Inkonsistenz als Risiko identifiziert (NEU-02: IPC-Latenz Windows). Tauri 2 Plugins: fs, shell (Sidecar), sql (rusqlite), updater.
- **Beschreibung:** Tauri 2 ist als Kandidat erwaehnt. Konkreter Vergleich:
  - **Tauri 2**: Kleine Bundle-Size (~10-15 MB), Rust-Backend (sicher, schnell), System-WebView. Nachteil: WebView-Rendering ist nicht konsistent (WKWebView/Safari auf macOS, Edge WebView2 auf Windows, WebKitGTK auf Linux). Canvas/WebGL-Performance kann variieren.
  - **Electron 34**: Chromium-basiert, konsistente Darstellung, riesiges Oekosystem. Nachteil: Bundle-Size (~150-200 MB), hoher RAM-Verbrauch (~200 MB Basis), Node.js-Backend (langsamer als Rust fuer RF-Berechnung).
  - **Konkrete Tests noetig**: iPerf3-Sidecar (Tauri hat Sidecar-Support nativ), Canvas/WebGL-Performance in WebView vs. Chromium, System-Tray-Integration, Auto-Update-Faehigkeit, Code-Signing.
  - **Tauri-spezifisch**: Tauri 2 hat IPC ueber `invoke` (synchron-artig) und Events (async). Sicherheitsmodell mit Capabilities (ACL fuer Plugins).
- **Warum wichtig:** Bestimmt die Backend-Sprache (Rust vs. Node.js), die Deployment-Strategie und die Performance-Charakteristik. Rust-Backend in Tauri waere ideal fuer die rechenintensive Heatmap-Berechnung.

### WL-TS-03: Backend-Logik-Verteilung (Frontend vs. Backend)
- **Prioritaet:** HOCH
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` und `docs/research/Canvas-Heatmap.md`
- **Ergebnis:** Empfohlene Verteilung: Heatmap-Berechnung im Frontend (Web Worker, kein IPC-Overhead), AP-Steuerung im Backend (Rust, Netzwerk-Zugriff), iPerf3 als Backend-Sidecar, Datenbankzugriff via Tauri-Commands (rusqlite), RSSI-Messung im Backend (OS-spezifische Rust-Crates). IPC-Design: Tauri invoke fuer Request-Response, Tauri Events fuer lang laufende Operationen (Messungen, iPerf-Fortschritt).
- **Beschreibung:** Wo laeuft welche Logik?
  - **Heatmap-Berechnung**: Frontend (JS/WASM im WebWorker) oder Backend (Rust in Tauri)? Rust waere 10-100x schneller, aber IPC-Serialisierung der Heatmap-Daten (16.000+ Farbwerte) kostet Zeit.
  - **AP-Steuerung**: Muss im Backend laufen (Netzwerk-Zugriff, SNMP, HTTP-Requests)
  - **iPerf3**: Separater Prozess, gesteuert vom Backend (Tauri Sidecar)
  - **Datenbankzugriff**: Backend (Tauri-Commands mit SQL-Queries) oder Frontend (sql.js/wa-sqlite)?
  - **RSSI-Messung**: Backend (OS-spezifische APIs ueber Rust) oder Frontend (Tauri Shell Command)?
  - **IPC-Design**: Welche Tauri-Commands werden definiert? Event-basierte Kommunikation fuer lang laufende Operationen (Messungen)?
- **Warum wichtig:** Die Verteilung der Logik beeinflusst Performance, Architektur, Testbarkeit und die Komplexitaet des IPC-Layers.

### WL-TS-04: Testing-Strategie und -Framework
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` Abschnitt 6
- **Ergebnis:** Vitest empfohlen (Vite-nativ, ESM-Support, schnelle Ausfuehrung). Svelte Testing Library fuer Komponenten-Tests. Playwright fuer E2E (Tauri WebDriver Support). RF-Modell-Tests: Numerische Verifikation gegen ITU-R P.1238 Referenzwerte. Coverage-Ziel: 90% RF-Berechnung, 80% Business-Logik, 60% UI-Komponenten. CI/CD: GitHub Actions mit macOS/Windows/Linux Matrix.
- **Beschreibung:** Kein Testing-Framework festgelegt. Zu klaeren:
  - **Unit Tests**: Vitest (schnell, Vite-nativ, ESM-Support) -- fuer beide Svelte und React geeignet
  - **Komponenten-Tests**: Svelte Testing Library oder React Testing Library (je nach WL-TS-01)
  - **E2E-Tests**: Playwright (Tauri-Support via WebDriver) oder WebdriverIO (mit Tauri-Plugin)
  - **RF-Modell-Tests**: Numerische Verifikation gegen bekannte Referenzwerte (ITU-R P.1238 Beispielrechnungen)
  - **Test-Coverage-Ziel**: z.B. 90% fuer RF-Berechnung, 80% fuer UI-Logik, 60% fuer UI-Komponenten
  - **CI/CD**: GitHub Actions (naheliegend fuer GitHub-Repo)
  - **Snapshot-Tests**: Fuer Heatmap-Rendering (Bild-Vergleich)?
- **Warum wichtig:** TDD ist als Qualitaetsstrategie geplant (Phase 8). Ohne Framework-Entscheidung kein TDD moeglich.

### WL-TS-05: i18n-Loesung
- **Prioritaet:** MITTEL
- **Art:** Recherche noetig + Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Open-Source-Evaluation.md` und `docs/research/Tech-Stack-Evaluation.md`
- **Ergebnis:** Paraglide-js (inlang) empfohlen. Gruende: Kompilierzeit-i18n, vollstaendig typsicher (TypeScript), Tree-Shaking (nur genutzte Uebersetzungen im Bundle), offizielle SvelteKit-Integration, Laufzeit-Sprachwechsel ohne Reload. Nachteil: Juengeres Projekt als i18next. Fallback-Sprache: Englisch. Spaeteren Support fuer weitere Sprachen einfach durch zusaetzliche JSON-Dateien.
- **Beschreibung:** Key-basierte Uebersetzungen sind gefordert (EN/DE). Optionen:
  - **svelte-i18n**: Nativ fuer Svelte, einfach, aber weniger Features (keine Typsicherheit fuer Keys)
  - **i18next** (+ svelte-i18next / react-i18next): Ausgereift, Pluralisierung, Interpolation, Namespaces, viele Plugins. Defacto-Standard.
  - **Paraglide** (inlang): Kompilierzeit-i18n, Tree-Shaking, vollstaendig typsicher (TypeScript-Integration), extrem kleine Runtime. Nachteil: Neueres Projekt.
  - **Eigene Loesung**: JSON-Key-Value-Store mit Svelte Store. Minimalistisch, volle Kontrolle.
  - **Relevante Fragen**: Laufzeit-Sprachwechsel ohne Reload? Typ-Sicherheit fuer Uebersetzungs-Keys? Fallback-Sprache (EN)? Spaetere Erweiterung auf weitere Sprachen?
- **Warum wichtig:** i18n ist eine MVP-Anforderung (US-11, US-12) und muss von Tag 1 integriert werden. Nachtraegliches Einbauen erfordert das Anfassen JEDER UI-Komponente.

### WL-TS-06: Build-System und Bundler
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` Abschnitt 7
- **Ergebnis:** Vite als klarer Standard fuer Svelte + Tauri. Dev-Server-Port konfigurierbar, HTTPS nicht noetig (SharedArrayBuffer ueber Tauri Capabilities statt COOP/COEP Header). Biome als Linter/Formatter (ersetzt ESLint + Prettier, 100x schneller). Source Maps nur in Development. CI/CD: GitHub Actions.
- **Beschreibung:** Optionen:
  - **Vite**: De-facto-Standard fuer Svelte + Tauri. Schneller Dev-Server, guter Production-Build.
  - Dev-Server-Konfiguration: Port, HTTPS (noetig fuer SharedArrayBuffer-Header)?
  - Source Maps in Production? (fuer Debugging, aber groessere Bundle)
- **Warum wichtig:** Meist trivial (Vite ist der klare Gewinner), aber die Konfiguration muss dokumentiert werden.

---

## 9. Deployment & Distribution

### WL-DP-01: Plattform-Support und -Prioritaet
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen + Benutzer fragen
- **Status:** OFFEN (Benutzer) -- siehe Phase4-Fragenkatalog.md F-12
- **Ergebnis:** Tech-Stack-Evaluation.md: Tauri 2 unterstuetzt macOS (Universal Binary), Windows (x64 + ARM), Linux (AppImage, .deb, .rpm). Benutzer-Entwicklungsmaschine ist macOS (Apple Silicon). RSSI-Crates fuer alle 3 Plattformen verfuegbar. Benutzer muss entscheiden: macOS-First oder alle gleichzeitig? iPerf3-Binaries muessen pro Plattform gebundled werden.
- **Beschreibung:** Welche Betriebssysteme werden unterstuetzt und in welcher Reihenfolge?
  - **macOS**: Intel + Apple Silicon (Universal Binary). Ab macOS 12 (Monterey)?
  - **Windows**: x64 zwingend. ARM (Surface Pro X)? Ab Windows 10?
  - **Linux**: AppImage (universell), .deb (Debian/Ubuntu), .rpm (Fedora/openSUSE), Flatpak?
  - **iPerf3-Binary**: Muss fuer jede Plattform und Architektur mitgeliefert werden (Cross-Compilation oder Pre-built Binaries)
  - **Entwicklungsmaschine des Benutzers**: macOS (laut Environment) -- macOS-First?
  - **CI/CD**: GitHub Actions unterstuetzt macOS, Windows und Linux Runner
- **Warum wichtig:** Beeinflusst CI/CD-Pipeline, Testing-Matrix und den Aufwand fuer Plattform-spezifischen Code (RSSI-Messung, Shell-Commands).

### WL-DP-02: Auto-Update und Code-Signing
- **Prioritaet:** NIEDRIG
- **Art:** Recherche noetig
- **Status:** TEILWEISE -- Tauri-Updater dokumentiert, Code-Signing ist Benutzer-Entscheidung
- **Ergebnis:** Tech-Stack-Evaluation.md: Tauri Updater Plugin (v2) unterstuetzt GitHub Releases als Backend, Full-Download (kein Delta). Code-Signing: macOS Notarization ($99/Jahr Apple Developer), Windows Authenticode (~$200/Jahr). OFFEN: Ob Benutzer Kosten fuer Code-Signing tragen will oder unsigned Distribution mit Installationsanleitung akzeptabel ist. Benutzer-Entscheidung F-18.
- **Beschreibung:** Offene Fragen:
  - Tauri hat ein eingebautes Updater-Plugin -- reicht das?
  - Update-Server: GitHub Releases als Backend (kostenlos, einfach)?
  - Delta-Updates oder immer Full-Download? (Tauri Updater unterstuetzt nur Full)
  - **Code-Signing**: macOS erfordert Notarization (Apple Developer Account, $99/Jahr), Windows erfordert Authenticode (Code Signing Certificate, ~$200/Jahr). Ohne Signing: Gatekeeper-Warnung (macOS) und SmartScreen-Warnung (Windows).
  - Workaround: Unsigned Distribution mit Installationsanleitung ("Right-click → Open")?
- **Warum wichtig:** Ohne Code-Signing warnen macOS und Windows vor der Installation, was viele Nutzer abschreckt. Finanzieller Aspekt: Jaehrliche Kosten fuer Zertifikate.

### WL-DP-03: Lizenz-Compliance
- **Prioritaet:** NIEDRIG
- **Art:** Recherche noetig
- **Status:** BEANTWORTET -- siehe `docs/research/Open-Source-Evaluation.md` und `docs/research/Tech-Stack-Evaluation.md`
- **Ergebnis:** Alle empfohlenen Abhaengigkeiten MIT- oder Apache-2.0-lizenziert (kompatibel mit MIT). iPerf3: BSD-3-Clause (kompatibel). Konva.js: MIT. flatten-js: MIT. Paraglide-js: Apache-2.0. Tauri: MIT + Apache-2.0. rusqlite: MIT. Biome: MIT. Keine GPL-Infektionsgefahr identifiziert. SBOM-Erstellung: cargo-about (Rust) + license-checker (npm) empfohlen fuer Phase 9.
- **Beschreibung:** MIT-Lizenz ist entschieden, aber:
  - Lizenz-Kompatibilitaet aller Abhaengigkeiten pruefen (GPL-Infektionsgefahr! z.B. manche Linux-Libraries)
  - iPerf3: BSD-3-Clause lizenziert -- kompatibel mit MIT
  - Canvas-Libraries: Welche Lizenz? (Konva: MIT, Fabric: MIT, PixiJS: MIT)
  - Tauri: MIT + Apache-2.0 (kompatibel)
  - SBOM (Software Bill of Materials) erstellen?
  - Third-Party-License-Notice in der App anzeigen?
- **Warum wichtig:** Lizenz-Verletzungen koennen rechtliche Konsequenzen haben. Eine fruehe Pruefung verhindert spaetere Ueberraschungen.

---

## 10. Offene Architektur-Fragen

### WL-AR-01: State Management
- **Prioritaet:** HOCH
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` und `docs/research/Canvas-Heatmap.md`
- **Ergebnis:** Svelte 5 Runes ($state, $derived, $effect) als primaeres State-Management. Kein externes State-Management-Framework noetig (Svelte 5 Runes ersetzen Stores). Reaktivitaets-Kette: Wand-Aenderung -> $derived Heatmap-Neuberechnung -> Canvas-Update. Serialisierung: JSON.stringify/$state Snapshot fuer Speichern/Laden. XState optional fuer komplexe Workflows (Mess-Ablauf State Machine) -- Architektur-Entscheidung Phase 5.
- **Beschreibung:** Welches State-Management-Pattern? Die App hat verschiedene State-Domains:
  - **App-State**: Aktuelles Projekt, aktiver Modus, Sprache, Theme
  - **Canvas-State**: Waende, APs, Messpunkte, Zoom/Pan, aktives Werkzeug, Selektion
  - **Heatmap-State**: Berechnungsergebnis (Raster mit dBm-Werten), aktive Layer, Farbschema, Frequenzband
  - **Mess-State**: Aktueller Run, aktueller Messpunkt, iPerf-Status, gesammelte Messwerte
  - **Mixing-Console-State**: Aktuelle Slider-Werte vs. tatsaechliche AP-Konfiguration
  - Optionen: Svelte Stores (built-in, einfach), Zustand (leichtgewichtig), XState (Zustandsmaschine -- gut fuer komplexe Workflows wie Mess-Ablauf), Redux (fuer React, ueberdimensioniert)
  - **Reaktivitaet**: Aenderung an Wand → Neuberechnung Heatmap → UI-Update (wie wird diese Kette gemanaged?)
  - **Serialisierung**: State muss fuer Speichern/Laden serialisierbar sein
- **Warum wichtig:** State Management ist das Rueckgrat der Anwendung. Falsches Pattern fuehrt zu schwer wartbarem Code, schwer auffindbaren Bugs und schlechter Performance.

### WL-AR-02: Modularisierung und Paketstruktur
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Empfehlung vorhanden, Detail-Spezifikation Phase 5
- **Ergebnis:** Tech-Stack-Evaluation.md: Single-Package mit Feature-basierter Ordnerstruktur empfohlen (src/features/planning/, src/features/measurement/, src/features/optimization/). Kein Monorepo noetig fuer MVP. Shared Types: TypeScript Interfaces in src/types/, generiert via Supabase-Style generate_typescript_types oder manuell. Abhaengigkeitsrichtung: core (RF-Modell) -> features -> UI. Detail-Spezifikation in Phase 5.
- **Beschreibung:** Wie wird der Code strukturiert?
  - **Monorepo** (ein Repository, mehrere Packages) vs. **Single-Package** (alles in einem `src/`)?
  - Feature-basierte Ordnerstruktur (`src/features/planning/`, `src/features/measurement/`) vs. schichtenbasiert (`src/components/`, `src/services/`, `src/models/`)?
  - Shared Types zwischen Frontend und Backend (Tauri): Eigenes Package? Oder dupliziert?
  - Klare Modul-Grenzen: Planung, Messung, Optimierung, Infrastruktur
  - Abhaengigkeitsrichtung: RF-Modell hat keine UI-Abhaengigkeit, UI haengt von RF-Modell ab
  - Auswirkung auf Agent Teams: Module mit klaren Grenzen ermoeglichen parallele Entwicklung
- **Warum wichtig:** Gute Modularisierung ermoeglicht parallele Entwicklung mit Agent Teams (Phase 8) und reduziert Merge-Konflikte.

### WL-AR-03: Plugin-System fuer AP-Modelle und Materialien
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Materialien als JSON dokumentiert, AP-Profil-System offen
- **Ergebnis:** RF-Materialien.md: 27 Wandmaterialien + 4 Deckentypen als JSON-Struktur definiert (ID, Name, Daempfung pro Band, Kategorie). Benutzer-editierbar ueber UI. AP-Steuerung.md: APControllerTrait als Rust-Interface fuer Hersteller-Plugins. AP-Modell-Profile als JSON (TX-Power-Range, Channels, Capabilities). OFFEN: Community-Repository-Konzept, Validierung benutzerdefinierter Profile -- Phase 5 Architektur.
- **Beschreibung:** Das PRD fordert Erweiterbarkeit. Offene Fragen:
  - AP-Modell als JSON/YAML-Datei mit definiertem Schema?
  - Material-Definitionen als Konfigurationsdatei (bearbeitbar durch Benutzer)?
  - Benutzer-definierte AP-Modelle ueber die UI hinzufuegen?
  - Community-Repository fuer AP-Profile? (wie z.B. Geraete-Profile bei Home-Assistant)
  - Validierung von benutzerdefinierten Profilen (Min/Max-Werte fuer TX-Power, Antennengewinn etc.)
  - Import von AP-Daten aus Hersteller-Datenblaettern?
- **Warum wichtig:** Ohne ein konfigurierbares Profil-System ist das Tool auf die mitgelieferten AP-Modelle und Materialien beschraenkt. Die Erweiterbarkeit ist ein Kernargument fuer Open Source.

### WL-AR-04: Error Handling und Logging
- **Prioritaet:** MITTEL
- **Art:** Entscheidung treffen
- **Status:** TEILWEISE -- Grundkonzept in Tech-Stack-Evaluation, Details offen
- **Ergebnis:** Tech-Stack-Evaluation.md: Svelte 5 Error Boundaries fuer UI-Fehler. Rust-Backend: anyhow/thiserror fuer Error-Handling, tracing Crate fuer strukturiertes Logging. Tauri: Log-Plugin fuer Datei-basiertes Logging mit Rotation. Auto-Save: Empfohlen alle 5 Minuten oder bei kritischen Aktionen. OFFEN: Crash-Reporting-Strategie, benutzerfreundliche Fehlermeldungen (i18n), Graceful Degradation bei AP-Kommunikationsfehlern -- Phase 5.
- **Beschreibung:** Offene Fragen:
  - **Globale Fehlerbehandlung**: Error Boundary in Svelte/React fuer UI-Fehler
  - **Logging**: Logging-Level (Debug, Info, Warn, Error) und -Ziel (Datei im Benutzerverzeichnis? Konsole? Rotierendes Log?)
  - **Crash-Reporting**: Lokal, da keine Cloud. Crash-Log-Datei die der Benutzer an den Entwickler senden kann?
  - **Benutzerfreundliche Fehlermeldungen**: Technische Fehler in verstaendliche DE/EN-Meldungen uebersetzen
  - **Auto-Save**: Periodisches Speichern um Datenverlust bei Absturz zu minimieren
  - **Graceful Degradation**: Wenn AP-Kommunikation fehlschlaegt: Nur Forecast-Modus anbieten
- **Warum wichtig:** Ein Tool das AP-Konfigurationen aendert, muss robust gegen Fehler sein. Ein Absturz waehrend einer Konfigurationsaenderung koennte das Netzwerk in einem inkonsistenten Zustand hinterlassen.

### WL-AR-05: Freischaltungslogik fuer Optimierungsmodul
- **Prioritaet:** MITTEL
- **Art:** Benutzer fragen
- **Status:** OFFEN (Benutzer) -- siehe Phase4-Fragenkatalog.md F-02
- **Ergebnis:** Nicht in Phase 3 technisch recherchiert, da reine Geschaeftsentscheidung. Widerspruch WID-02 identifiziert: MIT-Lizenz macht technische Freischaltung sinnlos (Fork moeglich). Benutzer muss klaeren: Bezahlmodell, UI-Flow-Gate, oder Feature komplett offen? Empfehlung: Falls Open Source (MIT), dann kein technisches Gate, statt dessen Donation-Link oder Sponsorware-Modell.
- **Beschreibung:** Das PRD erwaehnt "Freischalt-Feature" und US-05 spricht von "Freischaltung mit Laufzeitanzeige (z.B. 30 Tage)". Voellig ungeklaert (siehe auch WID-02):
  - Ist das ein Bezahlmodell? (License Key? Donation-Ware? Sponsorware a la Tailwind UI?)
  - Oder ist "Freischaltung" nur ein UI-Flow? (Planungsfeatures zuerst, Messfeatures als "naechster Schritt")
  - Falls Bezahlmodell: Wie? (Payment-Provider? Offline-Lizenzschluessel?)
  - Server fuer Lizenzvalidierung? (widerspricht "keine Cloud" und "lokal")
  - Open-Source-Kompatibilitaet: Bei MIT-Lizenz kann jeder das Feature freischalten (Fork)
- **Warum wichtig:** Hat grundlegenden Einfluss auf die App-Architektur (Feature-Gates, Lizenz-Pruefung) und das Geschaeftsmodell.

### WL-AR-06: Datenmigration bei Schema-Aenderungen
- **Prioritaet:** NIEDRIG
- **Art:** Entscheidung treffen
- **Status:** BEANTWORTET -- siehe `docs/research/Tech-Stack-Evaluation.md` Abschnitt 4
- **Ergebnis:** rusqlite mit PRAGMA user_version fuer Schema-Versionierung. Migrationen als sequentielle SQL-Skripte (001_initial.sql, 002_add_measurements.sql etc.). Automatische Migration bei App-Start: user_version pruefen, fehlende Migrationen anwenden. Backup vor Migration: SQLite-Datei kopieren (trivial). Migrationstests als Teil der Test-Suite (Phase 9).
- **Beschreibung:** Wenn sich das Datenbankschema oder Projektformat aendert:
  - Automatische Migration bei App-Update? (SQLite ALTER TABLE + Migrationsskripte)
  - Schema-Versionsnummer in der Datenbank?
  - Backup vor Migration automatisch erstellen?
  - Abwaertskompatibilitaet: Alte Projekte in neuer App-Version oeffnen? Neue Projekte in alter Version?
  - Migrationstests als Teil der Test-Suite?
- **Warum wichtig:** Relevant ab dem zweiten Release, aber die Infrastruktur (Schema-Version, Migrations-Framework) muss von Anfang an eingeplant werden.

---

## Zusammenfassung

### Gesamtstatistik

| Kategorie | Anzahl | HOCH | MITTEL | NIEDRIG |
|-----------|--------|------|--------|---------|
| Widersprueche | 2 | 2 | 0 | 0 |
| 1. RF-Modellierung & Physik | 7 | 3 | 2 | 2 |
| 2. AP-Steuerung & Hardware | 6 | 3 | 3 | 0 |
| 3. Canvas & UI | 5 | 2 | 1 | 2 |
| 4. Heatmap-Berechnung & Rendering | 5 | 3 | 2 | 0 |
| 5. Messung & Kalibrierung | 6 | 3 | 2 | 1 |
| 6. Mixing Console & Optimierung | 3 | 1 | 2 | 0 |
| 7. Datenhaltung & Persistenz | 3 | 1 | 1 | 1 |
| 8. Tech-Stack Entscheidungen | 6 | 3 | 2 | 1 |
| 9. Deployment & Distribution | 3 | 0 | 1 | 2 |
| 10. Offene Architektur-Fragen | 6 | 1 | 3 | 2 |
| **GESAMT** | **52** | **22** | **19** | **11** |

### Verteilung nach Art

| Art | Anzahl (Nennungen) |
|-----|---------------------|
| Recherche noetig | 17 |
| Entscheidung treffen | 25 |
| Technisches Experiment | 11 |
| Benutzer fragen | 4 |

> Hinweis: Einige Luecken haben mehrere Arten (z.B. "Recherche noetig + Technisches Experiment"). Die Summe der Nennungen ist daher groesser als 52.

### Top-10 Kritische Luecken (sofort adressieren)

| Rang | ID | Thema | Empfohlene Aktion |
|------|----|-------|-------------------|
| 1 | **WL-AP-01** | AP-Zugriffsmethode | **Technisches Experiment**: DAP-X2810 physisch auf APIs testen (SNMP-Walk, SSH-Versuch, Web-Interface analysieren, REST-API suchen). Ohne Ergebnis ist der Optimierungsassistent nicht realisierbar. |
| 2 | **WL-TS-01** | Frontend-Framework | **Evaluation**: Svelte 5 vs. React 19 mit Canvas-PoC (Bild laden, Linien zeichnen, Heatmap-Overlay) |
| 3 | **WL-TS-02** | Desktop-Framework | **Evaluation**: Tauri 2 vs. Electron mit iPerf3-Sidecar-PoC und WebView-Canvas-Performance-Test |
| 4 | **WL-UI-01** | Canvas-Library | **PoC**: Konva.js vs. PixiJS vs. Hybrid-Ansatz (SVG+Canvas) im gewaehlten Framework |
| 5 | **WL-HM-01** | Heatmap-Aufloesung | **Benchmark**: Ray-Casting-Performance bei 10cm, 25cm, 50cm Aufloesung mit 50 Waenden und 5 APs |
| 6 | **WL-HM-02** | Ray-Casting-Algorithmus | **PoC**: Implementierung + Performance-Test mit Spatial Index (Quadtree/Grid) |
| 7 | **WL-HM-03** | Berechnung offloaden | **PoC**: WebWorker vs. Rust-Backend vs. WASM fuer Heatmap-Berechnung |
| 8 | **WL-MS-01** | iPerf3-Integration | **PoC**: Tauri-Sidecar mit iPerf3-Binary, JSON-Output-Parsing, Fehlerbehandlung |
| 9 | **WL-RF-01** | Materialdatenbank | **Recherche**: IEEE 802.11 Literatur und ITU-R P.1238 Revision 4 nach Daempfungswerten fuer alle gaengigen Materialien durchsuchen |
| 10 | **WL-RF-05** | Antennendiagramm | **Recherche**: D-Link-Datenblatt und FCC-Filing fuer DAP-X2810 Antennen-Pattern-Daten suchen. Vereinfachtes 2D-Modell ableiten. |

### Empfohlene naechste Schritte

#### Phase 3a: Technische Recherche (Prioritaet 1)
1. **AP-Experiment** (WL-AP-01, WL-AP-02, WL-AP-03): DAP-X2810 physisch testen -- SNMP-Walk (`snmpwalk -v2c -c public <ip>`), SSH-Versuch, Web-Interface HTTP-Traffic analysieren (Browser DevTools), REST-API-Endpunkte suchen
2. **Canvas-PoC** (WL-UI-01, WL-UI-02): Minimaler Prototyp mit Grundriss-Bild + Linien-Zeichnung + Heatmap-Overlay in verschiedenen Libraries
3. **iPerf3-PoC** (WL-MS-01): Tauri-App die iPerf3 als Sidecar startet und JSON-Output parsed
4. **RF-Materialdatenbank** (WL-RF-01): IEEE 802.11-Literatur, ITU-R P.1238 Revision 4, und bestehende Open-Source-Tools nach Daempfungswerten durchsuchen

#### Phase 3b: Open-Source-Evaluation (Prioritaet 2)
5. Bestehende WLAN-Planungstools evaluieren: Ekahau HeatMapper (Konzepte), WiFi Sweetspots (macOS), LinSSID (Linux), NetSpot Free -- was koennen wir uebernehmen?
6. Canvas/Zeichentools evaluieren: Excalidraw (Architektur), tldraw (UX) -- fuer Grundriss-Editor-Inspiration

#### Phase 3c: Tech-Stack-Evaluation (Prioritaet 3)
7. Framework-Vergleich: Svelte 5 + Tauri 2 als Basis-PoC bauen
8. State-Management: Svelte Stores vs. XState fuer komplexe Workflows (Mess-Ablauf) testen
9. i18n-Bibliothek: i18next vs. Paraglide vs. Custom evaluieren

#### Phase 4: Fragen an den Benutzer
10. Mixing Console im MVP? (WID-01)
11. Freischaltungslogik: Bezahlmodell oder UI-Flow? (WID-02, WL-AR-05)
12. Plattform-Prioritaeten: macOS first? Alle gleichzeitig? (WL-DP-01)
13. Herstellerunabhaengigkeit: Nur D-Link im MVP oder auch andere? (WL-AP-05)
14. Mobile Messung: Reicht Desktop oder brauchen wir eine Companion-Loesung? (WL-UI-04)
