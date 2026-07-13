## Ziel

PR 00 vervollständigt die unveränderte Legacy-Sicherung und etabliert den Repository-Grundschutz.

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

Keine; `legacy/index.html` bleibt bytegleich.

## Tests

Node-Test-Suite und vollständiger Repository-Guard.

## Testbefehle und Ergebnisse

`npm.cmd run ci`: 11/11 Tests bestanden; Mindestabdeckung von 80 Prozent für Zeilen, Branches und Funktionen erzwungen. Repository-Guard und Legacy-SHA-256-Prüfung bestanden.

## Datenschutzprüfung

Verbotene private Pfade und Umgebungsdateien werden automatisiert blockiert. Der Legacy-Referenzstand bleibt unverändert.

## Risiken

Der öffentliche Legacy-Snapshot enthält vorbestehende geschäftliche Referenzangaben; eine Bereinigung ist nicht Teil dieses PRs.

## Screenshots oder Beispielausgabe

Nicht zutreffend.

## Review-Schwerpunkte

Unverändertheit der Legacy-Datei, Wirksamkeit der Ignore-Regeln und CI-Guardrails.

## Rollback

Branch verwerfen; der Stand von `main` bleibt unverändert.
