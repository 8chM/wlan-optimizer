---
paths:
  - "src/**/rf/**"
  - "src/**/heatmap/**"
  - "src/**/model/**"
---

# RF-Modellierung Regeln

## Formel: Indoor Path Loss (ITU-R P.1238)
```
PL(d) = PL(1m) + 10 * n * log10(d) + Sum(L_Waende)
RSSI = TX_Power + Antenna_Gain - PL(d)
```

## Referenzwerte
- PL(1m) @ 2.4 GHz: 40.05 dB
- PL(1m) @ 5 GHz: 46.42 dB
- n (Wohngebaeude): 3.0 - 3.8, Default: 3.5
- Smartphone-Empfaenger: -3 dBi

## Signal-Schwellen (Default)
- Excellent: > -50 dBm (gruen)
- Good: -50 bis -65 dBm (hellgruen)
- Fair: -65 bis -75 dBm (gelb)
- Poor: -75 bis -85 dBm (orange)
- No signal: < -85 dBm (rot)

## Konservativ-Prinzip
- Bei Daempfungsbereichen: immer oberen Wert verwenden
- Lieber zu pessimistisch als zu optimistisch
