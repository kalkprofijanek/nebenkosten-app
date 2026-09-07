# Heizkostenprüfung und PR 20

Prüfstand: öffentlicher `main` bei `b505c284` (PR #40), 7. September 2026.
Alle hier verwendeten Personen, Mengen und Geldbeträge sind frei erfunden.
Dieser Bericht beschreibt das implementierte Verhalten; er bestätigt keine
rechtliche Eignung der Berechnungsregeln. Schema v4 und Rechenengine bleiben
unverändert. Die fachlichen Lücken werden nicht durch neue Regeln überdeckt.

## 1. Heizkostentopf und FIFO

Der Ablauf in `packages/core/src/calculation/calculate-billing.ts`
(`prepareCircuits`, `rawCircuitResults`) lautet je Gebäude/Heizkreis:

1. Verbrauchskosten aller zugehörigen Energiequellen nach FIFO addieren.
2. Gesamte CO₂-Kosten abziehen; Mieter- und Vermieteranteil getrennt ausweisen.
3. Bei zentralem Warmwasser den konfigurierten Prozentsatz vom Brennstoffwert
   nach CO₂ abtrennen.
4. Umlagefähige Heizkostenarten mit explizitem Gebäudebereich addieren.
5. Tatsächlich gedeckten Betriebsstrom aus markierten Stromkostenarten umbuchen.
6. Verbleibenden Heiztopf in Grund- und Verbrauchskosten aufteilen.

Eine Kostenart verwendet die Summe ihrer Kostenpositionen, sobald mindestens
eine Position existiert; sonst ihren Gesamtbetrag. Beide werden nicht addiert.
Umlagefähige Prozentsätze werden berücksichtigt. Ein Brennstoffbeleg gehört
in die Lieferungen. Wird derselbe Betrag zusätzlich als Heiznebenkosten erfasst,
ist das kein automatischer Dublettenabgleich.

### Erfassung und Bewertung

Unter **Heizkreise → Brennstoffe → Aktive Energiequelle** werden
Anfangsmenge, Anfangswert bzw. Anfangspreis, Restmenge und Lieferungen mit Datum,
Menge, Einheit und Rechnungsbetrag erfasst. Bestände/Lieferungen verweisen auf
`energySourceId` und `billingPeriodId`. Die Quelle verweist auf den Heizkreis.
Bei Lieferungen stammt der Preis aus `amountCents / quantity.value`.
Beim Anfangsbestand hat ein erfasster `openingValueCents` Vorrang vor
`openingQuantity × openingPricePerUnitCents`; ein Widerspruch wird nicht
automatisch abgeglichen.

`packages/core/src/heating/fuel.ts` sortiert zuerst Anfangsbestände nach ID,
danach Lieferungen nach Datum und bei Gleichstand nach ID. Ein fehlendes Datum
sortiert vor datierten Lieferungen. Der Rest wird rückwärts aus den jüngsten
Losen bewertet. Somit wird zuerst der Anfangsbestand, danach die älteste
Lieferung verbraucht. Mengen und Rechnungswerte bleiben am jeweiligen Los.
FIFO läuft getrennt je Energiequelle, nicht über Öl und Strom gemeinsam.

Unterjährige Lieferungen werden vollständig in die Jahresbilanz aufgenommen;
das Datum bestimmt die Reihenfolge, nicht einen zeitanteiligen Rechnungsbetrag.
Die UI-Commands lehnen ein Lieferdatum außerhalb der Abrechnungsperiode ab.
Der Core-Eingang filtert dagegen nach Perioden-ID, nicht nochmals nach dem Datum.

**Folgejahr:** `createBillingPeriod` legt nur eine neue Abrechnungsperiode an.
Es überträgt keine Bestände, Quellen oder FIFO-Lose. Eine manuelle Übernahme
von Restmenge und Restwert ist möglich. Werden mehrere verbleibende Lose zu
einem einzigen Anfangswert zusammengefasst, bleiben ihre unterschiedlichen
Einzelpreise für eine spätere Teilentnahme nicht erhalten.

### Fehlende und widersprüchliche Werte

- Die Erfassung blockiert negative Mengen und gemischte Einheiten derselben
  Quelle. Auch die Engine wirft bei gemischten Einheiten einen Fehler.
- Die Core-Funktion begrenzt negative Mengen auf null. Fehlende Restmenge wirkt
  rechnerisch wie null. Das ist keine Bestätigung, dass der Bestand erhoben wurde.
- Bei Restmenge über verfügbarer Menge wird nur die verfügbare Menge bewertet;
  `overstockQuantity` zeigt den Überschuss. Ein spezieller Freigabefehler für
  diesen Fall fehlt derzeit.
- Sind alle Mengen null/fehlend, werden Beträge als
  `direct_cost_without_quantity` verarbeitet. Sobald irgendein Los eine positive
  Menge hat, lautet der Quellenmodus `fifo`; ein zusätzliches Los ohne Menge
  kann trotzdem seinen Betrag vollständig in den Verbrauchskosten belassen.
- Fehlende Preise/Beträge werden im Core teilweise als null angesetzt. Die
  Freigabe prüft unter anderem Beleg- und Buchungsverknüpfungen; sie ersetzt
  keine vollständige mengenbezogene FIFO-Plausibilitätsprüfung.

### Fiktives Rechenbeispiel (Jahr 2024)

| Los            |   Menge | Rechnungs-/Bestandswert | Preis/l | Verbrauch | Verbrauchskosten |    Rest |   Restwert |
| -------------- | ------: | ----------------------: | ------: | --------: | ---------------: | ------: | ---------: |
| Anfangsbestand | 1.000 l |                800,00 € |  0,80 € |   1.000 l |         800,00 € |     0 l |     0,00 € |
| 15.02.         | 1.200 l |              1.320,00 € |  1,10 € |   1.200 l |       1.320,00 € |     0 l |     0,00 € |
| 15.06.         |   800 l |                720,00 € |  0,90 € |     500 l |         450,00 € |   300 l |   270,00 € |
| 15.10.         | 1.500 l |              1.800,00 € |  1,20 € |       0 l |           0,00 € | 1.500 l | 1.800,00 € |
| Summe          | 4.500 l |              4.640,00 € |         |   2.700 l |       2.570,00 € | 1.800 l | 2.070,00 € |

Rechnung: `4.500 − 1.800 = 2.700 l`; Restwert
`1.500 × 1,20 + 300 × 0,90 = 2.070,00 €`; Verbrauchskosten
`4.640,00 − 2.070,00 = 2.570,00 €`.

Für die transparente Abstimmung sind CO₂ manuell auf 0 und zentrales
Warmwasser ausgeschaltet. Das sind Testparameter, keine fachliche Empfehlung.
Heizungswartung: 200,00 €. Markierter Allgemeinstrom: 200,00 €.
Betriebsstrom-Soll: 5 % von 2.570,00 € = 128,50 €; dieses Budget ist gedeckt.

**Heiztopf = 2.570,00 + 200,00 + 128,50 = 2.898,50 €.**
Grundkosten 30 % = 869,55 €; Verbrauchskosten 70 % = 2.028,95 €.
71,50 € verbleiben bei Allgemeinstrom. Bei zwei ganzjährig belegten Wohnungen
mit Flächen- und Verbrauchsverhältnis 40:60 ergeben sich inklusive dieses
Reststroms 1.188,00 € und 1.782,00 €; Gesamtkosten 2.970,00 €,
Kontrolldifferenz 0,00 €.

Der Integrationstest `tests/integration/pr20-heating-audit.test.ts` vergleicht
diese unabhängig gerechneten Zahlen mit der unveränderten Engine. Er übergibt
die Lieferungen absichtlich unsortiert und prüft Reihenfolge, Menge, Restwert,
Verbrauchskosten, Heiztopf, Split, Nutzerbeträge und unveränderte Eingaben.
Der Core-Trace enthält Lose und Quellenaggregate, aber noch keine eigene
Verbrauchs-/Restzeile je Los; die obige Losaufteilung ist manuell hergeleitet.

## 2. Heizkostenzuordnung

```text
Lieferung → Energiequelle → jahresbezogener Heizkreis → Gebäude
Kostenposition → Kostenart mit kind=heating und scope=building → Gebäude
Bankbuchung → Verknüpfung/Belegnachweis (kein zweiter Kostenbetrag)
Gebäude → Heiztopf → Grund-/Verbrauchskosten
Wohnung + ggf. Kostenbereich des Nutzerzeitraums → wirksames Gebäude
Nutzerzeitraum → Fläche × Zeit bzw. manuelle Verbrauchseinheiten
→ Nutzeranteil / Vermieteranteil bei Leerstand → Snapshot → PDF

Zähler → gespeicherte Ablesungen
       [derzeit keine Verbindung zur Verbrauchsberechnung]
```

| Entität          | Tatsächliche Bedeutung                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Objekt           | Oberer Kontext von Gebäuden, Wohnungen und Abrechnungsperioden                                             |
| Gebäude          | Operativer Schlüssel der Heizkostenberechnung                                                              |
| Heizkreis        | Ein Heizkreis je Gebäude und Jahr wird durch UI-Commands erzwungen; die Engine verwendet `find` je Gebäude |
| Energiequelle    | Ein oder mehrere getrennte Brennstofftöpfe innerhalb eines Heizkreises                                     |
| Wohnung          | Stammdaten mit Gebäude, Nutz- und beheizter Fläche                                                         |
| Nutzer/Leerstand | Jahresbezogener Zeitraum mit Wohnungsreferenz und ggf. `costScope`                                         |
| Kostenart        | `kind=heating` und `scope.kind=building` bestimmen Aufnahme in den Heiztopf                                |
| Kostenposition   | Betrag unter einer Kostenart; keine direkte Heizkreis-ID                                                   |
| Bankbuchung      | Belegverknüpfung/Zuordnung, nicht direkt im CalculationInput als Kostenquelle                              |
| Zähler           | Objektbezogene Stammdaten; optionale Energiequellenreferenz                                                |
| Zählerstand      | Gespeicherte Ablesung ohne aktuelle Verteilungswirkung                                                     |

Ein `costScope` vom Typ Gebäude am Nutzerzeitraum hat Vorrang vor
`Unit.buildingId`. Damit kann die für die Rechnung wirksame Gebäudezuordnung
von den Wohnungsstammdaten abweichen. Allgemeine Objekt-/Haus-Scopes von
Heizkostenarten gelangen nicht über den gebäudespezifischen Heiznebenkostenpfad
in den Topf. Mehrere Kreise im selben Gebäude sind nicht unterstützt;
mehrere Gebäude mit je einem Kreis sowie mehrere Quellen pro Kreis dagegen schon.

Grund-/Verbrauchsprozente stammen zuerst aus dem Heizkreis, dann aus den
Jahresvorgaben, sonst 30/70. Validatoren verlangen zusammen 100 % und einen
Verbrauchsanteil zwischen 50 und 70 %. Bei Abweichung von 70 % ohne Begründung
entsteht ein Hinweis. Die Grundflächenbasis kommt aus den Jahresvorgaben:
Nutzfläche oder beheizte Fläche; fehlt letztere bzw. ist sie null, verwendet
die Engine die Nutzfläche. Flächen werden mit dem Tagesanteil des Zeitraums
gewichtet. Verbrauchseinheiten werden nicht nochmals zeitanteilig gekürzt.

Leerstand wird explizit als Zeitraum geführt. Sein Grundkostenanteil fällt
dem Vermieter zu; Verbrauchseinheiten von Leerstand werden im Nenner
ausgeschlossen. Nutzerwechsel nutzt inklusive Tage innerhalb der Periode
und getrennt manuell eingegebene Verbrauchseinheiten je Nutzerzeitraum.
Es gibt keine automatische Zwischenablesungsaufteilung. Eine Wohnung ohne
Belegungszeiträume in der neuen Übersicht erzeugt keine neue fiktive
Leerstandsabrechnung; der Umbau ist ausschließlich Darstellung.

Öl, Gas und Wärmepumpe nutzen dieselbe quellenbezogene Mengen-/Wertrechnung.
Heizwert und CO₂-Faktor müssen passend zur gewählten Einheit vorliegen.
`sourceType` allein setzt keinen energieträgerspezifischen Faktor. Hybride
Systeme addieren die Ergebnisse mehrerer Quellen des Kreises. Die UI bietet
für zusätzliche Quellen derzeit weniger direkte Möglichkeiten als das Modell.

### Betriebsstrom, CO₂ und Warmwasser

Betriebsstrom entsteht nur aus ausdrücklich markierten Kostenarten.
Gebäudebezogene Quellen bedienen zuerst das gleiche Gebäude; globale Budgets
werden anschließend proportional auf offene Bedarfe verteilt. Es wird nie mehr
als Quellbudget oder Bedarf umgebucht. Ungedeckter Bedarf wird als
`uncoveredCents` sichtbar, nicht als zusätzlicher Rechnungsbetrag erfunden.
Beleg: `packages/core/src/heating/operating-electricity.ts`.

CO₂ automatisch: Verbrauchsmenge × Heizwert × Faktor ergibt kg;
kg/1.000 × konfigurierter Centpreis je Tonne ergibt Kosten.
Kennwert = kg × 365/Periodentage / zeitgewichtete beheizte Fläche.
Die implementierten Kennwertgrenzen sind 12/17/22/27/32/37/42/47/52;
Mieteranteile der zehn Stufen: 100/90/80/70/60/50/40/30/20/5 %.
Das Stufenmodell verwendet den ungerundeten Kennwert. Ohne konfigurierten Preis
fällt der Code auf 4.500 Cent/t zurück; das ist kein automatisch aktualisierter
Jahrespreis. Manuell werden Abgabe und Vermieterprozentsatz übernommen.
Der gesamte CO₂-Betrag verlässt zunächst den Brennstofftopf; der Mieteranteil
wird separat nach Verbrauchseinheiten verteilt. Vermieteranteil bleibt außerhalb
des Nutzerheiztopfs.

Warmwasser: zentraler Anteil ist ein Prozentsatz des Brennstoffwerts nach CO₂
(Code-Fallback 18 %), vor Heiznebenkosten/Betriebsstrom. Die Verteilung erfolgt
nach Personen × Zeit, nicht nach Warmwasserzählerdifferenzen. Fehlende/nicht
positive Personenzahl beim Nutzer wird mit einer Person angesetzt und im Trace
genannt. Leerstand erhält dafür null Personen. Dezentral: kein zentraler Topf.

### Rundungen und Restcents

Geld-Eingaben sind ganze Cent. Intern bleiben FIFO-Lospreise, CO₂, Zeitfaktoren,
Verteilungspreise und Rohanteile ungerundet. An Cent-Ausgabegrenzen wird
kaufmännisch von null weg gerundet (`roundCentsHalfAwayFromZero`).
Mengen-/Kennwertanzeigen im Trace sind überwiegend auf drei Nachkommastellen,
der Jahresfaktor auf sechs gerundet; das verändert nicht die interne Stufenwahl.

`allocateLargestRemainder` rundet exakte Centanteile zunächst ab und verteilt
die zur gerundeten Zielsumme fehlenden Cents an die größten Nachkommarestwerte.
Bei Gleichstand entscheidet die stabile ID. Mieter und Leerstand werden getrennt
abgestimmt, Salden danach als Anteil minus Vorauszahlung gebildet. Auch
Heizkosten-/CO₂-Splits und Betriebsstrom bleiben summenerhaltend. Beispiel:
100 Cent auf drei gleiche IDs a/b/c ergeben 34/33/33 Cent. Trace-Abweichungen
aus der Centdarstellung werden ausdrücklich als `roundingDifferenceCents`
ausgewiesen. Die Freigabetoleranz beträgt höchstens einen Cent.

PDF nutzt dieselbe wirksame Gebäudezuordnung (`costScope` vor Wohnung), den
gespeicherten Heizkreis-Trace und dessen Prozentsatz. Grund-, Verbrauchs-,
Warmwasser- und CO₂-Beträge kommen aus dem Nutzer-Snapshot. Es gibt keine zweite
PDF-Heizkostenberechnung. Siehe `packages/pdf/src/tenant-statement.ts`,
`apps/web/src/features/pdf/context.ts` und `docs/HEATING-CO2.md`.

## 3. Zähler und Ablesungen: genaue Bedienung und Grenzen

1. **Wo?** Hauptmenü Heizkreise, dort Tab Zähler. Es gibt keinen eigenen
   Hauptmenüpunkt Wärmezähler. Das Modell stammt aus Stromzählern für
   Allgemeinstrom/Wärmeerzeugung; es ist kein vollständiges Wohnungs-WMZ-Modell.
2. **Stände?** Aktiven Zähler auswählen, Datum, Zählerstand und Ableseeinheit
   eingeben. Anfangs-, End- und Zwischenstand sind lediglich einzelne datierte
   Ablesungen, keine speziellen Rollen.
3. **Rechenwirkung?** Keine der Ablesungen steuert derzeit den Heizverbrauch.
   `createCalculationInput` übernimmt sie, `calculateBilling` wertet sie nicht aus.
4. **Differenz?** Eine automatische Bildung Endstand minus Anfangsstand fehlt.
5. **Wohnung?** `meterSchema` kennt keine `unitId` oder Nutzerzeitraumreferenz.
   Optional gibt es `energySourceRef`; die aktuelle Erfassungsmaske befüllt
   diesen Verweis nicht. Einheit wird je Ablesung gespeichert, nicht am Zähler.
6. **Nutzerwechsel?** Verbrauchseinheiten pro Nutzerzeitraum manuell eingeben;
   eine datierte Zwischenablesung allein teilt nichts zu.
7. **Fehlend/geschätzt?** Fehlende Anfangs-/Endablesungen und sinkende positive
   Stände werden nicht als Verbrauchsfehler erkannt. Ein negativer Einzelstand
   wird abgelehnt. `source=estimated` und Notiz lassen sich speichern; eine
   eigenständige verpflichtende Schätzbegründung der Ablesung fehlt.
8. **Korrektur?** Ablesung bearbeiten/speichern oder kontrolliert löschen ist
   möglich. Zählerstammdaten und Gültigkeitsdaten sind ebenfalls bearbeitbar.
   Eine eigene Zählerwechselkette mit Vorgänger/Nachfolger und Überlaufrechnung
   existiert nicht.
9. **Neuberechnung?** Die App kann einen neuen Berechnungssnapshot speichern.
   Korrektur eines Ablesewerts allein verändert die Heizkosten jedoch nicht.
   Der neue Integrationstest vergleicht Endstand 1.100 und 9.000 bei Anfang
   1.000 und bestätigt identische Ergebnisse.
10. **Prüfbericht/PDF?** Prüfung enthält Nummern-/Jahresrechnungs-/Buchungsstatus,
    aber keine Standdifferenzen. PDF enthält Heizkosten und ggf. Schätzhinweis
    aus dem Nutzerverbrauch, keine Zählernummern oder Anfangs-/Endstände.

Belege: `packages/schema/src/entities/metering.ts`,
`apps/web/src/features/workflows/heating/MeterPanel.tsx`,
`apps/web/src/features/metering/meter-commands.ts`,
`packages/validators/src/static-validation.ts` (`meters`),
`packages/core/src/calculation/calculate-billing.ts` (`buildOccupancyContexts`).

## 4. Priorisierte Lücken und nächster fachlicher Schritt

- **Hoch:** Der Pfad Wärmezähler → Verbrauch → Wohnung/Nutzer fehlt vollständig.
  Beispiel: Endstandkorrektur 1.100 → 9.000 bleibt ohne Kostenwirkung.
- **Hoch:** FIFO-Überbestand und fehlende Mengen werden nicht durchgängig als
  Freigabefehler erkannt. Beispiel: 100 l verfügbar, 200 l Rest wird gekappt.
- **Hoch:** Keine automatische Folgejahresübernahme mit Erhalt mehrerer Restlose.
- **Mittel:** Nur ein Heizkreis je Gebäude; keine eigenständige frei wählbare
  Heizkreiszuordnung von Kostenpositionen und Wohnungszählern.
- **Mittel:** FIFO-Trace ohne verbrauchte/verbleibende Menge je Los; UI/PDF
  zeigen diesen Rechenweg noch nicht als vollständige Bestandskarte.
- **Mittel:** CO₂-Fallbackpreis ist statisch; Quellen-/Jahreswerte bedürfen
  ausdrücklicher Erfassung. Warmwasser nutzt einen Prozent-/Personenansatz.
- **Dokumentation:** README/Datenschutz-/Release-Texte enthalten historische
  Aussagen über noch ausstehende Veröffentlichung und Snapshot v2, obwohl
  `main`/PR #40 veröffentlicht und der Rechenvertrag inzwischen v3 ist.

Empfehlung: PR 20 nach technischer Abnahme separat zur Freigabe vorlegen.
Danach einen fachlichen Vertrag für Zählerzuordnung, Ableserollen,
Zwischenablesung, Schätzung, Wechsel und FIFO-Bestandsprüfung anhand der
genannten Gegenbeispiele festlegen. Erst danach Schema/Migration/Engine ändern.
Keine neue Regel und keine Veröffentlichung wird durch diesen Audit autorisiert.
