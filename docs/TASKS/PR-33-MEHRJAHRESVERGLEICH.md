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
