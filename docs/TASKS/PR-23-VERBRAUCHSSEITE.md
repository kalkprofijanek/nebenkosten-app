# Verbrauchsseite für Zählerstände und Schätzung

Stand: 4. Oktober 2026. Ausgangspunkt: 1.2.2, Commit 2aefbe4.

## Änderungsgrund

Zählerstände und Verbrauchseinheiten lagen im Bearbeitungsformular einzelner
Nutzer. Für die Jahresarbeit fehlte eine Gesamtsicht; die Schätzung nach § 9a
HeizKV war nur sichtbar, wenn sie möglich war, ohne Begründung im Fehlerfall.

## Vertrag

- Neue Route `/verbrauch` zwischen `/nutzer` und `/vorauszahlungen`;
  Deep-Link `#/verbrauch?occupancy=<Nutzerzeitraum>` hebt die Zeile hervor.
- Neuer Befehl `updateOccupancyConsumption` ändert ausschließlich
  `consumptionUnits`, `consumptionUnitsEstimated`,
  `consumptionUnitsEstimateReason`, `heatMeterReading`, `coldWater` und
  `warmWater` einer
  Mieter-Belegung. Fehlende Felder werden entfernt; alle anderen Angaben
  bleiben unverändert. Gesperrte Jahre laufen über
  `applyEditableBillingPeriodChange`.
- `explainConsumptionEstimate` liefert Schätzung oder Hinderungsgrund;
  `estimateConsumptionUnits` bleibt unverändert nutzbar.
- Die Nutzerbearbeitung übergibt die gespeicherten Verbrauchs- und
  Wasserwerte unverändert an `updateTenantOccupancy`.
- Validator (Nutzerentscheidung 4. Oktober 2026): `heating.meter_reading_mismatch`
  entfällt bei begründeter Schätzung (`consumptionUnitsEstimated` und nicht
  leerer Schätzgrund); ohne Schätzgrund bleibt die Warnung.
- Keine Schemaänderung, keine Migration, keine Änderung am Rechenweg oder an
  Legacy. Version 1.3.0.

## Tests

Oberflächentests für Übersicht, Befehl, Schätzbegründung und Seite
(Schätzen, Übernehmen, Sammelschätzung, Fehler, Sperre, Deep-Link);
Browserfall `tests/e2e/consumption-page.spec.ts` bei 1440 px ohne
horizontalen Seitenüberlauf. Bestehende Tests der Nutzerbearbeitung und
Prüflinks wurden auf das neue Ziel angepasst.

## Offene fachliche Entscheidungen

- § 9a Abs. 2 HeizKV ist zwingend: Bei mehr als 25 % geschätzter Fläche sind
  die Kosten ausschließlich nach Fläche oder umbautem Raum zu verteilen. Die
  Seite zeigt dazu bisher nur einen Hinweis. Offen ist die Umsetzung im
  Rechenkern (automatische Umstellung, Sperre der Freigabe oder Warnung).
- Leerstandsverbrauch bleibt vorerst in der Nutzerbearbeitung.
