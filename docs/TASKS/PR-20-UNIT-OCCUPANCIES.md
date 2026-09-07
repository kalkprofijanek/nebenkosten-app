# PR 20 – Wohnungen mit Nutzer- und Leerstandszeiträumen

## Ziel und Umfang

Die Nutzerübersicht beginnt bei der Wohnung. Jede Wohnung des ausgewählten
Objekts bleibt sichtbar, auch ohne Belegung im ausgewählten Abrechnungsjahr.
Gebäude, Lage, Nutzfläche und Anzahl/Art der erfassten Zeiträume stehen vor
der chronologischen Belegungstabelle. Suchtreffer wählen ganze Wohnungen;
bei einer Nutzersuche bleiben alle Zeiträume der betroffenen Wohnung sichtbar.
Filter unterscheiden Nutzerzeitraum, Leerstandszeitraum und fehlende Belegung.
Die Erfassungsformulare folgen unter „Neue Belegung erfassen“.

## Grenzen

Belegungsstatus beschreibt erfasste Zeiträume im Abrechnungsjahr, keine
automatisch angenommene Vollbelegung. Eine Wohnung ohne Zeitraum wird nicht
automatisch zu einem Leerstand. Bestehende Commands für Anlage, Änderung,
Löschung, Überschneidung und Freigabeschutz werden weiterverwendet.
Keine Änderung an Schema, Migration, Engine oder `legacy/index.html`.

## Pfade

- `apps/web/src/features/workflows/OccupanciesRoute.tsx` und neue
  Übersicht-/Zeitraum-/Editor-Komponenten sowie Darstellungshelfer und CSS
- zugehörige Komponenten- und bestehende Workflowtests
- Playwright-Belegungs- und Heizkostenabläufe
- Integrationstest und Auditdokumentation unter `docs/TASKS/`

## Abnahme

1. Wohnungen ohne Belegung, Kontextbegrenzung, Metadaten und Chronologie prüfen.
2. Nutzer-/Gebäude-/Lagesuche sowie alle Filter zählen Wohnungen.
3. Bearbeitung, Escape und bestätigtes Löschen funktionieren unverändert.
4. Desktop-/Mobilansicht ohne Seitenüberlauf; Screenshots erzeugen und ansehen.
5. Alle Projektprüfungen und Coverage-Gates ab 80 % ausführen.
6. Vollständigen Diff, Datenschutz und unveränderten Legacy-Hash prüfen.

Neue Darstellungstests wurden vor Übernahme der Umsetzung gegen `main`
ausgeführt und scheiterten an der dort noch fehlenden Wohnungsübersicht.
Die anschließende Umsetzung erfüllt diese drei Tests. Weitere Prüfresultate
werden im Abschlussnachweis festgehalten.

Die Heizkostenbefunde einschließlich FIFO-Beispiel stehen in
[PR-20-HEATING-AUDIT.md](PR-20-HEATING-AUDIT.md).
Push, Draft-PR, Merge und Deployment benötigen den separaten Benutzerauftrag.
