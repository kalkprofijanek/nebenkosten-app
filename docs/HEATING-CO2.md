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
