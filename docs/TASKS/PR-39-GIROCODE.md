# PR-39 – GiroCode (EPC-QR-Code) bei Nachzahlung

Stand: 17. Oktober 2026. Auftrag: Roadmap Phase 3, Punkt 1 (Priorität 1).

## Umfang

Die Einzelabrechnung zeigt bei einer Nachzahlung neben der
Zahlungsaufforderung einen scanbaren EPC-QR-Code („GiroCode“) mit Betrag,
IBAN, Kontoinhaber und Verwendungszweck. Bei Guthaben oder ausgeglichenem
Saldo entfällt er. Die Berechnungslogik bleibt unverändert.

## Vertrag

- Neues Modul `packages/pdf/src/epc-girocode.ts`, Funktion
  `buildEpcPayload({ name, iban, bic, amountCents, remittance })` →
  `string | null`.
- Format EPC069-12, Version `002`, Zeichensatz `1` (UTF-8), `SCT`, BIC
  optional, Name max. 70 Zeichen, Betrag `EUR<Euro>.<Cent>` aus ganzen
  Centwerten (keine Gleitkommarundung), Verwendungszweck unstrukturiert
  max. 140 Zeichen, Zeilenumbrüche/Mehrfachleerzeichen werden entfernt.
- `null` (kein Code) bei Betrag ≤ 0, Nicht-Ganzzahl, Betrag über
  999.999.999,99 €, ungültiger IBAN (Prüfziffer mod 97), ungültiger BIC
  oder leerem Namen. Ein fehlerhafter Code wäre schlechter als keiner.
- Darstellung: pdfmake-Knoten `qr` mit Fehlerkorrektur `M` (Vorgabe der
  EPC-Spezifikation), Kantenlänge 80 pt (≈ 2,8 cm, Mindestgröße 2 cm),
  Bildunterschrift `GIROCODE_CAPTION`.
- Keine Schemaänderung, keine Migration, keine neue Abhängigkeit.

## Freigegebene Pfade

`packages/pdf/`, `packages/validators/` (Prüfhinweis Kontoinhaber),
`CHANGELOG.md`, `docs/TASKS/`.

## Tests

- `packages/pdf/tests/epc-girocode.test.ts`: Zeilenaufbau, Betragsformat,
  Kürzung, alle `null`-Fälle.
- `packages/pdf/tests/legal-statement.test.ts`: Code bei Nachzahlung, kein
  Code bei Guthaben/ausgeglichen/ungültiger IBAN.
- Snapshot der Einzelabrechnung aktualisiert (nur Zahlungsabschnitt).
- Manuell: PDF aus der Fixture gerendert, QR-Code mit einem Decoder
  zurückgelesen – Inhalt identisch mit den Nutzdaten.

## Entscheidungen (Nutzer, 17.10.2026)

- **E-39-1 = A – kein Ersatzname:** Ohne hinterlegten Kontoinhaber des
  maßgeblichen Kontos (Objektkonto vor Konto der Gesellschaft) wird kein
  GiroCode gedruckt. Grund: Seit Oktober 2025 gleichen Banken den
  Empfängernamen mit dem Kontoinhaber ab (Empfängerüberprüfung,
  Verordnung (EU) 2024/886); ein abweichender Name löst beim Mieter eine
  Warnung aus. Prüfhinweis (Stufe info, blockiert die Freigabe nicht)
  `master_data.account_holder_missing` in `packages/validators`.
- **E-39-2 = A – Nutzungsbeginn bei Mieterwechsel:** Hat dieselbe Einheit im
  Abrechnungszeitraum einen weiteren Mieter-Nutzungszeitraum und beginnt der
  eigene Zeitraum nach dem Periodenbeginn, lautet der Verwendungszweck
  „NK <Jahr> <Einheit> ab TT.MM.“ – im QR-Code und im Fließtext. Vormieter
  und Einzug nach Leerstand bleiben bei „NK <Jahr> <Einheit>“.

## Offen

- **E-39-3 Abschaltbarkeit:** Optionaler Schalter je Abrechnungszeitraum,
  falls ein Vermieter keinen QR-Code wünscht (derzeit nicht geplant).
