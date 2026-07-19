# PR 07 – Heizkosten- und CO₂-Modul

Bezug: Masterplan Abschnitt 20, PR 07.

## Ziel

Den in PR 06 eingeführten Core-Rechenweg für Heizkosten und CO₂ fachlich
vollständig nachvollziehbar machen und die Betriebsstrom-Reallokation
summenneutral ergänzen. Die 15 freigegebenen Legacy-Goldens bleiben
unverändert.

## Umfang

- Ergebnisvertrag auf `snapshotFormatVersion: 2` anheben.
- Eigenständig versionierten Heizkosten-Trace
  `traceFormatVersion: 1` bereitstellen.
- Anfangsbestand, Lieferungen, Restbestand und FIFO je Energiequelle
  offenlegen.
- Energie- und CO₂-Mengen sowie automatische oder manuelle
  Mieter-/Vermieter-Aufteilung getrennt ausweisen.
- Zentralen Warmwasseranteil vor dem Heiztopf separat ausweisen und verteilen.
- Heiztopf anschließend in Grund- und Verbrauchskosten aufteilen
  (Standard 30/70).
- Betriebsstrom budgetgedeckt aus markierten Stromkosten in die Heizkosten
  umbuchen:
  - gebäudespezifische Quellen vor globalen Quellen,
  - gebäudespezifische Quellen nur für das eigene Gebäude,
  - globale Quellen proportional nach verbleibendem Soll,
  - keine Überschreitung von Quellenbudget oder Heizkreis-Soll,
  - ungedeckte Beträge explizit ausweisen,
  - Abzug und Zugang in identischer Cent-Höhe.
- Ausgabegrenzen nach `docs/ROUNDING.md` runden und Verteilungen mit dem
  Größter-Rest-Verfahren summenerhaltend machen.

## Ergebnisverträge

- Snapshot v2 enthält die kompakten Abrechnungsergebnisse, den
  Betriebsstrom-Überblick und den Trace.
- Trace v1 enthält je Heizkreis:
  - Energiequellen und FIFO-Lose,
  - CO₂-Rechenweg,
  - Warmwasser-Rechenweg,
  - Heizungsbetriebskosten,
  - Betriebsstrom-Soll, -Zugang und -Unterdeckung,
  - Grund-/Verbrauchskosten-Aufteilung,
  - centgenaue Abstimmung vom FIFO-Verbrauchswert bis zum Heiztopf mit
    expliziter reiner Rundungsdifferenz.
- Der Trace erklärt den Snapshot und führt keine zweite Berechnung ein.

Die fachliche Detailbeschreibung steht in `docs/HEATING-CO2.md`.

## Tests

Neue PR-07-Core-Tests decken ab:

- vollständig gedeckte Netto-null-Umbuchung,
- Umbuchung mit unzureichendem Quellenbudget,
- Vorrang und Gebäudegrenze einer gebäudespezifischen Quelle,
- sichere Behandlung einer Haus-Quelle ohne eindeutige Heizkreis-Zuordnung,
- Snapshot v2 und Trace v1,
- vollständige Trace-Kette für FIFO, CO₂, Warmwasser, Betriebsstrom und
  70/30-Aufteilung.

Die 15 Characterization-Fälle bleiben aktiv und unverändert. Alle setzen den
Betriebsstromprozentsatz auf 0 %. Damit prüfen sie weiterhin exakt den
freigegebenen Legacy-Stand; die neue Betriebsstromfunktion wird bewusst in den
zusätzlichen Core-Tests geprüft. Die einzige bereits freigegebene
Golden-Abweichung bleibt der Restcent in `case-12-co2-split`.

## Akzeptanzkriterien

- Alle 15 Legacy-Vergleichsfälle bestehen.
- Der Rechenweg ist in Snapshot v2 über Trace v1 maschinenlesbar
  nachvollziehbar.
- FIFO wird je Energiequelle berechnet; Quellen werden nicht vermischt.
- CO₂ und Warmwasser bleiben als eigenständige Rechenschritte sichtbar.
- Grund- und Verbrauchskosten ergeben gemeinsam den Heiztopf.
- Objektweite Heiz- und CO₂-Summen entsprechen der Summe ihrer centgenauen
  Heizkreis-Ergebnisse.
- Die Betriebsstrom-Umbuchung ist budgetgedeckt und netto null.
- Gebäudespezifische Quellen werden vor globalen proportionalen Quellen
  verwendet.
- Verteilungen sind bis auf die dokumentierte 1-Cent-Regel summenerhaltend.
- Core-Coverage bleibt in Statements, Branches, Functions und Lines über
  80 %.
- `legacy/index.html` bleibt unverändert.

## Nicht Teil dieses PR

- Persistenz, IndexedDB, Backups, Wiederherstellung und Versionsschutz
  (PR 08).
- Routing, Formulare und Bedienoberfläche (PR 09).
- Formelle und fachliche Freigabeprüfungen, Fehlerklassen und Sperrlogik
  (PR 10).
- PDF- und Exportausgabe (PR 11).
