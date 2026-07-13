## Ziel

PR 00 schützt die sanitisierte, noch nicht abschließend anonymitätsgeprüfte GitHub-Legacy-Referenz und etabliert den Repository-Grundschutz nach dem History-Rewrite.

## Umgesetzter Umfang

- dokumentierte Agenten-, Datenschutz-, Sicherheits- und Review-Regeln
- reproduzierbare Legacy-Prüfsumme
- automatisierter Repository- und Privacy-Guard
- erster CI-Workflow

## Nicht umgesetzt

Keine Fachlogik, Schema-, UI-, Persistenz- oder Build-Migration.

## Geänderte fachliche Regeln

Keine.

## Schemaänderungen

Keine.

## Migrationsauswirkungen

Keine weiteren; `legacy/index.html` bleibt bytegleich zum bereinigten Root-Commit. Die vorherige Sanitisation gegenüber der ausschließlich lokalen produktiven Original-App ist in ADR-0001 dokumentiert; sie gilt nicht als Nachweis vollständiger Anonymisierung.

## Tests

Node-Test-Suite und vollständiger Repository-Guard.

## Testbefehle und Ergebnisse

`npm.cmd run ci`: 11/11 Tests bestanden; Mindestabdeckung von 80 Prozent für Zeilen, Branches und Funktionen erzwungen. Repository-Guard und Legacy-SHA-256-Prüfung bestanden.

## Datenschutzprüfung

Verbotene private Pfade und Umgebungsdateien werden automatisiert blockiert. Der sanitisierte GitHub-Referenzstand bleibt ab dem bereinigten Root-Commit unverändert.

## Risiken

Alte Pull-Request-Refs und Commit-Objekte können weiterhin die verworfene Historie erreichen. Das Repository bleibt privat, bis GitHub Support die serverseitige Bereinigung bestätigt und eine erneute dokumentierte Inhalts-/Denylist-Prüfung der gesamten erreichbaren Historie bestanden ist. Die bereinigten Seed- und Klassifizierungsbereiche sind nicht vollständig verhaltensgleich mit der lokalen produktiven Original-App.

## Screenshots oder Beispielausgabe

Nicht zutreffend.

## Review-Schwerpunkte

Unverändertheit der sanitisierten GitHub-Baseline, Wirksamkeit der Ignore-Regeln, CI-Guardrails und korrekte Trennung vom lokalen produktiven Originalstand.

## Rollback

Branch verwerfen; der Stand von `main` bleibt unverändert.
