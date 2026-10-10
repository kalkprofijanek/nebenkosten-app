# Witterungsbereinigter Vorperiodenvergleich (§ 6a Abs. 3 Satz 3/4 HeizKV)

Stand: 10. Oktober 2026. Ausgangspunkt: `main` bei 909fe6b. Entscheidung:
`docs/DECISIONS/ADR-0005-WITTERUNGSBEREINIGUNG.md`.

## Änderungsgrund

Der Vorjahresvergleich der Einzelabrechnung ist nicht witterungsbereinigt;
das ist eine unvollständige Angabe nach § 6a HeizKV (Kürzungsrecht 3 %,
§ 12 Abs. 1 HeizKV).

## Teil A – Claude (dieser PR): Schema, Rechenvertrag, Prüfung

- `packages/schema`: `climateFactorSchema`, `BillingPeriod.climateFactor`,
  `PreviousConsumption.climateFactor` (optional, Schema v5 bleibt).
- `packages/core`: `postalCodeFromAddress`, `checkClimateFactor`,
  `previousPeriodClimateFactor`, `weatherAdjustPreviousPeriod`; Export über
  `packages/core/src/index.ts`.
- `packages/validators`: `heating.climate_factor_period_mismatch`,
  `heating.climate_factor_postal_code_mismatch`,
  `heating.climate_factor_previous_missing`.
- Keine Änderung an Kostenverteilung, Rundung, Legacy oder PDF.

## Teil B – Codex (Folge-PR): Import, Erfassung, Ausgabe

Erst nach dem Merge von Teil A beginnen; PDF-Teil nach Teil B von PR-24, weil
beide `consumptionInformation`/`previousPeriodSection` betreffen.

1. **Import der DWD-Liste** (`packages/import-export`): Parser für die
   Klimafaktor-CSV; Format ist in ADR-0005 („Dateiformat der DWD-Liste“) an
   Originaldateien geprüft. Kopfzeile `DatAnf;DatEnd;PLZ;KF` bzw. `KF_k`
   (Dezimalkomma), Zeitraum aus den Spalten `DatAnf`/`DatEnd`
   (`JJJJMMTT` → ISO), **Postleitzahl links mit Nullen auf fünf Stellen
   auffüllen**. Ergebnis `{ periodStart, periodEnd, factors: Map<PLZ,
number> }`. Fehler: unbekannte Kopfzeile, mehrere Zeiträume in einer
   Datei, doppelte Postleitzahl, Faktor nicht positiv. Fixture nur mit
   wenigen erfundenen Zeilen, keine Kopie der DWD-Datei. Quellenvermerk
   „Deutscher Wetterdienst“ (GeoNutzV) in `source` übernehmen.
2. **Oberfläche** (Abrechnungsjahr bearbeiten): Abschnitt „Klimafaktor
   (DWD)“ – Datei wählen, Postleitzahl aus der Objektanschrift vorbelegen
   (`postalCodeFromAddress`), Faktor und Zeitraum übernehmen; Quelle
   vorbelegen mit „DWD, Klimafaktoren (Referenz Potsdam)“. Alternativ Faktor
   von Hand. Beim übernommenen Vorjahresverbrauch der Nutzung zusätzlich ein
   Feld „Klimafaktor Vorjahr“.
3. **PDF** (`previousPeriodSection`): Wenn
   `checkClimateFactor(...).status === 'matching'` und
   `previousPeriodClimateFactor(...)` einen Wert liefert, Balken mit
   `weatherAdjustPreviousPeriod` (bereinigte Werte) und Text
   „witterungsbereinigt mit Klimafaktoren des DWD (Postleitzahl …,
   Faktor Vorjahr …, Abrechnungsjahr …)“ statt
   `PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED`; sonst wie bisher unbereinigt.
4. **Prüfung:** neue Warnung `heating.previous_period_not_weather_adjusted`,
   wenn ein Vorjahresvergleich ausgegeben wird, aber unbereinigt bleibt –
   zusammen mit Punkt 3 einführen.
5. **Doku:** Benutzerhandbuch (wo die DWD-Liste zu finden ist), CHANGELOG,
   `docs/TODO-HEIZKV-6A.md`.

## Tests (Teil A)

Siehe ADR-0005, Abschnitt „Tests“.

## Migrationsauswirkungen

Keine Migration; additive optionale Felder.
