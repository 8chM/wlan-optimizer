# Forschung: Messung & Kalibrierung

> Integration von iPerf3 und WLAN-Signalmessung in das WLAN-Optimizer Projekt

## 1. iPerf3 Integration

### 1.1 Integrationswege

Es gibt drei Wege, iPerf3 in eine Tauri-2-Desktop-App zu integrieren:

#### Option A: CLI-Wrapper via Tauri Sidecar (Empfehlung)

iPerf3 wird als externe Binaerdatei (Sidecar) in die App eingebettet und ueber das Tauri Shell-Plugin als Child-Process gesteuert.

**Konfiguration** in `tauri.conf.json`:
```json
{
  "bundle": {
    "externalBin": ["binaries/iperf3"]
  }
}
```

**Cross-Platform Naming**: Pro Zielplattform muss eine Binaerdatei mit Suffix existieren:
- `binaries/iperf3-x86_64-unknown-linux-gnu`
- `binaries/iperf3-x86_64-pc-windows-msvc.exe`
- `binaries/iperf3-aarch64-apple-darwin`

**Permissions** in `src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        {
          "name": "binaries/iperf3",
          "sidecar": true,
          "args": [
            "-c", { "validator": "\\S+" },
            "-t", { "validator": "\\d+" },
            "-P", { "validator": "\\d+" },
            "-J",
            "-R",
            "--connect-timeout", { "validator": "\\d+" }
          ]
        }
      ]
    }
  ]
}
```

**Rust-seitig (Tauri Backend)**:
```rust
use tauri_plugin_shell::ShellExt;

let command = app.shell().sidecar("iperf3").unwrap()
    .args(["-c", server_ip, "-t", "10", "-J"]);
let (mut rx, child) = command.spawn()?;

let mut output = String::new();
while let Some(event) = rx.recv().await {
    if let CommandEvent::Stdout(line) = event {
        output.push_str(&String::from_utf8_lossy(&line));
    }
}
```

**JavaScript-seitig (Frontend)**:
```javascript
import { Command } from '@tauri-apps/plugin-shell';
const command = Command.sidecar('binaries/iperf3', ['-c', serverIp, '-t', '10', '-J']);
const output = await command.execute();
const result = JSON.parse(output.stdout);
```

**Vorteile**: Einfachste Integration, nutzt offizielle iPerf3-Builds, gut getestet, JSON-Output direkt parsebar.
**Nachteile**: Externe Binaerdatei muss mitgeliefert werden (~1-2 MB pro Plattform), Lizenzfrage (BSD-3-Clause, kompatibel mit MIT).

#### Option B: libiperf C-API via Rust FFI

Die libiperf-Bibliothek bietet eine C-API fuer programmatische Nutzung.

**Wichtige Funktionen** (`iperf_api.h`):
```c
// Initialisierung
struct iperf_test *iperf_new_test();
int iperf_defaults(struct iperf_test *t);
void iperf_free_test(struct iperf_test *t);

// Konfiguration
void iperf_set_test_role(struct iperf_test *t, char role);  // 'c' oder 's'
void iperf_set_test_server_hostname(struct iperf_test *t, const char *host);
void iperf_set_test_server_port(struct iperf_test *t, int port);
void iperf_set_test_duration(struct iperf_test *t, int duration);
void iperf_set_test_num_streams(struct iperf_test *t, int num);
void iperf_set_test_blksize(struct iperf_test *t, int blksize);
void iperf_set_test_json_output(struct iperf_test *t, int enabled);

// Ausfuehrung
int iperf_run_client(struct iperf_test *t);
int iperf_run_server(struct iperf_test *t);
void iperf_reset_test(struct iperf_test *t);

// Ergebnis
char *iperf_get_test_json_output_string(struct iperf_test *t);
```

**Rust FFI Binding** (konzeptionell):
```rust
extern "C" {
    fn iperf_new_test() -> *mut IperfTest;
    fn iperf_defaults(test: *mut IperfTest) -> c_int;
    fn iperf_set_test_role(test: *mut IperfTest, role: c_char);
    fn iperf_set_test_server_hostname(test: *mut IperfTest, host: *const c_char);
    fn iperf_run_client(test: *mut IperfTest) -> c_int;
    fn iperf_get_test_json_output_string(test: *mut IperfTest) -> *const c_char;
    fn iperf_free_test(test: *mut IperfTest);
}
```

**Vorteile**: Kein externer Prozess, engere Integration.
**Nachteile**: Komplexes Build-System (C-Dependency), Cross-Compilation schwierig, Speichersicherheit muss manuell gewaehrleistet werden, kaum Rust-Ecosystem-Unterstuetzung.

#### Option C: riperf3 (Rust-Reimplementierung)

Das Projekt [riperf3](https://github.com/therealevanhenry/riperf3) ist eine Rust-Reimplementierung von iPerf3 mit FFI-kompatibler API. Noch frueh in der Entwicklung (MIT/Apache-2.0).

**Vorteile**: Native Rust, keine C-Dependencies.
**Nachteile**: Noch nicht produktionsreif, unklare Kompatibilitaet mit iPerf3-Servern, geringer Community-Support.

#### Empfehlung

**Option A (Sidecar)** ist klar zu bevorzugen:
- Bewaehrte, stabile iPerf3-Builds
- Einfache Integration ueber Tauri Shell-Plugin
- JSON-Output-Parsing ist trivial
- Cross-Platform via vorkompilierte Binaries
- Lizenz kompatibel (BSD-3-Clause)

### 1.2 Testparameter fuer WLAN-Throughput

#### TCP vs. UDP: Beide nutzen

| Protokoll | Metriken | Nutzen fuer WLAN-Optimizer |
|-----------|----------|---------------------------|
| **TCP** | Throughput, Retransmits | Realistische Anwendungsperformance, Retransmits zeigen WLAN-Probleme |
| **UDP** | Throughput, Jitter, Packet Loss | Netzwerkqualitaet unabhaengig von TCP-Congestion-Control |

**Empfehlung**: Beides messen. TCP fuer praxisnahe Throughput-Werte, UDP fuer Jitter und Packet Loss.

#### Empfohlene Parameter

**TCP-Test (Haupttest)**:
```bash
iperf3 -c SERVER -t 10 -P 4 -J --connect-timeout 5000
```

| Parameter | Wert | Begruendung |
|-----------|------|-------------|
| `-t` (Dauer) | **10s** | Guter Kompromiss: genuegend Samples fuer Mittelwert, nicht zu lang fuer den Benutzer. Bei 15+ Messpunkten sind 30s zu lang. |
| `-P` (Streams) | **4** | Nutzt MIMO (2x2) besser aus, realistischer als 1 Stream |
| `-J` (JSON) | immer | Maschinell parsebar |
| `--connect-timeout` | **5000ms** | Schnelles Fehlerfeedback |
| `-w` (Window) | Standard | TCP Window Scaling uebernimmt automatisch |
| `--omit` | **2s** | Erste 2 Sekunden ignorieren (TCP Slow Start) |

**UDP-Test (Ergaenzungstest)**:
```bash
iperf3 -c SERVER -u -b 0 -t 5 -J
```

| Parameter | Wert | Begruendung |
|-----------|------|-------------|
| `-u` | - | UDP-Modus |
| `-b 0` | unbegrenzt | Maximale Bitrate testen (Default waere nur 1 Mbit/s!) |
| `-t` | **5s** | Kuerzer als TCP, da aussagekraeftig genug |

**Reverse-Mode-Test (Download-Richtung)**:
```bash
iperf3 -c SERVER -t 10 -P 4 -R -J
```
Mit `-R` sendet der Server zum Client. Wichtig, da Upload und Download unterschiedlich sein koennen.

#### Gesamter Messpunkt-Test

Pro Messpunkt werden 3 Tests in Sequenz ausgefuehrt:
1. TCP Upload (10s) - `iperf3 -c SERVER -t 10 -P 4 -J --omit 2`
2. TCP Download (10s) - `iperf3 -c SERVER -t 10 -P 4 -R -J --omit 2`
3. UDP Qualitaet (5s) - `iperf3 -c SERVER -u -b 0 -t 5 -J`

**Gesamtdauer pro Messpunkt**: ca. 30-35 Sekunden (inkl. Overhead)

### 1.3 Server-Setup

#### Wer betreibt den iPerf3-Server?

Der iPerf3-Server muss auf einem separaten Geraet laufen, das per Kabel (Ethernet) mit dem Netzwerk verbunden ist. Der AP selbst kann in der Regel **nicht** als iPerf3-Server dienen (kein Linux-Shell-Zugang, keine iPerf3-Installation moeglich).

**Empfohlene Setups**:

| Option | Eignung | Hinweis |
|--------|---------|---------|
| **Desktop-PC/Notebook (LAN)** | Sehr gut | Schnellste Option, Gigabit-Ethernet |
| **Raspberry Pi 4/5** | Gut | Gigabit-Ethernet, leicht positionierbar, guenstig |
| **NAS/Homeserver** | Gut | Oft ohnehin vorhanden, Docker-Image verfuegbar |
| **Router (OPNsense etc.)** | Moeglich | iPerf3 oft als Paket installierbar |

**Raspberry Pi Setup**:
```bash
sudo apt install iperf3
# Als Daemon starten
iperf3 -s -D
# Oder als systemd Service
sudo systemctl enable iperf3
sudo systemctl start iperf3
```

**Wichtig**: Der Server muss am Ethernet haengen (nicht WLAN!), sonst misst man WLAN-zu-WLAN statt Client-zu-Netzwerk.

**Performance-Limitierung**: Raspberry Pi 3 schafft ca. 75 Mbit/s (CPU-limitiert), Pi 4/5 schafft Gigabit. Fuer Wi-Fi-6-Tests wird mindestens ein Pi 4 oder besser ein PC empfohlen.

### 1.4 JSON-Output-Parsing

#### iPerf3 JSON-Struktur

Mit `--json` (`-J`) liefert iPerf3 strukturierten Output:

```json
{
  "start": {
    "connected": [
      {
        "socket": 5,
        "local_host": "192.168.1.100",
        "local_port": 54321,
        "remote_host": "192.168.1.1",
        "remote_port": 5201
      }
    ],
    "version": "iperf 3.20",
    "system_info": "Linux ...",
    "timestamp": {
      "time": "2026-02-27T10:00:00+0100",
      "timesecs": 1740650400
    },
    "test_start": {
      "protocol": "TCP",
      "num_streams": 4,
      "blksize": 131072,
      "omit": 2,
      "duration": 10,
      "bytes": 0,
      "blocks": 0,
      "reverse": 0
    }
  },
  "intervals": [
    {
      "streams": [
        {
          "socket": 5,
          "start": 0.0,
          "end": 1.0,
          "seconds": 1.0,
          "bytes": 52428800,
          "bits_per_second": 419430400,
          "retransmits": 2,
          "snd_cwnd": 262144,
          "rtt": 1500,
          "rttvar": 200,
          "pmtu": 1500,
          "omitted": false
        }
      ],
      "sum": {
        "start": 0.0,
        "end": 1.0,
        "seconds": 1.0,
        "bytes": 209715200,
        "bits_per_second": 1677721600,
        "retransmits": 8,
        "omitted": false
      }
    }
  ],
  "end": {
    "streams": [],
    "sum_sent": {
      "start": 0.0,
      "end": 10.0,
      "seconds": 10.0,
      "bytes": 2097152000,
      "bits_per_second": 1677721600,
      "retransmits": 42,
      "sender": true
    },
    "sum_received": {
      "start": 0.0,
      "end": 10.0,
      "seconds": 10.0,
      "bytes": 2093056000,
      "bits_per_second": 1674444800,
      "sender": false
    },
    "cpu_utilization_percent": {
      "host_total": 12.5,
      "host_user": 8.3,
      "host_system": 4.2,
      "remote_total": 5.1,
      "remote_user": 3.2,
      "remote_system": 1.9
    }
  }
}
```

**UDP-spezifische Felder** (statt `retransmits`):
```json
{
  "jitter_ms": 0.45,
  "lost_packets": 3,
  "packets": 10000,
  "lost_percent": 0.03
}
```

#### Relevante Metriken fuer WLAN-Optimizer

| Metrik | JSON-Pfad | Einheit | Bedeutung |
|--------|-----------|---------|-----------|
| **Throughput (Send)** | `end.sum_sent.bits_per_second` | bps | Upload-Durchsatz |
| **Throughput (Recv)** | `end.sum_received.bits_per_second` | bps | Download-Durchsatz |
| **Retransmits** | `end.sum_sent.retransmits` | Anzahl | WLAN-Paketverluste/Interferenz |
| **Jitter** | `end.sum.jitter_ms` | ms | Latenz-Schwankung (nur UDP) |
| **Packet Loss** | `end.sum.lost_percent` | % | Verlorene Pakete (nur UDP) |
| **RTT** | `intervals[].streams[].rtt` | us | Round-Trip-Time (Latenz) |

#### Rust Datenstruktur zum Parsen

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct IperfResult {
    start: IperfStart,
    intervals: Vec<IperfInterval>,
    end: IperfEnd,
}

#[derive(Deserialize)]
struct IperfEnd {
    sum_sent: IperfSumSent,
    sum_received: IperfSumReceived,
    cpu_utilization_percent: CpuUtilization,
}

#[derive(Deserialize)]
struct IperfSumSent {
    bytes: u64,
    bits_per_second: f64,
    retransmits: Option<u32>,   // nur TCP
    sender: bool,
}

#[derive(Deserialize)]
struct IperfSumReceived {
    bytes: u64,
    bits_per_second: f64,
    sender: bool,
}

// UDP-spezifisch
#[derive(Deserialize)]
struct IperfUdpSum {
    jitter_ms: f64,
    lost_packets: u32,
    packets: u32,
    lost_percent: f64,
}
```

#### Streaming JSON (ab iPerf3 v3.20)

Mit `--json-stream` koennen Zwischen-Ergebnisse in Echtzeit gelesen werden:
```json
{"event": "interval", "streams": [...], "sum": {...}}
```
Nützlich fuer Fortschrittsanzeige waehrend der Messung.

---

## 2. WLAN-Signalstaerke-Messung (RSSI)

### 2.1 macOS: CoreWLAN Framework

#### Programmatische RSSI-Abfrage

**Rust-Crate**: `objc2-core-wlan` (offizielle Bindings fuer Apple CoreWLAN)

```rust
use objc2_core_wlan::{CWInterface, CWWiFiClient};

// RSSI und Noise auslesen
unsafe {
    let client = CWWiFiClient::sharedWiFiClient();
    let interface = client.interface(); // Default-Interface (en0)

    let rssi = interface.rssiValue();           // dBm (z.B. -55)
    let noise = interface.noiseMeasurement();   // dBm (z.B. -90)
    let ssid = interface.ssid();                // Option<String>
    let bssid = interface.bssid();              // Option<String> "XX:XX:XX:XX:XX:XX"
    let tx_rate = interface.transmitRate();     // Mbps
}
```

**Verfuegbare Methoden auf CWInterface**:
| Methode | Rueckgabe | Beschreibung |
|---------|-----------|-------------|
| `rssiValue()` | `NSInteger` (dBm) | Aktuelle Empfangssignalstaerke |
| `noiseMeasurement()` | `NSInteger` (dBm) | Aktuelles Rauschen |
| `ssid()` | `Option<String>` | Verbundenes Netzwerk-SSID |
| `bssid()` | `Option<String>` | MAC-Adresse des verbundenen AP |
| `transmitRate()` | `f64` (Mbps) | Aktuelle Uebertragungsrate |
| `powerOn()` | `bool` | Interface aktiv? |
| `security()` | `CWSecurity` | Sicherheitstyp |
| `interfaceMode()` | `CWInterfaceMode` | Betriebsmodus |

**Berechtigungen**: SSID und BSSID erfordern Location Services Authorization (ab macOS Sonoma). RSSI und Noise funktionieren ohne.

**airport-Tool**: Das CLI-Tool unter `/System/Library/PrivateFrameworks/Apple80211.framework/` wurde in **macOS Sonoma 14.4 entfernt**. Alternativen:
- `wdutil` (erfordert sudo)
- `system_profiler SPAirPortDataType`
- CoreWLAN API direkt (bevorzugt)

**Root-Rechte**: Nicht noetig fuer RSSI/Noise. Noetig fuer Scan (`scanForNetworksWithName`).

### 2.2 Windows: WlanApi

#### Native API

Windows bietet die WlanApi (`wlanapi.h`) mit `WLAN_ASSOCIATION_ATTRIBUTES`:

```c
typedef struct _WLAN_ASSOCIATION_ATTRIBUTES {
    WLAN_SIGNAL_QUALITY wlanSignalQuality;  // 0-100 (Prozent)
    // ... weitere Felder
} WLAN_ASSOCIATION_ATTRIBUTES;
```

**Signal Quality zu RSSI Umrechnung**:
```
RSSI (dBm) = (quality / 2) - 100
```
- Quality 0 = -100 dBm
- Quality 50 = -75 dBm
- Quality 100 = -50 dBm

#### CLI-Fallback

```cmd
netsh wlan show interfaces
```
Liefert `Signal: XX%` (Quality-Wert, umrechenbar in dBm).

**Parsing** (Regex): `Signal\s+:\s+(\d+)%`

#### Rust-Integration

Kein etabliertes Rust-Crate fuer WlanApi. Optionen:
1. **FFI-Bindings** auf `wlanapi.dll` (komplex)
2. **`netsh` CLI parsen** (einfacher, aber fragil)
3. **`wifi_scan` Crate** (nutzt intern `win32-wlan`)

### 2.3 Linux: nl80211 / iw

#### Methoden (aufsteigend nach Komplexitaet)

| Methode | Vorteil | Nachteil |
|---------|---------|----------|
| `/proc/net/wireless` | Einfach, kein Subprocess | Veraltetes Interface |
| `iw dev wlan0 link` | Standardtool | CLI-Parsing noetig |
| `iw dev wlan0 station dump` | Detailliert | CLI-Parsing noetig |
| nl80211 Netlink API | Direkt, kein Parsing | Komplex |

**iw Output** (relevante Felder):
```
Connected to XX:XX:XX:XX:XX:XX (on wlan0)
        SSID: MeinWLAN
        freq: 5180
        signal: -52 dBm
        tx bitrate: 866.7 MBit/s
```

**Rust-Crate**: `nl80211` auf crates.io bietet Low-Level-Zugang zum nl80211-Interface.

### 2.4 Cross-Platform Loesung

#### Empfehlung: `wifi_scan` Crate + plattformspezifischer RSSI-Layer

**`wifi_scan`** (v0.7.x, crates.io):
- Fork von `wifiscanner`, keine CLI-Abhaengigkeiten
- Nutzt intern:
  - macOS: CoreWLAN (objc2)
  - Windows: win32-wlan
  - Linux: nl80211-rs + netlink-rust
- Liefert: SSID, BSSID, RSSI (dBm), Frequenz, Sicherheit

```rust
use wifi_scan;

let networks = wifi_scan::scan()?;
for net in networks {
    println!("SSID: {}, RSSI: {} dBm, BSSID: {}",
        net.ssid, net.signal_level, net.mac);
}
```

**Limitation**: `wifi_scan` scannt **alle sichtbaren Netzwerke**, liefert aber nicht die RSSI des aktuell verbundenen Netzwerks im Echtzeit-Monitoring.

#### Architektur-Empfehlung

```
                    +------------------+
                    |  WifiMeasurement |  (Trait)
                    +------------------+
                    | + get_rssi()     |
                    | + get_noise()    |
                    | + get_bssid()    |
                    | + get_ssid()     |
                    | + get_tx_rate()  |
                    | + scan_networks()|
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
    +---------+--+  +--------+---+  +-------+------+
    | MacOSWifi  |  | WindowsWifi|  | LinuxWifi    |
    +------------+  +------------+  +--------------+
    | CoreWLAN   |  | WlanApi /  |  | nl80211 /    |
    | (objc2)    |  | win32-wlan |  | iw fallback  |
    +------------+  +------------+  +--------------+
```

Fuer den MVP reicht eine macOS-Implementierung (primaere Entwicklungsplattform). Windows und Linux koennen spaeter ergaenzt werden.

**Kein bestehendes Tauri-Plugin** fuer WLAN-Signalmessung gefunden. Ein Custom-Plugin oder Tauri-Command ist notwendig.

---

## 3. Messpunkt-System

### 3.1 Messpunkt-Definition durch den Benutzer

#### Interaktion

1. Benutzer oeffnet den Grundriss im Mess-Modus
2. **Klick auf Grundriss** = Messpunkt erstellen
3. Messpunkt erscheint als nummerierter Kreis (1, 2, 3, ...)
4. Drag-and-Drop zum Verschieben
5. Rechtsklick/Long-Press zum Loeschen
6. Automatische Nummerierung in Erstellungsreihenfolge

#### Automatische Messpunkt-Generierung (M1)

Die App kann Messpunkte automatisch vorschlagen:
- **Ecken/Raender**: Entfernteste Punkte von APs (potenzielle Problemzonen)
- **Durchgaenge**: Zwischen Raeumen (Wanddurchdringung pruefen)
- **AP-Positionen**: Direkt am AP als Referenz (sollte maximale Signalstaerke haben)
- **Raster**: Gleichmaessiges Raster als Ausgangsbasis

#### Mindestabstand und Empfohlene Anzahl

| Grundrissgroesse | Empfohlene Messpunkte | Begruendung |
|------------------|----------------------|-------------|
| Kleine Wohnung (< 60 m2) | 5-8 | Pro Raum 1-2 Punkte |
| Mittlere Wohnung (60-120 m2) | 8-15 | Abstand ca. 3-4 m |
| Grosses Haus (> 120 m2) | 15-25 | Abstand ca. 3-5 m |
| Mehrstoeckig | +5-8 pro Stockwerk | Treppen/Stockwerksuebergaenge |

**Mindestabstand**: 2 Meter (Messpunkte naeher beieinander liefern kaum Mehrwert, da RSSI auf kurze Distanz wenig variiert).

**Best Practice** (angelehnt an Ekahau/Cisco):
- Mindestens 1 Messpunkt pro Raum
- 1 Messpunkt in jeder Ecke/Randzone
- 1 Messpunkt pro Durchgang/Tuer zwischen Raeumen
- Messhoehenempfehlung: 1,0-1,5 m (Smartphone-/Laptop-Hoehe)

### 3.2 Datenmodell

```rust
/// Ein einzelner Messpunkt auf dem Grundriss
#[derive(Serialize, Deserialize, Clone)]
struct MeasurementPoint {
    id: Uuid,
    label: String,                    // "MP-01", "MP-02", ...
    position: Position,               // x, y in Metern (Grundriss-Koordinaten)
    measurements: Vec<Measurement>,   // Alle Messungen an diesem Punkt
    auto_generated: bool,             // Automatisch oder manuell platziert
    notes: Option<String>,            // Benutzernotizen ("Im Flur", "Hinter Regal")
}

#[derive(Serialize, Deserialize, Clone)]
struct Position {
    x: f64,   // Meter vom Ursprung (links oben)
    y: f64,   // Meter vom Ursprung
}

/// Eine einzelne Messung an einem Messpunkt
#[derive(Serialize, Deserialize, Clone)]
struct Measurement {
    id: Uuid,
    timestamp: DateTime<Utc>,
    run_number: u8,                   // 1, 2 oder 3
    run_type: RunType,                // Baseline, PostOptimization, Verification

    // WLAN-Signalwerte
    rssi_dbm: f64,                    // z.B. -55.0
    noise_dbm: Option<f64>,          // z.B. -90.0 (nicht auf allen Plattformen)
    snr_db: Option<f64>,             // RSSI - Noise (berechnet)
    connected_bssid: String,          // An welchem AP gemessen
    connected_ssid: String,
    frequency_mhz: u32,              // z.B. 5180
    tx_rate_mbps: Option<f64>,       // z.B. 866.7

    // iPerf3-Ergebnisse
    iperf_tcp_upload: Option<IperfResult>,
    iperf_tcp_download: Option<IperfResult>,
    iperf_udp: Option<IperfUdpResult>,

    // Qualitaet/Konfidenz
    quality: MeasurementQuality,
}

#[derive(Serialize, Deserialize, Clone)]
struct IperfResult {
    throughput_bps: f64,
    retransmits: u32,
    duration_secs: f64,
    rtt_mean_us: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
struct IperfUdpResult {
    throughput_bps: f64,
    jitter_ms: f64,
    lost_packets: u32,
    total_packets: u32,
    lost_percent: f64,
}

#[derive(Serialize, Deserialize, Clone)]
enum RunType {
    Baseline,           // Run 1: Vor Aenderungen
    PostOptimization,   // Run 2: Nach Optimierung
    Verification,       // Run 3: Verifikation
}

#[derive(Serialize, Deserialize, Clone)]
enum MeasurementQuality {
    Good,      // Stabile Messung, geringe Varianz
    Fair,      // Leichte Schwankungen
    Poor,      // Hohe Varianz, moeglicherweise Interferenz
    Failed,    // Messung fehlgeschlagen
}
```

### 3.3 Qualitaetsbewertung einer Messung

Die Qualitaet wird nach der Messung bewertet:

| Kriterium | Good | Fair | Poor |
|-----------|------|------|------|
| RSSI-Schwankung waehrend Messung | < 3 dB | 3-6 dB | > 6 dB |
| iPerf Retransmits (% von Paketen) | < 1% | 1-5% | > 5% |
| UDP Packet Loss | < 0.1% | 0.1-1% | > 1% |
| iPerf-Verbindung | Stabil | Kurze Aussetzer | Abbruch |

---

## 4. Kalibrierungsalgorithmus

### 4.1 Ziel der Kalibrierung

Das RF-Modell (ITU-R P.1238) nutzt Parameter, die fuer allgemeine Wohngebaeude gelten:
- **n** (Path-Loss-Exponent): Default 3.5, realer Bereich 2.5-4.5
- **L_Wand** (Wanddaempfung): Tabellenwerte mit hoher Unsicherheit

Durch reale Messungen koennen diese Parameter an die spezifische Umgebung angepasst werden.

### 4.2 Least Squares Fitting (Empfehlung fuer MVP)

#### Mathematisches Modell

Gegeben:
- RSSI_gemessen(i) = gemessener RSSI am Messpunkt i
- RSSI_modell(i, n, L_w) = TX_Power + Antenna_Gain - PL(1m) - 10*n*log10(d_i) - Sum(L_Waende_i)

Gesucht: n und optional L_Wand-Korrekturfaktor k, die den Fehler minimieren:

```
Minimiere: Sum_i ( RSSI_gemessen(i) - RSSI_modell(i, n, k) )^2
```

#### Implementierung (Pseudocode)

```rust
/// Kalibrierung des Path-Loss-Exponenten n
fn calibrate_path_loss_exponent(
    measurements: &[MeasurementPoint],
    floor_plan: &FloorPlan,
    ap: &AccessPoint,
) -> CalibrationResult {
    // Schritt 1: Messpaare sammeln (RSSI_gemessen, Distanz, Wanddurchgaenge)
    let pairs: Vec<(f64, f64, Vec<Wall>)> = measurements.iter()
        .flat_map(|mp| {
            mp.measurements.iter()
                .filter(|m| m.connected_bssid == ap.bssid)
                .map(|m| {
                    let distance = euclidean_distance(mp.position, ap.position);
                    let walls = find_intersecting_walls(mp.position, ap.position, floor_plan);
                    (m.rssi_dbm, distance, walls)
                })
        })
        .collect();

    // Schritt 2: Least Squares - n bestimmen
    // RSSI = TX + Gain - PL(1m) - 10*n*log10(d) - Sum(L_w)
    // Umgestellt: 10*n*log10(d) = TX + Gain - PL(1m) - Sum(L_w) - RSSI
    // y = n * x  wobei x = 10*log10(d), y = expected_loss - wall_loss

    let mut sum_xy = 0.0;
    let mut sum_xx = 0.0;

    for (rssi, distance, walls) in &pairs {
        let wall_loss: f64 = walls.iter().map(|w| w.attenuation_db).sum();
        let free_space_ref = pl_1m(ap.frequency);
        let expected_total_loss = ap.tx_power + ap.antenna_gain - rssi;
        let y = expected_total_loss - free_space_ref - wall_loss;
        let x = 10.0 * distance.log10();
        sum_xy += x * y;
        sum_xx += x * x;
    }

    let n_calibrated = sum_xy / sum_xx;
    let n_clamped = n_calibrated.clamp(2.0, 5.0); // Physikalisch sinnvoller Bereich

    // Schritt 3: RMSE berechnen
    let rmse = calculate_rmse(&pairs, n_clamped, ap);

    CalibrationResult {
        n_original: 3.5,
        n_calibrated: n_clamped,
        rmse_db: rmse,
        num_measurements: pairs.len(),
        confidence: assess_confidence(rmse, pairs.len()),
    }
}
```

### 4.3 Erweiterte Kalibrierung: Wand-Korrektur

Neben n kann auch ein Korrekturfaktor fuer Wanddaempfung bestimmt werden:

```
L_Wand_kalibriert = k * L_Wand_Tabelle
```

Mit k als skalarem Faktor (z.B. 0.8 = Waende daempfen weniger als angenommen).

Dies erfordert mindestens 2-3 Messpunkte mit unterschiedlicher Wandanzahl zum AP.

### 4.4 Einfacher Korrektur-Offset (Alternative)

Falls nicht genuegend Messpunkte vorhanden (< 5):

```
Offset = Median(RSSI_gemessen - RSSI_modell)
RSSI_kalibriert(x, y) = RSSI_modell(x, y) + Offset
```

Einfach, aber global (nicht differenziert nach Richtung/Waenden).

### 4.5 Bayesian Calibration (Post-MVP)

Fuer fortgeschrittene Kalibrierung:
- Prior: n ~ Normal(3.5, 0.5)
- Likelihood: RSSI_gemessen ~ Normal(RSSI_modell(n), sigma)
- Posterior: Aktualisierte Verteilung von n nach Beobachtungen

Vorteil: Liefert Unsicherheitsschaetzung (Konfidenzintervall), nicht nur Punktschaetzung.

### 4.6 Statistik ueber mehrere Runs

#### Aggregation pro Messpunkt

Wenn ein Messpunkt in mehreren Runs gemessen wird:

```rust
fn aggregate_measurements(measurements: &[Measurement]) -> AggregatedResult {
    let rssi_values: Vec<f64> = measurements.iter().map(|m| m.rssi_dbm).collect();

    AggregatedResult {
        rssi_median: median(&rssi_values),        // Robuster als Mittelwert
        rssi_mean: mean(&rssi_values),
        rssi_std_dev: std_deviation(&rssi_values), // Qualitaetsindikator
        rssi_min: min(&rssi_values),
        rssi_max: max(&rssi_values),
        num_samples: rssi_values.len(),
    }
}
```

**Median vs. Mittelwert**: Median ist bevorzugt, da er robust gegen Ausreisser ist (z.B. kurzzeitige Interferenz durch Mikrowelle oder Nachbar-WLAN).

#### Standardabweichung als Qualitaetsindikator

| Std. Abweichung | Bewertung | Interpretation |
|-----------------|-----------|----------------|
| < 2 dB | Sehr gut | Stabile Umgebung |
| 2-4 dB | Gut | Normale Schwankungen |
| 4-6 dB | Maessig | Merkliche Interferenz |
| > 6 dB | Schlecht | Instabile Umgebung, Messung fragwuerdig |

#### Vorher-Nachher-Vergleich (3 Runs)

```rust
struct RunComparison {
    point_id: Uuid,
    baseline: AggregatedResult,          // Run 1
    post_optimization: AggregatedResult, // Run 2
    verification: AggregatedResult,      // Run 3

    improvement_rssi_db: f64,     // Positiv = besser
    improvement_throughput_pct: f64,
    improvement_significant: bool, // > 3 dB Aenderung = signifikant
}
```

### 4.7 Qualitaetskriterien der Kalibrierung

| Metrik | Gut | Akzeptabel | Schlecht |
|--------|-----|------------|---------|
| **RMSE** | < 3 dB | 3-6 dB | > 6 dB |
| **R2** | > 0.85 | 0.7-0.85 | < 0.7 |
| **Max. Abweichung** | < 6 dB | 6-10 dB | > 10 dB |
| **Anzahl Messpunkte** | >= 10 | 5-9 | < 5 |

Laut Literatur ist ein **RMSE < 6 dB akzeptabel** fuer Indoor-Pfadverlustmodelle. In der Praxis erreichen kalibrierte Modelle typisch 2-5 dB RMSE.

**Wichtig**: Bei weniger als 5 Messpunkten ist eine sinnvolle Kalibrierung kaum moeglich. Die App sollte dem Benutzer mindestens 5 Messpunkte empfehlen.

---

## 5. Mess-Workflow (UX)

### 5.1 Schritt-fuer-Schritt Wizard

Der Mess-Workflow ist als gefuehrter Wizard implementiert:

```
┌─────────────────────────────────────────────────────┐
│ Messung: Run 1 - Baseline                           │
│                                                     │
│ Schritt 1/3: Vorbereitung                           │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [✓] iPerf3-Server erreichbar (192.168.1.10)    │ │
│ │ [✓] WLAN verbunden (SSID: TestNetz-AP1)        │ │
│ │ [ ] Messpunkte platziert (min. 5)              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Schritt 2/3: Messung durchfuehren                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │  Grundriss mit Messpunkten                      │ │
│ │                                                 │ │
│ │    [1]  ──aktiv──>  [2]    [3]    [4]           │ │
│ │                                                 │ │
│ │         [5]    [6]    [7]                       │ │
│ │                                                 │ │
│ │  "Gehen Sie zu Messpunkt 2 und druecken Sie     │ │
│ │   'Messung starten'"                            │ │
│ │                                                 │ │
│ │  [████████░░░░░░░░░░]  TCP Upload: 8/10s        │ │
│ │  Throughput: 245 Mbit/s | RSSI: -58 dBm         │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Schritt 3/3: Ergebnis                               │
│                                                     │
│ [Zurueck]              [Messpunkt ueberspringen]    │
│                        [Naechster Messpunkt →]       │
└─────────────────────────────────────────────────────┘
```

### 5.2 Ablauf pro Messpunkt

```
1. Navigation
   └─ "Gehen Sie zu Messpunkt X" (hervorgehoben auf Grundriss)
   └─ Messpunkt blinkt/pulsiert auf der Karte

2. Bereitschafts-Check
   └─ WLAN-Verbindung pruefen (verbunden? Richtiges SSID?)
   └─ iPerf3-Server Ping (erreichbar?)
   └─ RSSI vorab anzeigen (Live-Update)

3. Messung starten (Button)
   └─ 3-Sekunden-Countdown
   └─ "Bitte nicht bewegen waehrend der Messung"

4. Messsequenz (automatisch, ca. 30s)
   ├─ RSSI + Noise + BSSID sofort auslesen
   ├─ TCP Upload (10s) mit Fortschrittsbalken
   ├─ TCP Download (10s) mit Fortschrittsbalken
   └─ UDP Qualitaet (5s)

5. Ergebnis anzeigen
   └─ RSSI: -58 dBm (Good ✓)
   └─ Upload: 245 Mbit/s
   └─ Download: 312 Mbit/s
   └─ Jitter: 0.8 ms
   └─ Qualitaet: Good

6. Weiter zum naechsten Messpunkt
```

### 5.3 Echtzeit-Feedback waehrend Messung

Waehrend iPerf3 laeuft:
- Fortschrittsbalken (x/10 Sekunden)
- Live-Throughput-Wert (aus `--json-stream`, ab v3.20)
- RSSI-Anzeige (separat, parallel auslesen)
- Abbrechen-Button jederzeit

### 5.4 Fehlerfaelle und Behandlung

| Fehler | Erkennung | Behandlung |
|--------|-----------|------------|
| **iPerf3 nicht installiert** | Sidecar-Binary fehlt | Fehlermeldung mit Download-Link / Auto-Bundling |
| **Server nicht erreichbar** | TCP-Connect-Timeout (5s) | "Server unter IP:PORT nicht erreichbar. Laeuft iperf3 -s auf dem Server?" |
| **Server belegt** | iPerf3 Error "server busy" | "Server wird bereits genutzt. Warten Sie oder starten Sie den Server neu." |
| **WLAN getrennt** | RSSI = 0 / kein Interface | "WLAN-Verbindung verloren. Bitte neu verbinden." |
| **Messung abgebrochen** | User-Cancel oder Timeout | Teilergebnisse speichern, Messpunkt als "unvollstaendig" markieren |
| **Zu niedriger RSSI** | RSSI < -85 dBm | Warnung: "Schwaches Signal. Ergebnis moeglicherweise unzuverlaessig." |
| **Keine RSSI-Berechtigung** | macOS Location Services | "Bitte erlauben Sie Standortzugriff in den Systemeinstellungen." |

### 5.5 Run-Ueberblick

```
┌────────────────────────────────────────────────┐
│ Run-Uebersicht                                 │
│                                                │
│ ● Run 1: Baseline          [Abgeschlossen ✓]  │
│   7/7 Messpunkte, 2 Warnungen                 │
│                                                │
│ ● Run 2: Nach Optimierung  [In Bearbeitung]   │
│   3/7 Messpunkte                               │
│                                                │
│ ○ Run 3: Verifikation      [Noch nicht]        │
│                                                │
│ [Vergleich anzeigen]                           │
└────────────────────────────────────────────────┘
```

---

## 6. Vergleichbare Projekte / Konkurrenzanalyse

### 6.1 Kommerzielle Tools

#### Ekahau Pro / Ekahau AI Pro
- **Preis**: ca. 2.000-4.000 EUR/Jahr (Subscription)
- **Plattform**: Windows, macOS
- **Messung**: Eigener Sidekick-Dongle (spezialisierte Hardware)
- **Heatmap**: Predictive (Modell) + Active Survey (reale Messung)
- **Kalibrierung**: Automatisch basierend auf Survey-Daten
- **Staerken**: Industrie-Standard, sehr genau, 3D-Planung
- **Relevanz fuer uns**: Konzepte (Predictive + Survey) sind vorbildhaft, aber voellig anderes Preissegment

#### NetSpot
- **Preis**: Free (Discover), 49-499 USD (Pro/Enterprise)
- **Plattform**: macOS, Windows
- **Messung**: Laptop-internes WLAN, kein externer Dongle
- **Features**: Passive Survey, Active Survey, Heatmap-Overlay auf Grundriss
- **Staerken**: Einfache Bedienung, visuell ansprechend
- **Relevanz fuer uns**: Gutes UX-Vorbild fuer Mess-Workflow, aehnlicher Ansatz (Laptop als Messgeraet)

#### WiFi Analyzer (verschiedene)
- **Preis**: Free - 30 USD
- **Plattform**: Android, Windows
- **Messung**: RSSI-Scan, Kanalanalyse
- **Limitierung**: Keine Heatmap auf Grundriss, kein Throughput-Test
- **Relevanz fuer uns**: Gutes Beispiel fuer Echtzeit-RSSI-Anzeige

### 6.2 Open-Source-Tools

#### python-wifi-survey-heatmap (jantman)
- **GitHub**: ~400 Stars
- **Plattform**: Linux only
- **Sprache**: Python, wxPython GUI
- **Features**:
  - iPerf3-Integration (Server extern)
  - Grundriss als PNG laden
  - Klick-basierte Messpunkte
  - Heatmap-Generierung (RSSI, Throughput, Jitter)
  - JSON-Export aller Messdaten
- **Staerken**: Gut dokumentiert, bewaehrtes Konzept
- **Schwaechen**: Nur Linux (libnl3), veraltete UI, keine Vorhersage-Heatmap
- **Relevanz**: Direktes Vorbild fuer unseren Mess-Workflow und Datenmodell

#### wifi-heat-mapper (Nischay-Pro)
- **GitHub**: ~300 Stars
- **Plattform**: Linux only
- **Sprache**: Python
- **Features**:
  - iPerf3-Integration (TCP + UDP)
  - Floorplan-basierte Heatmaps
  - Multiple Metriken (RSSI, Throughput, Jitter, Packet Loss)
  - Archlinux-Paket (AUR)
- **Relevanz**: Gute Metrik-Auswahl als Referenz

#### wifi-heatmapper (hnykda)
- **Plattform**: macOS, Windows, Linux
- **Sprache**: Next.js (Electron-aehnlich)
- **Features**:
  - iPerf3-Integration
  - Web-basierte UI
  - Cross-Platform
  - Signal + Throughput Heatmaps
- **Staerken**: Moderne UI, Cross-Platform
- **Relevanz**: Aehnlichster Ansatz zu unserem Projekt, gutes UX-Vorbild

#### LinSSID
- **Plattform**: Linux only
- **Sprache**: C++, Qt5
- **Features**:
  - WiFi-Scanner (2.4 + 5 GHz)
  - Signal-Zeitverlauf
  - Kanalanalyse
- **Limitierung**: Kein Heatmap, kein Throughput-Test
- **Relevanz**: Gering, anderer Fokus

#### sparrow-wifi
- **Plattform**: Linux only
- **Sprache**: Python, Qt
- **Features**: Next-Gen GUI WiFi + Bluetooth Analyzer, GPS-Mapping
- **Relevanz**: Konzept des Bluetooth-Einbezugs interessant fuer spaetere Erweiterung

### 6.3 Lessons Learned aus Open-Source-Projekten

| Erkenntnis | Quelle | Umsetzung fuer uns |
|------------|--------|---------------------|
| iPerf3-Server extern, Ethernet-angebunden | Alle Projekte | Dokumentation + Setup-Wizard |
| Klick auf Grundriss = Messpunkt | python-wifi-survey-heatmap | Canvas-Click-Handler |
| JSON als Speicherformat | python-wifi-survey-heatmap | Projekt-Persistenz als JSON |
| TCP + UDP messen | wifi-heat-mapper | Beide Protokolle in Messsequenz |
| Cross-Platform schwierig (RSSI) | Alle haben OS-Limits | Plattform-Trait + Fallbacks |
| Predictive + Measured kombiniert | Ekahau (kommerziell) | Unser USP: beides in einer App |

---

## 7. Zusammenfassung und Empfehlungen

### Fuer Phase 5 (Architektur)

| Entscheidung | Empfehlung | Begruendung |
|-------------|------------|-------------|
| iPerf3-Integration | Sidecar (CLI) | Einfach, stabil, bewaehrt |
| RSSI-Messung macOS | `objc2-core-wlan` | Offizielle Bindings, kein CLI-Parsing |
| RSSI-Messung Windows | `wifi_scan` Crate + WlanApi Fallback | Cross-Platform Crate vorhanden |
| RSSI-Messung Linux | `nl80211` Crate | Direkt, kein CLI-Parsing |
| RSSI Trait | Plattform-spezifische Implementierungen | Saubere Abstraktion |
| Kalibrierung MVP | Least Squares (n-Fitting) | Einfach, gut verstanden, <100 Zeilen |
| Kalibrierung Post-MVP | Bayesian + Wand-Korrektur | Bessere Unsicherheitsschaetzung |
| Messpunkt-UI | Klick auf Canvas | Bewaehrt in allen Referenzprojekten |
| Messdauer pro Punkt | ~30s (10s TCP Up + 10s TCP Down + 5s UDP) | Kompromiss: Genauigkeit vs. Geduld |
| JSON Output | iPerf3 `--json` + serde Parsing | Typsicher, gut testbar |

### Offene Fragen fuer Phase 4 (Klaerung)

1. **iPerf3 Bundling**: Duerfen wir iPerf3-Binaries mitliefern (BSD-3-Clause)? Oder erwarten wir, dass der Benutzer iPerf3 selbst installiert?
2. **Server-Setup**: Liefern wir einen eigenen iPerf3-Server als separate App/Installer? Oder reicht eine Anleitung?
3. **Minimum Messpunkte**: Erzwingen wir mindestens 5 Punkte oder erlauben wir auch 1-2?
4. **Run 2 im MVP**: Ist Run 2 (gemeinsame SSID, Roaming-Test) im MVP enthalten oder spaeter?
5. **macOS Location Services**: Brauchen wir SSID/BSSID (erfordert Standortfreigabe) oder reicht RSSI (ohne)?

### Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| macOS entfernt CoreWLAN API | Niedrig | Hoch | Fallback auf `wdutil` oder System Profiler |
| iPerf3-Server-Setup zu komplex fuer Benutzer | Mittel | Mittel | Setup-Wizard, Docker-Image, Raspberry Pi Image |
| RSSI-Messung ungenau (Schwankungen) | Hoch | Niedrig | Median ueber mehrere Samples, Qualitaetsanzeige |
| Kalibrierung mit wenigen Punkten unzuverlaessig | Mittel | Mittel | Minimum 5 Punkte empfehlen, Konfidenz anzeigen |

---

## Quellen

### iPerf3
- [iPerf3 Dokumentation (v3.20)](https://software.es.net/iperf/)
- [iPerf3 JSON Support - DeepWiki](https://deepwiki.com/esnet/iperf/5.3-json-support)
- [iPerf3 GitHub Repository](https://github.com/esnet/iperf)
- [libiperf Manpage](https://www.mankier.com/3/libiperf)
- [riperf3 - Rust Implementation](https://github.com/therealevanhenry/riperf3)
- [iPerf3 Python Wrapper](https://github.com/thiezn/iperf3-python)
- [Raspberry Pi als iPerf3-Server](https://netbeez.net/blog/raspberry-pi-and-distributed-network-monitoring-iperf/)
- [Cisco Meraki: Troubleshooting Client Speed using iPerf](https://documentation.meraki.com/General_Administration/Tools_and_Troubleshooting/Troubleshooting_Client_Speed_using_iPerf)

### WLAN-Signalmessung
- [Apple CWInterface rssiValue() Dokumentation](https://developer.apple.com/documentation/corewlan/cwinterface/rssivalue())
- [objc2-core-wlan Rust Crate](https://docs.rs/objc2-core-wlan/latest/objc2_core_wlan/)
- [wifi_scan Rust Crate](https://crates.io/crates/wifi_scan)
- [wifiscan-rs (Codeberg)](https://codeberg.org/fuxle/wifiscan-rs)
- [nl80211 Rust Crate](https://lib.rs/crates/nl80211)
- [Windows WlanApi WLAN_ASSOCIATION_ATTRIBUTES](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_association_attributes)
- [macOS airport CLI Deprecation](https://github.com/gopro/OpenGoPro/issues/506)

### Tauri Integration
- [Tauri 2 Sidecar Dokumentation](https://v2.tauri.app/develop/sidecar/)
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/)

### RF-Kalibrierung
- [Adaptive Calibration Algorithm (RSSI + LDPLM)](https://www.mdpi.com/1424-8220/22/15/5689)
- [Indoor Path Loss Model with Wall Correction](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2018RS006536)
- [Path Loss Exponent Estimation (Bayesian)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7998977/)
- [Regression-based Path Loss Model Correction](https://dl.acm.org/doi/fullHtml/10.1145/3592307.3592335)
- [Simple Indoor Path Loss Prediction Algorithm](https://link.springer.com/article/10.1007/s11277-011-0467-4)

### Site Survey Best Practices
- [Cisco Site Survey Guidelines](https://www.cisco.com/c/en/us/support/docs/wireless/5500-series-wireless-controllers/116057-site-survey-guidelines-wlan-00.html)
- [Ekahau WiFi Survey Best Practices](https://fingtapsolutions.com/the-ekahau-wifi-survey-6-key-steps/)
- [Mastering Home Wi-Fi: Predictive RF Planning](https://www.derekseaman.com/2024/03/mastering-home-wi-fi-a-guide-to-predictive-rf-planning.html)

### Open-Source-Referenzprojekte
- [python-wifi-survey-heatmap](https://github.com/jantman/python-wifi-survey-heatmap)
- [wifi-heat-mapper](https://github.com/Nischay-Pro/wifi-heat-mapper)
- [wifi-heatmapper](https://github.com/hnykda/wifi-heatmapper)
- [LinSSID](https://sugggest.com/software/linssid)
- [sparrow-wifi](https://github.com/ghostop14/sparrow-wifi)
