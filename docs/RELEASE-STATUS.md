# Release-Status

Stand: 10. Oktober 2026 (Abschnitt Version 1.0.0: 9. August 2026). Diese Datei enthält ausschließlich technische Nachweise;
lokale produktive Abnahmeberichte bleiben unter `private-data/` und werden
nicht veröffentlicht.

| Abschlusskriterium                | Status           | Nachweis / nächster Schritt                                    |
| --------------------------------- | ---------------- | -------------------------------------------------------------- |
| PR 00–12 gemergt                  | Erfüllt          | PR 12: #28, Merge `75c1869`                                    |
| Menschliche Freigabe PR 12        | Erfüllt          | Freigabe vor Merge von PR #28                                  |
| CI für PR 12                      | Erfüllt          | 15/15 Prüfungen grün                                           |
| Code- und Security-Review         | Erfüllt          | keine offenen Blocker                                          |
| Produktionsmigration / Vergleich  | Erfüllt          | Abschluss vom Maintainer bestätigt (10.10.2026), Bericht lokal |
| Rollback-Weg                      | Erfüllt          | Backup, `before_import`, atomarer `before_restore` und Runbook |
| Reproduzierbarer statischer Build | Erfüllt in PR 13 | Build, Artefakt-Guard und Browser-Test                         |
| Repository öffentlich             | Erfüllt          | `kalkprofijanek/nebenkosten-app`                               |
| Branch-Schutz `main`              | Erfüllt          | 15 strikte Pflichtprüfungen, Admin-Durchsetzung aktiv          |
| GitHub Pages aktiviert            | Erfüllt          | Deployment ausschließlich über GitHub Actions                  |
| Öffentlicher Smoke-Test           | Erfüllt          | HTTPS, Navigation, CSP und lokale Datenhaltung geprüft         |
| Release-Tag `v1.0.0`              | Erfüllt          | veröffentlichter Tag auf Merge-Commit von PR #29               |

Ein offener Punkt darf nicht durch Dokumentation als erfüllt umgedeutet werden.
Die technische Veröffentlichung von `v1.0.0` ist abgeschlossen. Bei der
anschließenden lokalen Produktionsabnahme wurde festgestellt, dass vorhandene
Kostenpositionen und Bankbuchungen nicht vollständig sichtbar waren; die
produktive Übernahme wurde bis zur Korrektur (PR 14) angehalten.

**Nachtrag 10. Oktober 2026:** Der Maintainer hat bestätigt, dass die
Produktionsmigration abgeschlossen ist. Der Abnahmebericht liegt
ausschließlich lokal (`private-data/`) und wird nicht veröffentlicht.
Aktueller Release-Tag ist `v1.3.0`; Änderungen danach stehen in
`CHANGELOG.md` unter „Unveröffentlicht“.
