# Rundungsregeln (docs/ROUNDING.md)

Stand: PR 05 (Characterization Tests). Verantwortlich: Claude. Review: Codex.
Bezug: Masterplan Abschnitt 6.3 und 9.5, `legacy/behavior-map.md` Abschnitt 6
(die 33 Rundungsquellzeilen), `packages/schema/src/migrations/euro-to-cents.ts`.

Dieses Dokument legt die verbindlichen Rundungsregeln je Rechenschritt fest.
Es ist aus dem Bestandsverhalten der Legacy-App abgeleitet und markiert dort,
wo der Bestand von der Masterplan-Zielvorgabe abweicht, **beide** Varianten als
offene Entscheidung (Abschnitt 8). Nichts wird stillschweigend festgelegt.

> Geldbeträge dürfen niemals als reine Fließkomma-Euro persistiert werden
> (Masterplan 2.5/5.3). Persistenz und Vergleich erfolgen in ganzen Cent.

---

## 1. Bestandsbefund (Legacy)

Die Legacy-App hält Geldbeträge **durchgängig als JavaScript-Fließkommazahlen in
Euro**, nicht in Cent (`legacy/behavior-map.md` Abschnitt 6, Risiko 8.6).

Innerhalb von `Engine.rechne()` wird **an keiner Stelle gerundet** — alle
Zwischenwerte (Preise je Einheit, Nutzeranteile, Grund-/Verbrauchskosten,
CO₂-Kosten) behalten volle Fließkomma-Präzision. Gerundet wird nur an 33
Quellzeilen außerhalb des Kern-Rechenwegs (Tage, Mengen, Anzeige, manuelle
Splits, Bestandsrollover, VZ-Empfehlung). Die Kontrolldifferenz entsteht damit
nicht durch Rundung, sondern durch fachliche Rest-/Vermieteranteile.

Für die **Anzeige** rundet `fmtEuro()`/`fmtNum()` über `Intl.NumberFormat`
('de-DE') kaufmännisch (halbe Einheit von der Null weg), ohne den gespeicherten
Wert zu verändern.

---

## 2. Interne Genauigkeit (Zielmodell)

| Ebene                  | Regel                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Persistenz             | Ganze **Cent** als Integer (`moneyCentsSchema`). Keine Fließkomma-Euro.                                                       |
| Eingabekonvertierung   | Euro → Cent **ausschließlich** über `euroToCents` (siehe Abschnitt 3), dokumentiert in `docs/MIGRATION.md`.                   |
| Kern-Rechnung (Engine) | Zwischenrechnungen mit voller `number`-Präzision (Cent als Dezimalzahl zulässig). **Keine Zwischenrundung** — wie Legacy.     |
| Ausgabe-Grenze         | Rundung auf ganze Cent erst beim Ergebnis: je Position, je Nutzeranteil, je Aggregat.                                         |
| Mengen/Prozente        | Mengen behalten Dezimalwert + Einheit (`quantitySchema`); Prozente sind Zahlen 0–100. Keine Geld-Rundung auf Mengen anwenden. |

Begründung: Zwischenrundung erzeugt Ketten-Rundungsfehler; die Legacy hält
bewusst volle Präzision bis zum Ende. Das Zielmodell übernimmt das und rundet
nur an der Ausgabegrenze, wo Cent-Beträge ausgewiesen werden.

---

## 3. Rundungsverfahren

**Kaufmännisch, halbe Einheit von der Null weg** (`round half away from zero`).

Verbindliche Implementierung: `euroToCents` in
`packages/schema/src/migrations/euro-to-cents.ts`. Sie skaliert die kanonische
Dezimaldarstellung mit BigInt und rundet halbe Cent für beide Vorzeichen
symmetrisch von der Null weg. Das entspricht dem Legacy-Anzeigeverhalten
(`Intl.NumberFormat` „halfExpand") und vermeidet die Vorzeichen-Asymmetrie von
`Math.round` (das halbe Werte stets Richtung +∞ rundet).

Charakterisierungs- und Golden-Werte in `tests/characterization` wurden mit
genau dieser Funktion aus den Legacy-Fließkomma-Ergebnissen abgeleitet.

---

## 4. Zeitpunkt der Rundung je Rechenschritt

Reihenfolge entspricht `Engine.rechne` (`legacy/behavior-map.md` Abschnitt 5).

| Schritt                                                                       | Zwischenwert              | Rundung                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Zeitanteil (`bewohnteTage`, `zeitraumTage`)                                   | Tage                      | **Ganze Tage** (`round`), vor der Geldrechnung. Zeitfaktor `zf = Tage/Perioden­tage` bleibt Fließkomma. |
| Monatsanteil VZ (`monatlicheAnteile`)                                         | Monatsbruchteile          | Tage je Monat auf ganze Tage; Summe bleibt Fließkomma.                                                  |
| FIFO-Brennstoff (`heizquelleKostenDetails`)                                   | Restwert/Verbrauchskosten | **Keine** Zwischenrundung; volle Präzision.                                                             |
| CO₂ (`co2BilanzBlock`)                                                        | kg, kWh, €, Kennwert      | **Keine** Zwischenrundung; Stufenmodell auf ungerundetem Kennwert.                                      |
| 70/30-Heiztopf (Grund/Verbrauch)                                              | € je Block                | **Keine** Zwischenrundung.                                                                              |
| Preis je Bezugseinheit (`preisGrund`, `preisVerbr`, `preisCo2`, `kpos.preis`) | €/Einheit                 | **Keine** Zwischenrundung.                                                                              |
| Nutzer-Position (`pos[].betrag`)                                              | €                         | Erst an der Ausgabegrenze auf Cent.                                                                     |
| Nutzer-Summe (`summe`), Saldo (`saldo = summe − vz`)                          | €                         | Erst an der Ausgabegrenze auf Cent.                                                                     |
| Aggregate (`gesamtkosten`, `vermieterKosten`, `erfassteKosten`)               | €                         | Erst an der Ausgabegrenze auf Cent.                                                                     |
| VZ-Empfehlung (Folgejahr)                                                     | €                         | Legacy rundet auf 0,50 € bzw. 5 € (Anzeige/Assistent, **nicht** abrechnungsrelevant).                   |
| Mengenumrechnung t→kg                                                         | Menge                     | `round(x·1000)/1000` (Menge, kein Geld).                                                                |

Die 33 Legacy-Rundungsquellzeilen sind vollständig in `legacy/behavior-map.md`
Abschnitt 6 tabelliert; sie liegen — bis auf die reine Anzeige und die manuellen
Split-Helfer — außerhalb des deterministischen Kern-Rechenwegs.

---

## 5. Verteilung von Restcentbeträgen

**Bestandsbefund:** `Engine.rechne` verteilt Restcents **nicht** aktiv. Da
intern volle Präzision gilt, entsteht ein Restcent erst durch das Runden der
einzelnen Ausgabewerte. Die Summe der auf Cent gerundeten Nutzeranteile kann
daher um wenige Cent von der auf Cent gerundeten Gesamtsumme abweichen (in den
Golden-Fixtures maximal 1 Cent, Fall `case-12-co2-split`).

Nur einzelne **manuelle** Split-Helfer der Legacy (Block-Aufteilung von
Heizkosten, Buchungs-Splits) weisen den Rest der **letzten** Position/dem
letzten Block zu (`legacy/behavior-map.md` Abschnitt 6, Zeilen 3587, 4861 ff.).

**Verbindliche Entscheidung (menschliche Freigabe 2026-07):** PR 06 verwendet
das **Größter-Rest-Verfahren** (largest remainder) über die Nutzeranteile.

Algorithmus:

1. Alle exakten Centanteile werden zunächst abgerundet.
2. Die Zielsumme ist die mit `round half away from zero` gerundete Summe der
   ungerundeten Anteile.
3. Die noch fehlenden Cent werden absteigend nach dem Nachkomma-Rest verteilt.
4. Bei identischem Rest entscheidet die stabile Nutzer-ID aufsteigend.
5. Mieter- und Leerstandszeilen werden getrennt ausgeglichen, damit beide
   fachlichen Gruppen summenerhaltend bleiben.
6. Der Saldo wird anschließend exakt als `gerundeter Anteil − Vorauszahlung`
   gebildet.

Damit ist die Summe der ausgewiesenen Mieteranteile immer exakt gleich
`tenantTotalCents`. Gegenüber dem Legacy-Bestand ist je Nutzer höchstens eine
fachlich freigegebene Abweichung von 1 Cent zulässig. In
`case-12-co2-split` erhält bei gleichem Rest die lexikografisch erste Nutzer-ID
den einzelnen Restcent; die Legacy-Goldens selbst bleiben als unveränderte
Referenzwerte erhalten.

---

## 6. Kontrollsumme

Fachliche Identität (Masterplan 6.3):

```
Summe Nutzeranteile (Mieter)
+ Vermieteranteile
+ nicht zugeordnete Beträge
= erfasste Gesamtkosten
```

Legacy-Umsetzung (`Engine.rechne`):

```
kontrollDiff = erfassteKosten − gesamtkosten(Mieter) − vermieterKosten
```

`vermieterKosten` enthält CO₂-Vermieteranteil, Leerstand (Zeilen- und
Offen-Kosten), unverteilte Heizkosten und den nicht umlagefähigen Freianteil.
`direktKostenSum` (Umlage „direkt") und `interneKostenSum` (`NICHT_UML`) stehen
**außerhalb** dieser Identität — sie sind erfasst, aber bewusst nicht verteilt
(siehe `case-13-direct-costs`). Das ist eine Abweichung von der wörtlichen
Masterplan-Formel „+ nicht zugeordnete Beträge" und in Abschnitt 8 als offene
Entscheidung geführt.

In den Golden-Fixtures gilt exakt (in Cent):

```
recordedCostsCents = tenantTotalCents + landlordTotalCents
                     + unallocatedCents + controlDifferenceCents
```

`unallocatedCents` ist derzeit 0 (die Legacy-Identität kennt keinen separaten
Posten; Leerstand steckt in `landlordTotalCents`).

---

## 7. Zulässige Toleranz

| Quelle                      | Toleranz Kontrolldifferenz                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Masterplan 6.3              | > 0,01 € (1 Cent) ist ein Fehler, sofern nicht fachlich begründet.                        |
| Masterplan 9.5              | Saldo je Nutzer max. 0,01 € Abweichung gegenüber der Alt-App.                             |
| Legacy-Freigabecheck        | 0,50 € (`legacy/behavior-map.md` Abschnitt 6, Zeile 1825).                                |
| Legacy-PDF-Anzeige          | 0,02 € (Zeile 6264).                                                                      |
| **Golden-Fixtures (PR 05)** | **1 Cent** (`CONTROL_TOLERANCE_CENTS`), plus je Nutzer/Position 1 Cent Restcent-Toleranz. |

**Verbindliche Entscheidung (menschliche Freigabe 2026-07):** Im Zielsystem gilt
verbindlich **0,01 € (1 Cent)** als Freigabegrenze — auch für PR 06. Der
historische Legacy-Wert **0,50 €** bleibt ausschließlich als **dokumentierter
Legacy-Warnwert** bestehen und ist **keine** Freigabegrenze. Die Golden-Fixtures
verwenden diese strenge Zielvorgabe; alle 15 Fälle erfüllen sie mit
Kontrolldifferenz = 0.

---

## 8. Entscheidungen und offene Punkte

1. **Kontrolldifferenz-Toleranz — ENTSCHIEDEN (menschliche Freigabe 2026-07):**
   Verbindlich **0,01 € (1 Cent)** im Zielsystem und für PR 06. Der Legacy-Wert
   **0,50 €** bleibt nur als dokumentierter Warnwert erhalten, nicht als
   Freigabegrenze (siehe Abschnitt 7). Die Fixtures verwenden bereits 1 Cent.
2. **Restcent-Verfahren — ENTSCHIEDEN (menschliche Freigabe 2026-07):**
   Größter-Rest-Verfahren mit stabiler ID als Gleichstandsregel; Mieter- und
   Leerstandszeilen werden getrennt ausgeglichen (Abschnitt 5).
3. **„Nicht zugeordnete Beträge" in der Kontrollidentität:** Legacy hält
   `direktKostenSum`/`interneKostenSum` außerhalb der Identität; die
   Masterplan-Formel nennt „+ nicht zugeordnete Beträge". Zu klären, ob diese
   Posten in `unallocatedCents` einfließen sollen oder informativ bleiben.
4. **Rundungsverfahren-Bestätigung:** „half away from zero" (`euroToCents`) ist
   gesetzt; abweichende kaufmännische Sonderregeln (z. B. „half to even") sind
   nicht vorgesehen — bei Bedarf hier ergänzen.

Die Punkte 1 und 2 sind entschieden; die Punkte 3 und 4 sind bis zur Abnahme
durch den Menschen offen und dürfen nicht stillschweigend anders implementiert
werden (Masterplan 2.6, 12.1 Punkt 3).
