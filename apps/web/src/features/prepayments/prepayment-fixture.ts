import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { buildAppDataFile } from '../../../../../tests/characterization/build-app-data'
import scenarioFile from '../../../../../tests/characterization/scenarios.json'
import type { Scenario } from '../../../../../tests/characterization/types'
import { runCalculation } from '../calculation/calculate-preview'

// Fiktive Testdaten für die Vorauszahlungs-Tests.
export const scenarios = scenarioFile.scenarios as unknown as Scenario[]

export function settledYear(): AppDataFile {
  return runCalculation(
    buildAppDataFile(scenarios.find(({ id }) => id === 'case-01-full-year')!),
    'bp-1',
  )
}

/** Abrechnungsjahr 2024 mit Rechenstand und Folgejahr 2025 im Entwurf. */
export function withFollowYear(
  data = settledYear(),
  status: BillingPeriod['status'] = 'DRAFT',
): AppDataFile {
  const settled = data.billingData.billingPeriods[0]!
  return {
    ...data,
    billingData: {
      ...data.billingData,
      billingPeriods: [
        ...data.billingData.billingPeriods,
        {
          ...settled,
          id: 'bp-2',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status,
        },
      ],
      occupancyPeriods: [
        ...data.billingData.occupancyPeriods,
        {
          id: 'op-t1-2025',
          billingPeriodId: 'bp-2',
          unitId: 'u1',
          tenancyId: 'ten-t1',
          kind: 'tenant',
        },
      ],
      prepayments: [
        ...data.billingData.prepayments,
        {
          id: 'pp-t1-2025',
          occupancyPeriodId: 'op-t1-2025',
          mode: 'monthly',
          monthlyAmountCents: 5000,
        },
      ],
    },
  }
}
