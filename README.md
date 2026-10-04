# Nebenkosten-App

Betriebs- und Heizkostenabrechnung für Wohnraum – kostenlos, quelloffen und
**vollständig lokal im Browser**. Umlage nach BetrKV, Heizkosten nach HeizKV
(inkl. FIFO-Brennstoffbewertung und Warmwasser), CO₂-Kostenaufteilung nach
CO2KostAufG, Vorauszahlungsanpassung nach § 560 BGB und PDF-Abrechnungen.

**[▶ App im Browser öffnen](https://kalkprofijanek.github.io/nebenkosten-app/)**
· [Benutzerhandbuch](docs/BENUTZERHANDBUCH.md)
· [Mit Claude/ChatGPT arbeiten](docs/KI-ANLEITUNG.md)
· [Mitwirken](CONTRIBUTING.md)

> **Haftungsausschluss.** Die App ist ein Rechenwerkzeug und ersetzt keine
> Rechts- oder Steuerberatung. Für die Richtigkeit einer Abrechnung ist allein
> der Abrechnende verantwortlich. Bereitstellung ohne Gewährleistung gemäß
> [AGPL-3.0](LICENSE).

## Nutzung

**Aktuelle Version: 1.2.2 · Schema v5**

- Ausschließlich für **Desktop-Browser** gedacht (siehe
  [ADR-0002](docs/DECISIONS/ADR-0002-DESKTOP-ONLY.md)).
- Alle Daten bleiben **lokal im Browser** (IndexedDB); es gibt keinen Server,
  keine Anmeldung und keine Datenübertragung (Content Security Policy
  `connect-src 'none'`). Jeder Nutzer hat seinen eigenen Datenbestand.
- **Regelmäßig unter „Sicherung“ eine JSON-Sicherung herunterladen.** Werden
  die Browserdaten gelöscht, sind die Abrechnungsdaten ohne Sicherung verloren.
- Ablauf: **Jahresabrechnung** führt in acht Schritten von Objekt und Belegung
  über Heizung, Zähler, Energie und Kosten bis zu Berechnung, Freigabe, PDF und
  Sicherung. Prüfhinweise verlinken direkt auf die Korrekturstelle.
- Bankbuchungen lassen sich als CSV übernehmen
  ([unterstützte Formate](docs/BANK-CSV-FORMAT.md),
  [Beispieldatei](docs/beispiel/bankbuchungen-beispiel.csv)).
- Bestehende Daten der Alt-App: oben rechts über **Daten importieren** die
  `nk-daten.json` (Legacy v3) wählen. Die Importvorschau zeigt Migrationsbericht
  und fachliche Prüfung, bevor etwas übernommen wird.

Änderungen je Version: [`CHANGELOG.md`](CHANGELOG.md).

## Mitmachen

- **Fehler, Fachfragen, Wünsche:**
  [Issue eröffnen](https://github.com/kalkprofijanek/nebenkosten-app/issues/new/choose)
  – bitte **niemals echte Mieter-, Bank- oder Belegdaten** anhängen.
- **Code:** über Fork und Pull Request, siehe
  [`CONTRIBUTING.md`](CONTRIBUTING.md). KI-Coding-Agenten sind willkommen und
  lesen [`AGENTS.md`](AGENTS.md) automatisch.
- **Sicherheitslücken:** nicht öffentlich, sondern über
  [`SECURITY.md`](SECURITY.md).

## Projektablauf

Der verbindliche Arbeits-, Migrations- und Review-Ablauf steht in
[`MASTERPLAN_MIGRATION_FABLE_CODEX.md`](MASTERPLAN_MIGRATION_FABLE_CODEX.md).
Kurzregeln für Beitragende: [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md).

## Grundsätze

- **Migration vor Erweiterung.** Bestehendes, funktionierendes Verhalten darf
  nicht stillschweigend verloren gehen; neue Produktfunktionen kommen erst nach
  der Migration.
- **Deterministische Fachlogik.** Berechnungen sind unabhängig von DOM, React
  oder Persistenz. Geldbeträge werden intern ausschließlich in **ganzen Cent**
  gehalten, niemals als Fließkomma-Euro.
- **Kein stiller Datenverlust.** Beim Import bleibt jedes unbekannte Legacy-Feld
  erhalten (`legacyUnmapped`) und wird im Migrationsbericht ausgewiesen.
- **Änderungen nur über geprüfte Pull Requests.** Kein direkter Push auf `main`,
  gegenseitiges Review, menschliche Endabnahme.

## Datenschutz & Sicherheit

Produktive Abrechnungs-, Mieter-, Bank-, Verbrauchs- und Belegdaten gehören
**ausschließlich** in das lokal ignorierte Verzeichnis `private-data/` und
niemals nach GitHub. Details: [`docs/PRIVACY.md`](docs/PRIVACY.md),
[`SECURITY.md`](SECURITY.md).

Alle Testdaten und Fixtures sind frei erfunden (Mustermann/Musterstraße-Stil).
Zwei Guards laufen lokal und in der CI und blockieren versehentliche Lecks:

```bash
node scripts/verify-repository-guardrails.mjs   # Pflichtdateien, .gitignore, Legacy-SHA-256
node scripts/scan-repository-content.mjs        # E-Mail/IBAN/Token/Adress-Heuristik
```

`legacy/index.html` ist die **sanitisierte** Migrations-Referenz (verbindlicher
SHA-256 in `legacy/SHA256SUMS`) und darf nicht verändert werden. Sie ist nicht
bytegleich mit dem produktiven Original, das ausschließlich lokal verbleibt —
siehe [`docs/DECISIONS/ADR-0001-SANITIZED-LEGACY-BASELINE.md`](docs/DECISIONS/ADR-0001-SANITIZED-LEGACY-BASELINE.md).

## Projektstruktur

```text
apps/
  web/                 React/Vite-UI (nur Darstellung, keine Fachlogik)
packages/
  schema/              Ziel-Datenmodell (Schema v5, Zod), Migrationen v3→v5 und v4→v5
  import-export/       Legacy-v3-Importer (Byte-Eingang, Hashing, Migration)
  core/                Reine Berechnungsengine (Umlage, Heizkosten, CO₂, Messverbrauch)
  persistence/         Storage-Adapter (Memory, IndexedDB, Datei), Snapshots, Backup
  validators/          Formelle & fachliche Prüfungen, Freigabelogik
  pdf/                 Dokument-/PDF-Erzeugung aus Snapshots
  test-fixtures/       Gemeinsame, anonymisierte Fixtures
legacy/                Sanitisierte Referenz-App + Behavior-Map
tests/                 characterization, integration, migration, e2e, privacy, repository
docs/                  Architektur-, Daten-, Rundungs- und Prozessdokumentation
```

## Entwicklung

Voraussetzungen: **Node.js 22.23.1** (siehe `.node-version`) und **pnpm 11**
(via `corepack enable` oder `npm i -g pnpm@11`).

```bash
pnpm install

pnpm lint          # ESLint
pnpm typecheck     # TypeScript (Workspace)
pnpm test          # Architektur-, Repository-, Privacy-, Unit-, Integrations-,
                   # Migrations- und Characterization-Tests
pnpm build         # Alle Pakete bauen
pnpm privacy:scan  # Repository- und Inhalts-Guard
```

Weitere Skripte: `pnpm test:coverage`, `pnpm test:e2e`, `pnpm format`. Der
vollständige CI-Lauf entspricht `pnpm run ci`. In der GitHub-CI laufen dieselben
Schritte als separate Checks (`lint`, `typecheck`, diverse `*-tests`,
`coverage`, `build`, `e2e-smoke`, `privacy-scan`, `security-audit`,
`repository-guardrails`).

## Entwicklungsstand

Umgesetzt und auf `main` gemergt (Aufgabenbeschreibungen unter
[`docs/TASKS/`](docs/TASKS)):

| PR       | Inhalt                                  | Ergebnis                                                |
| -------- | --------------------------------------- | ------------------------------------------------------- |
| PR 00–02 | Grundschutz, Bestandsaufnahme, Scaffold | Guards, CI, pnpm-Monorepo                               |
| PR 03–05 | Schema, Legacy-Importer, Golden-Fälle   | Zod-Schema, v3-Import, Characterization Tests           |
| PR 06–07 | Berechnung, Heizkosten & CO₂            | Umlage, FIFO, 70/30, Warmwasser, CO2KostAufG            |
| PR 08–11 | Persistenz, UI, Freigabe, PDF           | lokaler Arbeitsablauf bis Einzelabrechnung              |
| PR 12–13 | Produktionsabnahme, Release-Build       | Vergleich, Rollback, GitHub Pages, `v1.0.0`             |
| PR 14–19 | Datensichten, Workflows, Bank, Tabellen | Kosten-, Buchungs- und Stammdaten-Arbeitsplätze         |
| PR 20    | Belegungen je Wohnung, Heizungsaudit    | Nutzerwechsel und Leerstände je Einheit                 |
| PR 21    | Geführte Jahresabrechnung               | acht Schritte mit Prüfhinweisen                         |
| PR 22    | Schema v5, Wohnungswärme aus Ablesungen | Messverbrauch, v4→v5-Migration, `v1.1.0`                |
| PR 47–50 | Praxisabgleich mit Echtbestand          | Versandanschrift, Flüssiggas, Importprüfung, `v1.1.1`   |
| PR 52–53 | Prüfhinweise, Verbrauchsschätzung       | „Betrifft“-Angaben, Schätzung § 9a HeizKV, `v1.1.2`     |
| PR 55    | Salden-Übersicht                        | Summen Nachzahlung/Guthaben, `v1.1.3`                   |
| PR 56    | PDF-Download, Briefkopf                 | Speichern-Link, Absender, Nutzungszeitraum, `v1.1.4`    |
| PR 57–58 | Rechtssichere PDFs, Vorauszahlungen     | § 7 HeizKV, CO2KostAufG, § 560 BGB, `v1.2.0`            |
| PR 59    | Zählerstände, Rechtstexte, Freigabe     | Verbrauchserfassung, § 6a HeizKV, `v1.2.1`              |
| PR 60    | Anschriftfeld Versand                   | Fensterkuvert/Versandbox, Zeilen ohne Umbruch, `v1.2.2` |

Verbindliche Rechenvorgabe: Kontrolldifferenz-Toleranz **0,01 €** im Zielsystem
(der Legacy-Wert 0,50 € bleibt nur dokumentierter Warnwert, siehe
[`docs/ROUNDING.md`](docs/ROUNDING.md)).

## Dokumentation

- [`docs/BENUTZERHANDBUCH.md`](docs/BENUTZERHANDBUCH.md) – Bedienung für Anwender
- [`docs/KI-ANLEITUNG.md`](docs/KI-ANLEITUNG.md) – Arbeiten mit Claude/ChatGPT
- [`docs/BANK-CSV-FORMAT.md`](docs/BANK-CSV-FORMAT.md) – CSV-Import von Bankbuchungen
- [`docs/PROJECT.md`](docs/PROJECT.md) – Projektauftrag und Invarianten
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) – Ziel-Datenmodell
- [`docs/MIGRATION.md`](docs/MIGRATION.md) – v3→v4-Feldmapping und Pipeline
- [`docs/ROUNDING.md`](docs/ROUNDING.md) – Rundungsregeln je Rechenschritt
- [`docs/HEATING-CO2.md`](docs/HEATING-CO2.md) – Heizkosten- und CO₂-Logik
- [`docs/PERSISTENCE.md`](docs/PERSISTENCE.md) – Speicher- und Backup-Konzept
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) – Build, Pages und Rollback
- [`docs/RELEASE-STATUS.md`](docs/RELEASE-STATUS.md) – offene Abschlussgates
- [`docs/REVIEW-PROCESS.md`](docs/REVIEW-PROCESS.md) – Review- und Freigabeprozess
- [`docs/DECISIONS/`](docs/DECISIONS) – Architecture Decision Records (u. a. ADR-0003 Mietkonto)

## Status

Version **1.2.2** ist veröffentlicht (GitHub Pages, Release-Tag `v1.2.2`). Das
Repository ist öffentlich und enthält ausschließlich fiktive Testdaten. Offen
für spätere Versionen: Import von Heizkostenverteiler-Werten des Messdienstes,
ein strukturiertes Importformat für KI-ausgelesene Eingangsrechnungen und ein
Mehrbenutzer-/Mandantenbetrieb.

## Lizenz

Copyright © 2026 kalkprofijanek und Mitwirkende.

Lizenziert unter der [GNU Affero General Public License v3.0](LICENSE)
(`AGPL-3.0-only`). Wer die App verändert und anderen – auch über ein
Netzwerk – bereitstellt, muss den geänderten Quellcode unter derselben Lizenz
zugänglich machen.
