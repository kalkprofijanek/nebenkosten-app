/**
 * Berechnungslauf und -ergebnis (Masterplan 5.1). Die vollständigen
 * Ergebnis-Verträge (CalculationInput/Output, Masterplan 6.1) werden mit
 * der Core-Engine (PR 06/07) in `packages/core/src/contracts/` präzisiert;
 * hier wird nur der persistierte Snapshot-Rahmen definiert.
 */
import { z } from 'zod'
import {
  entityIdSchema,
  isoTimestampSchema,
  moneyCentsSchema,
} from '../primitives'
import { validationIssueSchema } from './validation'

/**
 * CalculationRun / Berechnungslauf. Ein Lauf ist einem Abrechnungsjahr
 * zugeordnet und referenziert den Eingabestand über einen Hash, damit
 * finalisierte Dokumente nicht rückwirkend „live“ mutieren können
 * (Masterplan 10).
 */
export const calculationRunSchema = z.strictObject({
  id: entityIdSchema,
  billingPeriodId: entityIdSchema,
  startedAt: isoTimestampSchema,
  appVersion: z.string().nullish(),
  /** SHA-256 des validierten, serialisierten Eingabestands. */
  inputSha256: z.string().length(64).nullish(),
})
export type CalculationRun = z.infer<typeof calculationRunSchema>

/** Kontrollsummen des Gesamtergebnisses (Cent-genau, Masterplan 6.3). */
export const calculationTotalsSchema = z.strictObject({
  recordedCostsCents: moneyCentsSchema,
  tenantTotalCents: moneyCentsSchema,
  landlordTotalCents: moneyCentsSchema,
  unallocatedCents: moneyCentsSchema,
  prepaymentsCents: moneyCentsSchema,
  /** Soll 0; Abweichung > 1 Cent ist ein Fehler (Masterplan 6.3). */
  controlDifferenceCents: moneyCentsSchema,
})
export type CalculationTotals = z.infer<typeof calculationTotalsSchema>

/**
 * CalculationResult / persistiertes Berechnungsergebnis (Snapshot).
 * `resultSnapshot` trägt das vollständige Engine-Ergebnis; sein innerer
 * Aufbau wird mit PR 06/07 versioniert (`snapshotFormatVersion`).
 */
export const calculationResultSchema = z.strictObject({
  id: entityIdSchema,
  calculationRunId: entityIdSchema,
  totals: calculationTotalsSchema,
  warnings: z.array(validationIssueSchema),
  snapshotFormatVersion: z.int().positive(),
  resultSnapshot: z.unknown(),
})
export type CalculationResult = z.infer<typeof calculationResultSchema>
