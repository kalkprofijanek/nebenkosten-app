import { describe, expect, it } from 'vitest'
import type { AppDataFile, ConsumptionBenchmark } from '@nebenkosten/schema'
import {
  detectEnergyCarriers,
  parseCategoryAreaRange,
  validateBillingPeriod,
} from '../src/index'
import { validData } from './fixture'

/** Fiktive Klassengrenzen; keine Werte einer echten Heizspiegel-Ausgabe. */
function benchmark(category: string): ConsumptionBenchmark {
  return {
    source: 'Heizspiegel für Deutschland (co2online)',
    referenceYear: 2025,
    category,
    includesHotWater: false,
    lowMaxKwhPerSqmYear: 70,
    mediumMaxKwhPerSqmYear: 130,
    elevatedMaxKwhPerSqmYear: 200,
  }
}

function withCircuit(
  patch: {
    benchmark?: ConsumptionBenchmark
    sourceType?: string
    units?: number
  } = {},
): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: 'property-1',
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
    consumptionBenchmark: patch.benchmark ?? null,
  })
  data.billingData.energySources.push({
    id: 'source-1',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    sourceType: patch.sourceType ?? 'Heizöl',
    calorificValueKwhPerUnit: 10,
  })
  data.billingData.fuelDeliveries.push({
    id: 'delivery-1',
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    date: '2025-03-01',
    quantity: { value: 2_000, unit: 'l' },
    amountCents: 200_000,
  })
  for (let index = 2; index <= (patch.units ?? 1); index += 1) {
    data.masterData.units.push({
      id: `unit-${index}`,
      propertyId: 'property-1',
      buildingId: 'building-1',
      usableAreaSqm: { value: 60, unit: 'm2' },
      heatedAreaSqm: { value: 55, unit: 'm2' },
    })
    data.masterData.tenancies.push({
      id: `tenancy-${index}`,
      unitId: `unit-${index}`,
      personIds: ['person-1'],
    })
    data.billingData.occupancyPeriods.push({
      id: `occupancy-${index}`,
      billingPeriodId: 'period-1',
      unitId: `unit-${index}`,
      tenancyId: `tenancy-${index}`,
      kind: 'tenant',
    })
  }
  for (const occupancy of data.billingData.occupancyPeriods)
    occupancy.consumptionUnits = { value: 100, unit: 'einheiten' }
  return data
}

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

describe('§ 9a HeizKV: Schätzungen', () => {
  it('warnt bei geschätztem Verbrauch ohne Begründung', () => {
    const data = withCircuit({ units: 4 })
    data.billingData.occupancyPeriods[0]!.consumptionUnitsEstimated = true
    const [issue] = find(data, 'heating.estimate_reason_missing')
    expect(issue).toMatchObject({
      severity: 'warning',
      area: 'occupancy',
      entity: { type: 'OccupancyPeriod', id: 'occupancy-1' },
    })
    expect(issue!.detail).toContain('§ 9a Abs. 1 HeizKV')

    data.billingData.occupancyPeriods[0]!.consumptionUnitsEstimateReason =
      'Gerät defekt, Vorjahresverbrauch angesetzt'
    expect(find(data, 'heating.estimate_reason_missing')).toEqual([])
  })

  it('meldet nichts ohne Heizkreis oder ohne Schätzung', () => {
    const data = validData()
    data.billingData.occupancyPeriods[0]!.consumptionUnitsEstimated = true
    expect(find(data, 'heating.estimate_reason_missing')).toEqual([])
    expect(find(withCircuit(), 'heating.estimate_reason_missing')).toEqual([])
  })

  it('weist auf deutliche Abweichungen vom Vorjahr hin', () => {
    const data = withCircuit({ units: 4 })
    const occupancy = data.billingData.occupancyPeriods[0]!
    occupancy.consumptionUnitsEstimated = true
    occupancy.consumptionUnitsEstimateReason = 'Schätzung'
    occupancy.previousConsumption = { year: 2024, value: 80 }
    const [issue] = find(data, 'heating.estimate_deviates_from_previous')
    expect(issue).toMatchObject({ severity: 'info', area: 'occupancy' })
    expect(issue!.detail).toContain('+25 %')

    occupancy.previousConsumption = { year: 2024, value: 90 }
    expect(find(data, 'heating.estimate_deviates_from_previous')).toEqual([])
    occupancy.previousConsumption = { year: 2023, value: 10 }
    expect(find(data, 'heating.estimate_deviates_from_previous')).toEqual([])
  })

  it('rechnet den Vorjahreswert auf den Nutzungszeitraum um', () => {
    const data = withCircuit({ units: 4 })
    const occupancy = data.billingData.occupancyPeriods[0]!
    occupancy.consumptionUnitsEstimated = true
    occupancy.consumptionUnitsEstimateReason = 'Schätzung'
    occupancy.from = '2025-07-01'
    occupancy.consumptionUnits = { value: 50, unit: 'einheiten' }
    occupancy.previousConsumption = { year: 2024, value: 100 }
    expect(find(data, 'heating.estimate_deviates_from_previous')).toEqual([])
    occupancy.consumptionUnits = { value: 100, unit: 'einheiten' }
    expect(find(data, 'heating.estimate_deviates_from_previous')).toHaveLength(
      1,
    )
  })

  it('warnt, wenn über 25 % der Fläche geschätzt sind (§ 9a Abs. 2)', () => {
    const data = withCircuit({ units: 2 })
    const occupancy = data.billingData.occupancyPeriods[0]!
    occupancy.consumptionUnitsEstimated = true
    occupancy.consumptionUnitsEstimateReason = 'Gerät defekt'
    const [issue] = find(data, 'heating.section9a_area_only')
    expect(issue).toMatchObject({
      severity: 'warning',
      area: 'heating',
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(issue!.detail).toContain('50 %')
    expect(issue!.detail).toContain('§ 9a Abs. 2 HeizKV')

    const small = withCircuit({ units: 4 })
    small.billingData.occupancyPeriods[0]!.consumptionUnitsEstimated = true
    expect(find(small, 'heating.section9a_area_only')).toEqual([])
  })
})

describe('§ 6a Abs. 3 Nr. 4 HeizKV: Nutzerkategorie der Vergleichswerte', () => {
  it('liest Flächenklassen aus dem Kategorietext', () => {
    expect(parseCategoryAreaRange('Heizöl, 251–500 m²')).toEqual({
      min: 251,
      max: 500,
    })
    expect(parseCategoryAreaRange('Erdgas 1.001 - 2.000 qm')).toEqual({
      min: 1001,
      max: 2000,
    })
    expect(parseCategoryAreaRange('Fernwärme, bis 250 m²')).toEqual({
      min: 0,
      max: 250,
    })
    expect(parseCategoryAreaRange('Erdgas, über 1.000 m2')).toEqual({
      min: 1000,
      max: Infinity,
    })
    expect(parseCategoryAreaRange('Erdgas, Baujahr 1978–1983')).toBeNull()
  })

  it('erkennt Energieträger in Freitexten', () => {
    expect([...detectEnergyCarriers('Heizöl EL')]).toEqual(['oil'])
    expect([...detectEnergyCarriers('Öl-Brennwert')]).toEqual(['oil'])
    expect([...detectEnergyCarriers('Erdgas H')]).toEqual(['gas'])
    expect([...detectEnergyCarriers('Fernwärme')]).toEqual(['district_heating'])
    expect([...detectEnergyCarriers('Wärmepumpe')]).toEqual(['heat_pump'])
    expect([...detectEnergyCarriers('Holzpellets')]).toEqual(['wood'])
    expect([...detectEnergyCarriers('Boiler')]).toEqual([])
    expect([...detectEnergyCarriers(null)]).toEqual([])
  })

  it('warnt, wenn die Gebäudefläche außerhalb der Flächenklasse liegt', () => {
    const data = withCircuit({
      benchmark: benchmark('Heizöl, 251–500 m²'),
    })
    const [issue] = find(data, 'heating.consumption_benchmark_area_mismatch')
    expect(issue).toMatchObject({
      severity: 'warning',
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(issue!.detail).toContain('251–500 m²')
    expect(issue!.detail).toContain('55 m²')

    const fitting = withCircuit({
      benchmark: benchmark('Heizöl, 100–250 m²'),
      units: 4,
    })
    expect(
      find(fitting, 'heating.consumption_benchmark_area_mismatch'),
    ).toEqual([])
  })

  it('warnt, wenn der Energieträger der Kategorie nicht passt', () => {
    const data = withCircuit({ benchmark: benchmark('Erdgas, bis 250 m²') })
    const [issue] = find(data, 'heating.consumption_benchmark_carrier_mismatch')
    expect(issue).toMatchObject({ severity: 'warning', area: 'heating' })
    expect(issue!.detail).toContain('Gas')
    expect(issue!.detail).toContain('Heizöl')

    const fitting = withCircuit({ benchmark: benchmark('Heizöl, bis 250 m²') })
    expect(
      find(fitting, 'heating.consumption_benchmark_carrier_mismatch'),
    ).toEqual([])
    const unknown = withCircuit({
      benchmark: benchmark('Erdgas, bis 250 m²'),
      sourceType: 'Sonstiges',
    })
    expect(
      find(unknown, 'heating.consumption_benchmark_carrier_mismatch'),
    ).toEqual([])
  })
})
