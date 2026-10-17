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

Erwarteter Prüfhinweis: Die Freigabe meldet „IBAN fehlt“ – tragen Sie Ihre
eigene Bankverbindung unter **Objekte** bzw. **Firmen** ein. Weitere Hinweise
(z. B. fehlende Klimafaktoren oder Vergleichswerte) zeigen, welche Angaben
eine echte Abrechnung zusätzlich braucht.

Die Datei wird aus `tests/integration/beispielobjekt.test.ts` erzeugt
(`BEISPIEL_AKTUALISIEREN=1 pnpm test:integration`); der Test stellt sicher,
dass sie dem aktuellen Schema entspricht und ohne Rechenfehler bleibt.

## Bankbuchungen (`bankbuchungen-beispiel.csv`)

Beispiel für den Kontoauszugs-Import, siehe
[`docs/BANK-CSV-FORMAT.md`](../BANK-CSV-FORMAT.md).
