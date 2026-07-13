# PR 01 – Bestandsaufnahme und Refactor-Map

Verantwortlich: Fable
Review: Codex
Bezug: `MASTERPLAN_MIGRATION_FABLE_CODEX.md`, Abschnitt 20 (PR 01), Abschnitt 21
(Masterauftrag Fable).

## Ziel

Vollständige, nachvollziehbare Inventarisierung der bestehenden Single-File-Anwendung
`legacy/index.html`, bevor irgendein Umbau der Fachlogik beginnt. Ergebnis ist
`legacy/behavior-map.md`: alle Funktionen, globalen Objekte/Abhängigkeiten, das
Datenmodell (Schema Version 3), die zentralen Rechenwege, alle Rundungsstellen, alle
Validierungen/Prüfungen sowie die PDF-Ausgaben — jeweils mit Zeilenverweisen auf den
Ausgangsbestand. Zusätzlich: Zuordnung jedes Fachbereichs zu einem künftigen
Ziel-Package (Masterplan Abschnitt 4.2) sowie eine explizite Liste erkannter Risiken
und nicht mit Sicherheit geklärter Bereiche.

## Akzeptanzkriterien (aus Masterplan Abschnitt 20, PR 01)

- Jede wesentliche Legacy-Funktion ist einem künftigen Modul (Ziel-Package) zugeordnet.
- Keine Codeänderung an der Legacy-App (`legacy/index.html` bleibt byte-identisch).

Ergänzend, abgeleitet aus dem Aufgabenauftrag dieses PRs:

- `legacy/behavior-map.md` enthält mindestens: Überblick, globaler State &
  Datenobjekte, Datenmodell Schema Version 3 (alle Entitäten mit Feldern), ein nach
  Fachbereich gruppiertes Funktionsinventar mit Zeilenverweisen, eine detaillierte
  Beschreibung des zentralen Rechenwegs, eine vollständige Liste aller Rundungsstellen,
  eine Mapping-Tabelle Fachbereich → Ziel-Package, sowie die Abschnitte „Risiken und
  unklare Bereiche" und „Nicht behandelte/unsichere Bereiche".
- Keine erfundene Fachlogik: alles, was nicht mit Sicherheit aus dem Code hervorgeht,
  ist explizit unter „Nicht behandelte/unsichere Bereiche" aufgeführt statt geraten.
- Keine echten personenbezogenen Daten werden in `legacy/behavior-map.md` neu
  eingeführt (Zitate aus dem Bestand, soweit zur Dokumentation eines Risikos nötig,
  sind auf das fachlich Notwendige beschränkt).

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

Reine Dokumentationsaufgabe ohne Codeänderung — es sind keine automatisierten Tests
anwendbar. Verifikation erfolgt über Dokumentenreview (Review durch Codex) und den
Nachweis `git diff main -- legacy/index.html` liefert keinen Unterschied.
