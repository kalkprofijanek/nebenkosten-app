# Bankbuchungen per CSV übernehmen

Unter **Kosten → Bankbuchungen → „Bankbuchungen aus CSV übernehmen“** liest
die App einen Kontoauszug im CSV-Format ein. Die Datei wird ausschließlich
lokal im Browser verarbeitet. Neue Buchungen werden als **„Offen“** angelegt.
Buchungen mit gleichem Datum, gleichem Betrag, gleicher Gegenpartei (erste 30
Zeichen) und gleichem Verwendungszweck (erste 40 Zeichen) gelten als Dublette
und werden übersprungen – auch innerhalb derselben Datei. Zwei echte, völlig
gleichlautende Zahlungen am selben Tag müssen deshalb manuell nacherfasst
werden; die App meldet die Zahl übersprungener Dubletten.

Maßgeblich ist der Parser in
[`apps/web/src/features/costs/bank-booking-csv.ts`](../apps/web/src/features/costs/bank-booking-csv.ts).
Diese Beschreibung gibt seinen Stand wieder.

## Dateiformat

| Eigenschaft       | Anforderung                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Größe             | höchstens 5 MB, höchstens 20.000 Buchungszeilen                                                                                                |
| Zeichensatz       | UTF-8 (mit oder ohne BOM); sonst wird Windows-1252 angenommen                                                                                  |
| Trennzeichen      | `;` oder `,` – wird aus den ersten zehn Zeilen automatisch erkannt                                                                             |
| Anführungszeichen | `"` umschließt Zellen mit Trennzeichen oder Zeilenumbrüchen; `""` = ein `"`                                                                    |
| Kopfzeile         | muss in den **ersten zehn Zeilen** stehen und eine Spalte `Betrag` oder `Amount` enthalten; Zeilen davor (Kontoinfo der Bank) werden ignoriert |

## Erkannte Spalten

Die Spaltennamen werden ohne Beachtung von Groß-/Kleinschreibung gesucht,
zuerst exakt, dann als Teilwort (z. B. findet `datum` auch `Valutadatum`).
Bei mehreren Treffern gewinnt der erste Alias der Liste.

| Feld in der App  | Pflicht | Erkannte Spaltennamen (Reihenfolge = Vorrang)                                 |
| ---------------- | ------- | ----------------------------------------------------------------------------- |
| Datum            | ja      | `Buchungstag`, `Datum`, `Date`                                                |
| Betrag           | ja      | `Betrag`, `Amount`                                                            |
| Gegenpartei      | nein    | `Beguenstigter`, `Begünstigter`, `Auftraggeber`, `Zahlungspflichtig`, `Payee` |
| Verwendungszweck | nein    | `Verwendungszweck`, `Zweck`, `Purpose`                                        |
| Buchungstext     | nein    | `Buchungstext`, `Buchungstyp`, `Type`                                         |

Weitere Spalten (IBAN, BIC, Saldo, Währung …) werden **nicht** übernommen.

## Werteformate

- **Datum:** `TT.MM.JJJJ`, `TT.MM.JJ` (wird als 20JJ gelesen) oder
  `JJJJ-MM-TT`. Ungültige Kalenderdaten (z. B. 31.02.) führen zum Abbruch.
- **Betrag:** in Euro, Vorzeichen `-` für Ausgaben. Erlaubt sind
  `-1.234,56`, `-1234,56`, `-1234.56`, `1,234.56`; `€` und Leerzeichen
  werden entfernt. Höchstens zwei Nachkommastellen. Intern wird in ganzen
  Cent gerechnet.

Enthält eine einzige Zeile ein ungültiges Datum oder einen ungültigen Betrag,
wird **die gesamte Datei abgelehnt** und die Zeilennummer angezeigt. Es wird
nichts teilweise übernommen.

## Praxistipps

- Exportieren Sie im Online-Banking das Format **„CSV“ / „CSV-CAMT“**, nicht
  MT940 oder PDF.
- Exportieren Sie nur den Zeitraum des Abrechnungsjahres (plus Puffer für
  Rechnungen, die im Folgejahr bezahlt wurden).
- Prüfen Sie Summenzeilen am Dateiende: Eine Zeile „Saldo“ ohne gültiges Datum
  führt zur Ablehnung. Löschen Sie solche Zeilen vor dem Import.
- Wenn Ihre Bank andere Spaltennamen verwendet, benennen Sie die Kopfzeile in
  einem Texteditor um (z. B. `Wertstellung` → `Datum`). Melden Sie das Format
  gern über ein Issue („Funktionswunsch“), **ohne echte Kontodaten**.

## Beispiel

Eine vollständig erfundene Beispieldatei liegt unter
[`docs/beispiel/bankbuchungen-beispiel.csv`](beispiel/bankbuchungen-beispiel.csv).

```csv
Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Buchungstext;Betrag
15.01.2025;Beispiel Stadtwerke;Abschlag Wasser Januar;Lastschrift;-120,00
03.02.2025;Mieter Wohnung 1;Miete und Nebenkosten Februar;Gutschrift;850,00
```

## Nach dem Import

Jede Buchung steht zunächst auf **„Offen“**. Ordnen Sie sie einer Kategorie
zu (Umlagefähig, Nicht umlagefähig, Mieteingang, Kaution, Instandhaltung,
Verwaltung, Sonstige), dem Abrechnungsjahr und ggf. einer Kostenart. Eine
Kostenposition kann unter „Zahlungsnachweis“ mit der Bankbuchung verknüpft
werden.
