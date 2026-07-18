# PR 05 – Characterization Tests

Verantwortlich: Claude. Review: Codex. Freigabe: Mensch.
Bezug: Masterplan Abschnitt 6 (6.2/6.3), 9.5, 20 (PR 05), 21, 25.

## Ziel

Repräsentative, vollständig frei erfundene Abrechnungsfälle als Eingabe-Fixtures
im Ziel-Schema v4 bereitstellen und dazu die erwarteten Berechnungsergebnisse
als typisierte Golden-Werte (in ganzen Cent) festlegen. Diese Golden-Fixtures
sind die Vergleichsbasis, gegen die die Core-Engine in PR 06 validiert wird
(Characterization-/Approval-Ansatz). Die Rundungsregeln werden verbindlich in
`docs/ROUNDING.md` dokumentiert.

Die Core-Berechnungsengine wird in diesem PR **nicht** implementiert (PR 06).

## Umfang (umgesetzt)

- 15 frei erfundene Szenarien (`tests/characterization/scenarios.json`) als
  einzige Wahrheitsquelle; decken alle Mindestfälle aus Masterplan 20 ab.
- v4-Fixture-Builder (`build-app-data.ts`): Szenario → `AppDataFile`, beim
  Testlauf gegen `appDataFileSchema` validiert.
- Golden-Ergebnisse in Cent (`goldens.json`), aus der faktentreu extrahierten
  Legacy-`Engine.rechne` hergeleitet und verifiziert; Konvertierung Euro→Cent
  über `euroToCents`.
- Testrunner (`characterization.test.ts`): Schema-Validierung, Golden-Konsistenz
  (Kontrollidentität, Saldo, CO₂-/70-30-Aufteilung, Leerstand, Restcent),
  Abdeckungsprüfung, `it.todo` je Fall für den Engine-Vergleich in PR 06.
- `docs/ROUNDING.md`: Rundungsregeln je Rechenschritt inkl. offener
  Entscheidungen (Toleranz, Restcent-Verfahren).
- `tests/characterization/test-matrix.md`: Abdeckung der Rechenbereiche 6.2.
- CI-Einbindung: `test:characterization`, Aggregat `test`, CI-Job
  `characterization-tests`.

## Erlaubte Pfade

- `tests/characterization/**`
- `docs/ROUNDING.md`
- `docs/TASKS/PR-05-*.md`
- Minimal für CI-Einbindung (gemeinsame Dateien, im PR-Body ausgewiesen):
  `package.json` (Scripts `test:characterization`, `format`, `format:check`,
  Aggregat `test`), `vitest.characterization.config.ts`,
  `.github/workflows/ci.yml` (Job `characterization-tests`).

## Gesperrte Pfade

- `legacy/index.html` (nur lesen; `git diff main -- legacy/index.html` bleibt
  leer, SHA-256-Guard `30995a44…`).
- `packages/**` Produktivcode (Engine kommt in PR 06).
- alle übrigen Pfade.

## Verbindliche Entscheidungen

- Geldbeträge werden ausschließlich in ganzen Cent geführt; Konvertierung nur
  über `euroToCents` (kaufmännisch, halbe Einheit von der Null weg).
- Golden-Werte werden aus der Legacy-Rechenlogik hergeleitet; der Harness läuft
  im Scratchpad und wird nicht eingecheckt (er enthielt Legacy-Auszüge).
- Kontrolldifferenz-Toleranz der Fixtures: 1 Cent (strenge Masterplan-Vorgabe);
  Abweichung zum Legacy-Bestand (0,50 €) ist in `docs/ROUNDING.md` als offene
  Entscheidung dokumentiert.
- Direkt- und interne Kosten (`NICHT_UML`) stehen außerhalb der
  Kontrollidentität (Legacy-Verhalten) — als offene Entscheidung markiert.
- Betriebsstrom-Reallokation ist nicht Teil der Mindestfälle und auf PR 07
  verschoben (`test-matrix.md`).

## Akzeptanzkriterien

- Jede Eingabe-Fixture validiert gegen `appDataFileSchema`.
- Golden-Werte sind in sich konsistent (Kontrollidentität exakt in Cent,
  Kontrolldifferenz ≤ 1 Cent, Saldo = Anteil − VZ, CO₂-/70-30-Aufteilung).
- Alle Mindest-Testfälle aus Masterplan 20 sind abgedeckt (Abdeckungstest).
- Kein Test ist rot; Engine-Vergleiche sind als `it.todo` markiert.
- `pnpm test:characterization` läuft in der CI-Kette (eigener Job **und**
  `pnpm test`-Aggregat).
- Keine echten Daten; beide Guard-Scans grün; `legacy/index.html` unverändert.

## Nicht Teil dieses PR

- Core-Berechnungsengine und Engine-Vergleich (PR 06).
- Heizkosten-/CO₂-Modul inkl. Betriebsstrom-Reallokation (PR 07).
- Fachliche Plausibilitätsvalidatoren und Freigabelogik (PR 10).
