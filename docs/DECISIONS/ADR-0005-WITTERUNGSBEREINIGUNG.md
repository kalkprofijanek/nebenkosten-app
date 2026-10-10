# ADR-0005: Witterungsbereinigung mit DWD-Klimafaktoren je Postleitzahl

- Status: angenommen (Schema, Rechenvertrag, Prüfung); Ausgabe im PDF,
  Erfassung und Import der DWD-Liste folgen
  (`docs/TASKS/PR-25-WITTERUNGSBEREINIGUNG.md`)
- Datum: 2026-10-10
- Entscheidungen des Nutzers (10. Oktober 2026): Daten des Deutschen
  Wetterdienstes werden manuell importiert; die Wetterstation wird aus der
  Postleitzahl des Objekts abgeleitet (Variante a)

## Kontext

§ 6a Abs. 3 Satz 3 HeizKV verlangt für den Vergleich mit der Vorperiode eine
Witterungsbereinigung nach anerkannten Regeln der Technik; Satz 4 lässt das
im Bundesanzeiger bekannt gemachte vereinfachte Verfahren zu. Die
Einzelabrechnung vergleicht bisher unbereinigt („ohne
Witterungsbereinigung“).

Recherche (10. Oktober 2026):

- Der DWD bietet monatliche Gradtagzahlen nach VDI 2067 (G20/15) nicht mehr
  kostenfrei an. Frei verfügbar sind Gradtage nach VDI 3807 je Station; eine
  Zuordnung Postleitzahl → Station liefert der DWD dafür nicht.
- Der DWD veröffentlicht **Klimafaktoren je Postleitzahl** (über 8.200
  Werte) für gleitende Zwölfmonatszeiträume, monatlich etwa sechs Wochen
  nach Monatsende (CSV, XML; Dateiname mit Beginn und Ende des Zeitraums).
  Klimafaktor = Gradtage am Referenzstandort Potsdam ÷ Gradtage am Standort
  im Zeitraum. Bereinigt wird durch Multiplikation des
  Jahres-Heizenergieverbrauchs mit dem Faktor. Die Faktoren sind die
  Grundlage der Bekanntmachungen für Energieverbrauchskennwerte (GEG).

## Entscheidung

1. **Klimafaktoren statt eigener Gradtagsrechnung.** Sie erfüllen Variante
   (a) ohne eigene Stationstabelle: Der DWD ordnet die Wetterstation der
   Postleitzahl zu. Die App leitet die Postleitzahl aus der Objektanschrift
   ab (`postalCodeFromAddress`) und prüft sie gegen den erfassten Faktor.
2. **Schnittstelle (additiv, Schema v5 bleibt):**
   - `BillingPeriod.climateFactor` (`climateFactorSchema`): Postleitzahl,
     Faktor, Zeitraum (Beginn/Ende laut DWD-Datei), Quelle.
   - `PreviousConsumption.climateFactor`: Faktor des Vorjahres, wenn das
     Vorjahr nicht im System liegt (z. B. nach Eigentümerwechsel).
3. **Rechenvertrag** (`packages/core/src/heating/weather-adjustment.ts`):
   - `checkClimateFactor`: `matching` nur bei genau gleichem Zeitraum wie
     das Abrechnungsjahr und gleicher Postleitzahl wie das Objekt (sofern
     bekannt).
   - `previousPeriodClimateFactor`: Faktor des Vorjahres im System, sonst
     der des übernommenen Vorjahresverbrauchs – dieselbe Quellenwahl wie der
     Vorjahresvergleich der Einzelabrechnung.
   - `weatherAdjustPreviousPeriod`: bereinigter Wert = Verbrauch × Faktor
     (zwei Nachkommastellen) für beide Perioden, Veränderung in Prozent (eine
     Stelle) aus den gerundeten Werten. Der Verbrauch der Einzelabrechnung
     (HKV-Einheiten oder Wärmemenge) enthält kein Warmwasser und wird
     vollständig bereinigt.
4. **Prüfung** (nur bei Heizkreis und erfasstem Faktor):
   `heating.climate_factor_period_mismatch`,
   `heating.climate_factor_postal_code_mismatch`,
   `heating.climate_factor_previous_missing` (Warnungen). Eine Warnung
   „Witterungsbereinigung fehlt“ kommt erst mit der PDF-Ausgabe, damit die
   Prüfung keinen Vergleich bestätigt, den der Mieter nicht erhält.

## Dateiformat der DWD-Liste (geprüft am 10. Oktober 2026)

Geprüft an `KF_20250101_20251231.csv`, `…_k.csv` und `….xml` aus
`opendata.dwd.de/climate_environment/CDC/derived_germany/techn/monthly/climate_correction_factor/recent/`
(Datensatzbeschreibung Version v22.3):

- Dateiname `KF_JJJJMMTT_JJJJMMTT.csv`, je Monatsbeginn eine Datei; dazu
  `…_k.csv` (Dezimalkomma) und `….xml`.
- CSV: ASCII, Trennzeichen `;`, Zeilenende LF, Kopfzeile
  `DatAnf;DatEnd;PLZ;KF` (in `_k.csv`: `KF_k`), danach eine Zeile je
  Postleitzahl, z. B. `20250101;20251231;<PLZ>;1.14`.
- Zeitraum steht in jeder Zeile (`DatAnf`, `DatEnd`, `JJJJMMTT`).
- **Postleitzahlen ohne führende Null** (vierstellig für 0xxxx, in dieser
  Datei 652 von 8.234 Zeilen); beim Import auf fünf Stellen auffüllen.
- Faktor mit zwei Nachkommastellen, in dieser Datei 0,49 bis 1,33; keine
  doppelten Postleitzahlen.
- XML: Elemente `KF_die_letzten_12` mit `KLFK_POLZ`, `VON_DATUM`,
  `BIS_DATUM`, `KLIMAFAKTOR`.
- Nutzungsbedingungen: GeoNutzV, Quellenvermerk „Deutscher Wetterdienst“.

## Offene Entscheidungen

- **Teilzeiträume:** Bei Ein- oder Auszug im Jahr wird mit dem Faktor des
  ganzen Abrechnungszeitraums bereinigt. Genauer wäre eine Gewichtung nach
  den Gradtagen der Nutzungsmonate; dafür bräuchte es Monatswerte je
  Station (VDI 3807) und eine eigene Zuordnung zur Postleitzahl.
- **Abweichender Abrechnungszeitraum:** Der DWD veröffentlicht Faktoren für
  jeden Monatsbeginn; Zeiträume, die nicht am Monatsersten beginnen, haben
  keinen exakt passenden Faktor (Prüfung meldet den Zeitraum).
- **Neues DWD-Verfahren:** Das BBSR beschreibt 2025 ein Verfahren auf
  1-km-Raster (HOSTRADA) ohne Postleitzahl-Zuordnung. Ob und wann der DWD
  umstellt, ist offen; das Schema speichert nur Faktor, Zeitraum und Quelle
  und bleibt davon unberührt.

## Tests

- `packages/schema/tests/climate-factor.test.ts`
- `packages/core/tests/weather-adjustment.test.ts` (Handrechnung
  1.000 × 0,9 = 900 gegen 950 × 1,1 = 1.045, +16,1 %)
- `packages/validators/tests/climate-factor.test.ts`

## Migrationsauswirkungen

- Keine Migration; beide Felder sind optional. Ältere App-Versionen lehnen
  Dateien mit den neuen Feldern ab (strikte Schemaprüfung).
- Legacy-v3 (auch der KI-Ablauf mit `vorjahr_*`) kennt keinen Klimafaktor;
  der Import setzt die Felder nicht.
