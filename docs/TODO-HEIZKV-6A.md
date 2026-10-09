# TODO: § 6a HeizkostenV (Abrechnungs- und Verbrauchsinformationen)

Stand: Oktober 2026. Abgleich der App mit § 6a HeizKV. Die Einzelabrechnung
enthält einen Block „Abrechnungs- und Verbrauchsinformationen (§ 6a HeizKV)“
(`packages/pdf/src/tenant-statement.ts:994`, eingebunden in Zeile 1318).
Unterjährige Verbrauchsinformationen, der Vergleich mit einem normierten
Durchschnittsnutzer und die Witterungsbereinigung fehlen. Fehlende oder
unvollständige Angaben berechtigen den Mieter zur Kürzung seines
Heizkostenanteils um 3 % (§ 12 Abs. 1 HeizKV).

## Abgleich

| Anforderung                                                                          | Status           | Fundstelle im Code                                                                                                                    | Was zu bauen ist                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abs. 1: unterjährige Informationen bei fernablesbaren Geräten (seit 2022 monatlich)  | fehlt            | nur Hinweis `packages/validators/src/legal-rules.ts:36-40`, README „Was noch fehlt“                                                   | Fernablesbarkeit je Zähler, Import von Monatswerten, monatliches Infoblatt (Nr. 1)                                                                   |
| Abs. 2 Nr. 1: Monatsverbrauch in kWh                                                 | fehlt            | – (`meterReadingSchema` hat nur Einzelstände, `packages/schema/src/entities/metering.ts:57-67`)                                       | Monatsverbrauch je Nutzer berechnen, HKV-Einheiten in kWh umrechnen                                                                                  |
| Abs. 2 Nr. 2: Vergleich mit Vormonat und Vorjahresmonat                              | fehlt            | –                                                                                                                                     | Monatsreihe je Nutzer speichern, Vergleich im Infoblatt                                                                                              |
| Abs. 2 Nr. 3: Vergleich mit normiertem Durchschnittsnutzer                           | fehlt            | –                                                                                                                                     | Monatliche Referenzwerte (Nr. 4) wiederverwenden                                                                                                     |
| Abs. 3 Nr. 1a: Anteile der Energieträger                                             | teilweise        | `packages/pdf/src/heating-summary.ts:155` (Anteile in kWh), Warnung `packages/validators/src/billing-information.ts:184-194`          | Fernwärme: THG-Emissionen und Primärenergiefaktor des Netzes fehlen völlig (`energySourceSchema`, `packages/schema/src/entities/heating.ts:101-112`) |
| Abs. 3 Nr. 1b: Steuern, Abgaben, Zölle                                               | teilweise        | Pauschaltext `packages/pdf/src/legal-texts.ts:153`                                                                                    | Beträge (USt, Energie-/Stromsteuer, BEHG) aus Rechnungen erfassen und ausweisen                                                                      |
| Abs. 3 Nr. 1c: Entgelte Geräte, Eichung, Ablesung, Abrechnung                        | teilweise        | `packages/pdf/src/heating-summary.ts:529-541` (Erkennung per Regex), Text `legal-texts.ts:157`                                        | Kostenart explizit als Messdienstentgelt markieren statt Schlagwortsuche; Validator, wenn nichts erkannt                                             |
| Abs. 3 Nr. 2: Kontaktinformationen Verbraucherorganisationen/Energieagenturen        | erfüllt          | `packages/pdf/src/legal-texts.ts:146`, ausgegeben `tenant-statement.ts:1061`                                                          | –                                                                                                                                                    |
| Abs. 3 Nr. 3: Verbraucherstreitbeilegung (VSBG)                                      | erfüllt (prüfen) | `packages/pdf/src/legal-texts.ts:164`                                                                                                 | Bezeichnung der Stelle aktuell halten („Universalschlichtungsstelle des Bundes“ seit 2024)                                                           |
| Abs. 3 Nr. 4: Vergleich mit normiertem Durchschnittsnutzer derselben Nutzerkategorie | fehlt            | nur Heizkreis-Mittelwert `tenant-statement.ts:1022-1029`, `legal-texts.ts:196`; Warnung `billing-information.ts:155-168`              | Referenzwerte je Nutzerkategorie hinterlegen und ausgeben                                                                                            |
| Abs. 3 Nr. 5: grafischer Vergleich mit Vorperiode                                    | teilweise        | Balkengrafik `tenant-statement.ts:912-990`, Vorjahreswert `tenant-statement.ts:851-910`, `packages/schema/src/entities/tenancy.ts:58` | Witterungsbereinigung fehlt (Text `legal-texts.ts:176` „ohne Witterungsbereinigung“), Warmwasser nicht enthalten, bei HKV keine kWh                  |
| Abs. 3 S. 2: Energieverbrauch = Wärme + Warmwasser                                   | fehlt            | Warmwasser nur als Kosten nach Personen (`tenant-statement.ts:535-538`)                                                               | Warmwasserenergie je Nutzer ermitteln (§ 9 HeizKV) und addieren                                                                                      |
| Abs. 3 S. 3/4: Bereinigung nach anerkannten Regeln / Bundesanzeiger-Vereinfachung    | fehlt            | – (Gradtage nur für Nutzerwechsel, `packages/core/src/calculation/calculate-billing.ts:504`)                                          | Gradtagszahlen-Verfahren, siehe unten                                                                                                                |
| Abs. 4: § 556 Abs. 3 BGB unberührt                                                   | erfüllt          | Abrechnungsfrist/-form an anderer Stelle                                                                                              | –                                                                                                                                                    |
| Abs. 5: geschätzte Abrechnungen mind. Nr. 2 und 3                                    | erfüllt          | gleicher Block auch bei § 9a-Schätzung, `tenant-statement.ts:1061`                                                                    | Test für reine Flächenverteilung (§ 9a Abs. 2) ergänzen                                                                                              |

## Bauliste (priorisiert)

### 1. Vergleich mit normiertem Durchschnittsnutzer (Abs. 3 Nr. 4)

- Datenmodell: `consumptionBenchmarkSchema` in `packages/schema` mit
  `category` (z. B. „Mehrfamilienhaus, Baujahr/Energieträger“), `year`,
  `kwhPerSqmYear`, `source` (Text + URL, z. B. Heizspiegel co2online oder
  Vergleichswerte des Messdienstes), `hotWaterIncluded`. Zuordnung über
  `heatingCircuit.benchmarkId`.
- Berechnung (`packages/core`): eigener Verbrauch kWh/m²·a (hochgerechnet auf
  das Jahr) gegenüber Referenzwert; bei HKV vorher Umrechnung in kWh
  (Anteil × Energieeinsatz des Heizkreises).
- PDF: Zeile „Durchschnittsnutzer Ihrer Kategorie“ neben dem
  Heizkreis-Mittelwert, mit Quellenangabe; bei elektronischem Versand optional
  nur Verweis auf eine URL.
- Validator: `heating.consumption_benchmark_missing` nur noch, wenn keine
  Referenz zugeordnet ist; neue Warnung bei Referenz aus fremdem Jahr.
- Tests: Schema-Roundtrip, Berechnung kWh/m², PDF-Text mit/ohne Referenz.

### 2. Witterungsbereinigter Vorperiodenvergleich (Abs. 3 Nr. 5)

- Verfahren nach der Bundesanzeiger-Vereinfachung (BMWi/BMI): Heizwärme mit
  Gradtagszahlen (G20/15) des Standorts bereinigen, Warmwasser unbereinigt
  addieren.
- Datenquelle: monatliche Gradtagszahlen des Deutschen Wetterdienstes
  (Klimafaktoren/Gradtagszahlen je Postleitzahl bzw. nächster Station, frei
  verfügbar) oder Werte des Messdienstes; als Tabelle
  `degreeDays { stationId, year, month, g20_15 }` importieren, Zuordnung
  `property.weatherStationId` (Vorschlag aus PLZ).
- Formel (Skizze): `GT_P = Σ Gradtage der Monate im Abrechnungszeitraum`,
  `GT_ref = langjähriges Mittel`; `Q_heiz,ber = Q_heiz × GT_ref / GT_P`;
  `Q_ges,ber = Q_heiz,ber + Q_ww`. Für beide Perioden rechnen und als
  Balkenpaar darstellen. Unterjährige Nutzung: Gradtage nur der
  Nutzungsmonate.
- Datenmodell: `previousConsumption` um `heatKwh`, `hotWaterKwh`,
  `degreeDays` erweitern; Vorjahr bevorzugt aus gespeicherter
  Vorjahresberechnung.
- PDF: Text `PREVIOUS_PERIOD_NOT_WEATHER_ADJUSTED` ersetzen durch Hinweis auf
  Verfahren, Station und Gradtagszahlen beider Perioden; Einheit kWh.
- Validator: Warnung bei fehlender Station/fehlenden Gradtagen; Fehler, wenn
  Vergleich nur unbereinigt möglich.
- Tests: Formel mit festen Gradtagen, Teilperiode, fehlende Daten,
  Snapshot der Grafik.

### 3. Warmwasser-Energie je Nutzer (Abs. 3 S. 2)

- Berechnung: Warmwasserenergie nach § 9 HeizKV (Wärmezähler oder
  Formel 2,5 kWh/(m³·K) × V × (t_w − 10 °C)) und Verteilung nach
  Warmwasserzähler bzw. Personen; Ergebnis in `calculation.tenants[].hotWaterKwh`.
- Grundlage für Nr. 5 und für die monatliche Information.

### 4. Fernwärme: THG-Emissionen und Primärenergiefaktor (Abs. 3 Nr. 1a)

- `energySourceSchema` um `kind` (Enum statt Freitext), `districtHeatingGhgKg`
  (jährliche THG-Emissionen, t CO2-Äq.) und `primaryEnergyFactor` ergänzen
  (Angaben des Fernwärmeversorgers, § 1 Abs. 3 FFVAV).
- PDF: Zeile im § 6a-Block; Validator-Fehler bei Fernwärme ohne Angaben.

### 5. Steuern/Abgaben und Messentgelte beziffern (Abs. 3 Nr. 1b, 1c)

- Rechnungen: Felder `vatCents`, `energyTaxCents`, `co2LevyCents` je
  Energielieferung/-rechnung; Summe je Heizkreis im PDF statt Pauschaltext.
- Kostenart-Flag `isMeteringFee` statt `METERING_FEE_PATTERN`; Migration setzt
  Flag aus bisheriger Erkennung. Tests für beide Fälle.

### 6. Monatliche Verbrauchsinformation (Abs. 1/2)

- Datenmodell: `meter.remoteReadable: boolean`, `meter.remoteReadableSince`;
  `meterReading.source` um `remote` erweitern; Monatswerte als Ablesestände
  zum Monatsende.
- Import: CSV/Excel-Exporte der Messdienste (Techem, ista, Brunata, Minol,
  Kalo) in `packages/import-export`, Mapping Gerätenummer → Zähler,
  Plausibilitätsprüfung (Rücklauf, Lücken).
- Berechnung: Monatsverbrauch je Nutzer in kWh (HKV über Umrechnungsfaktor
  aus letzter Jahresabrechnung), Vormonat, Vorjahresmonat, Referenzwert
  (Bauliste 1, monatlich nach Gradtagen gewichtet).
- Ausgabe: neues PDF `monthly-consumption-info.ts` (eine Seite je Nutzer)
  plus E-Mail-Text; Versandprotokoll je Monat.
- Validator: Fehler, wenn fernablesbare Zähler vorhanden, aber Monatsinfo für
  einen Monat nicht erzeugt/versandt.
- Tests: Import-Parser je Format, Monatsberechnung, PDF-Inhalt nach Abs. 2
  Nr. 1–3.

### 7. Kleinigkeiten

- Schlichtungsstellen-Text aktualisieren (Abs. 3 Nr. 3).
- Test: § 6a-Block bei reiner Flächenverteilung nach § 9a Abs. 2 (Abs. 5).
