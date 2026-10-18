import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import { calculateBilling, createCalculationInput } from '../src'

/**
 * Umlage nach gemessenem Wasserverbrauch (§ 556a Abs. 1 Satz 2 BGB,
 * ADR-0013): Kalt- plus Warmwasser in m³, Leerstand im Nenner, ohne
 * Zeitfaktor.
 */
function waterCase(
  water: Readonly<Record<string, readonly [number | null, number | null]>>,
): AppDataFile {
  const scenario = scenarios.find(({ id }) => id === 'case-03-vacancy')!
  const data = structuredClone(buildAppDataFile(scenario))
  const category = data.billingData.costCategories[0]!
  category.kind = 'water'
  category.allocationKey = 'water_consumption'
  for (const occupancy of data.billingData.occupancyPeriods) {
    const [cold, warm] = water[occupancy.id] ?? [null, null]
    occupancy.coldWater = cold == null ? null : { value: cold, unit: 'm3' }
    occupancy.warmWater = warm == null ? null : { value: warm, unit: 'm3' }
  }
  return data
}

function calculate(data: AppDataFile) {
  return calculateBilling(createCalculationInput(data, 'bp-1'))
}

function operatingShare(
  result: ReturnType<typeof calculate>,
  occupancyId: string,
) {
  const tenant = result.tenants.find(({ id }) => id === occupancyId)!
  return tenant.costBreakdown.operatingByCategory.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  )
}

describe('Umlageschlüssel nach Wasserverbrauch', () => {
  it('verteilt nach Kalt- plus Warmwasser; Leerstand trägt der Vermieter', () => {
    const result = calculate(
      waterCase({ 'op-t1': [30, 10], 'op-t2': [10, null] }),
    )
    // 1.000 € : 50 m³ × 40 m³ = 800 €; Leerstand 10 m³ = 200 €
    expect(operatingShare(result, 'op-t1')).toBe(80_000)
    expect(result.operatingPositions![0]).toMatchObject({
      allocationKey: 'water_consumption',
      denominator: 50,
      denominatorUnit: 'm³',
      vacancyCents: 20_000,
      distributedCents: 100_000,
    })
    expect(result.totals.controlDifferenceCents).toBe(0)
    expect(
      result.tenants.find(({ id }) => id === 'op-t1')!.ownBasis,
    ).toMatchObject({ waterM3: 40 })
  })

  it('rechnet ohne Zeitfaktor, weil der Zählerwert den Zeitraum abbildet', () => {
    const data = waterCase({ 'op-t1': [40, null], 'op-t2': [10, null] })
    data.billingData.occupancyPeriods[0]!.to = '2024-06-30'
    expect(operatingShare(calculate(data), 'op-t1')).toBe(80_000)
  })

  it('verteilt nichts, solange kein Wasserverbrauch erfasst ist', () => {
    const result = calculate(waterCase({}))
    expect(operatingShare(result, 'op-t1')).toBe(0)
    expect(result.operatingPositions![0]).toMatchObject({
      denominator: 0,
      denominatorUnit: 'm³',
    })
  })
})
