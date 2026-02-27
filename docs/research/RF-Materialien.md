# RF-Materialdatenbank & Erweiterte Modellierung

> Technische Recherche fuer den WLAN-Optimizer: Daempfungswerte, Standards, Validierung
> Phase 3a - Stand: 2026-02-27

## Inhaltsverzeichnis

1. [Materialdatenbank](#1-materialdatenbank)
2. [Konservative Materialdatenbank (Empfohlene Defaults)](#2-konservative-materialdatenbank)
3. [Quellen und Standards](#3-quellen-und-standards)
4. [Benutzerdefinierte Wanddicke](#4-benutzerdefinierte-wanddicke)
5. [Multi-Floor-Daempfung](#5-multi-floor-daempfung)
6. [Frequenzabhaengigkeit & WiFi 6E](#6-frequenzabhaengigkeit--wifi-6e)
7. [Validierung & Genauigkeit](#7-validierung--genauigkeit)
8. [Implementierungsempfehlungen](#8-implementierungsempfehlungen)

---

## 1. Materialdatenbank

### 1.1 Leichtbauwande / Trockenbau

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Gipskarton / Rigips (einfach) | Drywall / Plasterboard (single) | 1.25 cm | 1-2 | 1-3 | 0.5-3 | 1-4 | [NIST-1997], [iBwave], [CWNA] |
| Gipskarton doppelt beplankt | Drywall double layer | 2x1.25 cm + Staender | 3-4 | 4-6 | 2-5 | 3-7 | [wlan-blog], [Ursa Major] |
| Leichtbauwand (Buero) | Office partition wall | 8-10 cm | 3-5 | 5-8 | 2-6 | 4-10 | [iBwave], [CWNA] |
| Leichtbauwand mit Daemmung | Insulated partition wall | 10-15 cm | 4-6 | 6-10 | 3-7 | 5-12 | [wlan-blog], [Ursa Major] |
| Brandschutz-Gipskarton (mit Graphit) | Fire-rated drywall (graphite) | 2.5 cm | 8-15 | 12-20 | 6-18 | 10-25 | [Baubiologie-Regional] |

**Hinweise:**
- Einfache Gipskartonplatten sind fast transparent fuer WLAN-Signale
- Die Doppelbeplankung mit Metallstaendern erhoeht die Daempfung deutlich
- Brandschutzplatten mit Graphit-Einlage koennen ueberraschend stark daempfen
- Quellen: NIST NISTIR 6055 (1997), iBwave Blog, CWNA Official Study Guide, wlan-blog.com, Ursa Major Lab, Baubiologie-Regional

### 1.2 Ziegelwande

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Ziegelwand duenn (Innenwand) | Brick wall thin (interior) | 11.5 cm | 5-8 | 10-16 | 4-10 | 8-18 | [EI Wellspring], [iBwave] |
| Ziegelwand mittel | Brick wall medium | 17.5 cm | 6-10 | 12-20 | 5-12 | 10-22 | [wlan-blog], [iBwave] |
| Ziegelwand dick (tragend) | Brick wall thick (load-bearing) | 24 cm | 8-14 | 15-25 | 7-16 | 12-28 | [EI Wellspring], [NIST-1997] |
| Poroton (verfuellt, Aussenwand) | Poroton clay block (filled, exterior) | 36 cm | 10-18 | 16-28 | 8-20 | 14-32 | [RF-Modellierung.md], [wlan-blog] |
| Klinker-Vormauerwerk + Ziegel | Brick veneer + brick | 36+ cm | 12-20 | 20-35 | 10-22 | 18-38 | [NIST-1997], [EI Wellspring] |

**Hinweise:**
- Ziegel haben eine hohe Varianz (+-10 dB lt. WLAN-Training)
- Hohlziegel (z.B. Poroton) daempfen weniger als Vollziegel gleicher Dicke
- Vermauerte/verfuellte Ziegel daempfen deutlich mehr
- Feuchtigkeit des Ziegels erhoeht die Daempfung erheblich
- Quellen: EI Wellspring (NIST-basiert), iBwave Blog, wlan-blog.com, eigene RF-Modellierung.md

### 1.3 Betonwande

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Beton duenn | Concrete thin | 10 cm | 10-15 | 18-25 | 8-18 | 15-30 | [EI Wellspring], [NIST-1997] |
| Beton mittel | Concrete medium | 15 cm | 15-20 | 25-35 | 12-23 | 20-40 | [Ursa Major], [iBwave] |
| Beton dick | Concrete thick | 20 cm | 18-25 | 30-48 | 15-29 | 25-55 | [NIST-1997], [iBwave] |
| Stahlbeton (bewehrt) | Reinforced concrete | 20 cm | 25-35 | 40-55 | 20-38 | 35-60 | [NIST-1997], [EI Wellspring] |
| Fundamentwand / Kellerwand | Foundation wall | 25-30 cm | 25-40 | 40-60 | 20-45 | 35-65 | [CWNA], [NIST-1997] |

**Hinweise:**
- Stahlbeton ist der groesste Feind von WLAN-Signalen
- Die Stahlbewehrung (Rebar) fuegt 5-15 dB zusaetzliche Daempfung hinzu
- NIST-1997: Stahlbeton 203mm = 31 dB (2.4 GHz), 55 dB (5 GHz)
- NIST-1997: Beton ohne Stahl 203mm = 29 dB (2.4 GHz), 48 dB (5 GHz)
- iBwave: Schwerer Beton = 22.8 dB (2.4 GHz), 44.8 dB (5 GHz)
- Quellen: NIST NISTIR 6055 (1997), EI Wellspring, iBwave Blog, Ursa Major Lab, CWNA

### 1.4 Porenbeton / Gasbeton (Ytong)

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Porenbeton Innenwand | AAC interior wall | 11.5 cm | 4-7 | 7-12 | 3-9 | 6-15 | [Springer], Schaetzung |
| Porenbeton Standard | AAC standard | 17.5 cm | 5-10 | 10-18 | 4-12 | 8-20 | [Springer], [Baubiologie] |
| Porenbeton Aussenwand | AAC exterior wall | 24-36 cm | 8-15 | 15-25 | 6-18 | 12-28 | [Springer], Schaetzung |

**Hinweise:**
- Porenbeton (Ytong/Xella) hat eine GERINGERE Dichte als Normalbeton (400-700 kg/m3 vs. 2300 kg/m3)
- Springer-Studie: Porenbeton ~33 dB/m bei 2.4 GHz vs. Normalbeton ~66 dB/m bei 2.4 GHz
- Das ergibt ca. HALBE Daempfung pro Meter gegenueber Normalbeton
- Wenig spezifische Messdaten verfuegbar - Werte teilweise geschaetzt
- Quellen: Springer (Journal of Nondestructive Evaluation), Baubiologie-Regional

### 1.5 Kalksandstein

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Kalksandstein Innenwand | Sand-lime brick interior | 11.5 cm | 4-8 | 8-14 | 3-10 | 6-16 | [iBwave], Schaetzung |
| Kalksandstein Standard | Sand-lime brick standard | 17.5 cm | 6-12 | 12-20 | 5-14 | 10-22 | [iBwave], Schaetzung |
| Kalksandstein tragend | Sand-lime brick load-bearing | 24 cm | 8-16 | 16-28 | 7-18 | 14-30 | Schaetzung |

**Hinweise:**
- Kalksandstein (KS) hat eine hohe Dichte (1800-2000 kg/m3)
- iBwave: Lime Brick = 4.3 dB (2.4 GHz), 7.8 dB (5 GHz) - vermutlich duenne Probe
- Hoehere Dichte als Ziegel -> tendenziell hoehere Daempfung bei gleicher Dicke
- Baubiologie-Quellen berichten: "KS lassen HF teilweise ungehindert durch" (variabel)
- WENIG belastbare Messdaten verfuegbar - Werte teilweise auf Basis von Dichtevergleich geschaetzt
- Quellen: iBwave Blog, Baubiologie-Regional, eigene Schaetzung

### 1.6 Holzbau

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Holzstaenderwand (beplankt) | Wood stud wall (clad) | 12-15 cm | 3-5 | 5-8 | 2-6 | 4-10 | [NIST-1997], [Ursa Major] |
| Massivholzwand | Solid wood wall | 10-15 cm | 4-8 | 8-15 | 3-10 | 6-18 | [EI Wellspring], [NIST-1997] |
| Holztuere | Wooden door | 4-5 cm | 3-4 | 4-6 | 2-5 | 3-8 | [CWNA], [wlan-blog] |
| Fachwerk (Holz + Lehm/Ziegel) | Half-timber (wood + clay/brick) | variabel | 5-10 | 8-16 | 4-12 | 6-20 | Schaetzung |

**Hinweise:**
- Trockenes Holz daempft relativ wenig
- NIST-1997: Trockenes Holz 38mm = 3 dB (2.4 GHz), 4 dB (5 GHz)
- EI Wellspring: Trockenes Holz 152mm = 8.5 dB (2 GHz), 20 dB (5 GHz)
- Feuchtigkeit erhoeht die Daempfung erheblich (nasses Holz ~ doppelte Daempfung)
- Fachwerk: Kombination aus Holzrahmen und Ausfachung (Lehm, Ziegel, Stein) - sehr variabel
- Quellen: NIST NISTIR 6055 (1997), EI Wellspring, Ursa Major Lab, CWNA, wlan-blog.com

### 1.7 Glas / Fenster

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Einfachverglasung | Single glazing | 4-6 mm | 1-2 | 1-2 | 0.5-3 | 0.5-3 | [NIST-1997], [EI Wellspring] |
| Doppelverglasung (Standard) | Double glazing (standard) | 2x4mm + Luft | 3-5 | 5-9 | 2-6 | 4-10 | [wlan-blog], [Ranplan] |
| Dreifachverglasung | Triple glazing | 3x4mm + Gas | 4-7 | 7-12 | 3-8 | 5-14 | Schaetzung basierend auf Doppelverglasung |
| Low-E Glas (Waermeschutz) | Low-E glass (thermal) | variabel | 15-25 | 20-30 | 12-30 | 18-35 | [Ranplan], [Ubiquiti] |
| Glaswand / Glastuere (innen) | Glass wall / door (interior) | 8-10 mm | 2-4 | 3-6 | 1-5 | 2-8 | [wlan-blog], [NIST-1997] |

**Hinweise:**
- **ACHTUNG Low-E Glas**: Metalloxid-Beschichtung fuer Waermeschutz blockiert WLAN massiv!
- Ranplan: Low-E Glas bei 700 MHz = 17 dB, bei 3.5 GHz = 25 dB (vs. Normalglas 0-1 dB)
- Ubiquiti-Forum: Praxismessung 15 dB Verlust durch ein einzelnes Doppel-Isolierfenster
- Moderne Energiesparfenster (KfW-Standard) haben fast immer Low-E Beschichtung!
- Standard-Glas ohne Beschichtung ist nahezu transparent fuer WLAN
- In deutschen Neubauten (EnEV/GEG) sind Low-E Fenster die Regel
- Quellen: NIST NISTIR 6055, EI Wellspring, Ranplan Wireless, Ubiquiti Community, wlan-blog.com

### 1.8 Tueren / Metall

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Zimmertuere (Holz, hohl) | Interior door (hollow wood) | 3-4 cm | 3-4 | 4-6 | 2-5 | 3-7 | [wlan-blog], [CWNA] |
| Wohnungstuere (Massivholz) | Apartment door (solid wood) | 5-8 cm | 5-8 | 8-12 | 4-10 | 6-14 | [wlan-blog] |
| Haustuere (isoliert) | Front door (insulated) | 6-10 cm | 6-10 | 9-14 | 5-12 | 8-16 | [wlan-blog] |
| Metalltuer / Brandschutztuere | Metal door / fire door | variabel | 10-20 | 14-25 | 8-25 | 12-30 | [wlan-blog], [CWNA] |
| Aufzugschacht (Stahlkonstruktion) | Elevator shaft (steel) | - | 25-40 | 35-50+ | 20-45 | 30-55 | [CWNA], Schaetzung |

**Hinweise:**
- wlan-blog: Metalltuer = 10 dB (2.4 GHz), 14 dB (5 GHz)
- CWNA: Elevator / metal obstacle = -10 dB (2.4 GHz Minimum)
- Aufzugschacht: Stahlkonstruktion + Stahlbeton = praktisch WLAN-undurchlaessig
- Brandschutztueren (T30, T60, T90) haben oft Stahlkern
- Quellen: wlan-blog.com, CWNA Official Study Guide

### 1.9 Decken / Boeden

| Material (DE) | Material (EN) | Typ. Dicke | 2.4 GHz (dB) | 5 GHz (dB) | Bereich 2.4 | Bereich 5 | Quellen |
|---|---|---|---|---|---|---|---|
| Stahlbetondecke (Standard) | Reinforced concrete ceiling | 18-22 cm | 20-30 | 30-50 | 18-35 | 28-55 | [ITU-R P.1238], [wlan-blog] |
| Stahlbetondecke + Fussbodenheizung | RC ceiling + underfloor heating | 22-28 cm | 25-38 | 35-55 | 20-42 | 30-60 | [wlan-blog] |
| Stahlbetondecke + Aufbauten (komplett) | RC ceiling + full floor buildup | 30+ cm | 30-40 | 40-60+ | 25-45 | 35-65 | [ITU-R P.1238], Schaetzung |
| Holzbalkendecke | Wooden beam ceiling | 20-30 cm | 8-15 | 12-22 | 6-18 | 10-25 | [NIST-1997], Schaetzung |
| Abgehaengte Decke (Gips) | Suspended ceiling (gypsum) | 1-2 cm | 1-3 | 2-5 | 1-4 | 1-6 | [NIST-1997] |

**Hinweise:**
- wlan-blog: Betondecke + Fussbodenheizung = 20 dB (2.4 GHz), 27 dB (5 GHz), 38 dB (6 GHz)
- ITU-R P.1238: Typischer Betonboden = 20 dB (Mittelwert), Standardabweichung 1.5 dB
- ITU-R P.1238: Mit abgehaengter Decke + Beleuchtung = 30 dB (Mittelwert), SD 3 dB
- ITU-R P.1238: Mit Klimakanaelen unter Boden = 36 dB (Mittelwert), SD 5 dB
- Fussbodenheizung: Metallrohre/-matten erhoehen die Daempfung signifikant
- Quellen: ITU-R P.1238, wlan-blog.com, NIST NISTIR 6055

---

## 2. Konservative Materialdatenbank

Fuer unser Tool nutzen wir das **konservative Prinzip**: Bei Daempfungsbereichen wird der obere Wert verwendet. Die folgenden Werte sind die empfohlenen **Defaults** fuer die Heatmap-Berechnung.

### 2.1 Empfohlene Default-Daempfungswerte

| ID | Material (DE) | Material (EN) | Kategorie | Dicke (cm) | 2.4 GHz (dB) | 5 GHz (dB) | 6 GHz (dB) |
|---|---|---|---|---|---|---|---|
| W01 | Gipskarton (einfach) | Drywall (single) | leicht | 1.25 | 2 | 3 | 4 |
| W02 | Gipskarton (doppelt) | Drywall (double) | leicht | 10 | 5 | 7 | 9 |
| W03 | Leichtbauwand (Buero) | Office partition | leicht | 10 | 5 | 8 | 10 |
| W04 | Holzstaenderwand | Wood stud wall | leicht | 12 | 5 | 8 | 10 |
| W05 | Holztuere (innen) | Interior door | leicht | 4 | 4 | 6 | 7 |
| W06 | Glaswand (innen) | Interior glass wall | leicht | 1 | 3 | 5 | 7 |
| W07 | Einfachverglasung | Single glazing | leicht | 0.6 | 2 | 2 | 3 |
| W08 | Doppelverglasung | Double glazing | mittel | 2.4 | 5 | 9 | 11 |
| W09 | Dreifachverglasung | Triple glazing | mittel | 4 | 7 | 12 | 15 |
| W10 | Low-E Fenster | Low-E window | schwer | 2.4 | 22 | 28 | 32 |
| W11 | Ziegelwand duenn | Thin brick wall | mittel | 11.5 | 8 | 16 | 19 |
| W12 | Ziegelwand mittel | Medium brick wall | mittel | 17.5 | 10 | 20 | 24 |
| W13 | Ziegelwand dick | Thick brick wall | schwer | 24 | 14 | 25 | 30 |
| W14 | Porenbeton (Ytong) | AAC (Ytong) | mittel | 17.5 | 10 | 18 | 22 |
| W15 | Porenbeton Aussenwand | AAC exterior wall | mittel | 24 | 15 | 25 | 30 |
| W16 | Kalksandstein | Sand-lime brick | mittel | 17.5 | 12 | 20 | 24 |
| W17 | Kalksandstein dick | Sand-lime brick thick | schwer | 24 | 16 | 28 | 33 |
| W18 | Beton duenn | Thin concrete | schwer | 10 | 15 | 25 | 30 |
| W19 | Beton mittel | Medium concrete | schwer | 15 | 20 | 35 | 42 |
| W20 | Beton dick | Thick concrete | schwer | 20 | 25 | 48 | 55 |
| W21 | Stahlbeton | Reinforced concrete | schwer | 20 | 35 | 55 | 62 |
| W22 | Metalltuer | Metal door | schwer | 5 | 18 | 22 | 25 |
| W23 | Brandschutztuere (T30) | Fire door (T30) | schwer | 6 | 15 | 20 | 23 |
| W24 | Haustuere (isoliert) | Front door (insulated) | mittel | 8 | 10 | 14 | 17 |
| W25 | Massivholzwand | Solid wood wall | mittel | 12 | 8 | 15 | 18 |
| W26 | Fachwerk | Half-timber | mittel | 20 | 10 | 16 | 19 |
| W27 | Aufzugschacht | Elevator shaft | blockierend | - | 40 | 50 | 55 |

### 2.2 Geschossdecken (Konservative Defaults)

| ID | Material (DE) | Material (EN) | 2.4 GHz (dB) | 5 GHz (dB) | 6 GHz (dB) |
|---|---|---|---|---|---|
| F01 | Stahlbetondecke (Standard) | RC ceiling (standard) | 25 | 40 | 48 |
| F02 | Stahlbetondecke + FBH | RC ceiling + underfloor heating | 32 | 48 | 55 |
| F03 | Holzbalkendecke | Wooden beam ceiling | 15 | 22 | 26 |
| F04 | Stahlbetondecke (komplett) | RC ceiling (full buildup) | 35 | 55 | 62 |

### 2.3 Wandkategorien fuer vereinfachte Auswahl

Fuer Benutzer, die nicht jedes Material kennen, bieten wir drei Kategorien:

| Kategorie | Beschreibung | 2.4 GHz (dB) | 5 GHz (dB) | Beispiele |
|---|---|---|---|---|
| **Leicht** | Trockenbau, Holz, Glas | 4 | 6 | Rigips, Holzstaender, Glaswand |
| **Mittel** | Ziegel, Porenbeton, KS | 12 | 20 | Ziegelwand, Ytong, Kalksandstein |
| **Schwer** | Beton, Stahlbeton, Metall | 25 | 45 | Betonwand, Stahlbeton, Metalltuer |

---

## 3. Quellen und Standards

### 3.1 ITU-R P.1238 (Basis-Modell)

**Aktuellste Version:** ITU-R P.1238-13 (September 2025)

**Kernformel (Site-General Indoor Path Loss):**
```
L_total(dB) = 20*log10(f) + N*log10(d) + Lf(n) - 28
```
wobei:
- `f` = Frequenz in MHz
- `d` = Distanz in Metern
- `N` = Distance Power Loss Coefficient
- `Lf(n)` = Floor Penetration Loss Factor (n = Anzahl Stockwerke)

**Power Loss Coefficient N (aus P.1238):**

| Frequenz | Residential | Office | Commercial |
|---|---|---|---|
| 1.8-2.0 GHz | 28 | 30 | 22 |
| 5.2 GHz | 28-30 | 31 | - |
| 5.8 GHz | - | 24 | - |
| 6.0 GHz | - | 22 | 17 |

**Floor Penetration Loss Factor Lf(n):**

| Frequenz | Residential | Office | Commercial |
|---|---|---|---|
| 1.8-2.0 GHz | 4n | 15+4(n-1) | 6+3(n-1) |
| 5.2 GHz | - | 16 (1 Floor) | - |
| 5.8 GHz | - | 22 (1F), 28 (2F) | - |

**Unsere Anpassung:**
Wir verwenden eine modifizierte Version mit expliziten Wandverlusten:
```
PL(d) = PL(1m) + 10 * n * log10(d) + Sum(L_Waende) + Sum(L_Decken)
RSSI = TX_Power + Antenna_Gain - PL(d)
```
Dies ist eine Kombination aus ITU-R P.1238 (Distanzmodell) und COST 231 Multi-Wall-Ansatz (explizite Wandverluste).

**Aenderungen in neueren Versionen (P.1238-10 bis P.1238-13):**
- Erweiterung des Frequenzbereichs auf 300 MHz bis 450 GHz
- Aktualisierte Parameter fuer 5G-Frequenzen
- Verbesserte Modelle fuer mmWave-Ausbreitung
- Keine wesentlichen Aenderungen fuer 2.4/5 GHz WiFi-Bereich

Quelle: [ITU-R P.1238-13 PDF](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1238-13-202509-I!!PDF-E.pdf)

### 3.2 ITU-R P.2040 (Materialparameter)

**Aktuellste Version:** ITU-R P.2040-4 (September 2025)

Definiert elektromagnetische Eigenschaften (Permittivitaet und Leitfaehigkeit) von Baumaterialien.

**Parametrisches Modell:**
```
epsilon_r = a * f^b       (Realteil der rel. Permittivitaet)
sigma = c * f^d            (Leitfaehigkeit in S/m)
```
wobei f in GHz.

**Materialparameter (aus P.2040-3, Table 3):**

| Material | a | b | c (S/m) | d | Freq. (GHz) |
|---|---|---|---|---|---|
| Beton | 5.24 | 0 | 0.0462 | 0.7822 | 1-100 |
| Ziegel | 3.91 | 0 | 0.0238 | 0.16 | 1-10 |
| Gipskarton | 2.73 | 0 | 0.0085 | 0.9395 | 1-100 |
| Holz | 1.99 | 0 | 0.0047 | 1.0718 | 0.001-100 |
| Glas | 6.31 | 0 | 0.0036 | 1.3394 | 0.1-100 |
| Deckenplatte | 1.48 | 0 | 0.0011 | 1.0750 | 1-100 |
| Spanplatte | 2.58 | 0 | 0.0217 | 0.78 | 1-100 |
| Sperrholz | 2.71 | 0 | 0.33 | 0 | 1-40 |
| Marmor | 7.074 | 0 | 0.0055 | 0.9262 | 1-60 |
| Metall | 1 | 0 | 10^7 | 0 | 1-100 |

**Berechnete Leitfaehigkeiten bei WiFi-Frequenzen:**

| Material | sigma @ 2.4 GHz | sigma @ 5 GHz | sigma @ 6 GHz |
|---|---|---|---|
| Beton | 0.082 S/m | 0.144 S/m | 0.166 S/m |
| Ziegel | 0.027 S/m | 0.028 S/m | 0.028 S/m |
| Gipskarton | 0.018 S/m | 0.034 S/m | 0.039 S/m |
| Holz | 0.010 S/m | 0.021 S/m | 0.025 S/m |
| Glas | 0.009 S/m | 0.022 S/m | 0.028 S/m |

**Relevanz fuer unser Tool:**
P.2040 ermoeglicht es, die Daempfung fuer beliebige Dicken und Frequenzen physikalisch korrekt zu berechnen, statt nur Lookup-Tabellen zu verwenden. Fuer die erste Version nutzen wir aber die Lookup-Tabelle (einfacher, schneller).

Quellen:
- [ITU-R P.2040-4 PDF](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf)
- [MATLAB buildingMaterialPermittivity](https://www.mathworks.com/help/antenna/ref/buildingmaterialpermittivity.html)

### 3.3 COST 231 Multi-Wall-Modell

**Formel:**
```
PL = PL_FS(d) + L_c + Sum_i(n_wi * L_wi) + n_f * L_f
```
wobei:
- `PL_FS(d)` = Freiraumausbreitung
- `L_c` = Konstanter Offset (empirisch, typisch -6.7 dB)
- `n_wi` = Anzahl Waende vom Typ i
- `L_wi` = Daempfung pro Wandtyp i
- `n_f` = Anzahl Stockwerke
- `L_f` = Stockwerksdaempfung

**Typische Wandklassen im COST 231:**
- Leichte Wand (Typ 1): 3-5 dB
- Schwere Wand (Typ 2): 6-9 dB
- Betonwand: 10-15 dB+

**Stärke:** Einfach, benoetigt nur Grundrissinformation
**Schwaeche:** Keine Reflexionen, keine Beugung, keine Streuung

Quellen:
- [Simplified Indoor Multiwall Path-Loss Model (arxiv.org)](https://arxiv.org/pdf/2009.11794)
- [COST 231 Multi-Wall MATLAB Code (MathWorks)](https://www.mathworks.com/matlabcentral/fileexchange/61340-multi-wall-cost231-signal-propagation-models-python-code)

### 3.4 3GPP TR 38.901 (Indoor Hotspot)

**Relevante Formeln:**

LOS: `PL_LOS = 32.4 + 17.3*log10(d_3D) + 20*log10(f_c)` mit sigma_SF = 3 dB
NLOS Opt.1: `PL_NLOS = 17.3 + 38.3*log10(d_3D) + 24.9*log10(f_c)` mit sigma_SF = 8.03 dB
NLOS Opt.2: `PL_NLOS = 32.4 + 31.9*log10(d_3D) + 20*log10(f_c)` mit sigma_SF = 8.29 dB

wobei d_3D in m, f_c in GHz. Gueltig fuer 0.5-100 GHz, 1-150 m.

**Relevanz:** Hauptsaechlich fuer 5G-Planung, aber die Shadow-Fading-Werte (3-8 dB) geben uns Anhaltspunkte fuer erwartete Vorhersagefehler.

Quelle: [3GPP TR 38.901 Validation (arxiv.org)](https://arxiv.org/abs/2504.15589)

### 3.5 Primaere Messdatenquellen

| Quelle | Jahr | Inhalt | Qualitaet |
|---|---|---|---|
| NIST NISTIR 6055 | 1997 | Labormes sungen an Baumaterialien, 0.3-12 GHz | Hoch (Referenzstandard) |
| iBwave Blog | 2019 | Zusammenstellung Daempfungswerte 2.4/5 GHz | Mittel (Branchenquelle) |
| EI Wellspring (NIST-basiert) | 2004 | Aufbereitete NIST-Daten bei 2/5 GHz | Hoch (NIST-Basis) |
| wlan-blog.com | 2024 | Praxiswerte DE-Materialien, 2.4/5/6 GHz | Mittel (Praxisquelle) |
| Ursa Major Lab | 2024 | Tabelle 2.4/5/6 GHz | Mittel (Herstellerquelle) |
| CWNA Study Guide | 2020 | Referenzwerte fuer WLAN-Zertifizierung | Mittel (Ausbildung) |
| Ranplan Wireless | 2023 | Low-E Glas Messungen, Sub-6 GHz | Hoch (Spezialist) |
| WLAN-Training | 2023 | Messmethodik und Varianz (+/-10 dB!) | Mittel (Praxis) |

---

## 4. Benutzerdefinierte Wanddicke

### 4.1 Skaliert die Daempfung linear mit der Dicke?

**Kurze Antwort: Nein, nicht perfekt.**

Die Daempfung eines elektromagnetischen Signals durch ein Material ist physikalisch eine exponentielle Funktion der Dicke:
```
Attenuation(dB) = alpha * d
```
wobei `alpha` der Daempfungskoeffizient in dB/m und `d` die Dicke in Metern ist. Dieses Modell gilt fuer homogene Materialien und plane Wellen.

**In dB ausgedrueckt IST die Beziehung linear** (da dB bereits logarithmisch ist). ABER:

1. **Reale Waende sind nicht homogen**: Ziegel haben Hohlraeume, Mauerfugen, Putzschichten
2. **Reflexion an Grenzflaechen**: Ein Teil der Energie wird an den Oberflaechen reflektiert - das ist NICHT dickenabhaengig
3. **Resonanzeffekte**: Bei bestimmten Dicken (Lambda/2) kann konstruktive Interferenz die Transmission erhoehen
4. **Multi-Layer-Effekte**: Reale Waende bestehen aus mehreren Schichten (Putz + Material + Putz)

### 4.2 Gemessene Daten zur Dickenabhaengigkeit

Aus den NIST-Daten (EI Wellspring) bei 2 GHz:
- Beton 203mm: 35 dB -> ~172 dB/m
- Betonblocksteine 203mm: 11 dB -> ~54 dB/m
- Betonblocksteine 406mm: 18 dB -> ~44 dB/m
- Betonblocksteine 609mm: 30 dB -> ~49 dB/m

Die Betonblocksteine zeigen: Die Daempfung pro Meter IST NICHT konstant (54 -> 44 -> 49 dB/m). Die Hohlraeume und Resonanzeffekte spielen eine Rolle.

Fuer die Springer-Studie: Porenbeton ~33 dB/m, Normalbeton ~66 dB/m bei 2.4 GHz. Das bestaetigt: Materialdichte ist ein wichtiger Faktor.

### 4.3 Empfehlung fuer unser Tool

**Empfohlener Ansatz: Fixe Voreinstellungen mit Dickenklassen**

1. **Primaer**: Vordefinierte Materialien mit festen Dicken und Daempfungswerten (Tabelle 2.1)
2. **Sekundaer**: Dickenklassen pro Material (duenn / mittel / dick) statt freier Eingabe
3. **Optional (spaeter)**: Freie Dickeneingabe mit linearer Interpolation zwischen den Klassen

**Begruendung:**
- Benutzer kennen selten die exakte Wanddicke
- Die Varianz innerhalb eines Materials (+/-10 dB lt. WLAN-Training) ist groesser als der Dickenunterschied
- Fixe Presets sind schneller und weniger fehleranfaellig
- Fuer praezisere Ergebnisse empfehlen wir die Kalibriermessung (Run 1-3)

**Falls freie Dickeneingabe implementiert wird:**
```
Attenuation_adjusted = Attenuation_default * (d_user / d_default)
```
Dies ist eine lineare Skalierung in dB, die fuer homogene Materialien (Beton, Glas) gut funktioniert, fuer heterogene (Hohlziegel, Fachwerk) aber nur eine Naeherung ist.

---

## 5. Multi-Floor-Daempfung

### 5.1 Floor Attenuation Factor (FAF) nach ITU-R P.1238

**Formel (Residential, 1.8-2.0 GHz):**
```
Lf(n) = 4 * n  (dB)
```
wobei n = Anzahl der zu durchdringenden Stockwerke.

**Formel (Office, verschiedene Frequenzen):**

| Frequenz | Formel |
|---|---|
| 1.8-2.0 GHz | 15 + 4*(n-1) |
| 5.2 GHz | 16 (nur 1 Floor gemessen) |
| 5.8 GHz | 22 (1F), 28 (2F) |

### 5.2 Typische Werte fuer Geschossdecken

**Betongeschossdecke (Wohngebaeude):**
- 1 Stockwerk: 20-25 dB (2.4 GHz), 30-40 dB (5 GHz)
- 2 Stockwerke: 30-38 dB (2.4 GHz), 45-58 dB (5 GHz)
- 3 Stockwerke: 38-48 dB (2.4 GHz), 55-70 dB (5 GHz)

Hinweis: Die Daempfung steigt NICHT linear mit der Anzahl der Stockwerke, da indirekte Pfade (Treppenhaeuser, Installationsschaechte) eine alternative Ausbreitung ermoeglichen.

**Holzbalkendecke (Altbau, Einfamilienhaus):**
- 1 Stockwerk: 10-18 dB (2.4 GHz), 15-25 dB (5 GHz)
- 2 Stockwerke: 16-28 dB (2.4 GHz), 25-40 dB (5 GHz)

### 5.3 Modellierung in der Heatmap

**Option A: Einfaches Additionsmodell (empfohlen fuer MVP)**
```
PL_total = PL(d_horizontal) + n_floors * FAF
```
- d_horizontal = Horizontaldistanz (projiziert)
- FAF = Floor Attenuation Factor (pro Deckendurchgang)

**Option B: 3D-Distanzmodell (spaetere Version)**
```
d_3D = sqrt(d_horizontal^2 + (n_floors * h_floor)^2)
PL_total = PL(d_3D) + n_floors * L_floor
```
- h_floor = Stockwerkshoehe (typisch 2.8-3.0 m)
- L_floor = zusaetzliche Deckendaempfung (weniger als FAF, da Distanz bereits beruecksichtigt)

**Empfehlung:** Fuer den MVP verwenden wir Option A mit konservativen FAF-Werten. Multi-Floor ist NICHT im MVP-Scope, aber wir bereiten die Datenstruktur vor.

---

## 6. Frequenzabhaengigkeit & WiFi 6E

### 6.1 Systematischer Unterschied 2.4 GHz vs 5 GHz

**Freiraumausbreitung (FSPL):**
```
FSPL(1m, 2.4 GHz) = 40.05 dB
FSPL(1m, 5.0 GHz) = 46.42 dB
Differenz: ~6.4 dB
```

**Materialdaempfung:**
Die Materialabhaengigkeit ist NICHT nur durch FSPL erklaerbar. Die Leitfaehigkeit steigt mit der Frequenz (ITU-R P.2040), was zu hoeherem dielektrischen Verlust fuehrt.

Typische Verhaeltnisse (5 GHz / 2.4 GHz Daempfung):

| Material | Verhaeltnis 5GHz/2.4GHz | Kommentar |
|---|---|---|
| Gipskarton | 1.3-1.8x | Gering |
| Holz | 1.5-2.5x | Mittel |
| Ziegel | 1.5-2.5x | Mittel |
| Beton | 1.5-2.0x | Mittel-Hoch |
| Stahlbeton | 1.5-1.8x | Hoch (bereits bei 2.4 GHz sehr hoch) |
| Glas (normal) | ~1.0x | Kaum Unterschied |
| Low-E Glas | 1.2-1.4x | Metallbeschichtung dominant |

### 6.2 WiFi 6E (6 GHz)

**Freiraumausbreitung:**
```
FSPL(1m, 6.0 GHz) = 47.96 dB
Differenz zu 5 GHz: ~1.5 dB
Differenz zu 2.4 GHz: ~7.9 dB
```

**Sollten wir 6 GHz beruecksichtigen?**

**Ja, aber mit niedrigerer Prioritaet.** Gruende:
1. WiFi 6E-Geraete werden zunehmend verbreitet
2. WiFi 7 (802.11be) nutzt ebenfalls 6 GHz
3. Die Daempfungswerte koennen naeherungsweise aus 5 GHz extrapoliert werden
4. Unser Referenz-AP (DAP-X2810) unterstuetzt KEIN 6 GHz

**Naeherungs-Extrapolation 5 GHz -> 6 GHz:**

Basierend auf den verfuegbaren Messdaten (wlan-blog.com, Ursa Major Lab) und der physikalischen Beziehung:

```
L_6GHz ≈ L_5GHz * (1.15 bis 1.30)
```

Der Faktor haengt vom Material ab:
- Leichte Materialien (Gips, Holz): Faktor ~1.15-1.20
- Mittlere Materialien (Ziegel, KS): Faktor ~1.20-1.25
- Schwere Materialien (Beton): Faktor ~1.20-1.30
- Metall/Low-E: Faktor ~1.10-1.15 (bereits sehr hoch)

**Kann man 6 GHz Werte aus 2.4/5 GHz interpolieren?**

Bedingt. Die Daempfung steigt NICHT streng monoton mit der Frequenz fuer alle Materialien. Bei manchen Materialien gibt es Resonanzeffekte. Empfehlung: Fuer eine grobe Schaetzung ja (mit obigem Faktor), fuer praezise Planung sind Messungen erforderlich.

Quellen:
- [Extreme Networks: WiFi 6E Range](https://www.extremenetworks.com/resources/blogs/how-far-will-wi-fi-6e-travel-in-6-ghz)
- [wlan-blog.com Daempfungstabelle](https://www.wlan-blog.com/erfahrungen/wlan-daempfung-tabelle-welches-material-daempft-wlan-wie-stark-fenster-rigips-holz-etc/)
- [Ursa Major Lab](https://www.ursamajorlab.com/blog/wifi-signal-attenuation-wall-materials-2-4ghz-5ghz-6ghz/)

---

## 7. Validierung & Genauigkeit

### 7.1 Typische Genauigkeit des ITU-R P.1238 Modells

**Unkalibriert (Standard-Parameter):**
- RMSE: 8-12 dB (typisch fuer Wohngebaeude)
- Standard-Abweichung Shadow Fading: 6-12 dB
- Maximaler Fehler: bis zu 20+ dB moeglich
- Vergleich: 3GPP TR 38.901 InH NLOS sigma_SF = 8.03-8.29 dB

**Kalibriert (mit wenigen Messpunkten):**
- RMSE: 3-6 dB (typisch)
- Beste Ergebnisse (Obeidat 2018): RMSE < 3 dB mit Wall Correction Factors
- T-IPLM Modell (arxiv 1707.05554): MSE 1.5-3.6 (vs. ITU-R: MSE 10.3)
- Verbesserung durch Kalibrierung: 40-70% RMSE-Reduktion

**Wichtige Erkenntnis:** Die Varianz INNERHALB eines Raumes (Shadow Fading) liegt bei 3-8 dB. Das ist eine fundamentale physikalische Grenze, die kein Modell unterschreiten kann.

### 7.2 Verbesserung durch Kalibrierung

Unsere geplante Kalibriermessung (Run 1-3) ermoeglicht:

| Schritt | Verbesserung | Erwartete Genauigkeit |
|---|---|---|
| Nur Modell (unkalibriert) | Baseline | RMSE 8-12 dB |
| + Korrektur n-Faktor | Distanzmodell angepasst | RMSE 6-9 dB |
| + Korrektur Wanddaempfung | Materialabgleich | RMSE 4-7 dB |
| + Mehrere Messpunkte | Lokale Kalibrierung | RMSE 3-5 dB |
| + Mixing Console (interaktiv) | Benutzer-Feintuning | RMSE 2-4 dB |

### 7.3 Vergleich mit empirischen Messungen

**NIST NISTIR 6055 (1997):**
- Labormessungen unter kontrollierten Bedingungen
- Einzelne Materialproben, keine kompletten Waende
- Wiederholbarkeit: +/- 1-2 dB
- Praxisrelevanz: Eingeschraenkt (reale Waende haben Fugen, Installationen, etc.)

**iBwave / Praxis-Messungen:**
- Reale Gebaeude, komplette Waende
- Varianz: +/- 5-10 dB fuer denselben Wandtyp!
- WLAN-Training: "Streuung bei Ziegelwaenden +/- 10 dB"
- Hauptgruende: Feuchtigkeit, Armierung, Installationen, Einfallswinkel

**Fazit fuer unser Tool:**
- Unkalibriertes Modell: Ausreichend fuer grobe Planung und Problemerkennung
- Kalibriertes Modell: Gut genug fuer konkrete AP-Platzierungsempfehlungen
- **Perfekte Vorhersage ist physikalisch NICHT moeglich** - daher ist unser 3-Run-Messansatz essentiell

Quellen:
- [Obeidat 2018: Wall Correction Factors](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2018RS006536)
- [Realistic Indoor Path Loss Modeling (arxiv)](https://arxiv.org/abs/1707.05554)
- [3GPP TR 38.901 Validation (arxiv)](https://arxiv.org/abs/2504.15589)

---

## 8. Implementierungsempfehlungen

### 8.1 Datenstruktur fuer Materialdatenbank

```typescript
interface WallMaterial {
  id: string;                    // z.B. "W01"
  nameDE: string;                // Deutscher Name
  nameEN: string;                // Englischer Name
  category: 'light' | 'medium' | 'heavy' | 'blocking';
  defaultThickness: number;      // Dicke in cm
  attenuation: {
    '2.4GHz': number;            // Default-Daempfung in dB (konservativ)
    '5GHz': number;
    '6GHz': number;
  };
  attenuationRange: {
    '2.4GHz': [number, number];  // [min, max] in dB
    '5GHz': [number, number];
    '6GHz': [number, number];
  };
  isFloor: boolean;              // Decke/Boden statt Wand
  icon?: string;                 // Fuer UI-Darstellung
}
```

### 8.2 Prioritaeten

1. **MVP**: 10-12 Materialien (W01-W06, W11-W13, W18-W21), nur 2.4 + 5 GHz
2. **V1.1**: Alle 27 Wandmaterialien + 4 Deckenmaterialien
3. **V1.2**: 6 GHz Unterstuetzung, Dickenklassen
4. **Spaeter**: Freie Dickeneingabe, P.2040-basierte Berechnung, Multi-Floor

### 8.3 Konservatives Prinzip in Code

```typescript
function getAttenuation(material: WallMaterial, frequency: '2.4GHz' | '5GHz' | '6GHz'): number {
  // Konservativ: Immer den Default-Wert verwenden (oberes Ende des typischen Bereichs)
  return material.attenuation[frequency];
}

function getAttenuationCalibrated(
  material: WallMaterial,
  frequency: string,
  calibrationFactor: number  // aus Messung Run 1-3
): number {
  // Kalibriert: Default * Korrekturfaktor
  return material.attenuation[frequency] * calibrationFactor;
}
```

### 8.4 Offene Fragen fuer Phase 4

1. **Benutzer-Frage**: Soll der Benutzer Materialien frei waehlen oder aus Kategorien (leicht/mittel/schwer)?
2. **Benutzer-Frage**: Ist Multi-Floor Support fuer die erste Version gewuenscht?
3. **Benutzer-Frage**: Soll 6 GHz bereits im MVP beruecksichtigt werden?
4. **Low-E Fenster**: Wie gehen wir mit der grossen Daempfung um? Warnung an den Benutzer?
5. **Kalibrierung**: Wie viele Messpunkte sind minimal fuer eine sinnvolle Kalibrierung?

---

## Quellenverzeichnis

| Kuerzel | Vollstaendiger Titel | URL/Referenz |
|---|---|---|
| [ITU-R P.1238] | Recommendation ITU-R P.1238-13 (09/2025) | [itu.int](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1238-13-202509-I!!PDF-E.pdf) |
| [ITU-R P.2040] | Recommendation ITU-R P.2040-4 (09/2025) | [itu.int](https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf) |
| [3GPP TR 38.901] | 3GPP TR 38.901 Indoor Hotspot Model | [arxiv.org](https://arxiv.org/abs/2504.15589) |
| [NIST-1997] | NISTIR 6055: EM Signal Attenuation in Construction Materials | Via [Wi-Fi Vitae](https://wifivitae.com/2021/12/15/wall-attenuation/) |
| [EI Wellspring] | EMF Shielding by Building Materials (NIST-basiert) | [eiwellspring.org](https://www.eiwellspring.org/tech/Shielding_by_building_materials.htm) |
| [iBwave] | Attenuation Across Materials, 2.4/5 GHz Bands | [ibwave.com](https://blog.ibwave.com/a-closer-look-at-attenuation-across-materials-the-2-4ghz-5ghz-bands/) |
| [Ursa Major] | WiFi Signal Loss Through Wall Materials | [ursamajorlab.com](https://www.ursamajorlab.com/blog/wifi-signal-attenuation-wall-materials-2-4ghz-5ghz-6ghz/) |
| [wlan-blog] | WLAN Daempfung Tabelle (2024) | [wlan-blog.com](https://www.wlan-blog.com/erfahrungen/wlan-daempfung-tabelle-welches-material-daempft-wlan-wie-stark-fenster-rigips-holz-etc/) |
| [CWNA] | CWNA Official Study Guide | Via [HPE Airheads](https://airheads.hpe.com/discussion/rf-attenuation-values-of-typical-building-materials) |
| [Ranplan] | Low-E Glass and 5G Coverage | [ranplanwireless.com](https://www.ranplanwireless.com/resources/low-e-glass) |
| [WLAN-Training] | Wall Measurement / WiFi Attenuation | [wlan.training](https://wlan.training/en/wall-measurement-wi-fi-attenuation/) |
| [Springer] | EM Transmission of Concrete Materials (2026) | [springer.com](https://link.springer.com/article/10.1007/s10921-026-01329-7) |
| [Baubiologie] | Abschirmung von Funkwellen (Pauli/Moldan) | [baubiologie-regional.de](https://www.baubiologie-regional.de/pauli_moldan_2003_leseprobe.pdf) |
| [Obeidat 2018] | Indoor Path Loss with Wall Correction Factors | [Wiley](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/2018RS006536) |
| [T-IPLM] | Realistic Indoor Path Loss Modeling for WiFi | [arxiv.org](https://arxiv.org/abs/1707.05554) |
| [COST 231] | Simplified Indoor Multiwall Path-Loss Model | [arxiv.org](https://arxiv.org/pdf/2009.11794) |
| [MATLAB P.2040] | MATLAB buildingMaterialPermittivity | [mathworks.com](https://www.mathworks.com/help/antenna/ref/buildingmaterialpermittivity.html) |

---

> **Hinweis**: Bei widerspruechlichen Quellen wurden beide Werte dokumentiert. Die konservativen Defaults (Tabelle 2.1) verwenden den hoeheren Wert. Fuer praezise Planung empfehlen wir immer die Kalibriermessung.
