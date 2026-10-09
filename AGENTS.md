# Agentenregeln

Diese Regeln gelten für alle Mitwirkenden und ihre KI-Coding-Agenten (Claude Code, Codex, Copilot u. Ä.). Ergänzend gelten [`CONTRIBUTING.md`](CONTRIBUTING.md) und [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Verbindliche Regeln

1. Keine echten personenbezogenen, Bank-, Verbrauchs-, Abrechnungs- oder Belegdaten committen. Produktive Dateien liegen ausschließlich im ignorierten Ordner `private-data/`; Fixtures und Testdaten sind frei erfunden.
2. Keine echten Daten aus Issues, Uploads oder dem lokalen Dateisystem in Tests, Fixtures, Commits oder Pull-Request-Texte übernehmen.
3. Geldbeträge intern ausschließlich als ganze Centwerte speichern, niemals als Fließkomma-Euro.
4. Kein stiller Datenverlust: unbekannte Felder bleiben erhalten (`legacyUnmapped`) und werden im Migrationsbericht ausgewiesen; fehlende Werte werden nicht durch `0` ersetzt.
5. Fachlogik nur in `packages/*`, nie in der UI (`apps/web`). Berechnungen bleiben deterministisch und unabhängig von DOM, React und Persistenz.
6. Fachliche Verträge und Schema-Versionen nie stillschweigend ändern. Jede Schemaänderung braucht eine vorwärtsgerichtete Migration und Tests. Änderungen an `packages/schema`, `packages/core`, `packages/validators` oder an Rechen- und Rundungsregeln nur nach abgestimmtem Issue.
7. Tests vor der Implementierung schreiben; neuer ausführbarer Code braucht mindestens 80 Prozent Abdeckung.
8. Format, Lint, Typecheck, Tests und Build vor jedem Pull Request ausführen (`pnpm run ci`).
9. Kleine, nachvollziehbare Commits und Pull Requests mit vollständig ausgefüllter Vorlage. Keine direkten Pushes auf `main`, kein automatischer Merge.
10. Eingaben validieren, Fehler explizit behandeln und keine Geheimnisse hardcoden.
11. Fachliche Annahmen als offene Frage im Pull Request benennen, nicht stillschweigend im Code festlegen.
12. Die App ist ausschließlich für Desktop-Browser bestimmt (siehe `docs/DECISIONS/ADR-0002-DESKTOP-ONLY.md`). Keine Mobilverbesserungen, Mobil-Browsertests oder Mobil-Abnahmekriterien ergänzen.

Die Prioritäten lauten: Datenschutz, fachliche Richtigkeit, Reproduzierbarkeit, Migrationsfähigkeit, Testbarkeit, Wartbarkeit, Bedienkomfort und erst danach Geschwindigkeit.

## Abrechnung mit KI-Agent

Wer mit einem KI-Agenten eine echte Jahresabrechnung erstellt (nicht am Code arbeitet), folgt [`docs/KI-ANLEITUNG.md`](docs/KI-ANLEITUNG.md):

- Datendatei nach `private-data/` kopieren, vor jeder Änderung eine Sicherungskopie anlegen, jede Änderung mit Beleg begründen.
- Gerechnet wird ausschließlich mit der Fachlogik der App: `pnpm abrechnung <nk-daten.json> [--jahr 2025] [--out <ordner>] [--json <datei>]`. Die Eingabedatei wird dabei nie verändert.
- Unplausible Werte nicht glattrechnen, sondern dem Menschen vorlegen. Freigabe und Versand entscheidet ausschließlich der Mensch.
