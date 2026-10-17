# PR-33 – Mehrjahresvergleich je Wohnung und Kostenart

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 4.

## Anlass

Die Plausibilisierung 2025 gegen 2024 (Kosten je Wohnung, je Kostenart, je
Heizkreis; witterungsbereinigter Wärmeverbrauch 2021–2025) wurde per Skript
erstellt und hat Preis- und Mengenfehler aufgedeckt.

## Umfang

1. Core: Vergleich mit dem Vorjahresberechnungslauf oder einer optional
   importierten Vorjahres-Summentabelle (Kostenart → Betrag, Wohnung → Kosten).
2. Bericht „Veränderung zum Vorjahr“: Tabellen je Kostenart, Heizkreis (inkl.
   Kosten je kWh) und Wohnung; Ausreißerregeln (z. B. ± 25 % gesamt, ± 40 %
   Heizung) mit Spalte für die Erklärung.
3. Export als internes PDF und CSV.

## Freigegebene Pfade

`packages/core`, `packages/import-export` (Vorjahres-Summentabelle),
`packages/pdf` (interner Bericht), `apps/web/src/features/review`, Tests,
diese Datei.

## Abnahme

Tests mit fiktiven Jahren, Nutzerwechsel, Leerstand, Witterungsbereinigung.

## Umsetzungsstand

- Core: `compareYears` / `yearOverYearReport`
  (`packages/core/src/comparison/year-over-year.ts`) mit Kostenarten
  (Zuordnung über Bezeichnung/BetrKV), Brennstoff je Heizkreis, Heizkosten je
  kWh, witterungsbereinigtem Energieeinsatz (Klimafaktor des Jahres) und
  Wohnungen (Nutzerwechsel, Leerstandstage). Grenzen ± 25 % / ± 40 % als
  Parameter.
- Web: Panel „Veränderung zum Vorjahr“ auf der Freigabeseite, Filter „Nur
  auffällige Positionen“, CSV-Export mit leerer Spalte „Erklärung“.
- Offen: internes PDF (`packages/pdf`) und Import einer
  Vorjahres-Summentabelle (`packages/import-export`) für Vorjahre, die nicht im
  System liegen.
