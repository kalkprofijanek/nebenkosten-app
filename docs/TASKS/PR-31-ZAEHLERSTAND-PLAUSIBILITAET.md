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

## Umsetzungsstand

- Core: `assessMeterReadingSeries` (`packages/core/src/heating/meter-reading-series.ts`)
  mit `digit_drop` (nur bei rund einer Zehnerpotenz Abstand; bei zwei
  Erklärungen die mit kleinerem Verbrauch), `swapped_columns` (erst ab drei
  Ablesungen), `decreasing`, `stalled` (Vorgabe zwei Perioden) und
  `implausible_share` (Gradtagsanteil, Toleranz ± 20 Prozentpunkte). Jeder
  Befund nennt alternative Werte und Folgeverbrauch; keine Änderung der Daten.
- Validator: `heating.meter_reading_series_<befund>` für Zählerablesungen
  (`MeterReading`) und für Stände der Nutzungen derselben Wohnung und
  Zählernummer über alle Jahre; gemeldet nur bei Bezug zum geprüften Jahr.
  Sprung zum Zähler bzw. zur Verbrauchszeile.
- Offen: Befundliste in der Verbrauchsseite mit „übernehmen / als Schätzung /
  belassen“ und Begründung im Audit.
