import {
  calculationInputSha256,
  createCalculationInput,
} from '@nebenkosten/core'
import type { AppDataFile } from '@nebenkosten/schema'
import { latestCalculationRun } from './latest-calculation-run'

/**
 * Bindung des jüngsten Rechenlaufs an den aktuellen Eingabestand (PR-48):
 * - `current`: `inputSha256` entspricht dem aktuellen Eingabestand.
 * - `stale`: Hash weicht ab, oder der Eingabestand ist nicht berechenbar.
 * - `unbound`: Lauf ohne Hash (vor PR-48 gespeichert oder importiert).
 * - `missing`: kein Rechenlauf mit gespeichertem Ergebnis.
 */
export type CalculationBinding = 'current' | 'stale' | 'unbound' | 'missing'

export function calculationBinding(
  data: AppDataFile,
  billingPeriodId: string,
): CalculationBinding {
  const latestRun = latestCalculationRun(
    data.billingData.calculationRuns,
    billingPeriodId,
  )
  if (
    !latestRun ||
    !data.billingData.calculationResults.some(
      ({ calculationRunId }) => calculationRunId === latestRun.id,
    )
  )
    return 'missing'
  if (!latestRun.inputSha256) return 'unbound'
  try {
    return calculationInputSha256(
      createCalculationInput(data, billingPeriodId),
    ) === latestRun.inputSha256
      ? 'current'
      : 'stale'
  } catch {
    return 'stale'
  }
}
