# PR 01 – Bestandsaufnahme und Refactor-Map

Verantwortlich: Fable
Review: Codex
Bezug: `MASTERPLAN_MIGRATION_FABLE_CODEX.md`, Abschnitt 20 (PR 01), Abschnitt 21
(Masterauftrag Fable).

## Ziel

Nachvollziehbare Inventarisierung der bestehenden Single-File-Anwendung
`legacy/index.html`, bevor irgendein Umbau der Fachlogik beginnt. Ergebnis ist
`legacy/behavior-map.md`: migrationskritische Funktionen werden tief beschrieben;
gleichartige migrationsrelevante UI-/Hilfsfunktionen dürfen gruppiert werden, müssen aber in
einem Coverage-Anhang lückenlos mit Name, Zeile, Gruppe, Ziel-Package und Prüftiefe
erscheinen. Reine Präsentationshelfer ohne Daten-, Sicherheits- oder Fachwirkung werden
separat mit Name, Zeile und überprüftem Ausschlussgrund nachgewiesen.
Dokumentiert werden außerdem globale Objekte/Abhängigkeiten, Datenmodell (Schema Version 3),
zentrale Rechenwege, sämtliche Rundungsquellzeilen, Validierungen/Prüfungen und PDF-Ausgaben.
Unsichere oder nur gesichtete Bereiche werden ausdrücklich markiert statt geraten.

## Akzeptanzkriterien (aus Masterplan Abschnitt 20, PR 01)

- Jede migrationsrelevante Legacy-Funktion ist entweder tief beschrieben oder in einer
  eindeutig benannten Funktionsgruppe erfasst und einem Ziel-Package zugeordnet.
- Der Coverage-Anhang lässt keine erkannte Funktions-/Methodendefinition unzugeordnet.
- Keine Codeänderung an der Legacy-App (`legacy/index.html` bleibt byte-identisch).

Ergänzend, abgeleitet aus dem Aufgabenauftrag dieses PRs:

- `legacy/behavior-map.md` enthält mindestens: Überblick, globaler State &
  Datenobjekte, Datenmodell Schema Version 3 (alle Entitäten mit Feldern), ein nach
  Fachbereich gruppiertes Funktionsinventar mit Zeilenverweisen, eine detaillierte
  Beschreibung des zentralen Rechenwegs, eine vollständige Liste aller 33 Quellzeilen mit
  `Math.round`, `Math.ceil`, `Math.floor` oder `.toFixed(`,
  eine Mapping-Tabelle Fachbereich → Ziel-Package, sowie die Abschnitte „Risiken und
  unklare Bereiche" und „Nicht behandelte/unsichere Bereiche".
- Keine erfundene Fachlogik: alles, was nicht mit Sicherheit aus dem Code hervorgeht,
  ist explizit unter „Nicht behandelte/unsichere Bereiche" aufgeführt statt geraten.
- Keine echten personenbezogenen oder operativen Identifikatoren werden in
  `legacy/behavior-map.md` eingeführt oder zitiert. Risiken werden ausschließlich abstrakt
  beschrieben.

## Erlaubte Pfade

- `legacy/behavior-map.md` (neu angelegt)
- `docs/TASKS/` (diese Datei)

## Gesperrte Pfade

- `legacy/index.html` — keine Änderung, keine Umformatierung, keine Kommentare, keine
  Whitespace-Anpassung. Nur Lesezugriff.
- Alle übrigen zu diesem Zeitpunkt noch nicht existierenden Verzeichnisse der
  Zielstruktur (`apps/`, `packages/`, weitere `docs/*.md` außer dieser Task-Datei) sind
  nicht Gegenstand dieses PRs.

## Tests

Die Dokumentation wird durch Review und reproduzierbare statische Prüfungen verifiziert:

- `git diff main -- legacy/index.html` liefert keinen Unterschied.
- SHA-256 des committed, LF-normalisierten Git-Inhalts von `legacy/index.html` entspricht
  `874af27415add7aeea330592c3e45da78a7c3e20e46dfcb8d71abbba6d21abab`.
- Der Rundungsscan liefert 33 Quellzeilen; alle 33 sind in Abschnitt 6 dokumentiert.
- Der Definitionsscan meldet nach Abgleich mit Funktionsinventar und Coverage-Anhang
  `unmapped = 0`.
- Die Inhalts-/Denylist-Prüfung der beiden geänderten Markdown-Dateien meldet keine
  personenbezogenen oder operativen Identifikatoren.
- `git diff --check` meldet keine Whitespace-Fehler.
