/**
 * Migrationsbericht (Masterplan 9.3). Der Bericht wird von jeder
 * Migration erzeugt und ist Teil des Import-Workflows (Vorschau vor
 * bewusster Übernahme, Masterplan 9.2).
 */
import { z } from 'zod'
import { isoTimestampSchema, sha256HexSchema } from '../primitives'
import { validationIssueSchema } from '../entities/validation'

/** Zählungen des migrierten Bestands (Masterplan 9.3). */
export const migrationCountsSchema = z.strictObject({
  ownerCompanies: z.int().nonnegative(),
  properties: z.int().nonnegative(),
  billingPeriods: z.int().nonnegative(),
  occupancyPeriods: z.int().nonnegative(),
  costCategories: z.int().nonnegative(),
  costEntries: z.int().nonnegative(),
  heatingCircuits: z.int().nonnegative(),
  energySources: z.int().nonnegative(),
  bankBookings: z.int().nonnegative(),
  meters: z.int().nonnegative(),
  warnings: z.int().nonnegative(),
})
export type MigrationCounts = z.infer<typeof migrationCountsSchema>

/**
 * Eine dokumentierte Feldtransformation: Quellfeld (JSON-Pfad in der
 * v3-Datei), Zielfeld (JSON-Pfad in der neuen Datei) und Regel.
 */
export const migrationFieldChangeSchema = z.strictObject({
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  /** Kurzname der Transformationsregel (z. B. `euro_to_cents`). */
  rule: z.string().min(1),
  note: z.string().nullish(),
})
export type MigrationFieldChange = z.infer<typeof migrationFieldChangeSchema>

/**
 * Ein verworfenes oder nicht zuordenbares Feld. Verwerfen ist nur mit
 * dokumentierter Begründung zulässig (Masterplan 9.3/25); unbekannte
 * Felder werden stattdessen unter `unmappedFields` ausgewiesen und im
 * Zielbestand aufbewahrt oder die Migration schlägt fehl.
 */
export const migrationDroppedFieldSchema = z.strictObject({
  sourcePath: z.string().min(1),
  reason: z.string().min(1),
  /** Letzter Wert nur als Typangabe, niemals der Inhalt (Datenschutz). */
  valueType: z.string().nullish(),
})
export type MigrationDroppedField = z.infer<typeof migrationDroppedFieldSchema>

/** Migrationsbericht (Masterplan 9.3). */
export const migrationReportSchema = z.strictObject({
  /** Quelldateiname, falls bekannt (Import aus Dateiauswahl). */
  sourceFileName: z.string().nullish(),
  /** SHA-256 der unveränderten Quelldatei (lowercase-Hex, validiert). */
  sourceSha256: sha256HexSchema,
  detectedSchemaVersion: z.int().positive(),
  targetSchemaVersion: z.int().positive(),
  counts: migrationCountsSchema,
  /** Warnungen und Hinweise der Migration (Kategorienmodell 7.1). */
  issues: z.array(validationIssueSchema),
  /** Dokumentierte Feldtransformationen. */
  changedFields: z.array(migrationFieldChangeSchema),
  /** Bewusst verworfene Felder mit Begründung. */
  droppedFields: z.array(migrationDroppedFieldSchema),
  /** Unbekannte Felder, die erhalten, aber keinem Zielfeld zugeordnet wurden. */
  unmappedFields: z.array(z.string()),
  migratedAt: isoTimestampSchema,
  appVersion: z.string().nullish(),
})
export type MigrationReport = z.infer<typeof migrationReportSchema>
