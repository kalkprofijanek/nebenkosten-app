# ADR-0008: Geräte- und Zählertausch innerhalb eines Nutzungszeitraums

- Status: angenommen (Schema, Core, Prüfung, Rechenstellen in PDF und
  Verbrauchsseite); Erfassung und Darstellung der Abschnitte folgen
  (`docs/TASKS/PR-28-ZAEHLERTAUSCH.md`)
- Datum: 2026-10-10
- Entscheidung des Nutzers (10. Oktober 2026): Weiterarbeit nach Vorschlag
  (README „Was noch fehlt“: Zählertausch im Datenmodell)

## Kontext

Je Nutzung gibt es genau einen Satz Zählerstände
(`OccupancyPeriod.heatMeterReading`: Nummer, Stand alt, Stand neu). Wird ein
Heizkostenverteiler oder Wärmemengenzähler im Jahr getauscht (Defekt,
Eichfrist, Umrüstung auf Fernablesung bis 31.12.2026), passt „Stand neu −
Stand alt“ nicht mehr. Bisher blieb nur eine Schätzung; jede Schätzung zählt
auf die 25-%-Grenze des § 9a Abs. 2 HeizKV an und kann eine ganze
Liegenschaft in die reine Flächenverteilung zwingen.

## Entscheidung

1. **Schnittstelle (additiv, Schema v5 bleibt):**
   `HeatMeterReading.replacements[]` mit `date`, `removedEndValue`,
   `installedMeterNumber` (optional), `installedStartValue`, `note`.
   `meterNumber`/`startValue` gehören zum ersten, `endValue` zum zuletzt
   eingebauten Gerät.
2. **Rechenregel im Core** (`meterReadingConsumption`, `meterReadingTotal`
   in `packages/core/src/heating/meter-reading.ts`): Verbrauch = Summe der
   Abschnitte (Endstand − Anfangsstand je Gerät), drei Nachkommastellen.
   Tauschtage müssen aufsteigend sein und innerhalb der Ablesedaten alt/neu
   liegen (sofern angegeben); sonst `invalid` und kein Verbrauch.
3. **Eine Regel für alle Stellen:** Prüfung (`heating.meter_reading_mismatch`),
   Einzelabrechnung (`readingDifference` in `packages/pdf/src/meter-readings.ts`)
   und Verbrauchsseite (`apps/web/src/features/consumption/overview.ts`)
   rechnen über den Core. Ohne Tausch bleibt das Ergebnis unverändert.
4. **Prüfung:** neu `heating.meter_replacement_invalid` (Warnung) bei
   unstimmigen Tauschdaten; der Text von `heating.meter_reading_mismatch`
   nennt bei Tausch „einschließlich Zählertausch“.
5. **Keine Schätzung:** Ein Tausch mit beiden Ständen ist eine Ablesung,
   kein Fall des § 9a; das Kennzeichen `consumptionUnitsEstimated` bleibt
   unberührt.

## Offene Entscheidungen

- **Unterschiedliche Skalen:** Wird ein Heizkostenverteiler gegen ein Gerät
  mit anderer Bewertung getauscht (z. B. Verdunster gegen elektronischen
  HKV), sind die Einheiten der Abschnitte nicht addierbar. Ein
  Umrechnungsfaktor je Abschnitt ist nicht modelliert; in diesem Fall
  bleibt es bei der Angabe des Messdienstes als Verbrauch der Nutzung
  (`consumptionUnits`) mit Erläuterung.
- **Tausch ohne Endstand des alten Geräts** (z. B. Totalausfall): bleibt
  Schätzung nach § 9a für den betroffenen Abschnitt; eine Teilschätzung je
  Abschnitt ist nicht modelliert.
- **Wohnungszähler als Stammdaten (`Meter`, `MeterReading`)** bilden Tausch
  bereits über `validFrom`/`validTo` ab; dieser ADR betrifft nur die
  Stände an der Nutzung.

## Tests

- `packages/core/tests/meter-reading.test.ts`: ohne Tausch, ein Tausch
  (Handrechnung (400 − 100) + (80 − 0) = 380), zwei Tausche mit
  Anfangsstand ≠ 0, fehlende Stände, falsche Reihenfolge, Tauschtag
  außerhalb.
- `packages/schema/tests/heat-meter-reading.test.ts`: Pflichtfelder, strikt.
- `packages/validators/tests/meter-reading-validation.test.ts`: Verbrauch
  über den Tausch, Text bei Abweichung, unstimmige Tauschdaten.

## Migrationsauswirkungen

Keine Migration; additives optionales Feld. Ältere App-Versionen lehnen
Dateien mit Tauschangaben ab (strikte Schemaprüfung). Legacy-v3 kennt keinen
Tausch; der Import setzt das Feld nicht.

## Umsetzung Teil B (10. Oktober 2026) – offene Annahmen

- Unstimmige Tauschtage blockieren das Speichern nicht (Meldung + Prüfung);
  unvollständige Tauschangaben schon.
- PDF: eine Zeile je Abschnitt und Summenzeile; bei `incomplete` weiterhin „–“
  ohne eigenen Hinweis.
