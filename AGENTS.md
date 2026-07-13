# Gemeinsame Agentenregeln

Vor jeder Bearbeitung sind der Masterplan, die Projektdokumentation und die zugewiesene Datei unter `docs/TASKS/` vollständig zu lesen.

## Verbindliche Regeln

1. Nur im zugewiesenen Branch und eigenen Worktree arbeiten.
2. Nur die im Task freigegebenen Pfade ändern.
3. Fachliche Verträge und Schema-Versionen nie stillschweigend ändern.
4. Für jede Schemaänderung eine vorwärtsgerichtete Migration und Tests bereitstellen.
5. Keine echten personenbezogenen, Bank-, Verbrauchs-, Abrechnungs- oder Belegdaten committen.
6. Geldbeträge intern als ganze Centwerte speichern.
7. Tests vor der Implementierung schreiben und mindestens 80 Prozent Abdeckung für neuen ausführbaren Code erreichen.
8. Format, Lint, Typecheck, Tests und Build vor jedem Pull Request ausführen.
9. Kleine, nachvollziehbare Commits und vollständige PR-Beschreibungen erstellen.
10. Keine direkten Pushes auf `main` und kein automatischer Merge.
11. `legacy/index.html` niemals formatieren, normalisieren oder fachlich verändern.
12. Eingaben validieren, Fehler explizit behandeln und keine Geheimnisse hardcoden.

Die Prioritäten lauten: Datenschutz, fachliche Richtigkeit, Reproduzierbarkeit, Migrationsfähigkeit, Testbarkeit, Wartbarkeit, Bedienkomfort und erst danach Geschwindigkeit.
