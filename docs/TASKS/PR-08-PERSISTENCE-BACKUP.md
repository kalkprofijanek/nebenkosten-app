# PR 08 – Persistenz und Backup

Bezug: Masterplan Abschnitt 8 und Abschnitt 20, PR 08.

## Ziel

Die vollständige `AppDataFile`-Datei der Schema-Version 4 lokal, offline und
verlustfrei speichern, laden, sichern und wiederherstellen. Externe oder
gleichzeitige Änderungen sowie Daten aus einer neueren Schema-Version dürfen
niemals still überschrieben werden.

## Verbindliche Architekturentscheidungen

- `IndexedDbStorageAdapter` ist der primäre, verbindliche Browser-Speicher.
- `MemoryStorageAdapter` besitzt denselben Vertrag und dient Tests sowie
  kurzlebigen Arbeitsständen.
- `JsonFileStorageAdapter` stellt den portablen UTF-8-JSON-Sicherungsweg
  bereit.
- `FileSystemAccessStorageAdapter` spiegelt eine bereits von der UI
  ausgewählte Datei. Picker und Dialoge bleiben in PR 09.
- JSON- und Dateisicherungen enthalten ausschließlich `AppDataFile`, niemals
  interne Revisionen, Datei-Handles oder Snapshot-Historien.
- Persistenz-Snapshots sichern die vollständige Anwendungsdatei. Sie sind
  fachlich und technisch von `CalculationResult.resultSnapshot` getrennt.
- `localStorage`, Mehrfach-Tab-Warnbanner, Autosave-Debounce und
  `beforeunload`-UI sind nicht Teil von PR 08.

## Daten- und Versionsschutz

- Jede Eingabe und jeder geladene Stand wird zuerst anhand seiner
  `schemaVersion` eingeordnet und anschließend vollständig mit
  `appDataFileSchema` validiert.
- Schema-Version 4 ist erlaubt. Legacy-v3-Daten werden nur über den bereits
  vorhandenen expliziten Importer migriert.
- Eine höhere Schema-Version wird mit `newer_schema_version` blockiert. Weder
  normales Speichern noch Konfliktauflösung dürfen diesen Schutz umgehen.
- Fehlerhafte, unbekannte oder nicht JSON-sichere Daten werden nicht
  automatisch durch eine leere Datei ersetzt.
- Die maximale Größe einer aktuellen JSON-Datei beträgt 25 MiB. Das Limit wird
  vor UTF-8-Decodierung und JSON-Parsing geprüft.
- `meta.savedAt` wird beim erfolgreichen Speichern auf einer defensiven Kopie
  aktualisiert. Das vom Aufrufer übergebene Objekt bleibt unverändert.
- Persistiert werden kanonische UTF-8-JSON-Bytes mit sortierten
  Objektschlüsseln, stabiler Array-Reihenfolge, Zwei-Leerzeichen-Einrückung,
  Abschlusszeilenumbruch und ohne BOM.
- Werte, die JSON still verändern oder nicht darstellen kann, werden
  abgelehnt. Dazu zählen insbesondere Zyklen, `undefined`, nicht endliche
  Zahlen, `BigInt`, Funktionen, Symbole, Sparse Arrays, Accessor-Eigenschaften
  und exotische Objektprototypen.

## Konfliktvertrag

- Die Revision ist der kleingeschriebene SHA-256-Hash der kanonischen
  gespeicherten Bytes.
- `expectedRevision: null` bedeutet: nur speichern, wenn noch kein Stand
  existiert.
- Eine konkrete Revision bedeutet: nur genau diesen zuvor geladenen Stand
  ersetzen.
- Eine abweichende Revision erzeugt `conflict`; der vorhandene Stand bleibt
  bytegenau unverändert.
- IndexedDB führt Vergleich und Schreiben atomar in einer Transaktion aus.
- Der Datei-Adapter liest unmittelbar vor dem Schreiben erneut und vergleicht
  die tatsächlichen Bytes. Der unvermeidbare kleine Prüf-/Schreib-Zeitraum der
  File System Access API wird dokumentiert; IndexedDB bleibt deshalb
  maßgeblich.
- Ein bewusstes Überschreiben eines Konflikts ist erst UI-Orchestrierung in
  PR 09 und kein ungeprüfter `force`-Schalter im Persistenzpaket.

## Snapshots und Wiederherstellung

- Snapshots sind vollständig, unveränderlich, revisionsgebunden und erhalten
  stabile IDs statt Zeitstempeln als Schlüssel.
- Automatische Snapshots folgen der Legacy-Rotation:
  - die neuesten fünf bleiben immer erhalten,
  - danach höchstens der neueste Snapshot je UTC-Kalendertag innerhalb der
    letzten 14 Tage.
- Manuelle sowie `before_restore`-Snapshots sind angeheftet und werden von
  der automatischen Rotation nicht entfernt.
- Eine Wiederherstellung:
  1. lädt und validiert den Ziel-Snapshot,
  2. prüft die erwartete aktuelle Revision,
  3. erstellt atomar einen angehefteten `before_restore`-Snapshot,
  4. speichert den wiederhergestellten Stand mit neuem `savedAt` und neuer
     Revision,
  5. verändert den historischen Ziel-Snapshot nicht.
- Scheitert der Sicherheits-Snapshot oder die Konfliktprüfung, bleibt der
  aktuelle Stand unverändert.

## Fehler- und Datenschutzvertrag

- Öffentliche Fehler verwenden stabile Codes, unter anderem:
  `invalid_data`, `not_json_safe`, `invalid_json`, `invalid_utf8`,
  `unsupported_schema_version`, `newer_schema_version`, `conflict`,
  `snapshot_not_found`, `corrupt_storage`, `quota_exceeded`,
  `permission_denied`, `unsupported_capability` und `io_failed`.
- Fehlermeldungen enthalten keine Namen, Adressen, Bankdaten,
  Verwendungszwecke, Anhänge, JSON-Ausschnitte, Dateinamen, vollständigen
  Pfade oder rohe Browser-Fehlermeldungen.
- Es gibt keine Netzwerkzugriffe, Telemetrie oder produktiven Fixtures.
- Datei-Berechtigungen werden explizit behandelt. Der Adapter fordert keine
  Berechtigung ohne eine von der UI ausgelöste Benutzeraktion an.

## TDD- und Akzeptanzkriterien

- Zuerst fehlschlagende Tests für Codec, Versionsschutz, JSON-Sicherheit,
  Konflikte, Snapshot-Rotation, Memory, IndexedDB, File System Access und
  Wiederherstellung.
- Gemeinsamer Adapter-Vertrag für Memory und IndexedDB.
- Speichern und Laden bewahren alle v4-Daten einschließlich Centwerten,
  `null`/fehlend/0, `legacyUnmapped`, Audit-Daten und Calculation-Snapshot v2.
- Zwei konkurrierende Schreiber: genau einer schreibt erfolgreich, der andere
  erhält einen Konflikt.
- Wiederherstellung und Sicherheits-Snapshot sind praktisch getestet.
- Neuere Schema-Versionen sowie defekte Daten bleiben unverändert.
- Paket-Coverage in Statements, Branches, Functions und Lines mindestens
  80 %.
- Vollständige Root-CI, Privacy-Scanner und Dependency-Audit sind grün.
- `legacy/index.html` bleibt unverändert.

## Nicht Teil dieses PR

- React-Zustand, Routing, Dialoge, Picker, Banner und Bedienoberfläche
  (PR 09).
- Fachliche Freigabevalidatoren (PR 10).
- Remote-API, Anmeldung, Rollen, Server-Backups und Verschlüsselung
  (Phase 2).
