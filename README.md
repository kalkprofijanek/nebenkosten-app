# Nebenkosten-App

Kontrollierte Migration einer bestehenden, lokalen Nebenkostenabrechnungs-App
(eine einzelne `index.html`) in eine modulare, getestete TypeScript-Web­anwendung.
Die Fachlogik (Umlage, Heizkosten, FIFO-Brennstoffbewertung, Warmwasser, CO₂
nach CO2KostAufG, Vorauszahlungen, Freigabe, PDF) wird schrittweise und
nachweisbar verhaltensgleich in prüfbare Pakete überführt.

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
  schema/              Ziel-Datenmodell (Schema v4, Zod) + Legacy-v3-Schema + Migrationsvertrag
  import-export/       Legacy-v3-Importer (Byte-Eingang, Hashing, Migration)
  core/                Reine Berechnungsengine (Umlage, Heizkosten, CO₂)
  persistence/         Storage-Adapter (Memory, IndexedDB, Datei), Snapshots, Backup
  validators/          Formelle & fachliche Prüfungen, Freigabelogik  (geplant)
  pdf/                 Dokument-/PDF-Erzeugung aus Snapshots            (geplant)
  ui/                  Wiederverwendbare UI-Bausteine                   (geplant)
  test-fixtures/       Gemeinsame, anonymisierte Fixtures               (geplant)
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
vollständige CI-Lauf entspricht `pnpm ci`. In der GitHub-CI laufen dieselben
Schritte als separate Checks (`lint`, `typecheck`, diverse `*-tests`,
`coverage`, `build`, `e2e-smoke`, `privacy-scan`, `security-audit`,
`repository-guardrails`).

## Migrationsstand

Umgesetzt und auf `main` gemergt:

| PR    | Inhalt                          | Ergebnis                                 |
| ----- | ------------------------------- | ---------------------------------------- |
| PR 00 | Repository-Grundschutz          | Guards, CI, Datenschutzregeln            |
| PR 01 | Bestandsaufnahme & Refactor-Map | `legacy/behavior-map.md`                 |
| PR 02 | Workspace & TypeScript-Scaffold | pnpm-Monorepo, Toolchain, CI             |
| PR 03 | Schema & Legacy-v3-Mapping      | `packages/schema` (Zod, Cent, Migration) |
| PR 04 | Legacy-v3-Importer              | `packages/import-export`                 |
| PR 05 | Characterization Tests          | 15 Golden-Fälle, `docs/ROUNDING.md`      |
| PR 06 | Core-Berechnungsengine          | `packages/core`                          |
| PR 07 | Heizkosten- & CO₂-Modul         | FIFO, 70/30, Warmwasser, CO₂             |
| PR 08 | Persistenz & Backup             | `packages/persistence`                   |

Als Nächstes (Masterplan Abschnitt 20): PR 09 UI-Grundstruktur, PR 10
Validatoren & Freigabe, PR 11 PDF & Export, PR 12 Produktionsmigration.

Verbindliche Rechenvorgabe: Kontrolldifferenz-Toleranz **0,01 €** im Zielsystem
(der Legacy-Wert 0,50 € bleibt nur dokumentierter Warnwert, siehe
[`docs/ROUNDING.md`](docs/ROUNDING.md)).

## Dokumentation

- [`docs/PROJECT.md`](docs/PROJECT.md) – Projektauftrag und Invarianten
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) – Ziel-Datenmodell (Schema v4)
- [`docs/MIGRATION.md`](docs/MIGRATION.md) – v3→v4-Feldmapping und Pipeline
- [`docs/ROUNDING.md`](docs/ROUNDING.md) – Rundungsregeln je Rechenschritt
- [`docs/HEATING-CO2.md`](docs/HEATING-CO2.md) – Heizkosten- und CO₂-Logik
- [`docs/PERSISTENCE.md`](docs/PERSISTENCE.md) – Speicher- und Backup-Konzept
- [`docs/REVIEW-PROCESS.md`](docs/REVIEW-PROCESS.md) – Review- und Freigabeprozess
- [`docs/DECISIONS/`](docs/DECISIONS) – Architecture Decision Records

## Status

In aktiver, kontrollierter Migration. Noch keine Produktivfreigabe für den
Echtbetrieb; der Mehrbenutzer-/Mandantenbetrieb (Phase 2) beginnt erst nach
abgeschlossener Migration.
