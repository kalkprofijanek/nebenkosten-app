import { describe, expect, it } from 'vitest'
import { consumptionFixture } from './consumption-fixture'
import {
  buildConsumptionOverview,
  isOpenOrDeviating,
  needsEstimate,
  section9aHint,
} from './overview'

describe('buildConsumptionOverview', () => {
  it('verwendet für Messmodus und Gebäude den Gebäudeoverride der Nutzung', () => {
    const data = consumptionFixture({
      o1: { costScope: { kind: 'building', buildingId: 'b2' } },
    })
    data.masterData.buildings.push({
      id: 'b2',
      propertyId: 'p',
      name: 'Haus B',
      mandateRefPrefixes: [],
    })
    data.billingData.heatingCircuits.push({
      id: 'override-circuit',
      billingPeriodId: 'y',
      buildingId: 'b2',
      consumptionMode: 'metered_kwh',
    } as never)
    const row = buildConsumptionOverview(data, 'y')!.rows.find(
      ({ occupancy }) => occupancy.id === 'o1',
    )!
    expect(row.buildingId).toBe('b2')
    expect(row.meteredCircuit).toBe(true)
    expect(needsEstimate(row)).toBe(false)
  })

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

  it('markiert Nutzerwechsel ohne Zwischenablesung nur mit Heizkreis', () => {
    const data = consumptionFixture({
      o1: { to: '2025-03-31' },
      o2: {
        to: '2025-06-30',
        heatMeterReading: { endValue: 5, endDate: '2025-06-30' },
      },
    })
    data.billingData.occupancyPeriods.push(
      {
        id: 'o4',
        billingPeriodId: 'y',
        unitId: 'u1',
        kind: 'vacancy',
        from: '2025-04-01',
      },
      {
        id: 'o5',
        billingPeriodId: 'y',
        unitId: 'u2',
        tenancyId: 't3',
        kind: 'tenant',
        from: '2025-07-01',
        consumptionUnits: { value: 9, unit: 'einheiten' },
      },
    )
    const unheated = buildConsumptionOverview(data, 'y')!
    expect(
      unheated.rows.every((row) => row.missingInterimReadings.length === 0),
    ).toBe(true)

    data.billingData.heatingCircuits.push({
      id: 'hc',
      billingPeriodId: 'y',
      heatingSystemId: 'hs',
      buildingId: 'b1',
      hasCentralHotWater: false,
    })
    const rows = buildConsumptionOverview(data, 'y')!.rows
    const byId = (id: string) =>
      rows.find(({ occupancy }) => occupancy.id === id)!
    // Wohnung 1: Mieter → Leerstand ohne Stand; Wohnung 2: Endstand erfasst.
    expect(byId('o1').missingInterimReadings).toEqual(['2025-04-01'])
    expect(byId('o2').missingInterimReadings).toEqual([])
    expect(byId('o5').missingInterimReadings).toEqual([])
    expect(isOpenOrDeviating(byId('o1'))).toBe(true)
    expect(isOpenOrDeviating(byId('o2'))).toBe(false)
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
