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
  `consumptionUnitsEstimateReason` und `heatMeterReading` einer
  Mieter-Belegung. Fehlende Felder werden entfernt; alle anderen Angaben
  bleiben unverändert. Gesperrte Jahre laufen über
  `applyEditableBillingPeriodChange`.
- `explainConsumptionEstimate` liefert Schätzung oder Hinderungsgrund;
  `estimateConsumptionUnits` bleibt unverändert nutzbar.
- Die Nutzerbearbeitung übergibt die gespeicherten Verbrauchswerte
  unverändert an `updateTenantOccupancy`.
- Keine Schemaänderung, keine Migration, keine Änderung an Rechenweg,
  Validatoren oder Legacy.

## Tests

Oberflächentests für Übersicht, Befehl, Schätzbegründung und Seite
(Schätzen, Übernehmen, Sammelschätzung, Fehler, Sperre, Deep-Link);
Browserfall `tests/e2e/consumption-page.spec.ts` bei 1440 px ohne
horizontalen Seitenüberlauf. Bestehende Tests der Nutzerbearbeitung und
Prüflinks wurden auf das neue Ziel angepasst.

## Offene fachliche Entscheidungen

- § 9a Abs. 2 HeizKV: Bei mehr als 25 % geschätzter Fläche zeigt die Seite
  nur einen Hinweis. Ob die Berechnung dann automatisch auf Flächenverteilung
  umstellt, ist offen.
- Die Freigabeprüfung meldet `heating.meter_reading_mismatch` auch bei
  geschätzten Werten (z. B. defekter Zähler mit Stand alt = Stand neu). Ob eine
  begründete Schätzung diese Warnung unterdrücken soll, ist offen; bis dahin
  wird sie in der Freigabe bestätigt.
- Kalt-/Warmwasser und Leerstandsverbrauch bleiben vorerst in der
  Nutzerbearbeitung.
