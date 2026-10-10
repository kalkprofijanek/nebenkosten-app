import { describe, expect, it } from 'vitest'
import type { AppDataFile, ConsumptionBenchmark } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

/** Fiktive Klassengrenzen; keine Werte einer echten Heizspiegel-Ausgabe. */
const BENCHMARK: ConsumptionBenchmark = {
  source: 'Heizspiegel für Deutschland (co2online)',
  referenceYear: 2025,
  category: 'Heizöl, fiktive Kategorie',
  includesHotWater: false,
  lowMaxKwhPerSqmYear: 70,
  mediumMaxKwhPerSqmYear: 130,
  elevatedMaxKwhPerSqmYear: 200,
}

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

function withCircuit(
  benchmark: ConsumptionBenchmark | null,
  patch: { hasCentralHotWater?: boolean; calorific?: number | null } = {},
): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: data.masterData.properties[0]!.id,
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: patch.hasCentralHotWater ?? true,
    hotWaterSharePercent: (patch.hasCentralHotWater ?? true) ? 18 : null,
    consumptionBenchmark: benchmark,
  })
  data.billingData.energySources.push({
    id: 'oil',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    sourceType: 'Heizöl',
    calorificValueKwhPerUnit:
      patch.calorific === undefined ? 10 : patch.calorific,
  })
  data.billingData.fuelDeliveries.push({
    id: 'oil-1',
    energySourceId: 'oil',
    billingPeriodId: 'period-1',
    date: '2025-03-01',
    quantity: { value: 2_000, unit: 'l' },
    amountCents: 200_000,
  })
  for (const occupancy of data.billingData.occupancyPeriods)
    occupancy.consumptionUnits = { value: 100, unit: 'einheiten' }
  return data
}

describe('§ 6a Abs. 3 Nr. 4 HeizKV – erfasste Vergleichswerte', () => {
  it('meldet nichts, wenn der Vergleich für alle Nutzer möglich ist', () => {
    const data = withCircuit(BENCHMARK)
    expect(find(data, 'totals.calculation_missing')).toEqual([])
    expect(find(data, 'heating.consumption_benchmark_not_comparable')).toEqual(
      [],
    )
    expect(find(data, 'heating.consumption_benchmark_year_mismatch')).toEqual(
      [],
    )
  })

  it('meldet Vergleichswerte mit Warmwasser bei dezentraler Bereitung', () => {
    const [warning] = find(
      withCircuit(
        { ...BENCHMARK, includesHotWater: true },
        { hasCentralHotWater: false },
      ),
      'heating.consumption_benchmark_not_comparable',
    )
    expect(warning).toMatchObject({
      severity: 'warning',
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(warning!.detail).toContain('Vergleichswerte ohne Warmwasser')
  })

  it('meldet einen unbekannten Energieeinsatz', () => {
    const [warning] = find(
      withCircuit(BENCHMARK, { calorific: null }),
      'heating.consumption_benchmark_not_comparable',
    )
    expect(warning!.detail).toContain('Energieeinsatz')
  })

  it('weist auf Vergleichswerte aus einem anderen Jahr hin', () => {
    const [info] = find(
      withCircuit({ ...BENCHMARK, referenceYear: 2023 }),
      'heating.consumption_benchmark_year_mismatch',
    )
    expect(info).toMatchObject({
      severity: 'info',
      entity: { type: 'HeatingCircuit', id: 'circuit-1' },
    })
    expect(info!.detail).toContain('2023')
  })

  it('prüft nichts ohne erfasste Vergleichswerte', () => {
    const data = withCircuit(null, { calorific: null })
    expect(find(data, 'heating.consumption_benchmark_not_comparable')).toEqual(
      [],
    )
    expect(find(data, 'heating.consumption_benchmark_year_mismatch')).toEqual(
      [],
    )
  })
})
