# ADR-0007: Gradtagszahlen nach VDI 2067 im Core

- Status: angenommen (Core); Aufteilung in der Oberfläche und Übergabe des
  Nutzungszeitraums im PDF folgen (`docs/TASKS/PR-27-GRADTAGSZAHLEN.md`)
- Datum: 2026-10-10
- Entscheidung des Nutzers (10. Oktober 2026): Weiterarbeit nach Vorschlag

## Kontext

1. § 9b Abs. 2 HeizKV: Ohne Zwischenablesung bei Nutzerwechsel sind die
   verbrauchsabhängigen Kosten nach Gradtagszahlen oder zeitanteilig auf Vor-
   und Nachnutzer aufzuteilen, Warmwasser zeitanteilig. Die App rechnet die
   Aufteilung bisher nicht selbst (README „Was noch fehlt“); sie wurde im
   KI-Ablauf nach VDI 2067 vorgenommen und als Verbrauch je Nutzung erfasst.
2. Der Vergleich mit dem Durchschnittsnutzer (ADR-0004) rechnete einen
   Teilzeitraum linear nach Tagen auf ein Jahr hoch. Wer nur im Winter
   wohnte, wurde dadurch zu hoch, wer nur im Sommer wohnte, zu niedrig
   eingestuft.

## Entscheidung

1. **Tabelle** (`packages/core/src/heating/degree-days.ts`): Promille je
   Monat Jan 170, Feb 150, Mär 130, Apr 80, Mai 40, Jun–Aug zusammen 40, Sep
   30, Okt 80, Nov 120, Dez 160 (Summe 1.000). Weil die veröffentlichten
   Tabellen Juni bis August unterschiedlich ausweisen, gelten diese drei
   Monate als ein Block. Innerhalb eines Monats bzw. des Blocks wird je
   Kalendertag gleichmäßig verteilt (Schaltjahr: Februar 29 Tage).
   Bundeseinheitliche Tabelle, keine Standortdaten.
2. **`degreeDayPermille(from, to)`**: Anteil eines Zeitraums (beide Tage
   einschließlich); ein Jahr ergibt 1.000 ‰, auch bei abweichendem
   Zwölfmonatszeitraum.
3. **`splitByDegreeDays(total, periods)`**: Aufteilung eines Verbrauchs im
   Verhältnis der Gradtagsanteile, drei Nachkommastellen, Rundungsrest beim
   größten Anteil (Summe = Verbrauch). Die Aufteilung ist **keine Schätzung**
   nach § 9a HeizKV; das Kennzeichen `consumptionUnitsEstimated` bleibt
   unberührt, damit die 25-%-Grenze des § 9a Abs. 2 nicht ausgelöst wird.
   Die Herleitung steht im Erläuterungstext der Nutzung
   (`consumptionUnitsEstimateReason`), den die Einzelabrechnung bereits unter
   „Ihre Verbrauchserfassung“ ausgibt. Keine Schemaänderung.
4. **Vergleich mit dem Durchschnittsnutzer** (Änderung an ADR-0004):
   `compareTenantWithConsumptionBenchmark` nimmt optional den Nutzungs- und
   Abrechnungszeitraum (`usage`). Dann wird die **Heizwärme** nach
   Gradtagszahlen, das **Warmwasser** weiter nach Tagen hochgerechnet
   (`annualization: 'degree_days'`); ohne Angabe bleibt es linear
   (`'linear'`). Die Klassengrenzen werden mit demselben Verhältnis auf den
   Nutzungszeitraum umgerechnet.

## Nachtrag (ADR-0009, 10. Oktober 2026)

Nach dem Wortlaut von § 9b HeizKV ist die **Zwischenablesung bei jedem
Nutzerwechsel Pflicht** (Abs. 1). Die Aufteilung nach Gradtagszahlen ist der
Ausweg nach Abs. 3, wenn die Ablesung nicht möglich war oder keine
hinreichend genaue Ermittlung zulässt; der Grund ist festzuhalten.

## Offene Entscheidungen

- **Gradtage oder zeitanteilig?** § 9b Abs. 2 lässt beides zu. Die App bietet
  Gradtage an; die Wahl trifft der Vermieter je Fall.
- **Mindestanteil für eine Zwischenablesung:** In der Praxis wird bei kurzen
  Nutzungszeiten eine Zwischenablesung empfohlen; eine Prüfregel dafür wird
  ohne Nutzerentscheidung nicht eingeführt.
- **Witterungsbereinigung bei Teilzeitraum (ADR-0005)** bleibt beim Faktor
  des ganzen Zeitraums; eine Gewichtung mit dieser Tabelle wäre möglich,
  ersetzt aber keine Standortdaten.

## Tests

- `packages/core/tests/degree-days.test.ts`: Jahressumme (auch Schaltjahr,
  abweichender Zeitraum), Monate, Sommerblock, Tagesanteile, Fehler,
  Aufteilung 450 : 550 bei Auszug zum 31.03., Rundungsrest.
- `packages/core/tests/consumption-benchmark.test.ts`: Hochrechnung nach
  Gradtagen (Handrechnung), `linear` und `none`.

## Migrationsauswirkungen

Keine; keine Schemaänderung. Ohne `usage` rechnet der Vergleich wie bisher.
