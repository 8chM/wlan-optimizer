# WLAN-Optimizer - Projektregeln

## Sprache
- **Code**: Englisch (Variablen, Funktionen, Kommentare)
- **Dokumentation**: Deutsch (PRD, Architektur, Plaene)
- **Kommunikation**: Deutsch
- **UI**: Zweisprachig (EN/DE), Key-basierte Uebersetzungen

## Aktuelle Phase
**Phase 0: Autonomie-Recherche** 🔄 (Neustart mit BMAD + erweiterten MCPs)
- Fortschritt: `docs/plans/progress.json`
- Details: `.claude/rules/phasenmodell.md`

## Prinzipien
- Vollstaendig autonom ab Phase 8
- Quality Gates - keine Phase ueberspringen
- Selbstkontrolle - eigene Arbeit pruefen
- Keine Annahmen - recherchieren oder fragen
- Einfachheit vor Komplexitaet
- Entscheidungen als ADR dokumentieren
- Regelmaessig zu GitHub pushen

## Dokumentation
```
docs/
├── prd/           # PRD, Funktionsliste
├── research/      # Recherche, Evaluationen
├── architecture/  # ADRs, Komponentendiagramm
├── plans/         # Implementierungsplan, Backlog, progress.json
└── archive/       # Originaldokumente
```

## Hardware-Kontext
- Referenz-AP: D-Link DAP-X2810 (Wi-Fi 6, 2x2 MU-MIMO)
- 2,4 GHz: 23 dBm TX, 3,2 dBi Gewinn
- 5 GHz: 26 dBm TX, 4,3 dBi Gewinn
- RF-Modell: `.claude/rules/rf-modell.md`

## Tech-Stack
(wird in Phase 5 festgelegt)
