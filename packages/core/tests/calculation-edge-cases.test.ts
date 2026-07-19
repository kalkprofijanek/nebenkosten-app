import type { AppDataFile, CostCategory } from '@nebenkosten/schema'
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

describe('calculateBilling – validierte Randfälle', () => {
  it('berechnet alle Umlageschlüssel, explizite Summen und Beleg-Umlagegrade', () => {
    const appData = appDataFor('case-01-full-year')
    const period = appData.billingData.billingPeriods[0]!
    period.totals = {
      usableAreaSqm: { value: 100, unit: 'm2' },
      heatedAreaSqm: { value: 100, unit: 'm2' },
      persons: { value: 3, unit: 'personen' },
      consumptionUnits: { value: 10, unit: 'einheiten' },
      residentialUnitCount: { value: 2, unit: 'stueck' },
    }

    const categories: CostCategory[] = [
      {
        id: 'heated',
        billingPeriodId: 'bp-1',
        kind: 'operating',
        label: 'Heizfläche',
        allocationKey: 'heated_area',
        scope: { kind: 'building', buildingId: 'B1' },
        totalAmountCents: 10_000,
      },
      {
        id: 'consumption',
        billingPeriodId: 'bp-1',
        kind: 'water',
        label: 'Verbrauch',
        allocationKey: 'consumption_units',
        scope: { kind: 'house', houseKey: 'AW1' },
        totalAmountCents: 10_000,
      },
      {
        id: 'residential',
        billingPeriodId: 'bp-1',
        kind: 'operating',
        label: 'Wohneinheiten',
        allocationKey: 'residential_units',
        scope: { kind: 'property' },
        totalAmountCents: 10_000,
      },
      {
        id: 'without-key',
        billingPeriodId: 'bp-1',
        kind: 'operating',
        label: 'Ohne Schlüssel',
        allocationKey: null,
        totalAmountCents: 10_000,
      },
    ]
    appData.billingData.costCategories = [
      ...appData.billingData.costCategories,
      ...categories,
    ]
    appData.billingData.costEntries = [
      {
        id: 'entry-positive',
        costCategoryId: 'k-muell',
        amountCents: 20_000,
        allocablePercent: 50,
      },
      {
        id: 'entry-negative',
        costCategoryId: 'k-muell',
        amountCents: -5_000,
        allocablePercent: 100,
      },
    ]

    const result = calculate(appData)

    expect(result.totals.recordedCostsCents).toBe(55_000)
    expect(result.tenants).toHaveLength(2)
    expect(
      result.tenants.every(({ shareCents }) => Number.isFinite(shareCents)),
    ).toBe(true)
  })

  it('ordnet Hausbereiche sowohl explizit als auch über die Mandatsreferenz zu', () => {
    const appData = appDataFor('case-01-full-year')
    const category = appData.billingData.costCategories[0]!
    category.scope = { kind: 'house', houseKey: 'aw1' }
    appData.billingData.occupancyPeriods[0]!.costScope = {
      kind: 'house',
      houseKey: 'AW1',
    }

    expect(calculate(appData).totals.tenantTotalCents).toBe(120_000)
  })

  it('weist gemischte Brennstoff-Mengeneinheiten zurück', () => {
    const appData = appDataFor('case-06-heating-oil-fifo')
    appData.billingData.fuelDeliveries[0]!.quantity = {
      value: 1_000,
      unit: 'kg',
    }

    expect(() => calculate(appData)).toThrowError(/Mengeneinheit/)
  })

  it('weist gemischte Liefer-Einheiten auch ohne Anfangsbestand zurück', () => {
    const appData = appDataFor('case-06-heating-oil-fifo')
    appData.billingData.fuelStocks = []
    const firstDelivery = appData.billingData.fuelDeliveries[0]!
    appData.billingData.fuelDeliveries = [
      firstDelivery,
      {
        ...firstDelivery,
        id: 'delivery-with-other-unit',
        quantity: { value: 1_000, unit: 'kg' },
      },
    ]

    expect(() => calculate(appData)).toThrowError(/Mengeneinheit/)
  })

  it('behandelt fehlende und leere Brennstoffbestände deterministisch', () => {
    const withoutFuel = appDataFor('case-06-heating-oil-fifo')
    withoutFuel.billingData.fuelStocks = []
    withoutFuel.billingData.fuelDeliveries = []
    expect(calculate(withoutFuel).heating.fuelConsumptionCents).toBe(0)

    const zeroLastLot = appDataFor('case-06-heating-oil-fifo')
    zeroLastLot.billingData.fuelDeliveries.push({
      id: 'zero-delivery',
      energySourceId: zeroLastLot.billingData.energySources[0]!.id,
      billingPeriodId: 'bp-1',
      date: '2024-12-31',
      quantity: { value: 0, unit: 'l' },
      amountCents: 0,
    })
    expect(calculate(zeroLastLot).heating.totalCents).toBeGreaterThan(0)
  })

  it('deckt alle gesetzlichen automatischen CO₂-Stufen ab', () => {
    const targets = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

    const percentages = targets.map((targetIntensity) => {
      const appData = appDataFor('case-06-heating-oil-fifo')
      const source = appData.billingData.energySources[0]!
      const area = appData.masterData.units.reduce(
        (sum, unit) => sum + (unit.heatedAreaSqm?.value ?? 0),
        0,
      )
      const stock = appData.billingData.fuelStocks[0]!
      const delivered = appData.billingData.fuelDeliveries.reduce(
        (sum, delivery) => sum + (delivery.quantity?.value ?? 0),
        0,
      )
      const consumed =
        (stock.openingQuantity?.value ?? 0) +
        delivered -
        (stock.remainingQuantity?.value ?? 0)
      source.co2FactorKgPerKwh =
        targetIntensity /
        ((consumed * (source.calorificValueKwhPerUnit ?? 0)) / area)

      return calculate(appData).heating.perCircuit[0]!.co2TenantPercent
    })

    expect(percentages).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 20, 5])
  })

  it('verwendet dokumentierte Standardwerte für optionale Heizangaben', () => {
    const appData = appDataFor('case-10-central-hot-water')
    const period = appData.billingData.billingPeriods[0]!
    const circuit = appData.billingData.heatingCircuits[0]!
    const occupancy = appData.billingData.occupancyPeriods[0]!
    period.heatingDefaults = null
    circuit.hotWaterSharePercent = null
    occupancy.persons = null

    const result = calculate(appData)

    expect(result.heating.perCircuit[0]!.hotWaterCents).toBeGreaterThan(0)
    expect(result.tenants[0]!.status).toBe('gruen')
  })

  it('markiert negative Anteile rot und weist unzugeordnete Heizkosten aus', () => {
    const negative = appDataFor('case-01-full-year')
    negative.billingData.costCategories[0]!.totalAmountCents = -1_000_000
    expect(
      calculate(negative).tenants.every(({ status }) => status === 'rot'),
    ).toBe(true)

    const unassigned = appDataFor('case-14-missing-assignment')
    unassigned.masterData.units = unassigned.masterData.units.map((unit) => ({
      ...unit,
      buildingId: null,
    }))
    const result = calculate(unassigned)
    expect(result.heating.unallocatedLandlordCents).toBe(0)
  })
})
