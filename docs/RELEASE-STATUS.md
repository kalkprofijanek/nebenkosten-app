# Release-Status Version 1.0.0

Stand: 31. Juli 2026. Diese Datei enthält ausschließlich technische Nachweise;
lokale produktive Abnahmeberichte bleiben unter `private-data/` und werden
nicht veröffentlicht.

| Abschlusskriterium                | Status           | Nachweis / nächster Schritt                                    |
| --------------------------------- | ---------------- | -------------------------------------------------------------- |
| PR 00–12 gemergt                  | Erfüllt          | PR 12: #28, Merge `75c1869`                                    |
| Menschliche Freigabe PR 12        | Erfüllt          | Freigabe vor Merge von PR #28                                  |
| CI für PR 12                      | Erfüllt          | 15/15 Prüfungen grün                                           |
| Code- und Security-Review         | Erfüllt          | keine offenen Blocker                                          |
| Produktionsmigration / Vergleich  | Lokal            | Nachweise bleiben absichtlich in `private-data/pr12/`          |
| Rollback-Weg                      | Erfüllt          | Backup, `before_import`, atomarer `before_restore` und Runbook |
| Reproduzierbarer statischer Build | Erfüllt in PR 13 | Build, Artefakt-Guard und Browser-Test                         |
| Repository öffentlich             | Erfüllt          | `kalkprofijanek/nebenkosten-app`                               |
| Branch-Schutz `main`              | Offen            | nach gesonderter GitHub-Freigabe aktivieren                    |
| GitHub Pages aktiviert            | Offen            | Quelle „GitHub Actions“ nach Go-live-Freigabe aktivieren       |
| Öffentlicher Smoke-Test           | Offen            | nach erstem Pages-Deployment                                   |
| Release-Tag `v1.0.0`              | Offen            | erst nach erfolgreichem öffentlichem Smoke-Test                |

Ein offener Punkt darf nicht durch Dokumentation als erfüllt umgedeutet werden.
Die finale Produktfreigabe besteht erst nach Branch-Schutz, Pages-Smoke-Test
und unveränderlichem Release-Tag.
