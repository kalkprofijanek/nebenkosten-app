import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import { calculateBilling, createCalculationInput } from '../src'

function appDataFor(caseId: string): AppDataFile {
  const scenario = scenarios.find(({ id }) => id === caseId)
  if (!scenario) throw new Error(`Testszenario "${caseId}" fehlt`)
  return structuredClone(buildAppDataFile(scenario))
}

function calculate(appData: AppDataFile) {
  return calculateBilling(createCalculationInput(appData, 'bp-1'))
}

describe('costBreakdown je Mieter (PR 11)', () => {
  it('liefert eine Kostenart-Aufschlüsselung, die nahe an shareCents liegt', () => {
    const appData = appDataFor('case-01-full-year')
    const result = calculate(appData)
    const categoryIds = new Set(
      appData.billingData.costCategories.map(({ id }) => id),
    )

    expect(result.tenants.length).toBeGreaterThan(0)
    for (const tenant of result.tenants) {
      const { costBreakdown } = tenant
      expect(Array.isArray(costBreakdown.operatingByCategory)).toBe(true)
      for (const item of costBreakdown.operatingByCategory) {
        expect(categoryIds.has(item.costCategoryId)).toBe(true)
        expect(Number.isInteger(item.amountCents)).toBe(true)
      }
      expect(Number.isInteger(costBreakdown.heatingBaseCents)).toBe(true)
      expect(Number.isInteger(costBreakdown.heatingConsumptionCents)).toBe(true)
      expect(Number.isInteger(costBreakdown.hotWaterCents)).toBe(true)
      expect(Number.isInteger(costBreakdown.heatingCo2Cents)).toBe(true)

      const breakdownSum =
        costBreakdown.operatingByCategory.reduce(
          (sum, item) => sum + item.amountCents,
          0,
        ) +
        costBreakdown.heatingBaseCents +
        costBreakdown.heatingConsumptionCents +
        costBreakdown.hotWaterCents +
        costBreakdown.heatingCo2Cents

      // Einzelrundung je Position vs. Gesamtrundung inkl. Restcent-Verteilung
      // – geringe Abweichung ist erwartbar, keine Drift in der Größenordnung.
      expect(Math.abs(breakdownSum - tenant.shareCents)).toBeLessThanOrEqual(
        costBreakdown.operatingByCategory.length + 4,
      )
    }
  })

  it('liefert keine Heizanteile ohne zugehörigen Heizkreis', () => {
    const appData = appDataFor('case-01-full-year')
    appData.billingData.heatingCircuits = []
    appData.billingData.energySources = []
    const result = calculate(appData)

    for (const tenant of result.tenants) {
      expect(tenant.costBreakdown.heatingBaseCents).toBe(0)
      expect(tenant.costBreakdown.heatingConsumptionCents).toBe(0)
      expect(tenant.costBreakdown.hotWaterCents).toBe(0)
      expect(tenant.costBreakdown.heatingCo2Cents).toBe(0)
    }
  })
})
