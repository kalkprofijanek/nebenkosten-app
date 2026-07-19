# Persistenz, Sicherungen und Wiederherstellung

Stand: PR 08. Dieses Dokument beschreibt den technischen Vertrag für die
lokale Speicherung der vollständigen `AppDataFile`-Datei in Schema-Version 4.

## Speicherwege

| Adapter                          | Aufgabe                            | Dauerhaft         | Snapshots |
| -------------------------------- | ---------------------------------- | ----------------- | --------- |
| `IndexedDbStorageAdapter`        | maßgeblicher Browser-Speicher      | ja                | ja        |
| `MemoryStorageAdapter`           | Tests und kurzlebige Arbeitsstände | nein              | ja        |
| `JsonFileStorageAdapter`         | portabler JSON-Backup-Port         | abhängig vom Port | nein      |
| `FileSystemAccessStorageAdapter` | Spiegelung einer gewählten Datei   | ja                | nein      |

Dateiauswahl, Dialoge, Autosave und Konfliktanzeigen gehören zur UI in PR 09.
Der File-System-Adapter öffnet selbst keinen Picker und fordert Berechtigungen
nur über den ausdrücklich aus einer Benutzeraktion aufzurufenden
`requestWritePermission()`-Weg an.

## Speichern und Konflikte

`load()` liefert Daten und ihre Revision. Die Revision muss beim nächsten
`save()` als `expectedRevision` übergeben werden. `null` erlaubt ausschließlich
das Erstellen eines noch leeren Speichers. Eine abweichende Revision führt zu
`conflict`; ein ungeprüftes Erzwingen gibt es nicht.

Die Revision ist SHA-256 über die tatsächlich gespeicherten, kanonischen
UTF-8-Bytes. Der Codec sortiert Objektschlüssel, erhält Array-Reihenfolgen,
schreibt zwei Leerzeichen und einen abschließenden Zeilenumbruch. Er aktualisiert
`meta.savedAt` nur auf einer defensiven Kopie.

IndexedDB vergleicht und schreibt atomar. Datei-Adapter lesen unmittelbar vor
dem Schreiben erneut und prüfen die geschriebenen Bytes anschließend. Wegen
des unvermeidbaren kurzen Zeitfensters der Browser-Dateischnittstelle bleibt
IndexedDB der maßgebliche Stand.

## Versions- und Verlustschutz

- Nur Schema-Version 4 wird als aktueller Stand geladen.
- Legacy-v3-Dateien laufen ausschließlich durch `importLegacyV3Bytes`.
- Neuere Versionen werden als `newer_schema_version` blockiert und nicht
  überschrieben.
- Defekte oder nicht JSON-sichere Werte werden nie durch einen leeren Stand
  ersetzt.
- Aktuelle JSON-Dateien sind auf 25 MiB begrenzt.
- Zyklen, `undefined`, nicht endliche Zahlen, `BigInt`, Funktionen, Symbole,
  Sparse Arrays, Accessor-Eigenschaften und exotische Prototypen werden
  abgewiesen.

## Snapshots und Restore

Memory und IndexedDB sichern vollständige, unveränderliche Stände. Automatische
Snapshots behalten immer die neuesten fünf sowie danach höchstens den neuesten
Stand je UTC-Tag innerhalb von 14 Tagen. Manuelle und `before_restore`-Snapshots
sind angeheftet.

Vor einer Wiederherstellung wird atomar ein angehefteter
`before_restore`-Snapshot des aktuellen Standes erzeugt. Erst danach ersetzt
der validierte Ziel-Snapshot den aktuellen Stand mit neuem `savedAt` und neuer
Revision. Konflikt, fehlender Snapshot oder beschädigte Daten lassen aktuellen
Stand und Historie unverändert.

## Fehler und Datenschutz

Öffentliche Fehler tragen stabile Codes, aber keine Rohdaten, Browsermeldungen,
Dateinamen oder Pfade. Relevante Codes sind unter anderem `conflict`,
`corrupt_storage`, `newer_schema_version`, `quota_exceeded`,
`permission_denied`, `unsupported_capability` und `io_failed`.

Die Adapter arbeiten vollständig lokal. Sie enthalten keine Netzwerkzugriffe,
Telemetrie oder produktiven Testdaten.
