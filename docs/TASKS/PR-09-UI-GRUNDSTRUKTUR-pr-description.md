# PR 09 – UI-Grundstruktur

## Ziel

Die geprüften v4-Pakete erstmals zu einer lokal nutzbaren Anwendung verbinden.
Der Legacy-Hauptablauf ist in der neuen Oberfläche vom Arbeitsbestand bis zur
gespeicherten Berechnung durchführbar. Die fachliche Freigabe bleibt bewusst
bis PR 10 gesperrt.

## Inhalt

- responsive App-Shell mit Hash-Routing für Firmen, Objekte,
  Abrechnungsjahre, Nutzer, Kosten, Heizkreise, Berechnung und Freigabe
- immutable, schema-validierte Commands für alle Eingabemasken
- Nutzerwechsel und explizite Leerstandszeiträume mit Überschneidungsschutz
- deutsche Euro-Eingabe mit verbindlicher Cent-Konvertierung
- Core-Berechnung ohne Rechenlogik in React-Komponenten
- persistierte Berechnungsläufe und vollständige Ergebnis-Snapshots
- IndexedDB-Autosave mit CAS-Revisionen, Konflikterkennung,
  Mehrfach-Tab-Hinweis und `beforeunload`-Schutz
- bestätigter v4-/Legacy-v3-Import mit Größenlimit, anonymisierter Vorschau
  und Sicherheits-Snapshot vor dem Ersetzen eines vorhandenen Stands
- dynamischer Fortschritt anhand tatsächlich vorhandener Daten
- interaktive, flüchtige Ein-Datei-HTML-Vorschau für die lokale Sichtprüfung

## Schutzmaßnahmen

- kein Netzwerkzugriff, keine Cloud, keine Telemetrie
- untrusted JSON wird größenbegrenzt, migriert beziehungsweise strikt
  validiert und erst nach ausdrücklicher Bestätigung übernommen
- keine Datei-, Personen- oder Inhaltsdetails in Importfehlern
- keine stillen Konfliktüberschreibungen
- keine Statusänderung aus `DRAFT`; Freigabe bleibt sichtbar gesperrt
- ausschließlich fiktive Testdaten
- `legacy/index.html` bleibt unverändert

## Tests

- Komponenten- und Command-Tests für sämtliche PR-09-Bereiche
- Persistenz- und Importtests einschließlich Fehler-, Konflikt- und
  Snapshotpfaden
- Headless-End-to-End-Test des vollständigen Hauptablaufs
- mindestens 80 % Web-Coverage in allen vier Messgrößen
- vollständige Root-CI, Privacy-Scanner und Dependency-Audit

## Review

Claude ist derzeit nicht verfügbar. Deshalb erfolgen getrennte
Codex-Prüfungen für Korrektheit/Bedienbarkeit sowie Sicherheit/Datenschutz.
Alle Blocker und hohen Befunde werden vor der Freigabe behoben und erneut
geprüft.

## Nicht enthalten

- formelle Freigabevalidatoren und Statusübergänge (PR 10)
- PDF und Export (PR 11)
- produktive Datenmigration und finale Abnahme (PR 12)
