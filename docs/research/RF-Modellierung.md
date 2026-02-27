# Forschung: RF-Modellierung & Messverfahren

> Technische Grundlagen für Heatmap-Berechnung und Optimierung

## 1. Referenz-Hardware: D-Link DAP-X2810

| Parameter | 2,4 GHz | 5 GHz |
|-----------|---------|-------|
| **Max. Sendeleistung** | 23 dBm | 26 dBm |
| **Antennengewinn** | 3,2 dBi | 4,3 dBi |
| **MIMO** | 2x2 MU-MIMO | 2x2 MU-MIMO |
| **Wi-Fi Standard** | Wi-Fi 6 | Wi-Fi 6 |

**Enterprise-Features:** Fast Roaming (802.11k/r), Band Steering, Airtime Fairness
**Montage:** Decke und Wand (unterschiedliche Antennen-Strahlungsdiagramme)
**Management:** Nuclias Connect (zentrale Verwaltung)

## 2. Indoor-Pathloss-Modell (ITU-R P.1238)

### Formel

```
PL(d) = PL(1m) + 10 * n * log10(d) + Summe(L_Wände) + L_Stockwerke
```

| Variable | Beschreibung | Typischer Wert |
|----------|-------------|----------------|
| `PL(1m)` | Freiraum-Pfadverlust bei 1m | ~40 dB (2,4 GHz), ~47 dB (5 GHz) |
| `n` | Umgebungsdämpfungsfaktor | 3,0 - 3,8 (Wohngebäude) |
| `L_Wände` | Wanddämpfung pro Durchgang | siehe Tabelle unten |
| `L_Stockwerke` | Stockwerksdämpfung | nicht im MVP |

### Wanddämpfungswerte

| Material | Dicke | Dämpfung 2,4 GHz | Dämpfung 5 GHz |
|----------|-------|-------------------|----------------|
| Poroton (dünn) | 17 cm | ~4-6 dB | ~6-9 dB |
| Poroton (dick) | 36 cm | ~8-12 dB | ~12-18 dB |
| Beton | variabel | ~10-15 dB | ~15-25 dB |
| Trockenbauwand | ~10 cm | ~3-4 dB | ~4-6 dB |

> **Hinweis:** Diese Werte sind konservativ gewählt. Die tatsächliche Dämpfung hängt von vielen Faktoren ab (Feuchtigkeit, Armierung, Frequenz, Einfallswinkel).

## 3. Messverfahren

### Run 1: Per-AP-Messung (Isolation)

| Schritt | Aktion |
|---------|--------|
| 1 | Pro AP eine eigene Test-SSID erstellen |
| 2 | Messpunkte abgehen (automatisch oder manuell platziert) |
| 3 | An jedem Punkt messen: RSSI/SNR, Jitter, Paketverlust, Durchsatz (iPerf) |
| 4 | Ergebnis: Abdeckungskarte pro AP, Überlappungszonen |

### Run 2: Gemeinsame SSID (Interaktion)

| Schritt | Aktion |
|---------|--------|
| 1 | Alle APs auf eine gemeinsame Test-SSID |
| 2 | Messpunkte abgehen |
| 3 | Messen: welcher AP bedient den Client (BSSID), Roaming-Verhalten |
| 4 | Ergebnis: Sticky-Client-Erkennung, Interferenz-Analyse |

### Run 3: Verifikation

| Schritt | Aktion |
|---------|--------|
| 1 | Optimierte Einstellungen anwenden |
| 2 | Kurze Messrunde an kritischen Punkten |
| 3 | Vorher-/Nachher-Vergleich |

## 4. Optimierungsparameter

| Parameter | Effekt bei Verringerung | Effekt bei Erhöhung |
|-----------|------------------------|---------------------|
| **TX-Power** | Besseres Roaming, weniger Sticky Clients | Größere Abdeckung, mehr Interferenz |
| **Kanalbreite** | Stabilere Verbindung, geringerer Durchsatz | Höherer Durchsatz, kürzere Reichweite |
| **Kanalwahl** | Abhängig von Nachbar-WLANs, muss getestet werden | - |

**Einschränkungen:**
- 2,4 GHz: Kanalbreite 20 MHz ist zwingend
- Roaming hängt stark von Endgeräten ab
- Kanalwahl-Vorhersage ist unsicher (Nachbar-WLANs ändern sich)
- Jede Änderung benötigt Verifikation
