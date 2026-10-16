# PR-34 – 25-%-Grenze nach § 9a Abs. 2 HeizKV vor jeder Schätzung anzeigen

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 5.

## Anlass

Ob eine weitere Schätzung einen Heizkreis über 25 % geschätzte Fläche und
damit in die reine Flächenverteilung bringt, war 2025 entscheidend
(z. B. 13,7 % → 22,1 % → 29,6 %).

## Umfang

1. Core: `estimatedAreaShare(circuit, occupancies, overrides)` mit
   Zeitgewichtung und ohne Doppelzählung bei Nutzerwechsel.
2. Oberfläche: beim Markieren als geschätzt Vorschau „vorher → nachher“ und
   Warnung bei Überschreiten; Übersicht je Heizkreis.

## Freigegebene Pfade

`packages/core`, `apps/web/src/features/consumption`, Tests, diese Datei.
Kein Schemawechsel.

## Abnahme

Tests: Grenzwert genau 25 %, Nutzerwechsel, Leerstand, mehrere Heizkreise.
