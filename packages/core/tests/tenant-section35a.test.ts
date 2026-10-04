import { readFileSync } from 'node:fs'
import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import type { Scenario } from '../../../tests/characterization/types'
import { calculateBilling, createCalculationInput } from '../src'

const handCases = JSON.parse(
  readFileSync(
    new URL(
      '../../../tests/characterization/hand-calculated/cases.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { cases: { scenario: Scenario }[] }

function appDataFor(caseId: string): AppDataFile {
  const entry = handCases.cases.find(({ scenario }) =>
    scenario.id.startsWith(caseId),
  )
  if (!entry) throw new Error(`Handrechnung "${caseId}" fehlt`)
  return structuredClone(buildAppDataFile(entry.scenario))
}

function section35a(appData: AppDataFile) {
  const result = calculateBilling(createCalculationInput(appData, 'bp-1'))
  return Object.fromEntries(
    result.tenants.map((tenant) => [
      tenant.id.replace(/^op-/u, ''),
      tenant.section35a,
    ]),
  )
}

describe('§ 35a EStG je Mieter', () => {
  it('weist den Lohnanteil je Kostenart aus', () => {
    expect(section35a(appDataFor('H04'))).toEqual({
      t1: {
        totalCents: 25_200,
        items: [{ costCategoryId: 'k-hauswart', laborCents: 25_200 }],
      },
      t2: {
        totalCents: 10_800,
        items: [{ costCategoryId: 'k-hauswart', laborCents: 10_800 }],
      },
    })
  })

  it('liefert ohne Lohnanteil eine leere Bescheinigung', () => {
    const appData = appDataFor('H01')
    expect(section35a(appData).t1).toEqual({ totalCents: 0, items: [] })
  })

  it('berücksichtigt nicht umlagefähige und direkt zugeordnete Kosten nicht', () => {
    const appData = appDataFor('H04')
    for (const category of appData.billingData.costCategories) {
      category.laborSharePercent = 50
      if (category.id === 'k-hauswart') category.allocationKey = 'direct'
    }
    expect(section35a(appData).t1).toEqual({ totalCents: 0, items: [] })
  })

  it('verteilt Heizungs-Wartung nach dem Anteil an Grund- und Verbrauchskosten', () => {
    expect(section35a(appDataFor('H06'))).toEqual({
      t1: {
        totalCents: 7_250,
        items: [{ costCategoryId: 'k-wartung', laborCents: 7_250 }],
      },
      t2: {
        totalCents: 2_750,
        items: [{ costCategoryId: 'k-wartung', laborCents: 2_750 }],
      },
    })
  })

  it('nutzt bei Grundkosten nach Nutzfläche dieselbe Fläche wie die Abrechnung', () => {
    const appData = appDataFor('H06')
    appData.billingData.billingPeriods[0]!.heatingDefaults!.baseCostAreaBasis =
      'usable_area'
    expect(section35a(appData).t1?.totalCents).toBe(7_250)
  })

  it('rechnet ohne Heizkosten im Heizkreis keinen Heizungs-Lohnanteil', () => {
    const appData = appDataFor('H06')
    appData.billingData.fuelDeliveries = []
    for (const stock of appData.billingData.fuelStocks) {
      stock.openingQuantity = { value: 0, unit: stock.openingQuantity!.unit }
      stock.openingValueCents = 0
      stock.remainingQuantity = { value: 0, unit: stock.openingQuantity!.unit }
    }
    for (const circuit of appData.billingData.heatingCircuits) {
      if (circuit.co2?.mode === 'manual') circuit.co2.levyCents = 0
    }
    for (const category of appData.billingData.costCategories) {
      category.totalAmountCents = 0
    }
    expect(section35a(appData).t1).toEqual({ totalCents: 0, items: [] })
  })
})
