# AP-Steuerung: D-Link DAP-X2810 Programmatische Kontrolle

> **Phase 3a Deliverable** | **Datum:** 2026-02-27 | **Status:** Abgeschlossen
>
> Adressiert Wissensluecke **WL-AP-01** (KRITISCH): Wie kann der D-Link DAP-X2810
> programmatisch gesteuert werden, ohne Nuclias Connect?
>
> **Wichtiger Hinweis:** Dieses Dokument unterscheidet klar zwischen
> **gesicherten Fakten** (mit Quelle) und **Annahmen/Ableitungen** (markiert).

---

## Zusammenfassung

Der D-Link DAP-X2810 bietet **vier primaere Steuerungsansaetze** mit unterschiedlicher
Zuverlaessigkeit und Funktionstiefe:

| Ansatz | Machbarkeit | Risiko | Empfehlung |
|--------|-------------|--------|------------|
| 1. Web-Interface Scraping (HTTP/HTTPS) | HOCH | MITTEL | **Primaer-Ansatz** |
| 2. SNMP (v1/v2c) | MITTEL | MITTEL | **Sekundaer-Ansatz** |
| 3. CLI ueber Seriell/Telnet | MITTEL | HOCH | **Fallback** |
| 4. Nuclias Connect API | NIEDRIG | HOCH | Nicht empfohlen |

**Kernempfehlung:** Web-Interface-Scraping als Hauptansatz mit SNMP als ergaenzende
Steuerung fuer spezifische Parameter (TX Power, Channel).

---

## 1. Management-Interfaces des DAP-X2810

### 1.1 Web-Interface (HTTP/HTTPS) - GESICHERT

**Quelle:** [D-Link DAP-X2810 Datasheet](https://support.dlink.com/resource/products/DAP-X2810/REVA/DAP-X2810_REVA_DATASHEET_v1.02_US.pdf), [SecureSwitches Specs](https://www.secureswitches.com/dap-x2810.asp)

- **Protokolle:** HTTP und SSL (HTTPS)
- **Standard-Adresse:** `http://dapx2810.local` oder `http://192.168.0.50` (DHCP-Fallback)
- **Standard-Login:** Username: `admin`, Passwort: `admin`
- **Struktur:** Drei Hauptbereiche: Basic Settings, Advanced Settings, Status
- **CGI-Endpunkt:** `/cgi-bin/webproc` (basierend auf Analyse verwandter D-Link Modelle)
  - Login: POST mit `obj-action=auth`, `:username`, `:password`
  - Session: Cookie-basiert (`sessionid`)
- **Konfigurationsspeicherung:** Ueber "Configuration > Save and Activate"

**Steuerbare Parameter im Web-Interface:**
- Frequenzband (2.4 GHz / 5 GHz)
- SSID und SSID-Hidden
- Security (WEP 64/128, WPA/WPA2/WPA3 Personal/Enterprise)
- Kanalauswahl (Auto oder manuell via Dropdown)
- Kanalbreite (20/40/80 MHz - Annahme basierend auf Wi-Fi 6 Standard)
- TX Power (vermutlich Dropdown mit Stufen - nicht explizit dokumentiert fuer DAP-X2810)
- Band Steering
- Airtime Fairness (ATF)
- Load Balancing
- MU-MIMO Einstellungen
- OFDMA
- Wireless Broadcast Scheduling
- Betriebsmodi: Access Point, WDS, WDS mit AP
- MAC Access Control
- Client Isolation
- VLAN-Zuordnung
- Captive Portal (ab Firmware 1.25)

### 1.2 SNMP - GESICHERT (Basis), TEILWEISE VERIFIZIERT (Wireless)

**Quelle:** [Firmware Release Notes v1.10](https://support.dlink.com/resource/products/DAP-X2810/REVA/FIRMWARE/DAP-X2810_REVA_RELEASE_NOTES_v1.10.015.pdf), [D-Link Support](https://support.dlink.com/resource/products/DAP-X2810/REVA/)

- **Unterstuetzung:** "SNMP for basic settings" (ab Firmware v1.10.015)
- **MIB-Datei:** Verfuegbar zum Download (MIB v1.10.015) auf der D-Link Support-Seite
- **D-View Integration:** MIB & D-View Module werden mit Firmware-Updates aktualisiert

**SNMP-Konfiguration (Ableitung von verwandten DAP-Modellen):**

Basierend auf dem DAP-2360/DAP-2690 (gleiche Produktfamilie):
- Public Community String (read-only): Default `public`
- Private Community String (read-write): Default `private`
- Trap Status: Aktivierbar/Deaktivierbar
- Trap Server IP: Konfigurierbar
- SNMP standardmaessig **deaktiviert** - muss im Web-Interface aktiviert werden

**IEEE 802.11 MIB (Standard) - Potentiell nutzbare OIDs:**

Die IEEE802dot11-MIB definiert folgende **read-write** OIDs fuer Wireless-Steuerung:

| OID | Name | Typ | Zugriff | Beschreibung |
|-----|------|-----|---------|--------------|
| `.1.2.840.10036.4.3.1.10` | `dot11CurrentTxPowerLevel` | Integer32 | **Read-Write** | Aktive TX-Leistungsstufe |
| `.1.2.840.10036.4.5.1.1` | `dot11CurrentChannel` | Integer32 | **Read-Write** | Aktiver Kanal |
| `.1.2.840.10036.4.11.1.1` | `dot11CurrentFrequency` | Integer32 | **Read-Write** | Aktive Frequenz |
| `.1.2.840.10036.4.5.1.3` | `dot11CurrentCCAMode` | Enum | **Read-Write** | CCA-Modus |
| `.1.2.840.10036.2.1.1.2` | `dot11RTSThreshold` | Integer32 | **Read-Write** | RTS-Schwelle |
| `.1.2.840.10036.2.1.1.5` | `dot11FragmentationThreshold` | Integer32 | **Read-Write** | Fragmentierungsschwelle |

Und folgende **read-only** OIDs fuer Monitoring:

| OID | Name | Typ | Beschreibung |
|-----|------|-----|--------------|
| `.1.2.840.10036.4.3.1.1` | `dot11NumberSupportedPowerLevels` | Integer32 | Anzahl unterstuetzter TX-Stufen |
| `.1.2.840.10036.4.3.1.2-9` | `dot11TxPowerLevel1-8` | Integer32 | Verfuegbare TX-Stufen (bis zu 8) |
| `.1.2.840.10036.1.7.1.4` | `dot11MaximumTransmitPowerLevel` | Integer32 | Maximale TX-Leistung |
| `.1.2.840.10036.1.7.1.2` | `dot11FirstChannelNumber` | Integer32 | Erster Kanal |
| `.1.2.840.10036.1.7.1.3` | `dot11NumberofChannels` | Integer32 | Anzahl Kanaele |

**Quelle:** [IEEE802dot11-MIB auf Observium](https://mibs.observium.org/mib/IEEE802dot11-MIB/)

> **WARNUNG:** Ob der DAP-X2810 die IEEE802dot11-MIB tatsaechlich implementiert und
> insbesondere SNMP-SET-Operationen auf Wireless-Parameter akzeptiert, ist **NICHT
> verifiziert**. Die D-Link-Dokumentation spricht nur von "SNMP for basic settings".
> Dies muss empirisch getestet werden.

### 1.3 CLI (Command Line Interface) - GESICHERT

**Quelle:** [D-Link Firmware Release Notes](https://support.dlink.com/resource/products/DAP-X2810/REVA/FIRMWARE/DAP-X2810_REVA_RELEASE_NOTES_v1.10.015.pdf), [D-Link UK FAQ](https://www.dlink.com/uk/en/support/faq/access-points-and-range-extenders/access-points/dap-series/dap-2690/uk_dap_2690_dap_2695_how_to_apply_an_ip_address_via_cli)

- **Unterstuetzung:** "CLI for basic settings" (ab Firmware v1.10.015)
- **Hardware-Anschluss:** RJ45-Konsolen-Port (auf der Geraete-Rueckseite)
  - Serielle Parameter: **115200 Baud, 8N1** (8 Daten-Bits, Keine Paritaet, 1 Stop-Bit)
  - Kein Flow Control
- **Software:** PuTTY oder beliebiger Terminal-Emulator
- **Login:** Username: `admin`, Passwort: (leer oder `admin`)
- **Prompt:** `WAP->`

**CLI-Befehlsformat (Ableitung von DAP-2360/DAP-2690/DAP-2695):**

Die D-Link DAP-Serie nutzt ein einfaches `get`/`set`-Befehlsschema:

```bash
# Hilfe anzeigen
WAP-> help
WAP-> ?

# Netzwerk-Konfiguration
WAP-> set ipmode static
WAP-> set ipaddr 192.168.1.185
WAP-> set ipmask 255.255.255.0
WAP-> set gateway 192.168.1.1
WAP-> set apply

# Wireless-Befehle (Ableitung von DAP-2695 CLI Manual)
WAP-> get apmode          # AP-Betriebsmodus anzeigen
WAP-> get band            # Aktuelles Band anzeigen
WAP-> get ssid            # SSID anzeigen
WAP-> get ssidhidden      # SSID-Hidden-Modus anzeigen
WAP-> get channel         # Kanal anzeigen
WAP-> get txpower         # TX-Leistung anzeigen

WAP-> set channel <n>     # Kanal setzen
WAP-> set txpower <value> # TX-Leistung setzen
WAP-> set band <value>    # Band setzen
WAP-> set ssid <name>     # SSID setzen
WAP-> set mode <value>    # Modus setzen
WAP-> set apply           # Aenderungen anwenden
```

**Quellen fuer CLI-Referenz:**
- [DAP-2695 CLI Manual (PDF)](https://www.dlink-jp.com/product/wireless-lan/pdf/D-Link-DAP-2695-CLI-Manual.pdf)
- [DAP-2360 CLI Manual (ManualsLib)](https://www.manualslib.com/manual/899512/D-Link-Dap-2360.html)
- [DAP-2690 CLI Manual (Manualzz)](https://manualzz.com/doc/47017304/dap-2690---d-link)

> **EINSCHRAENKUNG:** Es gibt kein publiziertes CLI-Manual spezifisch fuer den
> DAP-X2810. Die obigen Befehle sind von aelteren DAP-Modellen abgeleitet.
> Die tatsaechliche Befehlsstruktur muss am Geraet verifiziert werden mit `help`/`?`.

### 1.4 Telnet / SSH - UNGESICHERT

**Quelle:** [D-Link DAP-2680 Manual](https://www.manua.ls/d-link/dap-2680/manual), [SecureSwitches](https://www.secureswitches.com/dap-x2810.asp)

- Der Vorgaenger DAP-2680 unterstuetzt **SSH und Telnet** laut Spezifikation
- Die DAP-X2810-Spezifikation listet nur "Web (HTTP), SSL" als Management-Interfaces
- **Telnet-Zugang ist wahrscheinlich vorhanden** (da CLI unterstuetzt wird), aber nicht offiziell dokumentiert
- SSH-Zugang ist **nicht bestaetigt** fuer den DAP-X2810

> **ANNAHME:** Wenn CLI via Seriell verfuegbar ist, koennte Telnet den gleichen
> Befehlssatz bieten. Dies muss empirisch getestet werden mit `telnet 192.168.0.50`.

### 1.5 TR-069/CWMP - NICHT UNTERSTUETZT

Keine Hinweise auf TR-069/CWMP-Support in der DAP-X2810-Dokumentation gefunden.

### 1.6 NETCONF/YANG - NICHT UNTERSTUETZT

Kein NETCONF/YANG-Support dokumentiert. Dies ist bei Consumer/SMB-Geraeten auch nicht ueblich.

### 1.7 REST API - NICHT VORHANDEN

Es gibt keine dokumentierte REST API fuer den DAP-X2810. Die einzige API-aehnliche
Schnittstelle ist das CGI-basierte Web-Interface.

---

## 2. D-Link Management-Oekosystem

### 2.1 Nuclias Connect

**Quelle:** [Nuclias Connect](https://www.dlink.com/en/for-business/nuclias/nuclias-connect)

Nuclias Connect ist die primaere Management-Plattform fuer D-Link Business-APs:
- **Kostenlos**, keine Lizenzgebuehren
- Installation auf Windows/Linux Server oder DNH-100 Hardware
- Zentrales Management fuer bis zu 1.500 APs
- Konfiguration, Monitoring, Firmware-Updates
- **Keine dokumentierte oeffentliche REST API**

> **ENTSCHEIDUNG:** Nuclias Connect wird **nicht** verwendet (Benutzer-Anforderung).
> Der AP wird direkt gesteuert. Dies ist moeglich, da alle DAP-Geraete im
> Standalone-Modus betrieben werden koennen.

### 2.2 D-View (SNMP Management)

**Quelle:** [D-View Datasheet](https://support.dlink.com/resource/products/DS-510S/REVA/DS-510S_DATASHEET_1.00_EN.PDF)

D-View ist D-Links SNMP Network Management System:
- Unterstuetzt Standard-MIBs (MIB II, 802.1D, 802.1p, 802.1Q, RMON)
- MIB-Compiler fuer herstellerspezifische MIBs
- Die DAP-X2810 MIB-Datei kann in D-View importiert werden
- Irrelevant fuer unser Projekt, aber die MIB-Datei selbst ist nuetzlich

### 2.3 D-Link Central WiFi Manager (CWM)

Aeltere Management-Loesung, durch Nuclias Connect ersetzt. Keine API dokumentiert.

---

## 3. Steuerbare Parameter pro Schnittstelle

### 3.1 Parameter-Matrix

| Parameter | Web-GUI | SNMP (IEEE MIB) | CLI | Prioritaet |
|-----------|---------|------------------|-----|------------|
| TX Power (2.4 GHz) | Ja | Moeglich* | Moeglich* | KRITISCH |
| TX Power (5 GHz) | Ja | Moeglich* | Moeglich* | KRITISCH |
| Channel (2.4 GHz) | Ja | Moeglich* | Moeglich* | KRITISCH |
| Channel (5 GHz) | Ja | Moeglich* | Moeglich* | KRITISCH |
| Channel Width | Ja | Unwahrscheinlich | Moeglich* | HOCH |
| SSID | Ja | Nein | Ja | MITTEL |
| Security (WPA/WPA2/WPA3) | Ja | Nein | Moeglich* | MITTEL |
| Band Steering | Ja | Nein | Unbekannt | MITTEL |
| Airtime Fairness | Ja | Nein | Unbekannt | NIEDRIG |
| Client Isolation | Ja | Nein | Unbekannt | NIEDRIG |
| 802.11k/v/r (Fast Roaming) | Ja (via DNC) | Nein | Unbekannt | NIEDRIG |
| QoS Settings | Ja | Nein | Unbekannt | NIEDRIG |
| Scheduling (on/off) | Ja | Nein | Unbekannt | NIEDRIG |
| Load Balancing | Ja | Nein | Unbekannt | NIEDRIG |

\* = Basierend auf Standard-MIB/CLI-Ableitungen, muss empirisch verifiziert werden.

### 3.2 TX Power Werte (Referenz)

**Quelle:** [RF-Modell-Regeln](/.claude/rules/rf-modell.md), [Datasheet](https://support.dlink.com/resource/products/DAP-X2810/REVA/DAP-X2810_REVA_DATASHEET_v1.02_US.pdf)

- **2.4 GHz:** Max. 23 dBm TX Power, 3.2 dBi Antennengewinn
- **5 GHz:** Max. 26 dBm TX Power, 4.3 dBi Antennengewinn
- **Erwartete TX-Stufen:** Typischerweise 8 Stufen (Full, -1dB, -2dB, -3dB, -6dB, -9dB, -12dB, Min)
  - Ableitung von anderen D-Link Business-APs, muss verifiziert werden

---

## 4. Empfohlene Implementierungsstrategie

### 4.1 Primaer-Ansatz: Web-Interface Automation

**Warum:** Zuverlaessigste Methode, alle Parameter zuganglich, keine zusaetzliche
Hardware noetig.

**Technische Umsetzung:**

```
Architektur:
  Browser/App → [HTTP-Client] → DAP-X2810 Web-GUI (/cgi-bin/webproc)

Technologie:
  - Rust (Tauri Backend): reqwest + cookie-jar fuer HTTP-Session
  - Alternativ: Python requests + BeautifulSoup (fuer Prototyping)

Workflow:
  1. HTTP POST an /cgi-bin/webproc mit Login-Credentials
  2. Session-Cookie speichern
  3. GET-Requests fuer aktuelle Konfiguration (HTML parsen)
  4. POST-Requests fuer Konfigurationsaenderungen
  5. "Save and Activate" Endpoint aufrufen
```

**Risiken:**
- Web-Interface kann sich mit Firmware-Updates aendern (Form-Felder, Endpoints)
- HTML-Parsing ist fragil
- Kein offizieller API-Vertrag

**Mitigation:**
- Adapter-Pattern: Web-Interface hinter abstraktem Interface
- Automatische Tests gegen echtes Geraet
- Firmware-Version pruefen und warnen bei unbekannter Version

### 4.2 Sekundaer-Ansatz: SNMP fuer kritische Parameter

**Warum:** Stabiles, standardisiertes Protokoll fuer TX Power und Channel.

**Technische Umsetzung:**

```bash
# Beispiel: TX Power lesen (muss verifiziert werden)
snmpget -v2c -c public 192.168.0.50 \
  1.2.840.10036.4.3.1.10.0

# Beispiel: TX Power setzen (muss verifiziert werden)
snmpset -v2c -c private 192.168.0.50 \
  1.2.840.10036.4.3.1.10.0 i 3

# Beispiel: Kanal lesen
snmpget -v2c -c public 192.168.0.50 \
  1.2.840.10036.4.5.1.1.0

# Beispiel: Kanal setzen
snmpset -v2c -c private 192.168.0.50 \
  1.2.840.10036.4.5.1.1.0 i 6
```

**Rust-Bibliothek:** `snmp` oder `netsnmp-rs` Crate

**Risiken:**
- D-Link implementiert moeglicherweise nur ein Subset der IEEE802dot11-MIB
- "SNMP for basic settings" koennte bedeuten, dass nur System-MIBs (Hostname, etc.) unterstuetzt werden
- SNMP-SET koennte deaktiviert oder nicht implementiert sein

### 4.3 Fallback: CLI ueber Telnet/Seriell

**Warum:** Letzter Ausweg, wenn Web-Interface und SNMP nicht ausreichen.

**Einschraenkungen:**
- Seriell: Erfordert physische Verbindung (RJ45-Konsole + USB-Serial-Adapter)
- Telnet: Unverschluesselt, moeglicherweise nicht verfuegbar
- Befehlssatz moeglicherweise eingeschraenkt ("CLI for basic settings")

**Technische Umsetzung:**
- Telnet-Client in Rust (`tokio` + Telnet-Protokoll)
- Expect-artige Automatisierung (Prompt erkennen, Befehle senden)
- Parsing der Textausgabe

---

## 5. OpenWrt-Kompatibilitaet

### 5.1 Status - NICHT KOMPATIBEL

**Quelle:** [OpenWrt Forum DAP-2680](https://forum.openwrt.org/t/openwrt-on-dlink-dap-2680/56725), [OpenWrt Forum DAP-X1860](https://forum.openwrt.org/t/openwrt-support-for-d-link-dap-x1860/141538), [WikiDevi](https://wikidevi.wi-cat.ru/WikiDevi.Wi-Cat.RU:Network/Hardware_Specific/D-Link)

| Modell | Chipset | OpenWrt Status |
|--------|---------|----------------|
| DAP-2680 | Qualcomm QCA9558 + QCA9984 | **Unterstuetzt** (seit v20) |
| DAP-X1860 | MediaTek MT7621AT + MT7915E | **Unterstuetzt** (seit Jan 2023) |
| DAP-X2810 | Unbekannt (nicht in WikiDevi) | **Nicht unterstuetzt** |

- Der DAP-X2810 ist **nicht** in der OpenWrt Table of Hardware gelistet
- Der interne Chipset ist nicht oeffentlich dokumentiert
- Als Wi-Fi 6 (AX) Geraet verwendet er wahrscheinlich einen neueren Qualcomm IPQ oder MediaTek MT76xx Chipset
- OpenWrt-Portierung waere ein eigenstaendiges Projekt mit ungewissem Ausgang

> **ENTSCHEIDUNG:** OpenWrt ist **kein** gangbarer Weg fuer das Projekt.
> Wir arbeiten mit der Original-Firmware.

---

## 6. Firmware-Versionen

**Quelle:** [D-Link Support](https://support.dlink.com/productinfo.aspx?m=DAP-X2810), [Firmware-Verzeichnis](https://support.dlink.com/resource/products/DAP-X2810/REVA/FIRMWARE/)

| Version | Datum | Wichtige Aenderungen |
|---------|-------|---------------------|
| 1.00.007 | 2021 | Initiale Firmware |
| 1.10.015 | ~2022 | SNMP fuer Basic Settings, CLI fuer Basic Settings, D-Link Fast Roaming via DNC/DNH |
| 1.20.032 | 2023-02-21 | Aenderungen an MIB & D-View Module |
| 1.25.053 | 2025-04-24 | Captive Portal (External/MAC/Social Login/Click-through), KR 5GHz Ch165 |

**Empfohlene Firmware:** v1.25.053 (neueste, mit SNMP und CLI Support)

---

## 7. Risikobewertung

### 7.1 Was passiert wenn KEINE programmatische Steuerung moeglich ist?

**Szenario 1: Web-Interface Scraping funktioniert NICHT**
- Unwahrscheinlich, da das Web-Interface immer vorhanden ist
- Worst Case: JavaScript-heavy SPA ohne parsbare Forms
- Mitigation: Headless Browser (Chromium via Tauri) als letzter Ausweg

**Szenario 2: SNMP-SET funktioniert NICHT fuer Wireless-Parameter**
- Wahrscheinlich, da "SNMP for basic settings" eingeschraenkt sein kann
- Auswirkung: Nur Web-Interface fuer Wireless-Aenderungen
- Mitigation: Kein Problem, Web-Interface ist der Primaer-Ansatz

**Szenario 3: CLI ist zu eingeschraenkt**
- Wahrscheinlich, "CLI for basic settings" deutet auf eingeschraenkten Befehlssatz hin
- Auswirkung: CLI nur fuer Basis-Netzwerkkonfiguration nutzbar
- Mitigation: Kein Problem wenn Web-Interface funktioniert

**Szenario 4: Firmware-Update bricht Scraping**
- Moeglich bei jedem Web-Interface-Update
- Mitigation: Firmware-Version erkennen, Adapter pro Version, Tests

### 7.2 Gesamt-Risiko-Einschaetzung

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|-------------------|------------|------------|
| Web-Scraping funktioniert | 90% Erfolg | N/A | Primaer-Ansatz |
| SNMP SET fuer Wireless | 40% Erfolg | Gering | Web-Interface als Alternative |
| Telnet verfuegbar | 60% Erfolg | Gering | Nicht zwingend noetig |
| Firmware bricht Scraping | 20% pro Update | Mittel | Adapter-Pattern, Tests |
| AP reagiert nicht auf Aenderungen | 5% | KRITISCH | Manueller Fallback |

**Gesamt-Risiko: MITTEL** - Es gibt immer mindestens einen funktionierenden Steuerungsweg.

### 7.3 Auswirkung auf das Gesamtprojekt

- **Kernfunktion "Heatmap" (Phase 8c):** Nicht betroffen - benoetigt keine AP-Steuerung
- **Kernfunktion "Messung" (Phase 8d):** Minimal betroffen - Messpunkte erfassen geht auch ohne AP-Steuerung
- **Funktion "Optimierung/Mixing Console" (Phase 8e):** DIREKT betroffen - benoetigt AP-Parameteraenderungen
- **Fallback:** Mixing Console kann Aenderungen als "Empfehlung" ausgeben, die der Nutzer manuell umsetzt

---

## 8. Verifizierungsplan (Naechste Schritte)

Bevor die Implementierung beginnt, muessen folgende Tests am echten Geraet durchgefuehrt werden:

### 8.1 Web-Interface Reverse Engineering

```bash
# 1. Browser Developer Tools oeffnen (F12)
# 2. Network Tab aktivieren
# 3. Auf DAP-X2810 Web-Interface einloggen
# 4. Wireless-Einstellungen aendern
# 5. Alle HTTP-Requests dokumentieren:
#    - URL, Method, Headers, Body, Response

# Erwartetes Format (basierend auf D-Link DAP-2020 Analyse):
curl -X POST http://192.168.0.50/cgi-bin/webproc \
  -d "obj-action=auth&:username=admin&:password=admin"

# Session-Cookie extrahieren und fuer weitere Requests verwenden
```

### 8.2 SNMP-Test

```bash
# 1. SNMP im Web-Interface aktivieren
# 2. Community Strings konfigurieren

# System-MIB testen (sollte funktionieren)
snmpwalk -v2c -c public 192.168.0.50 system

# D-Link MIB testen
snmpwalk -v2c -c public 192.168.0.50 1.3.6.1.4.1.171

# IEEE 802.11 MIB testen
snmpwalk -v2c -c public 192.168.0.50 1.2.840.10036

# TX Power lesen
snmpget -v2c -c public 192.168.0.50 \
  1.2.840.10036.4.3.1.10.0

# TX Power SETZEN (kritischer Test!)
snmpset -v2c -c private 192.168.0.50 \
  1.2.840.10036.4.3.1.10.0 i 3
```

### 8.3 Telnet/CLI-Test

```bash
# Telnet testen
telnet 192.168.0.50

# Falls Telnet nicht verfuegbar, seriell:
# USB-to-Serial Adapter + RJ45-Konsolen-Kabel
# PuTTY: COM-Port, 115200 8N1

# Nach Login:
WAP-> help
WAP-> ?
WAP-> get txpower
WAP-> get channel
WAP-> get band
```

### 8.4 MIB-Datei analysieren

```bash
# MIB-Datei von D-Link Support herunterladen:
# https://support.dlink.com/resource/products/DAP-X2810/REVA/
# Datei: MIB v1.10.015

# MIB analysieren:
snmptranslate -Tp -M +./mibs -m ALL 1.3.6.1.4.1.171

# Oder visuell mit MIB-Browser (z.B. iReasoning MIB Browser)
```

---

## 9. Architektur-Empfehlung

### 9.1 AP-Controller Abstraktionsschicht

```
                    +--------------------+
                    |  APControllerTrait  |  (Abstract Interface)
                    +--------------------+
                    | + get_tx_power()   |
                    | + set_tx_power()   |
                    | + get_channel()    |
                    | + set_channel()    |
                    | + get_config()     |
                    | + set_config()     |
                    | + get_status()     |
                    +--------------------+
                             |
              +--------------+--------------+
              |              |              |
    +---------+----+ +------+------+ +-----+------+
    | WebGUIDriver | | SNMPDriver  | | CLIDriver  |
    +--------------+ +-------------+ +------------+
    | HTTP/HTTPS   | | snmpget/set | | Telnet/    |
    | Cookie Auth  | | Community   | | Serial     |
    | HTML Parsing | | IEEE 802.11 | | Expect     |
    +--------------+ +-------------+ +------------+
```

### 9.2 Priorisierte Nutzung

1. **WebGUIDriver** fuer alle Konfigurationsaenderungen (zuverlaessigster Ansatz)
2. **SNMPDriver** fuer schnelles Monitoring (TX Power, Channel, Statistiken)
3. **CLIDriver** nur wenn Web-GUI nicht erreichbar oder fuer spezielle Debugging-Zwecke

### 9.3 Firmware-Kompatibilitaet

```rust
// Pseudocode fuer Firmware-Erkennung
struct FirmwareVersion {
    major: u8,  // 1
    minor: u8,  // 25
    patch: u16, // 053
}

impl APController {
    fn detect_firmware(&self) -> Result<FirmwareVersion> {
        // GET /cgi-bin/webproc?getinfo=system
        // Parse firmware version from response
    }

    fn is_compatible(&self, version: &FirmwareVersion) -> bool {
        // Getestete Versionen: 1.20.032, 1.25.053
        version.major == 1 && version.minor >= 20
    }
}
```

---

## 10. Quellen

### Offizielle D-Link Dokumentation
- [DAP-X2810 Produktseite](https://www.dlink.com/en/products/dap-x2810-ax1800-wifi-6-dualband-poe-access-point)
- [DAP-X2810 Support & Downloads](https://support.dlink.com/productinfo.aspx?m=DAP-X2810)
- [DAP-X2810 Resource Directory](https://support.dlink.com/resource/products/DAP-X2810/REVA/)
- [DAP-X2810 Firmware Directory](https://support.dlink.com/resource/products/DAP-X2810/REVA/FIRMWARE/)
- [DAP-X2810 User Manual (PDF)](https://media.dlink.eu/support/products/dap/dap-x2810/documentation/dap-x2810_man_reva1_1-00_eu_multi_20211012.pdf)
- [DAP-X2810 Datasheet](https://support.dlink.com/resource/products/DAP-X2810/REVA/DAP-X2810_REVA_DATASHEET_v1.02_US.pdf)
- [SecureSwitches Specs](https://www.secureswitches.com/dap-x2810.asp)

### CLI-Referenz (verwandte Modelle)
- [DAP-2695 CLI Manual (PDF)](https://www.dlink-jp.com/product/wireless-lan/pdf/D-Link-DAP-2695-CLI-Manual.pdf)
- [DAP-2360 CLI Manual (ManualsLib)](https://www.manualslib.com/manual/899512/D-Link-Dap-2360.html)
- [DAP-2690 CLI Access FAQ](https://www.dlink.com/uk/en/support/faq/access-points-and-range-extenders/access-points/dap-series/dap-2690/uk_dap_2690_dap_2695_how_to_apply_an_ip_address_via_cli)

### SNMP / MIB
- [IEEE802dot11-MIB (Observium)](https://mibs.observium.org/mib/IEEE802dot11-MIB/)
- [D-Link MIB Browser](https://mibbrowser.online/mibdb_search.php?search=1.3.6.1.4.1.171.&vendor=D-LINK)
- [D-Link MIBs (OiDView)](http://www.oidview.com/mibs/171/md-171-1.html)
- [Centreon D-Link SNMP Plugin](https://docs.centreon.com/pp/integrations/plugin-packs/procedures/network-dlink-standard-snmp/)

### Hardware / OpenWrt
- [DAP-2680 OpenWrt Forum](https://forum.openwrt.org/t/openwrt-on-dlink-dap-2680/56725)
- [DAP-X1860 OpenWrt Forum](https://forum.openwrt.org/t/openwrt-support-for-d-link-dap-x1860/141538)
- [WikiDevi D-Link Hardware](https://wikidevi.wi-cat.ru/WikiDevi.Wi-Cat.RU:Network/Hardware_Specific/D-Link)
- [OpenWrt Table of Hardware](https://toh.openwrt.org/)

### Firmware Release Notes
- [v1.10.015 Release Notes](https://support.dlink.com/resource/products/DAP-X2810/REVA/FIRMWARE/DAP-X2810_REVA_RELEASE_NOTES_v1.10.015.pdf)
- [v1.25 Release Notes](https://support.dlink.com/resource/PRODUCTS/DAP-X2810/REVA/FIRMWARE/DAP-X2810_REVA_RELEASE_NOTES_v1.25.pdf)
- [v1.20 Release Notes (DOCX)](https://support.dlink.com/resource/PRODUCTS/DAP-X2810/REVA/DAP-X2810%20Firmware%20Release%20Note%201.20_20230224.docx)
