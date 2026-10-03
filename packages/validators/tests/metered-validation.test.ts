import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

/** Fiktiver Heizkreis mit Wohnungswärmezähler im aktivierten Messmodus. */
function meteredData(): AppDataFile {
  const data = validData()
  data.masterData.units[0] = { ...data.masterData.units[0]!, label: 'WE 01' }
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: 'property-1',
  })
  data.masterData.meters.push({
    id: 'meter-1',
    propertyId: 'property-1',
    kind: 'unit_heat',
    meterNumber: 'TEST-WMZ-1',
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
    consumptionMode: 'metered_kwh',
    meterAssignments: [{ meterId: 'meter-1', unitId: 'unit-1' }],
  })
  data.billingData.meterReadings.push(
    {
      id: 'reading-start',
      meterId: 'meter-1',
      billingPeriodId: 'period-1',
      date: '2025-01-01',
      boundary: 'start_of_day',
      source: 'manual',
      value: { value: 1_000, unit: 'kWh' },
    },
    {
      id: 'reading-end',
      meterId: 'meter-1',
      billingPeriodId: 'period-1',
      date: '2025-12-31',
      boundary: 'end_of_day',
      source: 'manual',
      value: { value: 2_000, unit: 'kWh' },
    },
  )
  return data
}

const meteredIssues = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1').issues.filter(({ code }) =>
    code.startsWith('metered.'),
  )

describe('Prüfung der Wohnungswärme-Ablesungen', () => {
  it('meldet bei vollständigen Grenzablesungen keine Messprobleme', () => {
    expect(meteredIssues(meteredData())).toEqual([])
  })

  it('ordnet Ablesefehler dem Zählerbereich und dem betroffenen Zähler zu', () => {
    const data = meteredData()
    data.billingData.meterReadings = data.billingData.meterReadings.filter(
      ({ id }) => id !== 'reading-start',
    )
    const [problem, ...rest] = meteredIssues(data)
    expect(rest).toEqual([])
    expect(problem).toMatchObject({
      severity: 'error',
      code: 'metered.boundary_missing',
      area: 'meters',
      title: 'Wohnungswärme-Ablesung fehlt oder ist ungültig',
      entity: { type: 'Meter', id: 'meter-1' },
    })
    expect(problem?.detail).toContain('Zähler TEST-WMZ-1')
    expect(problem?.detail).toContain('WE 01')
  })

  it('ordnet Lücken im Jahr dem Nutzerzeitraum zu', () => {
    const data = meteredData()
    data.billingData.occupancyPeriods[0] = {
      ...data.billingData.occupancyPeriods[0]!,
      from: '2025-03-01',
    }
    const gap = meteredIssues(data).find(
      ({ code }) => code === 'metered.occupancy_gap',
    )
    expect(gap).toMatchObject({
      severity: 'error',
      area: 'occupancy',
      title: 'Nutzerzeiträume für Wohnungswärme sind unvollständig',
      entity: { type: 'OccupancyPeriod', id: 'occupancy-1' },
    })
    expect(gap?.detail).toContain('WE 01')
  })

  it('verweist eine Wohnung ohne Nutzerzeitraum auf die Wohnung', () => {
    const data = meteredData()
    data.billingData.occupancyPeriods = []
    data.billingData.prepayments = []
    expect(meteredIssues(data)).toContainEqual(
      expect.objectContaining({
        code: 'metered.occupancy_missing',
        area: 'occupancy',
        entity: { type: 'Unit', id: 'unit-1' },
      }),
    )
  })

  it('verweist eine fehlende Zuordnung auf den Heizkreis', () => {
    const data = meteredData()
    data.billingData.heatingCircuits[0] = {
      ...data.billingData.heatingCircuits[0]!,
      meterAssignments: [],
    }
    expect(meteredIssues(data)).toContainEqual(
      expect.objectContaining({
        code: 'metered.assignment_missing',
        area: 'meters',
        entity: { type: 'HeatingCircuit', id: 'circuit-1' },
      }),
    )
  })

  it('meldet Probleme nur beim betroffenen Heizkreis', () => {
    const data = meteredData()
    data.masterData.buildings.push({
      id: 'building-2',
      propertyId: 'property-1',
      name: 'Haus B',
      mandateRefPrefixes: ['B'],
    })
    data.billingData.heatingCircuits.push({
      id: 'circuit-2',
      billingPeriodId: 'period-1',
      heatingSystemId: 'system-1',
      buildingId: 'building-2',
      hasCentralHotWater: false,
    })
    data.billingData.meterReadings.pop()
    const issues = meteredIssues(data)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every(({ entity }) => entity?.id !== 'circuit-2')).toBe(true)
  })
})
