# Beispieldaten

Alle Dateien in diesem Ordner sind frei erfunden. Sie enthalten keine echten
Personen, Anschriften oder Kontoverbindungen.

## Beispielobjekt (`beispielobjekt.json`)

Ein vollständiges Abrechnungsjahr 2025 zum Ausprobieren: Datei über
**Daten importieren** (Kopfleiste) laden, die Vorschau bestätigen und danach
unter **Berechnung** auf „Abrechnung berechnen“ klicken.

| Merkmal           | Inhalt                                                          |
| ----------------- | --------------------------------------------------------------- |
| Häuser            | Haus Nord (Heizöl, zentrales Warmwasser), Haus Süd (Wärmepumpe) |
| Wohnungen         | 12, davon eine ganzjährig und eine ab Oktober leer              |
| Nutzerwechsel     | Haus Nord, Wohnung 3 zum 1. Juli                                |
| Eigentümerwechsel | Übergabe am 1. April; Öllieferung im Februar vom Voreigentümer  |
| Betriebskosten    | Grundsteuer, Wasser, Müll, Allgemeinstrom, Versicherung         |
| Heizkosten        | Öl nach FIFO mit Anfangsbestand, Wärmepumpenstrom mit JAZ 3,5   |
| Belege            | je Kostenart eine Rechnung mit Datum und Belegnummer            |
| Namen, Anschrift  | erfunden („Erika Mustermann“, „Am Musterhof 1“)                 |

Ergebnis ohne eigene Eingaben: [Screenshots und Musterabrechnungen
(PDF)](../medien/README.md).

Erwarteter Prüfhinweis: Die Freigabe meldet „IBAN fehlt“ – tragen Sie Ihre
eigene Bankverbindung unter **Objekte** bzw. **Firmen** ein. Die übrigen
Warnungen sind gewollt und zeigen, welche Angaben eine echte Abrechnung
zusätzlich braucht:

| Warnung                                         | Was in einer echten Abrechnung fehlt                          |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Vergleich mit Durchschnittsnutzer (§ 6a HeizKV) | Vergleichswerte, z. B. aus dem Heizspiegel                    |
| Warmwasseranteil pauschal (§ 9 Abs. 2 HeizKV)   | Wärmemenge für Warmwasser (Wärmezähler oder Formel)           |
| Warmwasser nach Personen (§ 8 Abs. 1 HeizKV)    | Verteilung nach Warmwasserverbrauch und Fläche                |
| Gemischter Maßstab (§ 9b Abs. 3 HeizKV)         | Zwischenablesung beim Mieterwechsel oder Aufteilungsverfahren |
| Lieferbeleg fehlt                               | Rechnung der Brennstofflieferung als Beleg                    |
| Entgelte für Verbrauchserfassung                | Kostenart für Messdienst/Ablesung, falls vorhanden            |
| CO₂-Preis des Anfangsbestands                   | CO₂-Preis des Lieferjahres für den übernommenen Tankinhalt    |

Die Datei wird aus `tests/integration/beispielobjekt.test.ts` erzeugt
(`BEISPIEL_AKTUALISIEREN=1 pnpm test:integration`); der Test stellt sicher,
dass sie dem aktuellen Schema entspricht und ohne Rechenfehler bleibt.

## Bankbuchungen (`bankbuchungen-beispiel.csv`)

Beispiel für den Kontoauszugs-Import, siehe
[`docs/BANK-CSV-FORMAT.md`](../BANK-CSV-FORMAT.md).
