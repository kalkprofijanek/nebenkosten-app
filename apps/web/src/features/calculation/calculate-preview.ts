import {
  calculateBilling,
  createCalculationInput,
  type CalculationOutput,
} from '@nebenkosten/core'
import type { AppDataFile } from '@nebenkosten/schema'
import { appDataFileSchema } from '@nebenkosten/schema'

export function calculatePreview(
  data: AppDataFile,
  billingPeriodId: string,
): CalculationOutput {
  return calculateBilling(createCalculationInput(data, billingPeriodId))
}

export interface RunCalculationDependencies {
  readonly createId?: () => string
  readonly now?: () => Date
}

export function runCalculation(
  data: AppDataFile,
  billingPeriodId: string,
  dependencies: RunCalculationDependencies = {},
): AppDataFile {
  const output = calculatePreview(data, billingPeriodId)
  const createId = dependencies.createId ?? (() => crypto.randomUUID())
  const now = dependencies.now ?? (() => new Date())
  const calculationRunId = createId()
  const calculationResultId = createId()

  return appDataFileSchema.parse({
    ...data,
    billingData: {
      ...data.billingData,
      calculationRuns: [
        ...data.billingData.calculationRuns,
        {
          id: calculationRunId,
          billingPeriodId,
          startedAt: now().toISOString(),
          appVersion: 'pr09',
        },
      ],
      calculationResults: [
        ...data.billingData.calculationResults,
        {
          id: calculationResultId,
          calculationRunId,
          totals: {
            recordedCostsCents: output.totals.recordedCostsCents,
            tenantTotalCents: output.totals.tenantTotalCents,
            landlordTotalCents: output.totals.landlordTotalCents,
            unallocatedCents: output.totals.unallocatedCents,
            prepaymentsCents: output.totals.prepaymentsCents,
            controlDifferenceCents: output.totals.controlDifferenceCents,
          },
          warnings: output.warnings,
          snapshotFormatVersion: output.snapshotFormatVersion,
          resultSnapshot: structuredClone(output),
        },
      ],
    },
  })
}
