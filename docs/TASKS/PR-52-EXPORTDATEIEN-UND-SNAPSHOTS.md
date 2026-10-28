# PR-52 – Eindeutige Exportdateien und Snapshot-Aufbewahrung

Stand: 28. Oktober 2026. Auftrag: Sicherheitsaudit vom 28.10.2026,
Robustheitsfehler (vom Audit nicht als Sicherheitsbefund gewertet, aber
reproduziert). Priorität 2.

## Anlass

1. **Dateinamen:** `scripts/abrechnung.mjs` macht die Namen der
   Einzelabrechnungen nur untereinander eindeutig (`usedFileNames`). Die
   beiden Gesamtabrechnungen werden danach unter festen Namen geschrieben
   (`NK_<Jahr>_Gesamtabrechnung_intern.pdf` / `_Mieter.pdf`). Heißt eine
   Einheit „Gesamtabrechnung“ und der Mieter „intern“ oder „Mieter“, wird
   dessen Einzelabrechnung ohne Fehlermeldung überschrieben; der Zähler
   meldet trotzdem alle Dateien. Dieselbe Ursache gibt es im Web-Export
   (`apps/web/src/PdfExportRoute.tsx`).
2. **Snapshots:** `packages/persistence/src/snapshot-retention.ts` behält
   automatische Snapshots mit Zeitstempel in der Zukunft nicht.
   `createSnapshot` löscht sie. Nach einer zurückgestellten Systemuhr gehen
   so die neuesten Wiederherstellungspunkte verloren.
3. **Fest angeheftete Snapshots** (manual, before_import, before_restore,
   before_migration) werden nie gelöscht und wachsen bis zum Speicherlimit
   des Browsers.

## Umfang

1. Namen der Gesamtabrechnungen vor der Mieterschleife in `usedFileNames`
   reservieren, in CLI und Web-Export. Beim Schreiben im CLI das Flag `'wx'`
   verwenden, damit eine verbleibende Kollision laut fehlschlägt.
2. Länge von `safeFileNamePart` begrenzen
   (`apps/web/src/features/pdf/file-names.ts`, z. B. 60 Zeichen je Teil).
3. `snapshot-retention.ts`: automatische Snapshots mit `createdAt > now`
   behalten. Alternative: `now` auf den neuesten Snapshot-Zeitpunkt anheben.
4. Angeheftete Snapshots: Anzahl und Speicherverbrauch in der
   Sicherungsübersicht anzeigen; Begrenzung nach E-52-1.

## Freigegebene Pfade

`scripts/abrechnung.mjs`, `apps/web/src/features/pdf/file-names.ts`,
`apps/web/src/PdfExportRoute.tsx`, `packages/persistence/`,
`apps/web/src/features/` (nur Sicherungsübersicht), `CHANGELOG.md`,
`docs/PERSISTENCE.md`, `docs/TASKS/`.

## Tests (zuerst schreiben)

- Einheit „Gesamtabrechnung“ mit Mieter „intern“ ergibt
  `NK_2025_Gesamtabrechnung_intern_2.pdf`, und alle Dateien existieren (CLI
  und Web-Export).
- Sehr lange Einheitsbezeichnung ergibt einen gekürzten, gültigen Dateinamen.
- Retention mit `now` vor dem neuesten automatischen Snapshot behält diesen.

## Offene Entscheidungen

- **E-52-1 – angeheftete Snapshots:** nur anzeigen (Empfehlung) oder eine
  Obergrenze je Art mit Rückfrage vor dem Löschen.
