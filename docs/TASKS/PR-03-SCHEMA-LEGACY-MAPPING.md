# PR 03 – Schema und Legacy-v3-Mapping

Verantwortlich: Claude
Review: Codex
Bezug: `MASTERPLAN_MIGRATION_FABLE_CODEX.md` Abschnitte 5, 6.1, 7.1, 9,
20 (PR 03) und 21; `legacy/behavior-map.md` Abschnitt 3.

## Ziel

Das neue Datenmodell (Schema-Version 4) als validierte Laufzeit-Typen
definieren, das tatsächliche Legacy-v3-Format als toleranten
Parservertrag erfassen und das Feldmapping v3 → v4 verbindlich
dokumentieren — als Grundlage für den Legacy-Importer (PR 04, Codex)
und die Characterization Tests (PR 05).

## Umfang

1. `packages/schema/src/primitives.ts` — technische Grundbausteine
   (EntityId/UUID, ISO-Datum/-Zeitstempel, **Geldbeträge in Cent**,
   `Quantity` mit Einheit, Prozent; Masterplan 5.3).
2. `packages/schema/src/entities/` — alle Entitäten aus Masterplan 5.1
   als Zod-`strictObject` (unbekannte Felder ⇒ Fehler statt Verlust),
   inkl. `ValidationIssue` (Kategorienmodell 7.1) als Vertrag für
   `packages/validators` (PR 10).
3. `packages/schema/src/versions/current/` — Dateiformat
   `AppDataFile` mit Trennung Stammdaten/Abrechnungsdaten
   (Masterplan 5.2) und explizitem `schemaVersion: 4`.
4. `packages/schema/src/versions/v3/` — Legacy-Format als
   `looseObject`-Schemas (unbekannte Felder bleiben erhalten),
   verifiziert gegen `legacy/behavior-map.md` und `legacy/index.html`.
5. `packages/schema/src/migrations/` — Migrationsvertrag
   (`MigrateV3ToCurrent`, `MigrationResult`) und Berichtsformat
   (`MigrationReport`, Masterplan 9.3). Implementierung bewusst nur
   als werfender Platzhalter (PR 04).
6. `docs/DATA-MODEL.md` — Datenmodell-Doku mit Feldtabellen inkl.
   Legacy-Spalte.
7. `docs/MIGRATION.md` — Pipeline, Regelkatalog, Strukturzerlegung,
   verworfene/unbekannte Felder, Round-Trip-Anforderung.
8. `packages/schema/tests/` — Vitest-Suite mit frei erfundenen
   Fixtures.

## Erlaubte Pfade

- `packages/schema/**`
- `docs/DATA-MODEL.md`, `docs/MIGRATION.md`, `docs/TASKS/PR-03-*.md`
- `pnpm-lock.yaml` (Zod-Dependency)

## Gesperrte Pfade

- `legacy/index.html` (SHA-256-Guard), `legacy/SHA256SUMS`
- Root-`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
  (gemeinsame Dateien, Masterplan 13.3)
- alle übrigen Packages und `apps/`

## Akzeptanzkriterien (Masterplan Abschnitt 20, PR 03)

- Keine unbekannten Legacy-Felder werden still verworfen
  (v3-Schemas `loose`; Migrationsvertrag erzwingt
  `unmappedFields`-Ausweis; Zielformat `strict`).
- Jede Transformation ist dokumentiert (`docs/MIGRATION.md`
  Regelkatalog + DATA-MODEL-Feldtabellen).
- Geldbeträge im Zielmodell ausschließlich als ganze Centwerte;
  Euro→Cent nur über die dokumentierte Regel `euro_to_cents`.
- `null` / „nicht erfasst" / `0` bleiben unterscheidbar.
- Neuere Schema-Versionen werden erkannt und niemals überschrieben.
- Tests decken Roundtrip, Ablehnung ungültiger Daten, Erhalt
  unbekannter Felder und die Cent-/Datums-Invarianten ab.
- Keine echten oder aus `legacy/index.html` übernommenen Werte in
  Code, Docs oder Fixtures (ADR-0001).

## Tests / Nachweise

- `packages/schema`: Vitest-Suite grün, Typecheck grün.
- `node scripts/scan-repository-content.mjs` grün.
- `node scripts/verify-repository-guardrails.mjs` grün.
- `git diff main -- legacy/index.html` leer.

## Nicht umgesetzt (bewusst)

- Migrations-Implementierung, Fixture-Suite des Importers,
  `legacyUnmapped`-Felder: PR 04 (Codex).
- Fachliche Plausibilitätsprüfungen: PR 10.
- Rundungsregeln der Engine (`docs/ROUNDING.md`): PR 05/06.
