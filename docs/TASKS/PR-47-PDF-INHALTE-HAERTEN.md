# PR-47 – PDF-Inhalte nur aus geprüften Werten

Stand: 28. Oktober 2026. Auftrag: Sicherheitsaudit vom 28.10.2026
(Cloudflare `security-audit-skill`, Profil quick), Spur 2. Priorität 1.

## Anlass

Der gespeicherte Rechen-Snapshot (`calculationResults[].resultSnapshot`) ist
im Schema `z.unknown()`. Die PDF-Prüfung `isCompatibleCalculationOutput`
(`apps/web/src/features/pdf/context.ts`) prüft nur Teile davon. Einzelne
Felder, die laut Typ Text sind, gelangen ungeprüft als pdfmake-Inhalt in die
Mieter- und Gesamtabrechnung. Über ein importiertes Backup lässt sich so
fremder PDF-Inhalt einschleusen. Details stehen im nicht veröffentlichten
Auditbericht. Nach `SECURITY.md` gehören sie nicht in öffentliche Dateien.

## Umfang

1. **Snapshot-Prüfung vervollständigen** (`apps/web/src/features/pdf/context.ts`):
   `isCompatibleCalculationOutput` prüft auch `operatingPositions`. Je
   Position müssen `label` ein String, `allocationKey` ein String oder
   `null`, Centwerte ganze Zahlen und `costCategoryId` ein String sein. Ein
   Verstoß bedeutet „nicht kompatibel“; der Export verlangt dann eine
   Neuberechnung (bestehendes Verhalten bei inkompatiblem Snapshot).
2. **Textzellen erzwingen** (`packages/pdf`): Werte aus Daten werden vor dem
   Einsetzen in pdfmake-Inhalte mit einem gemeinsamen Helfer `pdfText(value)`
   zu Text gemacht. Betroffen sind mindestens:
   - `tenant-statement-tables.ts` (`costCategoryTable`: `position.label`,
     Umlageschlüssel)
   - `combined-cost-statement.ts` (`labelWithScope`)

   Andere Builder prüft der Auftrag mit (siehe PR-53).

3. **Nachschlagen nur über eigene Schlüssel:**
   - `packages/pdf/src/format.ts` `formatAllocationKeyLabel`:
     `Object.hasOwn` statt `?? allocationKey` auf unbekannte Werte; unbekannte
     Werte werden per `String()` ausgegeben.
   - `packages/pdf/src/cover-letter.ts` `renderCoverLetter`: `Object.hasOwn`
     und `typeof === 'string'` statt `key in record`. Sonst ersetzt
     `{{constructor}}` den Platzhalter durch Funktionstext.
4. **EPC-Nutzdaten:** `packages/pdf/src/epc-girocode.ts` `singleLine` entfernt
   zusätzlich Steuerzeichen (`\p{Cc}`, U+0085).

## Vertrag

- Keine Schemaänderung, keine Migration. `resultSnapshot` bleibt im Schema
  `z.unknown()`. Geprüft wird beim Lesen für das PDF (offene Entscheidung
  E-47-1).
- Gültige Snapshots aus der eigenen Berechnung erzeugen byte-gleiche PDFs
  (Snapshot-Tests unverändert).

## Freigegebene Pfade

`packages/pdf/`, `apps/web/src/features/pdf/`, `CHANGELOG.md`, `docs/TASKS/`.

## Tests (zuerst schreiben)

- `packages/pdf`: Positionsbezeichnung und Umlageschlüssel als Objekt bzw.
  Zahl ergeben im Dokument nur Text, keinen pdfmake-Knoten. Unbekannter
  Umlageschlüssel `constructor` ergibt den Text `constructor`.
- `packages/pdf`: Anschreiben mit `{{constructor}}`, `{{toString}}` und
  `{{__proto__}}` lässt diese Platzhalter unverändert.
- `packages/pdf`: EPC-Name mit Steuerzeichen ergibt Nutzdaten ohne diese
  Zeichen.
- `apps/web`: Snapshot mit nicht-textueller `operatingPositions[].label` gilt
  als inkompatibel; der Export verlangt eine Neuberechnung.

## Offene Entscheidungen

- **E-47-1 – Ort der Prüfung:**
  - A = Laufzeitprüfung beim PDF-Lesen plus Textzwang in `packages/pdf`;
    keine Schemaänderung. Empfehlung.
  - B = strenges zod-Schema für `resultSnapshot` in `packages/schema`.
    Erfordert Schemaversion, Migration und Umgang mit bestehenden Snapshots
    (AGENTS.md Regel 3–4).
