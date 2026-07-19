# Testmatrix: Rechenbereiche (Masterplan 6.2) je Characterization-Fall

Stand: PR 05. Zuordnung der 15 Golden-Fixtures zu den zu erhaltenden
Berechnungsbereichen aus Masterplan Abschnitt 6.2. `X` = Bereich wird durch
diesen Fall gezielt geprüft; `(x)` = Bereich ist im Fall vorhanden, aber nicht
sein Schwerpunkt.

Fälle: 01 Volljahr · 02 Nutzerwechsel · 03 Leerstand · 04 Mehrere Häuser ·
05 Mehrere Heizkreise · 06 Heizöl FIFO · 07 Pellets · 08 Wärmepumpe ·
09 Hybrid · 10 Zentrales WW · 11 Dezentrales WW · 12 CO₂-Aufteilung ·
13 Direktkosten · 14 Fehlende Zuordnung · 15 Negative Werte.

| Rechenbereich (6.2) | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tagegenaue Nutzerzeiträume | X | X | X | (x) | (x) | (x) | (x) | (x) | (x) | (x) | (x) | (x) | (x) | (x) | (x) |
| Leerstand | | | X | | | | | | | | | | | | |
| Nutzerwechsel | | X | | | | | | | | | | | | | |
| Umlage nach Nutzfläche (m²) | X | X | X | X | | | | | | | | | X | | X |
| Umlage nach beheizter Fläche | | | | | X | X | X | X | X | X | X | X | | X | X |
| Umlage nach Verbrauchseinheiten | | | | | X | X | X | X | X | X | X | X | | X | X |
| Umlage je Nutzungseinheit (Kopfteil) | | | | X | | | | | | | | | | | |
| direkte Zuordnung | | | | | | | | | | | | | X | | |
| Kostenaufteilung je Gebäude/Heizkreis | | | | X | X | | | | | | | | | | |
| Vorauszahlungen | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Kontrollsummen | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Kosten ohne Zuordnung | | | | | | | | | | | | | X | X | |
| Heizungsbetriebskosten | | | | | X | | | | | | | | | X | |
| Brennstoffanfangsbestand | | | | | | X | | | | | | | | | |
| Lieferungen | | | | | X | X | X | X | X | X | X | X | | X | X |
| Restbestand | | | | | | X | | | | | | | | | |
| FIFO-Bewertung | | | | | (x) | X | (x) | (x) | (x) | (x) | (x) | (x) | | (x) | (x) |
| Brennstoffverbrauchskosten | | | | | X | X | X | X | X | X | X | X | | X | X |
| Grund- und Verbrauchskosten | | | | | X | X | X | X | X | X | X | X | | X | X |
| 50–70 % Verbrauchsanteil | | | | | X | X | X | X | X | X | X | X | | X | X |
| Warmwasseranteil | | | | | | | | | | X | X | | | | |
| mehrere Energiequellen | | | | | | | | | X | | | | | | |
| Wärmepumpe plus Spitzenlast | | | | | | | | | X | | | | | | |
| CO₂-Menge | | | | | (x) | (x) | (x) | (x) | X | (x) | (x) | X | | (x) | (x) |
| CO₂-Kosten | | | | | | | | | X | | | X | | | |
| Vermieter-/Mieteranteil | | | X | | | | | | X | | | X | | X | |
| Jahres-/Teiljahreshochrechnung | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – |
| Rundungsdifferenzen | | | | | | | | | (x) | | | X | | | |
| Abrechnung je Nutzer | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |
| Gesamtabrechnung | X | X | X | X | X | X | X | X | X | X | X | X | X | X | X |

## Anmerkungen

- **Jahres-/Teiljahreshochrechnung** (`–`): Im Legacy-Bestand wird keine
  Geldbetrags-Hochrechnung auf das Jahr durchgeführt (nur der CO₂-Kennwert wird
  für die Stufenermittlung mit `365/Periodentage` hochgerechnet — enthalten in
  den CO₂-Fällen). Es gibt daher keinen eigenen Fall.
- **Betriebsstrom-Reallokation** (Heizungs-Betriebsstrom aus Allgemeinstrom,
  `bsFactor`; `legacy/behavior-map.md` Risiko 8.7) ist **nicht** in den 15
  Mindestfällen enthalten und bewusst auf **PR 07** (Heizkosten-/CO₂-Modul)
  verschoben. Alle Fixtures setzen `operatingElectricityPercent = 0`.
- **Rundungsdifferenzen**: `case-12-co2-split` erzeugt bewusst einen Restcent
  (Summe der gerundeten Nutzeranteile = Gesamtsumme − 1 Cent). Regeln dazu in
  `docs/ROUNDING.md` Abschnitt 5.
- **CO₂**: In `05/06/07/10/11/14/15` ist der CO₂-Preis bewusst 0 €/t (bzw. der
  Faktor 0 bei der Wärmepumpe), damit die reine Heizkostenaufteilung
  hand-nachvollziehbar bleibt; CO₂-**Kosten** und -**Aufteilung** prüfen gezielt
  `09` (Hybrid) und `12` (Stufenmodell).
