# PR-31 – Plausibilitätsprüfung für Zählerstände

Stand: 16. Oktober 2026. Auftrag: Roadmap Phase 2, Punkt 2.

## Anlass

Handschriftliche Ablesebögen enthielten 2025 weggelassene Nachkommastellen
(fünf- statt sechsstellig), vertauschte Spalten, Werte in falschen Spalten,
stehende Zähler (0 → 0, 47 → 47) und rückläufige Reihen. Die Fehler waren nur
durch Vergleich mehrerer Ablesungen (Jahresende, Januar, März) erkennbar.

## Umfang

1. Core: Funktion `assessMeterReadingSeries(readings)` liefert Befunde je
   Zähler: `decreasing`, `stalled` (mindestens zwei Perioden ohne Änderung),
   `digit_drop` (Faktor 10 erklärt die Reihe), `swapped_columns`
   (Vertauschung erklärt die Reihe), `implausible_share` (Teilperiode passt
   nach Gradtagszahlen nicht zum Jahreswert, Toleranz einstellbar).
2. Jeder Befund nennt die alternative Lesung und deren Folgeverbrauch; keine
   automatische Änderung.
3. Validator-Hinweise mit Sprung zur Zeile; Oberfläche: Befundliste mit
   „übernehmen / als Schätzung / belassen“, Entscheidung mit Begründung im
   Audit.

## Freigegebene Pfade

`packages/core` (neues Modul), `packages/validators`,
`apps/web/src/features/consumption`, Tests, diese Datei. Kein Schemawechsel.

## Abnahme

Tests mit fiktiven Reihen je Befundtyp, Gradtag-Anteil, keine stille Korrektur.
