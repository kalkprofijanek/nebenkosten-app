/**
 * Fehler- und Warnungsmodell (Masterplan 7.1). Dieser Vertrag wird von
 * `packages/validators` (PR 10) und vom Migrationsbericht (PR 04)
 * gemeinsam verwendet.
 */
import { z } from 'zod'

/**
 * Kategorien nach Masterplan 7.1:
 * - `error`: Abrechnung darf nicht freigegeben werden.
 * - `warning`: Freigabe nur mit bewusster Bestätigung.
 * - `info`: Hinweis ohne Sperrwirkung.
 * (Legacy verwendete `error`/`warn`/`info`; `warn` → `warning`.)
 */
export const validationSeveritySchema = z.enum(['error', 'warning', 'info'])
export type ValidationSeverity = z.infer<typeof validationSeveritySchema>

/**
 * Fachbereich der Prüfung (Erweiterung gegenüber dem Legacy-Freitextfeld
 * `area`; die Migration mappt Freitexte auf `other`, wenn kein Bereich
 * zuordenbar ist).
 */
export const validationAreaSchema = z.enum([
  'master_data',
  'billing_period',
  'occupancy',
  'costs',
  'bookings',
  'heating',
  'hot_water',
  'co2',
  'meters',
  'prepayments',
  'totals',
  'documents',
  'migration',
  'schema',
  'other',
])
export type ValidationArea = z.infer<typeof validationAreaSchema>

/**
 * ValidationIssue / Prüfhinweis (Legacy: `{level, area, title, detail}`
 * aus `check()`/`buildFreigabeChecks()`).
 *
 * `code` ist ein stabiler, maschinenlesbarer Schlüssel (snake_case),
 * damit Prüfungen versionsübergreifend identifizierbar bleiben.
 * `path` lokalisiert den Befund in der Datenstruktur (JSON-Pfad-Segmente).
 */
export const validationIssueSchema = z.strictObject({
  severity: validationSeveritySchema,
  code: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_.]+$/),
  area: validationAreaSchema,
  title: z.string().min(1).max(200),
  detail: z.string().max(2_000).nullish(),
  path: z
    .array(z.union([z.string().max(255), z.int().nonnegative()]))
    .max(64)
    .nullish(),
  /** Betroffene Entität, falls zuordenbar. */
  entity: z
    .strictObject({
      type: z.string().min(1).max(100),
      id: z.string().min(1).max(128),
    })
    .nullish(),
})
export type ValidationIssue = z.infer<typeof validationIssueSchema>
