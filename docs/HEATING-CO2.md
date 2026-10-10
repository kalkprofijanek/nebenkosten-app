# Heizkosten- und CO₂-Rechenweg

Stand: PR 07. Dieses Dokument beschreibt den fachlichen Ergebnis- und
Nachvollziehbarkeitsvertrag der Core-Engine. Die Berechnung bleibt rein,
deterministisch und frei von DOM-, Storage- und Netzwerkzugriffen.

## Versionierte Verträge

- `snapshotFormatVersion: 3` kennzeichnet den aktuellen Ergebnisvertrag mit
  der für Einzelabrechnungen erforderlichen Kostenaufschlüsselung. Historische
  Snapshots der Version 2 bleiben im Datenbestand erhalten, müssen vor einer
  neuen PDF-Ausgabe aber kontrolliert neu berechnet werden.
  Gegenüber Version 1 enthält der Heizkostenblock weiterhin die
  Betriebsstrom-Umbuchung und den maschinenlesbaren Rechenweg.
- `heating.trace.traceFormatVersion: 1` versioniert den Heizkosten-Trace
  unabhängig vom Gesamtsnapshot. Eine spätere Änderung seiner Bedeutung oder
  Struktur erfordert eine neue Trace-Version.

Der Snapshot enthält weiterhin die kompakten Abrechnungsergebnisse. Der Trace
ergänzt sie um die fachlichen Zwischenschritte; er ist keine zweite,
abweichende Berechnung.

## Rechenfolge je Heizkreis

Die Engine verarbeitet jeden Heizkreis und jede Energiequelle getrennt:

1. Anfangsbestände und Lieferungen bilden die verfügbaren Brennstofflose.
2. Der angegebene Restbestand wird je Energiequelle nach FIFO bewertet.
3. Verfügbarer Wert minus Restwert ergibt die Brennstoffverbrauchskosten.
4. Verbrauchte Menge und Heizwert ergeben die Energiemenge; daraus wird im
   automatischen Modus die CO₂-Menge bestimmt.
5. CO₂-Kosten und deren Mieter-/Vermieteranteile werden separat ermittelt.
6. Bei zentraler Warmwasserbereitung wird der Warmwasseranteil separat aus dem
   Brennstofftopf genommen und nach Personenzeit verteilt.
7. Heizungsbetriebskosten und der tatsächlich umgebuchte Betriebsstrom werden
   dem verbleibenden Heiztopf zugerechnet.
8. Der Heiztopf wird in Grund- und Verbrauchskosten aufgeteilt. Ohne
   abweichende Vorgabe gilt 30 % Grundkosten und 70 % Verbrauchskosten.

Der Trace weist diese Kette als Abstimmung aus:

`FIFO-Verbrauchskosten − CO₂ − Warmwasser + Heizungsbetriebskosten + Betriebsstrom + Rundungsdifferenz = Heiztopf`

Zusätzlich dokumentiert er je Energiequelle Lose, Mengen, Werte, Restbestand,
Verbrauch, Heizwert, Energie und CO₂-Menge. CO₂, Warmwasser und die
Grund-/Verbrauchskosten-Aufteilung besitzen jeweils eigene Trace-Blöcke. Damit
bleiben fachlich verschiedene Töpfe sichtbar und prüfbar.

## FIFO je Energiequelle

FIFO wird nicht über mehrere Energiequellen vermischt. Anfangsbestand und
Lieferungen werden ausschließlich der referenzierten Energiequelle zugeordnet.
Lieferungen werden nach Datum und anschließend deterministisch nach ID
geordnet. Der Restbestand wird aus den zuletzt verfügbaren Losen bewertet; die
älteren Lose gelten damit zuerst als verbraucht.

Unterschiedliche Mengeneinheiten innerhalb derselben Quelle sind unzulässig.
Liegt ein Kostenwert ohne auswertbare Menge vor, wird dies im Trace als
`direct_cost_without_quantity` statt als scheinbare FIFO-Berechnung
gekennzeichnet.

## CO₂ getrennt vom Heiztopf

Im automatischen Modus leitet die Engine aus Energie, CO₂-Faktor,
Periodenlänge und beheizter Fläche den Jahreskennwert und die Stufe ab. Im
manuellen Modus verwendet sie die vorgegebenen Kosten und Anteile. In beiden
Fällen werden Gesamtkosten sowie Mieter- und Vermieteranteil separat
ausgewiesen.

Der Vermieteranteil wird nicht in den auf Nutzer verteilten Heiztopf
eingerechnet. Dadurch bleiben CO₂-Kosten, Heizkosten und die
Mieter-/Vermieter-Verantwortung nachvollziehbar getrennt.

### Verteilung des CO₂-Mieteranteils (Vermieterentscheidung)

Der CO₂-Mieteranteil eines Heizkreises wird – wie die Brennstoffkosten –
nach dem Heizkreis-Schlüssel auf die Nutzer verteilt, also mit dem
Grundkostenanteil (z. B. 30 %) nach der konfigurierten Flächenbasis
(beheizte Fläche bzw. Wohnfläche, zeitanteilig nach Kalendertagen) und mit
dem Verbrauchskostenanteil (z. B. 70 %) nach erfasstem Verbrauch
(Verbrauchseinheiten oder gemessene kWh). Bis einschließlich Version 1.1.4
wurde der Mieteranteil zu 100 % nach Verbrauch verteilt. Die § 12-Kürzung
(15 %) wirkt weiterhin nur auf die Heizkosten, nicht auf den CO₂-Anteil.
Auf Leerstandszeiten entfallende CO₂-Anteile trägt der Vermieter.

Fehlt im automatischen Modus der CO₂-Preis, setzt die Berechnung
ersatzweise 45 €/t an; die Prüfung meldet dann die Warnung
`co2.price_missing`.

## Warmwasser getrennt vom Heiztopf

Zentrale Warmwasserbereitung erzeugt einen eigenen Warmwassertopf. Er wird vor
der 70/30-Aufteilung vom Brennstoffanteil getrennt und nach Personenzeit
verteilt. Fehlende oder nicht positive Personenzahlen werden nachvollziehbar
mit einer Person angesetzt; die betroffenen Belegungs-IDs stehen im Trace.
Dezentrale Warmwasserbereitung erzeugt keinen zentralen Warmwassertopf.

## Grund- und Verbrauchskosten

Der nach CO₂ und Warmwasser verbleibende Heiztopf zuzüglich
Heizungsbetriebskosten und Betriebsstrom wird getrennt verteilt:

- Grundkosten nach der konfigurierten Flächenbasis,
- Verbrauchskosten nach Verbrauchseinheiten.

Die Prozentsätze werden aus dem Heizkreis beziehungsweise den
Periodenvorgaben übernommen. Der Standard ist 30 % Grundkosten und 70 %
Verbrauchskosten; das Datenmodell lässt den fachlich vorgesehenen Bereich von
50 % bis 70 % Verbrauchsanteil zu.

### § 9a Abs. 2 HeizKV: über 25 % geschätzt (ab 1.3.0)

Je Heizkreis im manuellen Modus wird der zeitanteilige Anteil der beheizten
Fläche (sonst Wohnfläche) von Mieter-Nutzungen mit Kennzeichen „geschätzt“
an allen Mieter-Nutzungen ermittelt (Fläche × Zeitfaktor; Leerstände zählen
nicht). Liegt er über 25 %, werden die Heizkosten und der CO₂-Mieteranteil
dieses Heizkreises zu 100 % nach der Flächenbasis verteilt (Verbrauchsanteil
0 %). Eine Kürzung nach § 12 HeizKV entfällt dann, weil die Verteilung der
Verordnung entspricht. Der Trace `split` enthält `estimatedAreaSharePercent`
und `areaOnlySection9a`; ältere Rechenstände ohne diese Felder gelten als
verbrauchsabhängig verteilt. Heizkreise mit kWh-Messverbrauch sind
ausgenommen. Die Einzelabrechnung begründet die Flächenverteilung.

## Ausweis in den PDFs (ab 1.2.1)

- Die Heizkosten-Zusammenstellung schlüsselt
  `reconciliation.plusHeatingOperatingCostsCents` in „davon“-Zeilen auf
  (`heatingOperatingCostLines` in `packages/pdf`). Die Zuordnung entspricht
  `heatingOperating` im Core: Kostenarten der Art „Heizung“ mit Gebäude-Bereich
  des Heizkreises, Belege einzeln, ein nicht umlagefähiger Anteil als eigene
  Zeile, eine verbleibende Centdifferenz als „Rundung“. Die Summe der Zeilen
  ist damit exakt der Betrag der Zusammenstellung.
- Entgelte für Verbrauchserfassung und Abrechnung (§ 6a HeizKV) werden aus
  denselben Kostenarten erkannt (`meteringFeeCents`), wenn Kostenart oder
  Belegbeschreibung z. B. „Wärmezähler“, „Messdienst“, „Ablesung“,
  „Abrechnung“ oder „Eichung“ enthält; sonst lautet der Hinweis, dass sie in
  den Betriebskosten der Heizungsanlage enthalten sind.
- Zählerstände (`OccupancyPeriod.heatMeterReading`) sind rein dokumentarisch;
  maßgeblich für die Verteilung bleiben `consumptionUnits` bzw. die gemessenen
  kWh. Die Einzelabrechnung zeigt sie unter „Ihre Verbrauchserfassung“ mit der
  Rechnung der Grund-, Verbrauchs- und CO₂-Anteile; der CO₂-Verbrauchsanteil
  wird als Differenz zum gerundeten CO₂-Gesamtanteil des Mieters ausgewiesen,
  damit die gedruckte Summe stimmt.
- Ohne konfigurierte Warmwasserabgrenzung (`warmWater.method = 'none'`)
  enthalten die PDFs keinen Satz zum Warmwasser (Vermieterentscheidung).
- `@nebenkosten/validators` stellt zusätzlich `validateBillingPeriodCached`
  (Ergebnis je Datenobjekt und Abrechnungsjahr zwischengespeichert, setzt
  unveränderliche Datenobjekte voraus) und `withConfirmedWarnings` (bestätigte
  Warnungen ohne erneute Prüfung anwenden) bereit; die Oberfläche nutzt beide.

## Energierechnungen und § 6a HeizKV (ab 1.2.3)

Die Rechenlogik (Core, Trace-Format) bleibt unverändert; geändert sind
Darstellung und Prüfhinweise.

- **Leitungsgebundene Energie** (Strom inkl. Wärmepumpenstrom, Fern-/Nahwärme,
  Erdgas; `isGridEnergySource` im Core, erkannt an Art, Name oder Schlüssel
  der Energiequelle) ohne Anfangs- und Restbestand erscheint in den PDFs als
  Liste „Energierechnungen“: „Rechnung vom TT.MM.JJJJ: Beschreibung“, Menge,
  Betrag, Summe „= Energiekosten laut Rechnungen“. Kein Anfangsbestand,
  Endbestand oder FIFO. Den abgerechneten Liefer- bzw. Verbrauchszeitraum
  trägt die Beschreibung der Lieferung (kein eigenes Schemafeld).
- **Lagerfähige Brennstoffe** behalten das Brennstoffkonto mit FIFO. Eine
  Rechnung mit Betrag, aber ohne Liefermenge heißt „+ Rechnung vom … ohne
  Liefermenge: Beschreibung“ statt „Lieferung“.
- **Anteile der Energieträger** (`energyCarrierShares`): Energieeinsatz in kWh
  je Energieträger (Heizwert × Verbrauch, bei Abrechnung in kWh die Menge),
  ganze Prozent, Restverteilung nach größtem Rest. Fehlt für eine
  kostenbehaftete Quelle Menge oder Heizwert, nennt die Abrechnung nur die
  Energieträger; die Prüfung warnt (`heating.energy_share_not_determinable`).
- **Vergleichswerte:** Der mittlere Verbrauch des eigenen Heizkreises ist kein
  Vergleich mit einem normierten oder durch Vergleichstests ermittelten
  Durchschnittsnutzer und wird nur als „Mittlerer Verbrauch im Heizkreis“
  ausgewiesen. Die Prüfung meldet je Abrechnungsjahr mit Heizkreis
  `heating.consumption_benchmark_missing` (3-%-Kürzungsrecht nach § 12 Abs. 1
  HeizKV).
- **Durchschnittsnutzer (ADR-0004):** Mit Vergleichswerten am Heizkreis
  (`consumptionBenchmark`, z. B. Heizspiegel) ermittelt
  `compareTenantWithConsumptionBenchmark` den eigenen Verbrauch als Anteil am
  Energieeinsatz in kWh je m² und Jahr (Heizwärme nach Verbrauchseinheiten,
  Warmwasser nach Personenzeit) und stuft ihn ein. Die Einzelabrechnung gibt
  das noch nicht aus.
- **Vorjahresvergleich:** Ohne Vorjahresabrechnung des Objekts (z. B.
  Eigentümerwechsel) bzw. ohne Nutzung oder Verbrauchswerte im Vorjahr steht
  ein eigener, begründeter Satz. Liegen Vorjahreswerte derselben Mietpartei
  vor, zeigt die Einzelabrechnung eine Balkengrafik mit dem Hinweis „ohne
  Witterungsbereinigung“.
- Weitere Prüfhinweise: `heating.energy_invoice_quantity_missing` (Strom- bzw.
  Fernwärmerechnung ohne kWh), `heating.energy_invoice_period_missing`
  (Rechnung außerhalb des Abrechnungszeitraums ohne Beschreibung),
  `heating.cost_only_delivery_unlabelled` (Brennstoffrechnung ohne Menge und
  ohne Beschreibung), `costs.entry_ambiguous` (gleich bezeichnete Belege
  derselben Kostenart am selben Tag).

### Offene Entscheidungen

1. **Normierter Durchschnittsnutzer:** Quelle der Vergleichswerte (Messdienst,
   bundesweiter Heizspiegel o. Ä.), Nutzerkategorie und Umrechnung bei
   Verbrauchseinheiten statt kWh sind festzulegen; erst danach erhält der
   Heizkreis ein Feld für den Vergleichswert.
2. **Witterungsbereinigung:** Verfahren (Gradtagzahlen bzw. Klimafaktoren je
   Standort und Jahr) und Datenquelle sind festzulegen.
3. **Lieferzeitraum als Feld:** Bei Bedarf eigene Felder für Beginn und Ende
   des abgerechneten Zeitraums an `FuelDelivery` (Schemaerweiterung mit
   Migration) statt der Beschreibung.

## Betriebsstrom als budgetgedeckte Netto-null-Umbuchung

Eine Kostenart ist nur dann Quelle, wenn sie ausdrücklich als
Betriebsstromquelle markiert ist. Der gewünschte Betriebsstrom wird aus dem
jeweiligen Heizkostenwert und dem konfigurierten Prozentsatz ermittelt.

Die Umbuchung folgt diesen Regeln:

1. Gebäudespezifische Quellen bedienen zuerst und ausschließlich den
   Heizkreis desselben Gebäudes.
2. Danach wird das noch verfügbare globale Quellenbudget proportional auf die
   noch offenen Sollbeträge der Heizkreise verteilt.
3. Je Quelle kann höchstens ihr vorhandener Kostenbetrag abgezogen werden.
4. Je Heizkreis kann höchstens sein Sollbetrag zugerechnet werden.
5. Ein nicht gedeckter Sollbetrag wird als `uncoveredCents` offengelegt und
   nicht als zusätzliche Kosten erfunden.

Eine Haus-spezifische Quelle wird ohne eindeutige Heizkreis-Zuordnung nicht
umgebucht. Sie bleibt vollständig in ihrer normalen Kostenverteilung; eine
fachliche Zuordnung kann später durch die formellen Validatoren eingefordert
werden.

Abzug bei den normalen Kosten und Zugang beim Heiztopf sind betragsgleich.
Deshalb verändert die Umbuchung die erfassten Gesamtkosten nicht. Der Snapshot
weist Quellenbudget, Soll, tatsächlich verschobenen Betrag, ungedeckten Betrag
und Abzug je Quelle aus.

## Rundung und 1-Cent-Regel

Intern bleibt die volle Rechengenauigkeit erhalten. Erst an veröffentlichten
Cent-Grenzen wird kaufmännisch, bei halben Cent von null weg, gerundet.
Summenerhaltende Verteilungen verwenden das Größter-Rest-Verfahren mit einer
stabilen, sprachraumunabhängigen ID-Reihenfolge als Gleichstandsentscheidung.

Damit müssen Quellabzüge und Heizkreiszugänge dieselbe Cent-Summe ergeben.
Ebenso bleiben Nutzerzeilen und veröffentlichte Aggregate summenerhaltend.
Objektweite Heiz- und CO₂-Summen werden aus den bereits centgenauen
Heizkreis-Ergebnissen gebildet; dadurch stimmen Detail- und Summenebene auch
bei mehreren Heizkreisen mit Restcents überein. Die Trace-Abstimmung weist
eine ausschließlich durch die Darstellung in ganzen Cent entstehende
Differenz explizit als `roundingDifferenceCents` aus. Die Kontrolldifferenz
darf höchstens 1 Cent betragen. Die einzige freigegebene
Abweichung gegenüber den unveränderten Legacy-Goldens ist der bereits in PR 06
dokumentierte Restcent in `case-12-co2-split`.

## Legacy-Kompatibilität

Alle 15 Characterization-Fixtures aus PR 05 bleiben unverändert und laufen
gegen Snapshot v2 weiter. Sie setzen
`operatingElectricitySharePercent = 0`; dadurch bleiben ihre freigegebenen
Legacy-Ergebnisse trotz des neuen Betriebsstrompfads identisch. Die
Betriebsstromlogik wird stattdessen durch eigene PR-07-Core-Tests geprüft.

## Tests in PR 07

Die neuen Core-Tests prüfen insbesondere:

- eine vollständig gedeckte, gesamtkostenneutrale Umbuchung,
- die Begrenzung auf ein zu kleines Quellenbudget,
- die ausschließliche Verwendung einer gebäudespezifischen Quelle für den
  passenden Heizkreis,
- Snapshot v2 und Trace v1,
- den maschinenlesbaren Rechenweg für FIFO, CO₂, Warmwasser, Betriebsstrom und
  70/30-Aufteilung.

Die bestehende Characterization-Suite prüft weiterhin alle 15 Legacy-Fälle,
einschließlich mehrerer Heizkreise und Energiequellen, FIFO, Wärmepumpe,
Hybridheizung, zentralem und dezentralem Warmwasser sowie CO₂-Aufteilung.

## Abgrenzung

- PR 08 verantwortet Persistenz, Backup, Wiederherstellung,
  Konflikterkennung und Versionsschutz. Der Trace wird in PR 07 nur berechnet,
  nicht gespeichert.
- PR 09 stellt Routing und Bedienoberfläche bereit. PR 07 enthält keine
  UI-Komponenten und keine Rechenlogik in Komponenten.
- PR 10 ergänzt formelle und fachliche Validatoren, Fehlerklassen,
  Freigabestatus und Sperrlogik. PR 07 liefert die dafür prüfbaren Ergebnisse,
  ersetzt aber keine Freigabeentscheidung.
