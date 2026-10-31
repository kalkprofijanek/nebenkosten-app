import {
  calculateBilling,
  calculationInputSha256,
  createCalculationInput,
  type CalculationOutput,
} from '@nebenkosten/core'
import type { AppDataFile } from '@nebenkosten/schema'
import { appDataFileSchema } from '@nebenkosten/schema'

import { APP_VERSION } from '../../app/version'

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
  const input = createCalculationInput(data, billingPeriodId)
  const output = calculateBilling(input)
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
          appVersion: APP_VERSION,
          inputSha256: calculationInputSha256(input),
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
