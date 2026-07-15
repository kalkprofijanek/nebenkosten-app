/**
 * Erzeugte Dokumente und Änderungsprotokoll (Masterplan 5.1).
 */
import { z } from 'zod'
import { entityIdSchema, isoTimestampSchema } from '../primitives'

/** Dokumentarten der Legacy-PDF-Ausgabe (Masterplan 10). */
export const documentKindSchema = z.enum([
  'tenant_statement',
  'combined_statement',
  'owner_report',
  'total_cost_report',
  'co2_report',
  'approval_protocol',
  'zip_bundle',
])
export type DocumentKind = z.infer<typeof documentKindSchema>

/**
 * Document / erzeugtes Dokument. Dokumente werden aus einem
 * Berechnungs-Snapshot erzeugt; ein später veränderter Live-Datenbestand
 * darf ein finalisiertes Dokument nicht rückwirkend verändern.
 */
export const documentSchema = z.strictObject({
  id: entityIdSchema,
  billingPeriodId: entityIdSchema,
  kind: documentKindSchema,
  createdAt: isoTimestampSchema,
  calculationRunId: entityIdSchema.nullish(),
  /** Empfänger-Nutzungszeitraum bei Einzelabrechnungen. */
  occupancyPeriodId: entityIdSchema.nullish(),
  fileName: z.string().nullish(),
  sha256: z.string().length(64).nullish(),
})
export type Document = z.infer<typeof documentSchema>

/**
 * AuditEvent / Änderungsprotokoll (Legacy: `Abrechnung._protokoll[]`,
 * append-only). `details` nimmt die variablen Legacy-Felder
 * (`nutzerAnzahl`, `fehler`, `warnungen`, `version`, …) verlustfrei auf.
 */
export const auditEventSchema = z.strictObject({
  id: entityIdSchema,
  billingPeriodId: entityIdSchema.nullish(),
  timestamp: isoTimestampSchema,
  action: z.string().min(1),
  details: z.record(z.string(), z.unknown()).nullish(),
})
export type AuditEvent = z.infer<typeof auditEventSchema>
