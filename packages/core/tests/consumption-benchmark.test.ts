import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  ConsumptionBenchmark,
  HeatingCircuit,
} from '@nebenkosten/schema'
import {
  calculateBilling,
  classifyConsumptionBenchmark,
  compareTenantWithConsumptionBenchmark,
  createCalculationInput,
} from '../src'

/** Fiktive Klassengrenzen; keine Werte einer echten Heizspiegel-Ausgabe. */
const BENCHMARK: ConsumptionBenchmark = {
  source: 'Heizspiegel für Deutschland (co2online)',
  referenceYear: 2025,
  category: 'Heizöl, fiktive Kategorie',
  includesHotWater: true,
  lowMaxKwhPerSqmYear: 70,
  mediumMaxKwhPerSqmYear: 130,
  elevatedMaxKwhPerSqmYear: 200,
}

/**
 * Fiktives Haus: 2 × 100 m², 10.000 l Heizöl à 10 kWh = 100.000 kWh
 * Energieeinsatz, 20 % Warmwasser. Mieter A 300 Einheiten / 2 Personen
 * ganzjährig, Mieter B 100 Einheiten / 2 Personen ab 01.07.
 */
function data(circuitPatch: Partial<HeatingCircuit> = {}): AppDataFile {
  const area = (value: number) => ({ value, unit: 'm2' })
  return {
    schemaVersion: 5,
    meta: { appVersion: 'benchmark-test' },
    masterData: {
      organizations: [{ id: 'org', name: 'Test' }],
      ownerCompanies: [
        {
          id: 'owner',
          organizationId: 'org',
          name: 'Test',
          additionalNameLines: [],
          address: { street: 'Test', postalCodeAndCity: '12345 Test' },
        },
      ],
      properties: [
        {
          id: 'property',
          ownerCompanyId: 'owner',
          address: { street: 'Test', postalCodeAndCity: '12345 Test' },
        },
      ],
      buildings: [
        {
          id: 'building',
          propertyId: 'property',
          name: 'Test',
          mandateRefPrefixes: [],
        },
      ],
      units: ['unit-a', 'unit-b'].map((id) => ({
        id,
        propertyId: 'property',
        buildingId: 'building',
        usableAreaSqm: area(100),
        heatedAreaSqm: area(100),
      })),
      persons: [],
      tenancies: [],
      allocationRules: [],
      heatingSystems: [{ id: 'system', propertyId: 'property' }],
      meters: [],
    },
    billingData: {
      billingPeriods: [
        {
          id: 'p-2025',
          propertyId: 'property',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
          heatingDefaults: {
            consumptionSharePercent: 70,
            baseSharePercent: 30,
          },
        },
      ],
      occupancyPeriods: [
        {
          id: 'occ-a',
          billingPeriodId: 'p-2025',
          unitId: 'unit-a',
          kind: 'tenant',
          from: '2025-01-01',
          to: '2025-12-31',
          persons: { value: 2, unit: 'personen' },
          consumptionUnits: { value: 300, unit: 'einheiten' },
        },
        {
          id: 'occ-b-vacant',
          billingPeriodId: 'p-2025',
          unitId: 'unit-b',
          kind: 'vacancy',
          from: '2025-01-01',
          to: '2025-06-30',
        },
        {
          id: 'occ-b',
          billingPeriodId: 'p-2025',
          unitId: 'unit-b',
          kind: 'tenant',
          from: '2025-07-01',
          to: '2025-12-31',
          persons: { value: 2, unit: 'personen' },
          consumptionUnits: { value: 100, unit: 'einheiten' },
        },
      ],
      prepayments: [],
      costCategories: [],
      costEntries: [],
      bankBookings: [],
      heatingCircuits: [
        {
          id: 'circuit',
          billingPeriodId: 'p-2025',
          heatingSystemId: 'system',
          buildingId: 'building',
          hasCentralHotWater: true,
          hotWaterSharePercent: 20,
          consumptionBenchmark: BENCHMARK,
          ...circuitPatch,
        },
      ],
      energySources: [
        {
          id: 'oil',
          heatingCircuitId: 'circuit',
          key: 'haupt',
          sourceType: 'Heizöl',
          calorificValueKwhPerUnit: 10,
        },
      ],
      fuelStocks: [
        {
          id: 'oil-stock',
          energySourceId: 'oil',
          billingPeriodId: 'p-2025',
          openingQuantity: { value: 0, unit: 'l' },
          openingValueCents: 0,
          remainingQuantity: { value: 0, unit: 'l' },
        },
      ],
      fuelDeliveries: [
        {
          id: 'oil-1',
          energySourceId: 'oil',
          billingPeriodId: 'p-2025',
          date: '2025-02-01',
          quantity: { value: 10_000, unit: 'l' },
          amountCents: 1_000_000,
        },
      ],
      meterReadings: [],
      meterBillingStatuses: [],
      calculationRuns: [],
      calculationResults: [],
      documents: [],
      auditEvents: [],
    },
  } as unknown as AppDataFile
}

function compare(file: AppDataFile, occupancyId: string) {
  const output = calculateBilling(createCalculationInput(file, 'p-2025'))
  return compareTenantWithConsumptionBenchmark(
    output,
    occupancyId,
    file.billingData.heatingCircuits[0],
  )
}

describe('Vergleich mit normiertem Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4 HeizKV)', () => {
  it('rechnet den Anteil am Energieeinsatz einschließlich Warmwasser', () => {
    const result = compare(data(), 'occ-a')
    expect(result.status).toBe('compared')
    if (result.status !== 'compared') return
    // Heizwärme: 100.000 kWh × 80 % × 300 / 400 Einheiten = 60.000 kWh
    expect(result.heatingKwh).toBe(60_000)
    // Warmwasser: 20.000 kWh × 2 Personen ÷ (2 + 2 × 184/365) Personenjahre
    expect(result.hotWaterKwh).toBe(
      Math.round((20_000 * 2) / (2 + (2 * 184) / 365)),
    )
    expect(result.energyKwh).toBe(result.heatingKwh + result.hotWaterKwh)
    expect(result.areaSqm).toBe(100)
    expect(result.annualized).toBe(false)
    expect(result.annualization).toBe('none')
    expect(result.kwhPerSqmYear).toBe(
      Math.round((60_000 + (20_000 * 2) / (2 + (2 * 184) / 365)) / 10) / 10,
    )
    expect(result.benchmarkClass).toBe('high')
    expect(result.rangeKwh).toEqual({
      lowMax: 7_000,
      mediumMax: 13_000,
      elevatedMax: 20_000,
    })
  })

  it('rechnet bei Teilzeitraum auf ein Jahr hoch und skaliert die Grenzen', () => {
    const result = compare(data(), 'occ-b')
    expect(result.status).toBe('compared')
    if (result.status !== 'compared') return
    const timeFactor = 184 / 365
    expect(result.annualized).toBe(true)
    expect(result.annualization).toBe('linear')
    expect(result.heatingKwh).toBe(20_000)
    expect(result.kwhPerSqmYear).toBe(
      Math.round(
        ((20_000 + (20_000 * 2 * timeFactor) / (2 + 2 * timeFactor)) /
          100 /
          timeFactor) *
          10,
      ) / 10,
    )
    expect(result.rangeKwh.mediumMax).toBe(Math.round(130 * 100 * timeFactor))
  })

  it('rechnet mit Nutzungszeitraum die Heizwärme nach Gradtagszahlen hoch', () => {
    const file = data()
    const output = calculateBilling(createCalculationInput(file, 'p-2025'))
    const result = compareTenantWithConsumptionBenchmark(
      output,
      'occ-b',
      file.billingData.heatingCircuits[0],
      {
        from: '2025-07-01',
        to: '2025-12-31',
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
      },
    )
    expect(result.status).toBe('compared')
    if (result.status !== 'compared') return
    // Gradtage 01.07.–31.12.: 40 × 62/92 (Juli, August) + 390 = 416,957 ‰
    const heatingFactor = ((40 * 62) / 92 + 390) / 1_000
    const timeFactor = 184 / 365
    const hotWater = (20_000 * 2 * timeFactor) / (2 + 2 * timeFactor)
    const annual = 20_000 / heatingFactor + hotWater / timeFactor
    expect(result.annualization).toBe('degree_days')
    expect(result.kwhPerSqmYear).toBe(Math.round((annual / 100) * 10) / 10)
    expect(result.rangeKwh.mediumMax).toBe(
      Math.round((130 * 100 * (20_000 + hotWater)) / annual),
    )
  })

  it('lässt Warmwasser weg, wenn die Vergleichswerte es nicht enthalten', () => {
    const result = compare(
      data({ consumptionBenchmark: { ...BENCHMARK, includesHotWater: false } }),
      'occ-a',
    )
    expect(result).toMatchObject({
      status: 'compared',
      heatingKwh: 60_000,
      hotWaterKwh: 0,
      energyKwh: 60_000,
      kwhPerSqmYear: 600,
    })
  })

  it('vergleicht nicht, wenn Warmwasser fehlt, die Werte es aber enthalten', () => {
    expect(
      compare(
        data({ hasCentralHotWater: false, hotWaterSharePercent: null }),
        'occ-a',
      ),
    ).toEqual({
      status: 'unavailable',
      occupancyPeriodId: 'occ-a',
      reason: 'hot_water_energy_unknown',
    })
  })

  it('nennt den Grund, wenn kein Vergleich möglich ist', () => {
    const reason = (file: AppDataFile, id = 'occ-a') => {
      const result = compare(file, id)
      return result.status === 'unavailable' ? result.reason : result.status
    }
    expect(reason(data({ consumptionBenchmark: null }))).toBe('no_benchmark')
    expect(reason(data(), 'occ-b-vacant')).toBe('vacancy')
    expect(reason(data(), 'unknown')).toBe('not_in_calculation')
    const withoutCalorific = data()
    withoutCalorific.billingData.energySources[0]!.calorificValueKwhPerUnit =
      null
    expect(reason(withoutCalorific)).toBe('energy_input_unknown')
    const withoutConsumption = data()
    withoutConsumption.billingData.occupancyPeriods[0]!.consumptionUnits = {
      value: 0,
      unit: 'einheiten',
    }
    expect(reason(withoutConsumption)).toBe('consumption_unknown')
    const withoutArea = data()
    withoutArea.masterData.units[0]!.heatedAreaSqm = { value: 0, unit: 'm2' }
    withoutArea.masterData.units[0]!.usableAreaSqm = { value: 0, unit: 'm2' }
    expect(reason(withoutArea)).toBe('area_unknown')
    const output = calculateBilling(createCalculationInput(data(), 'p-2025'))
    expect(
      compareTenantWithConsumptionBenchmark(output, 'occ-a', null),
    ).toEqual({
      status: 'unavailable',
      occupancyPeriodId: 'occ-a',
      reason: 'no_benchmark',
    })
  })

  it('stuft an den Klassengrenzen ein (Grenze gehört zur unteren Klasse)', () => {
    expect(classifyConsumptionBenchmark(70, BENCHMARK)).toBe('low')
    expect(classifyConsumptionBenchmark(70.1, BENCHMARK)).toBe('medium')
    expect(classifyConsumptionBenchmark(130, BENCHMARK)).toBe('medium')
    expect(classifyConsumptionBenchmark(200, BENCHMARK)).toBe('elevated')
    expect(classifyConsumptionBenchmark(200.1, BENCHMARK)).toBe('high')
  })
})
