/**
 * Vertrag der Legacy-v3-Migration (Masterplan 9.2/9.3, PR 03).
 *
 * Diese Datei definiert ausschließlich die Schnittstelle und die
 * Ergebnisstruktur. Die Implementierung ist PR 04 (Codex,
 * `packages/import-export/legacy-v3` mit fachlicher Logik hier in
 * `packages/schema/migrations`). Das Feldmapping ist verbindlich in
 * `docs/MIGRATION.md` dokumentiert; die Implementierung darf davon
 * nicht stillschweigend abweichen.
 */
import type { ValidationIssue } from '../entities/validation'
import type { AppDataFile } from '../versions/current/app-data-file'
import type { MigrationReport } from './report'

/** Optionen des Migrationslaufs. */
export interface MigrationOptions {
  /** Quelldateiname für den Bericht (Anzeige, kein Pfad erforderlich). */
  sourceFileName?: string
  /**
   * SHA-256 der unveränderten Quelldatei (Hex). Wird er nicht
   * mitgegeben, muss die Implementierung ihn selbst über dem
   * serialisierten Eingabetext bilden (Masterplan 9.2).
   */
  sourceSha256?: string
  /** App-Version für den Bericht. */
  appVersion?: string
  /** Zeitquelle (Determinismus in Tests); Default: Systemzeit. */
  now?: () => Date
}

/**
 * Ergebnis der Migration. `ok: false` bedeutet: Eingabe wurde erkannt,
 * aber nicht migriert (ungültige Struktur, nicht unterstützte oder
 * neuere Schema-Version). Neuere Versionen dürfen niemals verändert
 * oder überschrieben werden (Masterplan 5.3).
 */
export type MigrationResult =
  | {
      ok: true
      data: AppDataFile
      report: MigrationReport
    }
  | {
      ok: false
      reason:
        | 'invalid_json_structure'
        | 'unsupported_schema_version'
        | 'newer_schema_version'
        | 'validation_failed'
      issues: ValidationIssue[]
      /** Teilbericht, soweit vor dem Abbruch ermittelbar. */
      report?: Partial<MigrationReport>
    }

/**
 * Signatur der v3-Migration. Verbindliche Garantien der Implementierung
 * (PR 04):
 *
 * 1. `input` wird niemals mutiert.
 * 2. Kein Feld der Quelldatei geht still verloren: jedes bekannte Feld
 *    ist gemappt (docs/MIGRATION.md), jedes bewusst verworfene Feld
 *    steht mit Begründung in `report.droppedFields`, jedes unbekannte
 *    Feld wird in `report.unmappedFields` ausgewiesen und im
 *    Zielbestand konserviert.
 * 3. Geldbeträge werden mit der dokumentierten Regel Euro→Cent
 *    konvertiert (kaufmännische Rundung auf ganze Cent; Abweichung
 *    > 0,001 Cent erzeugt eine `warning`, siehe docs/MIGRATION.md).
 * 4. Fehlende Werte werden nicht durch `0` ersetzt (Masterplan 25).
 * 5. Der Lauf ist deterministisch bei gleicher Eingabe und `now`.
 */
export type MigrateV3ToCurrent = (
  input: unknown,
  options?: MigrationOptions,
) => MigrationResult

/**
 * Platzhalter bis PR 04: wirft immer. Bewusst keine Teil-Implementierung,
 * damit kein Aufrufer versehentlich einen unvollständigen Migrationspfad
 * produktiv nutzt.
 *
 * TODO(PR 04, Codex): Implementierung gemäß docs/MIGRATION.md.
 */
export const migrateV3ToCurrent: MigrateV3ToCurrent = () => {
  throw new Error(
    'migrateV3ToCurrent ist noch nicht implementiert (geplant: PR 04). ' +
      'Vertrag und Feldmapping: packages/schema/src/migrations, docs/MIGRATION.md.',
  )
}
