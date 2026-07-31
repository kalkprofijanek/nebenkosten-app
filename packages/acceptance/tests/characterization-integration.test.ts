import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { describe, expect, it } from 'vitest'

import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { goldenById, scenarios } from '../../../tests/characterization/cases'
import { compareAcceptance, type AcceptanceExpectation } from '../src'

describe.each(scenarios.map((scenario) => [scenario.id, scenario] as const))(
  'PR-12-Abnahmevergleich mit Characterization-Fall %s',
  (id, scenario) => {
    it('akzeptiert das echte Engine-Ergebnis innerhalb der freigegebenen Cent-Toleranzen', () => {
      const golden = goldenById.get(id)!
      const data = buildAppDataFile(scenario)
      const actual = calculateBilling(createCalculationInput(data, 'bp-1'))
      const expectation: AcceptanceExpectation = {
        reference: id,
        totals: {
          recordedCostsCents: golden.totals.recordedCostsCents,
          heatingTotalCents: golden.heating.totalCents,
          co2TenantCents: golden.co2.tenantCents,
          co2LandlordCents: golden.co2.landlordCents,
          prepaymentsCents: golden.totals.prepaymentsCents,
          vacancyLandlordCents: golden.vacancyLandlordCents,
          controlDifferenceCents: golden.totals.controlDifferenceCents,
        },
        occupancies: golden.tenants.map((tenant) => ({
          reference: tenant.id,
          calculationResultId: `op-${tenant.id}`,
          isVacancy: tenant.isVacancy,
          shareCents: tenant.shareCents,
          prepaymentCents: tenant.prepaymentCents,
          balanceCents: tenant.balanceCents,
        })),
      }

      const report = compareAcceptance(expectation, actual)

      expect(report.passed, JSON.stringify(report, null, 2)).toBe(true)
    })
  },
)
