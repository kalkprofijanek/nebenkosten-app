import { describe, expect, it } from 'vitest'
import { consumptionFixture } from './consumption-fixture'
import {
  buildConsumptionOverview,
  needsEstimate,
  section9aHint,
} from './overview'

describe('buildConsumptionOverview', () => {
  it('ordnet Status, Zählerdifferenz und Schätzung je Mieter zu', () => {
    const overview = buildConsumptionOverview(
      consumptionFixture({
        o1: { heatMeterReading: { startValue: 100, endValue: 500 } },
        o2: { heatMeterReading: { startValue: 0, endValue: 10 } },
      }),
      'y',
    )!
    expect(overview.rows.map((row) => [row.unitLabel, row.status])).toEqual([
      ['Wohnung 1', 'measured'],
      ['Wohnung 2', 'measured'],
      ['Wohnung 3', 'missing'],
    ])
    const [first, second, third] = overview.rows
    expect(first!.readingDifference).toBe(400)
    expect(first!.readingMismatch).toBe(false)
    expect(second!.readingMismatch).toBe(true)
    expect(first!.tenantName).toBe('Fiktiv 1')
    expect(first!.days).toBe(365)
    // (400 + 600) / (100 m² × 365 Tage) × 50 m² × 365 Tage = 500
    expect(third!.estimate).toMatchObject({
      ok: true,
      estimate: { value: 500 },
    })
    expect(overview.openCount).toBe(1)
    expect(needsEstimate(third!)).toBe(true)
    expect(buildConsumptionOverview(consumptionFixture(), 'fehlt')).toBeNull()
  })

  it('erkennt 0, Schätzungen, kWh-Messmodus und hohe Schätzanteile', () => {
    const data = consumptionFixture({
      o2: {
        consumptionUnits: { value: 300, unit: 'einheiten' },
        consumptionUnitsEstimated: true,
        consumptionUnitsEstimateReason: 'Fiktiv',
        heatMeterReading: { startValue: 5, endValue: 5 },
      },
      o3: { consumptionUnits: { value: 0, unit: 'einheiten' } },
    })
    const overview = buildConsumptionOverview(data, 'y')!
    expect(overview.rows.map(({ status }) => status)).toEqual([
      'measured',
      'estimated',
      'zero',
    ])
    // Wie die Freigabeprüfung: eine begründete Schätzung ersetzt 5 → 5.
    expect(overview.rows[1]!.readingMismatch).toBe(false)
    expect(overview.estimatedShares).toEqual([
      { buildingId: 'b1', buildingName: 'Haus A', estimatedShare: 1 / 3 },
    ])

    const metered = buildConsumptionOverview(
      {
        ...data,
        billingData: {
          ...data.billingData,
          heatingCircuits: [
            {
              id: 'hc',
              billingPeriodId: 'y',
              buildingId: 'b1',
              consumptionMode: 'metered_kwh',
            } as never,
          ],
        },
      },
      'y',
    )!
    expect(metered.rows.every(({ meteredCircuit }) => meteredCircuit)).toBe(
      true,
    )
    expect(metered.openCount).toBe(0)
    expect(metered.estimatedShares).toEqual([])
  })

  it('meldet das Überschreiten der 25-%-Grenze nur beim Übergang', () => {
    const overview = buildConsumptionOverview(consumptionFixture(), 'y')!
    expect(section9aHint(overview.rows, new Set())).toBeNull()
    expect(section9aHint(overview.rows, new Set(['o3']))).toContain(
      'in Haus A 33 % der Fläche geschätzt',
    )
    const already = buildConsumptionOverview(
      consumptionFixture({
        o2: {
          consumptionUnitsEstimated: true,
          consumptionUnitsEstimateReason: 'Fiktiv',
        },
      }),
      'y',
    )!
    expect(section9aHint(already.rows, new Set(['o3']))).toBeNull()
  })
})
