# PR 02 – Workspace und TypeScript-Scaffold

Status: vorbereitet; Implementierungs-Start-Gate noch offen  
Verantwortlich: Codex  
Review: Claude/Fable  
Bezug: `MASTERPLAN_MIGRATION_FABLE_CODEX.md`, insbesondere Abschnitte 2, 4, 13, 17, 19 und 20

## Capability

PR 02 schafft eine reproduzierbare TypeScript-Entwicklungsumgebung. Danach können Codex und
Claude/Fable getrennte Fachpakete implementieren, ohne Build-, Test-, Formatierungs- oder
CI-Grundlagen erneut festlegen zu müssen. Dieser PR enthält ausschließlich Infrastruktur,
Paketgrenzen und technische Smoke-Tests.

## Start-Gate

Die Implementierung beginnt erst, wenn:

1. das Claude/Fable-Review von PR 00 abgeschlossen ist,
2. alle BLOCKER und MAJOR aus PR 00 behoben sind,
3. PR 00 manuell nach `main` gemergt wurde,
4. PR 01 auf diesen Stand aktualisiert, geprüft und manuell gemergt wurde,
5. `main` sauber ist und alle vorhandenen Prüfungen erfolgreich laufen,
6. der PR-02-Branch auf dem dann aktuellen `main` basiert.

Der vorbereitende lokale Branch `codex/pr02-workspace-scaffold` basiert vorläufig auf dem
aktuellen PR-00-Stand. Vor der ersten Implementierung wird er auf den freigegebenen `main`
neu ausgerichtet. Bis dahin wird er nicht gepusht und kein Pull Request geöffnet.

## Verbindliche Constraints

- Das Repository bleibt privat; kein Deployment und keine Aktivierung von GitHub Pages.
- `legacy/index.html` bleibt unverändert und durch die PR-00-Prüfungen geschützt.
- Repository-, Datenschutz- und Coverage-Guardrails aus PR 00 bleiben erhalten.
- Keine realen Personen-, Objekt-, Bank-, Verbrauchs-, Abrechnungs- oder Belegdaten.
- Keine Secrets oder echten Werte in `.env.example`, Tests, Screenshots oder Logs.
- React bleibt UI-Schicht. Core-Pakete importieren weder React noch DOM oder Browser-Storage.
- Keine Schema-/Migrationsentscheidung vor PR 03 und kein Storage-Adapter vor PR 04.
- Keine fachliche Berechnung, Rundung, Validierung, PDF- oder Import-/Export-Logik.
- Workflows setzen auf oberster Ebene `permissions: contents: read`; PR-Jobs erhalten keine
  Secrets. `actions/checkout` nutzt `persist-credentials: false`. Ungeprüfte Werte aus dem
  GitHub-Kontext werden niemals direkt in `run:` interpoliert.
- Actions werden auf vollständige Commit-SHAs mit Versionskommentar fixiert, kontrolliert
  über Dependabot aktualisiert und jeder Job erhält ein angemessenes `timeout-minutes`.
- Reproduzierbare Installation mit committed Lockfile und `--frozen-lockfile`.
- Eine konkrete, zum Implementierungsstart unterstützte Node-22.x-Patchversion wird in
  `.node-version` und CI identisch fixiert; Updates erfolgen bewusst als eigener
  Sicherheits-/Tooling-Commit. Die pnpm-Version wird im `packageManager`-Feld fixiert.
- Bestehende Node-Tests aus PR 00 werden ergänzt, nicht durch Vitest ersetzt.
- Der Merge bleibt eine menschliche Entscheidung.

## Geplante Struktur

```text
apps/web/
packages/core/
packages/schema/
packages/validators/
packages/persistence/
packages/import-export/
packages/pdf/
packages/ui/
packages/test-fixtures/
tests/characterization/
tests/integration/
tests/migration/
tests/e2e/
```

Jedes Workspace-Paket erhält einen eindeutigen Namen unter `@nebenkosten/*`,
`private: true`, ein eigenes `package.json`, ein `tsconfig.json` und einen API-neutralen,
kompilierbaren Einstiegspunkt. Fachliche Schnittstellen werden nicht vorweggenommen.

## Root- und Tooling-Vertrag

PR 02 erstellt oder erweitert:

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.node-version`
- `.editorconfig`, ESLint- und Prettier-Konfiguration
- Vitest- und Playwright-Konfiguration
- `apps/web` mit Vite, React und TypeScript
- `.github/workflows/ci.yml`
- diese Task-Datei und eine PR-Beschreibung

Keine zusätzliche Build-Orchestrierung wie Turborepo und kein UI-Framework in PR 02.

Die neutrale Web-App muss ohne Laufzeitfehler starten, den Entwicklungsstand sichtbar
kennzeichnen und darf weder Formulare noch Demo-Mieter, Demo-Objekte, Datenhaltung,
Legacy-Zugriff oder fachliche Beispielwerte enthalten.

## Skriptvertrag

Die Root-Skripte bieten mindestens:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:architecture
pnpm test:repository
pnpm test:repository:coverage
pnpm test:unit
pnpm test:unit:coverage
pnpm test:integration
pnpm test:migration
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm check:repository
pnpm privacy:scan
pnpm security:audit
pnpm ci
```

`test:repository:coverage` führt die vorhandenen Node-Tests mit
`node --test --experimental-test-coverage` und mindestens 80 % für Lines, Branches und
Functions aus. `test:unit:coverage` misst den neuen ausführbaren TypeScript-/React-Code
separat mit Vitest/V8 und ebenfalls mindestens 80 %. Generierte Dateien oder reine
Scaffold-Einstiegspunkte dürfen nur mit dokumentierter Begründung ausgeschlossen werden.
`test:coverage` aggregiert beide Coverage-Gates, ohne Ergebnisse zu vermischen.

`pnpm test` aggregiert Architektur-, Repository-, Unit-, Integrations- und Migrationstests.
Die einzelnen Skripte bleiben als getrennte CI-Checks sichtbar. `privacy:scan` ist ein
eindeutig benannter Denylist-/Pfadcheck. `security:audit` führt mindestens
`pnpm audit --audit-level high` aus; HIGH und CRITICAL blockieren Commit/PR. Eine Ausnahme
benötigt dokumentierte Begründung, Risikobewertung, Ablaufdatum und menschliche Freigabe.

Playwright verwendet ausschließlich Chromium. CI installiert ihn reproduzierbar mit
`pnpm exec playwright install --with-deps chromium`. `playwright.config.ts` startet über
`webServer` die lokale Web-App auf einer festen `127.0.0.1`-Adresse und einem festen Port;
in CI wird kein vorhandener Server wiederverwendet. `playwright-report/`, `test-results/`
und Browser-Ausgabeordner werden ignoriert und nur bei Fehlern als kurzlebige CI-Artefakte
bereitgestellt.

## Test- und Akzeptanzmatrix

| Bereich | Prüfung | Akzeptanz |
|---|---|---|
| Installation | `pnpm install --frozen-lockfile` | erfolgreich ohne Lockfile-Änderung |
| Format | `pnpm format:check` | keine Abweichung |
| Lint | `pnpm lint` | keine Warnungen oder Fehler |
| Typen | `pnpm typecheck` | alle Workspaces fehlerfrei |
| Architektur | `pnpm test:architecture` | Core-Pakete importieren weder React/DOM noch Browser-Storage |
| Repository | `pnpm check:repository` | PR-00-Guard vollständig grün |
| Repository-Tests | `pnpm test:repository` | bestehende Node-Tests vollständig grün |
| Unit | `pnpm test:unit` | Vitest-Smoke-Tests vollständig grün |
| Integration | `pnpm test:integration` | Workspace-Auflösung und Web-Import ohne Fachlogik grün |
| Migration | `pnpm test:migration` | technische Hülle vorhanden; keine erfundene Fachmigration |
| Tests gesamt | `pnpm test` | alle getrennten Testgruppen grün |
| Repository-Coverage | `pnpm test:repository:coverage` | Lines, Branches und Functions jeweils mindestens 80 % |
| Vitest-Coverage | `pnpm test:unit:coverage` | neuer ausführbarer Code jeweils mindestens 80 % |
| Coverage gesamt | `pnpm test:coverage` | beide getrennten Coverage-Gates grün |
| Build | `pnpm build` | alle Pakete und die Web-App reproduzierbar gebaut |
| E2E | Chromium installieren, dann `pnpm test:e2e` | deterministischer lokaler Webserver; Root-Element sichtbar; keine Console Errors |
| Legacy | Hash und Git-Diff | `legacy/index.html` unverändert |
| Datenschutz | `pnpm privacy:scan` plus Review | keine sensiblen Inhalte |
| Abhängigkeiten | `pnpm security:audit` | keine HIGH-/CRITICAL-Funde ohne genehmigte Ausnahme |
| CI | GitHub Actions auf Linux | getrennte Checks grün; minimale Rechte, Timeouts und SHA-Pins |
| Lokal | vollständige Befehlsfolge unter Windows | vollständig grün |

Die fünf Mindestbefehle des Masterplans bleiben zwingend: `pnpm install`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` und `pnpm build`.

## TDD- und Implementierungsreihenfolge

1. Freigegebenen Basis-Commit und Legacy-Hash verifizieren.
2. Unterstützte Node-22.x-Patchversion und pnpm-Version fixieren.
3. Root-Workspace, Lockfile und TypeScript-Basis anlegen.
4. Zuerst fehlschlagende Scaffold-/Importtests erstellen.
5. API-neutrale Pakethüllen minimal implementieren.
6. Zuerst fehlschlagenden Web-App- und E2E-Smoke-Test erstellen.
7. Vite-/React-Scaffold minimal bis grün implementieren.
8. ESLint-Importgrenzen/Architekturtest, Prettier und PR-00-Prüfungen integrieren.
9. Getrennte Coverage-, Datenschutz- und Dependency-Audit-Gates integrieren.
10. Deterministischen Playwright-Webserver und Chromium-CI-Installation konfigurieren.
11. CI mit minimalen Rechten, Timeouts und SHA-Pins erstellen.
12. Alle lokalen Abnahmebefehle ausführen.
13. Security- und Code-Review durchführen und Befunde beheben.
14. Konventionell committen, Branch pushen und Draft-PR öffnen.
15. Claude/Fable-Review abwarten; kein Merge durch Codex.

## Non-Goals

- Datenmodell, Zod-Fachschemas oder Legacy-v3-Mapping
- Berechnungs-, Rundungs- oder Validierungslogik
- IndexedDB, File-System- oder andere Storage-Adapter
- JSON-Import/-Export oder PDF-Erzeugung
- echte Navigation, Fachseiten, Benutzerkonten, Backend oder API
- produktive Beispieldaten oder Deployment
- Änderungen an der Legacy-App

## Risiken

- Das neue Root-Testskript darf die PR-00-Tests nicht verdrängen.
- Leere Pakete dürfen keine erfundenen Fachschnittstellen festschreiben.
- Buildausgaben und Playwright-Artefakte dürfen nicht getrackt werden.
- Ein fehlendes Lockfile oder eine unfixierte pnpm-Version würde CI unreproduzierbar machen.
- Schwachstellen-Audits benötigen Netzwerkzugriff und können Registry-Ausfälle erleben;
  technische Ausfälle werden von echten Findings unterscheidbar protokolliert, aber nicht
  stillschweigend als Erfolg behandelt.
- Vorzeitige Implementierung auf dem provisorischen Branch würde einen unklaren
  Sicherheitsstand und unnötige Rebase-Konflikte erzeugen.

## Vorbereitend verifiziert

- Getrennter Worktree: `C:\Projekte\nebenkosten-app-codex-pr02`
- Lokaler Branch: `codex/pr02-workspace-scaffold`
- Lokal vorhanden: Node `v24.17.0`, Corepack `0.35.0`, pnpm `11.7.0`
- CI-Ziel bleibt eine exakt fixierte Node-22.x-Patchversion; lokale Node-24-Verfügbarkeit
  ändert diese Vorgabe nicht.

## Offene technische Festlegung beim Start

Empfohlene Defaults, vor dem ersten Lockfile-Commit unter der fixierten Node-Version zu
verifizieren:

- eine zum Startzeitpunkt unterstützte Node-22.x-Patchversion in `.node-version` und CI
- pnpm `11.7.0` im `packageManager`-Feld, unter dieser Node-Version gegenzuprüfen
- Namespace `@nebenkosten/*`
- V8 als Vitest-Coverage-Provider
- bestehender Guardrail-Workflow plus separater `ci.yml`
- kompilierbare, API-neutrale Einstiegspunkte für alle Zielpakete
