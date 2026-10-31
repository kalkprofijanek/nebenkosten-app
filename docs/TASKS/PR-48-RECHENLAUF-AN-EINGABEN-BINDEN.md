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

## Entscheidungen (Nutzer, 31.10.2026)

- **E-48-1 = Empfehlung – Umfang des Hashes:** nur die Eingaben, die `createCalculationInput`
  für den Zeitraum verwendet (Empfehlung), oder die gesamte `AppDataFile`.
- **E-48-2 = A – Läufe ohne oder mit falschem Hash beim Import:**
  - A = Status auf IN_REVIEW zurücksetzen und Neuberechnung verlangen.
    Empfehlung.
  - B = nur Hinweis.
  - C = Import ablehnen.

  Fachlich relevant für bereits versandte Abrechnungen (FINALIZED).

- **E-48-3 = A – Bankdaten nach Freigabe** (keine Empfehlung im Task; A
  als Annahme gewählt, im PR benannt):
  - A = wie andere Stammdaten über die Bearbeitungssperre (Zeitraum
    zurücksetzen).
  - B = erlaubt, aber PDF-Hinweis „Bankverbindung nach Freigabe geändert“.

  Die IBAN wird beim Rendern aus den aktuellen Stammdaten gelesen, nicht aus
  dem Snapshot.

## Umsetzung

- `packages/core/src/integrity/`: synchrones `sha256Hex` und
  `calculationInputSha256`. Gehasht wird die kanonisch serialisierte
  `CalculationInput` des Zeitraums. Ohne die Freigabe- und Textfelder des
  Abrechnungszeitraums: `status`, `dispatchDate`, `lastModifiedAt`, `notes`,
  `coverLetter`, `legacyUnmapped`.
- `runCalculation` speichert `inputSha256`.
- `packages/validators`: `calculationBinding` liefert `current`, `stale`,
  `unbound` oder `missing`. `transitionBillingPeriod` verlangt für
  READY_FOR_PDF und FINALIZED einen aktuellen, gebundenen Lauf; sonst
  `transition.calculation_stale`.
- PDF-Export (`pdfCalculationSnapshot`): Ein abweichender Lauf (`stale`)
  wird abgelehnt. Läufe ohne Hash aus dem Bestand vor PR-48 bleiben
  exportierbar.
- Import (`resetUnboundReleases`): READY_FOR_PDF ohne aktuellen Lauf und
  FINALIZED mit abweichendem Lauf werden auf IN_REVIEW gesetzt, mit
  Audit-Ereignis `billing_period.import_release_reset`. Die Vorschau nennt
  die betroffenen Jahre. FINALIZED ohne Hash (Bestand vor PR-48) bleibt
  unverändert, damit eigene ältere Sicherungen versandte Jahre nicht
  wieder öffnen.
- Bankverbindung (Firma und Objekt): Änderungen werden abgelehnt, solange
  ein betroffenes Jahr READY_FOR_PDF ist. FINALIZED sperrt nicht, damit ein
  späterer Kontowechsel möglich bleibt.

## Migrationsauswirkung

Keine Schemaänderung. Ein Jahr, das schon vor PR-48 READY_FOR_PDF war, kann
ohne Neuberechnung nicht mehr nach FINALIZED wechseln: Prüfung öffnen,
neu berechnen, erneut freigeben. Der PDF-Export solcher Jahre bleibt
möglich.
