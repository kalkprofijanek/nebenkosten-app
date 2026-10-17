# PR-39 – Screenshots, Bedienhinweise und Musterabrechnungen

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

## Befunde aus dem Rundgang (nicht in diesem PR behoben)

- **Verbrauch**: Die Tabelle läuft bei 1440 px Breite rechts über; die
  Statusspalte bricht buchstabenweise um. Deshalb kein Screenshot dieser
  Seite.
- **Heizkreise → Brennstoffe**: Lieferliste zeigt ISO-Datum und
  `3150.00 €` statt `10.02.2025` und `3.150,00 €`.
- **Beispielobjekt**: keine Zählerstände (nur Verbrauchseinheiten); für eine
  in allen Punkten HeizKV-konforme Musterabrechnung fehlen Vergleichswerte,
  Warmwasser-Wärmemenge und Zwischenablesung (siehe Warnungen in
  `docs/beispiel/README.md`).
