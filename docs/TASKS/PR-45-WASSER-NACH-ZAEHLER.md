# PR-45 – Umlageschlüssel „nach Wasserverbrauch“

Stand: 18. Oktober 2026. Auftrag: Nutzerauftrag 18.10.2026 (offener Punkt aus
PR-44). Entscheidung und Vertrag: [ADR-0013](../DECISIONS/ADR-0013-WASSER-NACH-ZAEHLER.md).

## Umfang

1. Schema: `water_consumption` in `allocationKeySchema` (additiv, v5).
2. Rechenkern: Verteilung nach Kalt- plus Warmwasser in m³, Leerstand im
   Nenner, Trace mit `waterM3` und Nenner `m³`.
3. PDF: Schlüsseltext, eigene Einheiten.
4. Prüfung: fehlender Kaltwasserwert (Fehler), Zähler erfasst, aber nach
   Fläche umgelegt (Warnung, § 556a Abs. 1 Satz 2 BGB).
5. Oberfläche: Auswahl im Formular und Anzeige in den Übersichten.
6. Beispielobjekt (nach Merge von PR-44): Kaltwasser je Nutzung,
   Wasserkosten nach Verbrauch.

## Freigegebene Pfade

`packages/schema`, `packages/core`, `packages/pdf`, `packages/validators`,
`apps/web/src/features/costs`, `apps/web/src/features/workflows/costs`,
`tests/`, `docs/`, `CHANGELOG.md`.

## Abnahme

Tests je Ebene; Kontrolldifferenz 0 im Beispielobjekt; Entscheidungen
E-45-1 bis E-45-3 durch den Maintainer.
