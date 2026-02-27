# ADR-001: Planrestrukturierung fuer volle Autonomie

> **Datum:** 2026-02-27 | **Status:** Akzeptiert | **Entscheider:** Benutzer + Claude

## Kontext

Der Benutzer moechte, dass Claude autonom bis zum fertigen Produkt durcharbeiten kann,
ohne auf Benutzereingaben warten zu muessen. Das erfordert Aenderungen am Phasenmodell
und klare Regeln fuer Entscheidungsdokumentation.

## Entscheidung

### 1. Phasen-Restrukturierung

| Alt | Neu | Aenderung |
|-----|-----|-----------|
| Phase 9: Qualitaetssicherung | Phase 9: Qualitaetskontrolle & Verbesserungsidentifikation | Erweitert um Verbesserungsvorschlaege |
| Phase 10: Uebergabe & Demo | Phase 10: Produktverbesserungen | Ueber MVP hinaus, perfektes Tool |
| - | Phase 11: Dokumentation & Uebergabe | Neue Phase fuer README, Handbuch, Release |

### 2. Autonomie-Regeln

- Ab Phase 7 wird VOLLSTAENDIG AUTONOM gearbeitet
- Eigene Entscheidungen als ADR dokumentieren
- Bei Unklarheiten: konservativste Option waehlen
- Provider-Pattern fuer AP-Hersteller-Anbindungen

### 3. Session-Management

- Jede Sub-Phase (8a-8g) in einer Session abschliessbar
- progress.json + MEMORY.md am Session-Ende aktualisieren
- Committen und pushen vor Session-Ende
- Bei Session-Start: Zustand aus Dateien rekonstruieren

### 4. Provider-Pattern fuer AP-Steuerung

AP-Anbindungen werden als austauschbare Provider implementiert:
- `APProvider` Trait/Interface mit standardisierter API
- Jeder Hersteller als eigener Provider (D-Link, Ubiquiti, TP-Link, etc.)
- Custom-Provider fuer manuelle Konfiguration (Assist-Mode)
- Neue Hersteller ohne Kernaenderungen nachruestbar

## Alternativen

1. Weiterhin Benutzer-Interaktion bei Entscheidungen → Abgelehnt (Autonomie gewuenscht)
2. Festes Session-Limit statt flexibler Planung → Abgelehnt (zu unflexibel)

## Konsequenzen

- Alle Entscheidungen muessen als ADR dokumentiert werden
- Benutzer kann nachtraeglich jede Entscheidung revidieren
- Hoehere Selbststaendigkeit erfordert konservativere Entscheidungen
- Provider-Pattern erhoet initialen Aufwand, aber langfristige Erweiterbarkeit
