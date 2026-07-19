# PR 06 – Core-Berechnungsengine

Verantwortlich: Codex. Review: Claude. Freigabe: Mensch.
Bezug: Masterplan Abschnitt 6.2/6.3, 9.5 und 20 (PR 06).

## Ziel

Eine deterministische, DOM- und Storage-freie Rechenengine für das v4-Datenmodell
bereitstellen. Der Eingabevertrag selektiert genau eine Abrechnungsperiode,
validiert den vollständigen Datenstand und erzeugt einen tief eingefrorenen
Snapshot. Die Ausgabe enthält ausschließlich reproduzierbare Ergebnisdaten in
Cent sowie Mengen- und Prozentwerte.

## Umfang

- `createCalculationInput(appData, billingPeriodId)`:
  - Laufzeitvalidierung gegen `appDataFileSchema`,
  - Selektion des verbundenen Objekt- und Periodengraphen,
  - Prüfung der rechenrelevanten Fremdschlüssel,
  - defensive Kopie und tiefes Einfrieren des Snapshots.
- `calculateBilling(input)` als reine Rechenfunktion:
  - inklusive Perioden- und Belegungstage,
  - Monats- und Jahresvorauszahlungen,
  - Umlage nach Nutzfläche, beheizter Fläche, Verbrauch und Wohneinheit,
  - Objekt-, Gebäude- und Hausbereich,
  - Umlagegrade je Kostenart oder Beleg,
  - Leerstand, Direktkosten und nicht umlagefähige interne Kosten,
  - Kontrollidentität und Ergebnisstatus,
  - Rundung an der Ausgabegrenze in ganzen Cent.
- Legacy-kompatible Basis für die bereits in PR 05 enthaltenen Heiz-/CO₂-
  Goldens: Brennstoffbestand und Lieferungen, FIFO-Restbewertung, mehrere
  Energiequellen, Grund-/Verbrauchsanteil, Warmwasser und CO₂-Stufenmodell.
  Die fachliche Erweiterung, Nachvollziehbarkeit und
  Betriebsstrom-Reallokation bleiben Gegenstand von PR 07.
- Versionierter Ergebnisvertrag mit `snapshotFormatVersion: 1`.

## Reine Schnittstelle

```ts
const input = createCalculationInput(appData, billingPeriodId)
const result = calculateBilling(input)
```

Die Engine liest weder DOM noch Browser-Storage, führt keine Netzwerkzugriffe
aus und mutiert weder `appData` noch den erzeugten Snapshot.

## Tests

- Unit-Tests für Zeitraum, Belegung, Vorauszahlungen, Rundung und
  Eingabeselektion.
- Validierte Randfalltests für alle Umlageschlüssel, Umlagegrade,
  Brennstoff-Mengeneinheiten, optionale Heizangaben, negative Anteile und alle
  zehn automatischen CO₂-Stufen.
- 15 vollständige Characterization-Vergleiche gegen die in PR 05 freigegebenen
  Legacy-Golden-Werte.
- Core-Coverage-Gate: mindestens 80 % für Statements, Branches, Functions und
  Lines.

## Verbindliche Ergebnisse

- Alle 15 Legacy-Vergleichsfälle stimmen vollständig überein.
- Cent-Rundung erfolgt einmalig an der Ausgabegrenze mit
  `roundCentsHalfAwayFromZero`.
- Die Kontrolldifferenz wird als eigener Cent-Wert ausgewiesen; die
  Freigabegrenze bleibt 1 Cent gemäß menschlicher Entscheidung in
  `docs/ROUNDING.md`.
- Direktkosten und `NICHT_UML` bleiben entsprechend den freigegebenen
  Legacy-Goldens informativ außerhalb der Kontrollidentität.

## Noch erforderliche menschliche Entscheidung

Das Restcent-Verfahren aus `docs/ROUNDING.md`, Abschnitt 5/8, ist weiterhin
offen. Die Engine bewahrt bis zu dieser Entscheidung das durch die Golden-Werte
festgelegte Legacy-Verhalten: volle Zwischenpräzision, unabhängige Rundung der
Ausgabezeilen und keine nachträgliche Restcent-Umverteilung. Eine Umstellung auf
das größte-Rest-Verfahren benötigt eine bewusste fachliche Freigabe und
angepasste Zieltests; sie darf nicht stillschweigend erfolgen.

## Akzeptanzkriterien

- Keine DOM-, React-, Browser- oder Storage-Abhängigkeit im Core-Paket.
- Eingaben werden an der Systemgrenze validiert und als unveränderlicher
  Snapshot verarbeitet.
- Alle 15 Golden-Vergleiche sowie Unit-, Architektur- und Privacy-Tests sind
  grün.
- Coverage liegt in allen vier Kategorien über 80 %.
- `legacy/index.html` bleibt unverändert.

## Nicht Teil dieses PR

- Betriebsstrom-Reallokation und der erweiterte nachvollziehbare
  Heiz-/CO₂-Rechenweg (PR 07).
- Persistenz und Backup (PR 08).
- UI und PDF-Ausgabe.
