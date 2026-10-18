# PR-44 – Screenshots, Bedienhinweise und Musterabrechnungen

Stand: 17. Oktober 2026. Auftrag: Nutzerauftrag 17.10.2026 („Akzeptanz und
Mitarbeit für Dritte verbessern: keine Screenshots, keine Bedienhinweise,
keine Musterabrechnungen im Repository“). Baut auf PR-37 Teil 1
(Beispielobjekt) und PR-38 (Kurzanleitung) auf.

## Umfang

1. Freigabe von Binärdateien nur in `docs/medien/` mit Hash-Manifest
   (ADR-0012), Tests im Privacy-Scan.
2. `pnpm medien`: Muster-PDFs über `pnpm abrechnung`, Vorschaubild,
   Screenshots über `tests/e2e/medien.spec.ts`, Manifest.
3. Beispielobjekt mit lesbaren Namen, Anschrift und Rechnungen je Kostenart.
4. `pnpm abrechnung` liest auch App-Sicherungen (Schema v4/v5).
5. Rundgang mit Bedienhinweisen (`docs/medien/README.md`), Einbindung in
   README, Kurzanleitung, Beispiel-Beschreibung und CONTRIBUTING.

## Freigegebene Pfade

`docs/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `package.json`
(Skript), `scripts/abrechnung.mjs`, `scripts/erzeuge-medien.mjs`,
`scripts/scan-repository-content.mjs`, `tests/privacy`, `tests/e2e`,
`tests/integration/beispielobjekt.test.ts`, diese Datei.

## Abnahme

Privacy-Scan grün; Rundgang-Test grün; Beispielobjekt rechnet ohne
Kontrolldifferenz; Entscheidung zu ADR-0012 durch den Maintainer.

## Erweiterung (Nutzerauftrag 17.10.2026, zweite Runde)

- GiroCode aus PR-39 (`claude/confident-cannon-t7z4h4`, hier eingemergt)
  im Screenshot `11-girocode.png` und in den Muster-PDFs; QR-Inhalt mit
  einem Decoder zurückgelesen (EPC-Format, Betrag, Verwendungszweck).
- Beispielobjekt praxisnah und ohne Prüfhinweis (0 Fehler, 0 Warnungen,
  0 Hinweise); Test erzwingt das.
- Fiktive IBAN mit Bankleitzahl 00000000, Scan-Ausnahme mit Test
  (ADR-0012 Nr. 4). Im GiroCode-Branch meldete der Scan eine echte
  Beispiel-IBAN in `packages/pdf/tests/epc-girocode.test.ts`; behoben.

## Befunde aus dem Rundgang

Behoben:

- **Verbrauch**: Tabelle lief bei 1440 px rechts über; Spaltenköpfe mit
  Trennstelle, schmalere Datums- und Vorjahresspalte. Der Rundgang prüft,
  dass nicht mehr horizontal gescrollt werden muss.
- **Heizkreise → Brennstoffe**: Lieferliste mit `10.02.2025`, `2.500 l` und
  `2.600,00 €` (Test in `FuelPanel.test.tsx`).
- **PDF-Anrede**: „Sehr geehrte Familie Familie Muster“, wenn der
  Anzeigename „Familie“ schon enthält (Test in `address.test.ts`).

Offen (nicht in diesem PR):

- **Wasser nach Zähler**: erledigt mit [PR-45](PR-45-WASSER-NACH-ZAEHLER.md)
  (Schlüssel `water_consumption`, ADR-0013); das Beispiel verteilt Wasser
  seitdem nach Verbrauch.
- **Firma-Anrede**: „Sehr geehrte Damen und Herren Beispiel GmbH“ (bisher
  so getestet) wirkt ungewohnt; Vorschlag „Sehr geehrte Damen und Herren“.
