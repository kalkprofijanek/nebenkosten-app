# PR-32 – Energiebilanz je Heizkreis

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 3.

## Anlass

2025 passten Brennstoffmengen und gemessene Wärme nicht zusammen
(Nutzungsgrad 95 % bzw. 45 % statt rund 84 %); bei Wärmepumpen fehlten kWh in
Rechnungen. Beides fiel erst bei manueller Prüfung auf.

## Umfang

1. Core: Energieeinsatz je Heizkreis (Menge × Heizwert, Strom in kWh) gegen
   Summe der Wärmemengenzähler bzw. Einheiten; daraus Nutzungsgrad bzw.
   Jahresarbeitszahl, Vergleich mit Vorjahr.
2. Validator: Warnung außerhalb einstellbarer Bänder (Kessel 60–95 %,
   Wärmepumpe JAZ 2–5) und bei Energiekosten ohne Menge.
3. Anzeige in der Berechnungsvorschau und in der internen Gesamtabrechnung,
   nicht im Mieter-PDF.

## Freigegebene Pfade

`packages/core`, `packages/validators`, `packages/pdf` (nur interne
Gesamtabrechnung), `apps/web/src/features/heating`, Tests, diese Datei.

## Abnahme

Tests: Öl, Pellets, Gas, Wärmepumpe, Hybrid, fehlende Mengen, Bandgrenzen.
