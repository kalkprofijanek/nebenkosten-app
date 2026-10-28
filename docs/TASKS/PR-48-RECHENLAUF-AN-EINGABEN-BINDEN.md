# PR-48 – Gespeicherten Rechenlauf an die Eingaben binden

Stand: 28. Oktober 2026. Auftrag: Sicherheitsaudit vom 28.10.2026,
Härtungshinweise. Priorität 2. Abhängigkeit: PR-47.

## Anlass

- `CalculationRun.inputSha256` (`packages/schema/src/entities/calculation.ts`)
  ist laut Kommentar der Anker gegen spätere Änderungen. Das Feld wird aber
  weder beim Rechnen gesetzt noch irgendwo geprüft.
- Die Freigabe `transitionBillingPeriod` (`packages/validators/src/transition.ts`)
  prüft nur, dass ein gespeichertes Ergebnis existiert.
- Der PDF-Export (`apps/web/src/PdfExportRoute.tsx`) nutzt den gespeicherten
  Snapshot ohne Abgleich.
- Ein importiertes Backup kann deshalb Status READY_FOR_PDF oder FINALIZED
  zusammen mit einem Ergebnis mitbringen, das nicht zu den Eingaben passt.
- Änderungen an den Firmen-Bankdaten (`updateCompany` in
  `apps/web/src/features/master-data/commands.ts`) laufen nicht über die
  Bearbeitungssperre.

## Umfang

1. Beim Speichern eines Rechenlaufs `inputSha256` aus dem kanonischen,
   validierten Eingabestand setzen. Welcher Eingabestand gemeint ist,
   entscheidet E-48-1.
2. `transitionBillingPeriod` nach READY_FOR_PDF bzw. FINALIZED und der
   PDF-Export prüfen den Hash. Bei Abweichung oder fehlendem Hash: neuer
   Fehlercode `transition.calculation_stale` bzw. Export nur nach
   Neuberechnung.
3. Import: Ein Backup mit gesperrtem Abrechnungszeitraum (READY_FOR_PDF oder
   FINALIZED), dessen letzter Lauf nicht zum Eingabestand passt, wird in der
   Importvorschau gemeldet. Wie damit umgegangen wird, entscheidet E-48-2.
4. `updateCompany`: Änderung der Bankverbindung bei freigegebenem Zeitraum
   (E-48-3).

## Vertrag

- `inputSha256` existiert schon als `nullish`, daher keine Schemaänderung.
  Bestehende Läufe ohne Hash gelten als „nicht gebunden“ (E-48-2).
- Neuer Prüfcode in `packages/validators` dokumentieren
  (`docs/BELEGPRUEFUNG.md` bzw. Prüfhinweisliste).

## Freigegebene Pfade

`packages/core/` (nur Hash-Berechnung des Eingabestands),
`packages/validators/`, `apps/web/src/features/release/`,
`apps/web/src/features/import/`, `apps/web/src/features/pdf/`,
`apps/web/src/PdfExportRoute.tsx`,
`apps/web/src/features/master-data/commands.ts`, `CHANGELOG.md`, `docs/`.

## Tests (zuerst schreiben)

- Lauf mit passendem Hash: Freigabe und Export möglich.
- Eingabe nach dem Lauf geändert: `transition.calculation_stale`; Export
  verlangt Neuberechnung.
- Backup mit FINALIZED und abweichendem Snapshot: Importvorschau meldet es.
- Bankverbindung bei READY_FOR_PDF ändern: Verhalten nach E-48-3.

## Offene Entscheidungen

- **E-48-1 – Umfang des Hashes:** nur die Eingaben, die `createCalculationInput`
  für den Zeitraum verwendet (Empfehlung), oder die gesamte `AppDataFile`.
- **E-48-2 – Läufe ohne oder mit falschem Hash beim Import:**
  - A = Status auf IN_REVIEW zurücksetzen und Neuberechnung verlangen.
    Empfehlung.
  - B = nur Hinweis.
  - C = Import ablehnen.

  Fachlich relevant für bereits versandte Abrechnungen (FINALIZED).

- **E-48-3 – Bankdaten nach Freigabe:**
  - A = wie andere Stammdaten über die Bearbeitungssperre (Zeitraum
    zurücksetzen).
  - B = erlaubt, aber PDF-Hinweis „Bankverbindung nach Freigabe geändert“.

  Die IBAN wird beim Rendern aus den aktuellen Stammdaten gelesen, nicht aus
  dem Snapshot.
