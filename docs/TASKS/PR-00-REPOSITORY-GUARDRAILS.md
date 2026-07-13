# PR 00 – Sicherung und Repository-Grundschutz

## Ziel

Eine reproduzierbare, datenschutzgesicherte Entwicklungsbasis schaffen, ohne Fachlogik oder Legacy-Code zu verändern.

## Erlaubte Pfade

Root-Dokumentation und Konfiguration, `.github/`, `docs/`, `scripts/`, `tests/repository/` sowie neue Dokumente unter `legacy/`.

## Gesperrter Pfad

`legacy/index.html` darf nicht verändert werden.

## Akzeptanzkriterien

- Legacy-SHA-256 entspricht `726272e4438e3199ae154a7073741586e0d171647f39e271e6eb50e8f26cce0f`.
- Verbotene private Dateien werden nicht getrackt.
- Alle vorgeschriebenen `.gitignore`-Regeln sind vorhanden.
- Agenten-, Datenschutz-, Review- und Sicherheitsregeln sind dokumentiert.
- Der CI-Guard läuft mit read-only Repository-Rechten.
- Keine fachliche Funktion und kein Legacy-Byte wird geändert.

## Tests

- Unit-Tests für Ignore-Regeln, verbotene Pfade und Hashberechnung
- vollständiger Repository-Guard gegen den aktuellen Git-Stand
- SHA-256-Vergleich gegen den bisherigen produktiven Stand
- Prüfung des Git-Diffs für `legacy/index.html`

## Nicht umgesetzt

Workspace-Scaffold, Datenmodell, Fachlogik, UI, Persistenz und Deployment beginnen erst in späteren Pull Requests.
