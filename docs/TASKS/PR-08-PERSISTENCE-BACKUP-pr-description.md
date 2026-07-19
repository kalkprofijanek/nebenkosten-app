# PR 08 – Persistenz und Backup

## Ziel

Vollständige v4-Anwendungsdaten lokal, offline und verlustfrei speichern,
sichern und wiederherstellen, ohne neuere, beschädigte oder zwischenzeitlich
geänderte Stände still zu überschreiben.

## Inhalt

- kanonischer UTF-8-JSON-Codec mit SHA-256-Revision, 25-MiB-Grenze,
  Schema-Versionsschutz und strikter JSON-Sicherheitsgrenze
- atomarer `IndexedDbStorageAdapter` als maßgeblicher Browser-Speicher
- vertragsgleicher `MemoryStorageAdapter` für Tests und kurzlebige Stände
- `JsonFileStorageAdapter` und `FileSystemAccessStorageAdapter` für portable
  Backups und eine von der UI gewählte Spiegeldatei
- Compare-and-Swap-Konfliktschutz über `expectedRevision`
- unveränderliche Snapshots mit Rotation „neueste fünf plus täglich 14 Tage“
- atomare Wiederherstellung mit angeheftetem `before_restore`-Sicherungsstand
- typisierte, redaktierte Fehler und explizite Browser-Dateiberechtigungen
- Dokumentation unter `docs/PERSISTENCE.md`

## Schutzmaßnahmen

- keine Netzwerkzugriffe, Telemetrie oder produktiven Fixtures
- keine impliziten Berechtigungsdialoge
- neuere und nicht unterstützte Schema-Versionen werden vor Schreibzugriffen
  erkannt
- vorhandene IndexedDB-Daten und Snapshot-Historien werden vor Mutationen
  vollständig validiert und innerhalb der Schreibtransaktion bytegenau
  erneut abgeglichen
- Datei-Backups werden vor dem Einlesen anhand ihrer Größe begrenzt, vor dem
  Schreiben erneut gelesen und nach dem Schreiben verifiziert
- Getter, exotische Prototypen, Sparse Arrays, Zyklen, `undefined`, `BigInt`,
  nicht endliche Zahlen und negative Null werden verlustsicher abgewiesen
- `legacy/index.html` bleibt unverändert

## Tests

- 43 Import-/Export-Tests, davon 36 für den neuen v4-Codec
- 78 Persistenztests für Memory, IndexedDB, JSON-Datei, File System Access,
  Konflikte, Korruption, Snapshots, Rotation und Restore
- Integrationsprüfung Legacy-v3-Bytes → Migration → v4-Persistenz → Laden
- Persistenz-Coverage: mindestens 80 % in Statements, Branches, Functions und
  Lines
- vollständiges `pnpm run ci` einschließlich Lint, Typecheck, Tests, Coverage,
  Build, Repository-Guardrails, Privacy-Scanner und Dependency-Audit

## Review

Da Claude derzeit nicht verfügbar ist, wurden getrennte Codex-Prüfungen
durchgeführt:

- Code-/Korrektheitsreview: CAS, IndexedDB-Transaktionen, Snapshot- und
  Restore-Atomarität, Codec und API-Konsistenz
- Security-/Privacy-Review: untrusted JSON/Bytes, Größenlimits,
  Berechtigungen, Versionsschutz, Korruption und Fehlerredaktion

Die Befunde wurden behoben und gezielt erneut geprüft.

## Nicht enthalten

React-Zustand, Dateiauswahl, Dialoge, Konfliktbanner, Autosave und
`beforeunload` folgen in PR 09.
