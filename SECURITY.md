# Sicherheit

## Sicherheitslücken melden

Bitte keine sensiblen Details in öffentlichen Issues veröffentlichen. Verwende stattdessen die privaten Security Advisories des GitHub-Repositorys:
<https://github.com/kalkprofijanek/nebenkosten-app/security/advisories/new>

Das gilt auch, wenn versehentlich echte personenbezogene Daten in einem Issue, Pull Request oder Commit gelandet sind.

## Daten, die nie committed werden dürfen

- produktive JSON-Exporte und `nk-daten.json`
- Mieter-, Eigentümer-, Bank- und Zahlungsdaten
- Rechnungen, Belege, Zählernummern und echte Verbrauchsdaten
- nicht anonymisierte Abrechnungen oder technische Objektunterlagen
- `.env`-Dateien, Zugangsdaten, Tokens und private Schlüssel

Bei versehentlicher Veröffentlichung ist die Arbeit zu stoppen. Geheimnisse müssen sofort rotiert und betroffene Git-Historie sowie ähnliche Fundstellen geprüft werden.

## Architektur und Datenfluss

Die veröffentlichte App verarbeitet alle Daten ausschließlich lokal im Browser. Die Content Security Policy verbietet ausgehende Verbindungen (`connect-src 'none'`). Änderungen, die Daten an Dritte übertragen, sind nur nach eigener Architekturentscheidung (ADR) zulässig.

## Automatische Sicherheitsprüfungen

| Werkzeug       | Workflow         | Prüft                                    | Wirkung im Pull Request                |
| -------------- | ---------------- | ---------------------------------------- | -------------------------------------- |
| gitleaks       | `guardrails.yml` | Geheimnisse in der gesamten Git-Historie | blockiert bei jedem Fund               |
| zizmor         | `guardrails.yml` | GitHub-Actions-Workflows                 | blockiert ab Schweregrad „medium“      |
| Semgrep        | `security.yml`   | Codemuster (SAST)                        | blockiert nur bei neuen Funden         |
| OSV-Scanner    | `security.yml`   | bekannte Schwachstellen in `pnpm-lock`   | blockiert nur bei neuen Schwachstellen |
| CodeQL         | `codeql.yml`     | tiefe Codeanalyse (TypeScript, Actions)  | Meldung über GitHub Code Scanning      |
| OSSF Scorecard | `scorecard.yml`  | Sicherheitspraxis des Repositorys        | läuft nur auf `main` und wöchentlich   |

Ergebnisse von `main` und den wöchentlichen Läufen erscheinen unter _Security → Code scanning_. Ausnahmen stehen ausschließlich in `.gitleaks.toml` und brauchen eine Begründung je Eintrag; echte Geheimnisse werden nie als Ausnahme eingetragen, sondern rotiert.

## Lieferkette der Werkzeuge

- **pnpm** ist in `package.json` (`packageManager`) mit Version und sha512 festgelegt. Die CI aktiviert genau diese Angabe über `corepack prepare --activate`, das den Download gegen den Hash prüft.
- **Install-Skripte** von Abhängigkeiten sind gesperrt (`strictDepBuilds: true`, leere `allowBuilds` in `pnpm-workspace.yaml`). Eine Freigabe braucht einen Eintrag mit Begründung.
- **Schlüsseldateien** (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials.json`) sind ignoriert, und `scripts/verify-repository-guardrails.mjs` lehnt sie als versionierte Dateien ab.

## Einstellungen, die nur im Repository gesetzt werden können

- **Actions → Fork pull request workflows:** „Send write tokens to workflows from fork pull requests“ muss ausgeschaltet bleiben. Die PR-Jobs mit `security-events: write` führen keinen PR-Code aus, verlassen sich aber auf die Herabstufung des Tokens bei Forks. Das wird wichtig, wenn das Repository privat wird.
- **Environment `github-pages`:** Deployment nur von `main` zulassen (siehe `docs/TASKS/PR-49-EIGENE-HERKUNFT-UND-PAGES.md`).
