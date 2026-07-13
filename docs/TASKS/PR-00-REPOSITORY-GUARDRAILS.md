# PR 00 – Sicherung und Repository-Grundschutz

## Ziel

Eine reproduzierbare, datenschutzgesicherte Entwicklungsbasis schaffen, ohne Fachlogik oder Legacy-Code zu verändern.

## Erlaubte Pfade

Root-Dokumentation und Konfiguration, `.github/`, `docs/`, `scripts/`, `tests/repository/` sowie neue Dokumente unter `legacy/`.

## Gesperrter Pfad

`legacy/index.html` darf nicht verändert werden.

## Akzeptanzkriterien

- Die sanitisierte, noch nicht abschließend anonymitätsgeprüfte GitHub-Referenz entspricht SHA-256 `874af27415add7aeea330592c3e45da78a7c3e20e46dfcb8d71abbba6d21abab`.
- Verbotene private Dateien werden nicht getrackt.
- Alle vorgeschriebenen `.gitignore`-Regeln sind vorhanden.
- Agenten-, Datenschutz-, Review- und Sicherheitsregeln sind dokumentiert.
- Der CI-Guard läuft mit read-only Repository-Rechten.
- Keine fachliche Funktion und kein Legacy-Byte wird geändert.

## Tests

- Unit-Tests für Ignore-Regeln, verbotene Pfade und Hashberechnung
- vollständiger Repository-Guard gegen den aktuellen Git-Stand
- SHA-256-Vergleich gegen den bereinigten GitHub-Root; der produktive Originalstand wird ausschließlich lokal geprüft
- Prüfung des Git-Diffs für `legacy/index.html`

## Nicht umgesetzt

Workspace-Scaffold, Datenmodell, Fachlogik, UI, Persistenz und Deployment beginnen erst in späteren Pull Requests.
