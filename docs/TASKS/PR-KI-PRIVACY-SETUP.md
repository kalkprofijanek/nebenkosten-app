# KI-Privacy: lokale Vorschaltlösung dokumentieren

Stand: 9. November 2026. Auftrag: Nutzerauftrag in Codex; README,
Agentenregeln und Datenschutzdokumentation um eine lokale Vorschaltlösung
ergänzen und einen Pull Request erstellen.

## Ziel und Umfang

PrivAiTe als experimentellen lokalen Filter für Codex CLI und Claude Code
beschreiben, Presidio als enthaltenen Baustein und möglichen späteren Ausbau
einordnen. Git-Ausschluss, lokale Ausführung und Cloud-Modellverarbeitung
klar unterscheiden. Keine Zusage vollständiger Anonymisierung.

## Freigegebene Pfade

- `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`
- `docs/PRIVACY.md`, `docs/DATENSCHUTZ-KI.md`, `docs/KI-ANLEITUNG.md`
- `docs/KI-PRIVACY-SETUP.md`, diese Task-Datei
- `apps/web/src/features/ki/ai-prompts.ts` und `AiAssistPanel.tsx`:
  ausschließlich Anleitungstexte an die Dokumentation angleichen.

## Präzisierung nach Nutzerhinweis

Wegen geringer Verbreitung und Codex-Beta keine pauschale Empfehlung von
PrivAiTe für sensible Originaldaten. Reifegrad anhand GitHub-Metadaten prüfen
und dokumentieren; Presidio als etablierteren Baustein für einen möglichen
lokalen Ausbau einordnen. Standard bleibt vorab lokale Bereinigung.

## Akzeptanz und Prüfung

- Einrichtung mit lokalem Loopback-Listener, deutscher Erkennung,
  Codex-Responses-Gateway und Fehlerblockierung dokumentiert.
- Einrichtung und Prüfschritte verwenden ausschließlich künstliche Daten.
- Ungeprüfte Dateien, Bilder, PDFs und andere Übertragungswege sind nicht
  pauschal als geschützt beschrieben; Originale und Rückzuordnung bleiben
  außerhalb des Cloud-Agenten-Arbeitsbereichs.
- Keine automatischen Installationen, Anbieteranfragen oder Änderungen an
  persönlichen Codex-Einstellungen durch diesen PR.
- Widersprüchliche Aussagen in bisherigen Anleitungen und den kopierbaren
  App-Texten berichtigt; frühere Entscheidung E-43-2 eingeordnet.
- Format, Lint, Typecheck, Tests, Build und Privacy-Scan ausführen;
  vorhandene Prompt-Konsistenztests verwenden. Keine neue Laufzeitlogik,
  keine neuen Tests für reine Textänderungen.
- Änderungen in eigenem Branch/Worktree; Pull Request, kein Merge.
