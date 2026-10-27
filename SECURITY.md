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

| Werkzeug       | Workflow        | Prüft                                    | Wirkung im Pull Request                |
| -------------- | --------------- | ---------------------------------------- | -------------------------------------- |
| gitleaks       | `security.yml`  | Geheimnisse in der gesamten Git-Historie | blockiert bei jedem Fund               |
| Semgrep        | `security.yml`  | Codemuster (SAST)                        | blockiert nur bei neuen Funden         |
| zizmor         | `security.yml`  | GitHub-Actions-Workflows                 | blockiert bei jedem Fund               |
| OSV-Scanner    | `security.yml`  | bekannte Schwachstellen in `pnpm-lock`   | blockiert nur bei neuen Schwachstellen |
| CodeQL         | `codeql.yml`    | tiefe Codeanalyse (TypeScript, Actions)  | Meldung über GitHub Code Scanning      |
| OSSF Scorecard | `scorecard.yml` | Sicherheitspraxis des Repositorys        | läuft nur auf `main` und wöchentlich   |

Ergebnisse von `main` und den wöchentlichen Läufen erscheinen unter _Security → Code scanning_. Ausnahmen stehen ausschließlich in `.gitleaks.toml` und `.github/zizmor.yml` und brauchen eine Begründung je Eintrag; echte Geheimnisse werden nie als Ausnahme eingetragen, sondern rotiert.
