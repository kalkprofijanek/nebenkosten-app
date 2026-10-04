import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  estimateConsumptionUnits,
  explainConsumptionEstimate,
} from './estimate-consumption'

function fixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  const unit = (id: string, area: number, buildingId = 'b1') => ({
    id,
    propertyId: 'p',
    buildingId,
    label: id,
    heatedAreaSqm: { value: area, unit: 'm2' as const },
  })
  const occ = (
    id: string,
    unitId: string,
    value: number | undefined,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    billingPeriodId: 'y',
    unitId,
    kind: 'tenant' as const,
    ...(value === undefined
      ? {}
      : { consumptionUnits: { value, unit: 'einheiten' as const } }),
    ...extra,
  })
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      buildings: [
        { id: 'b1', propertyId: 'p', name: 'Haus A', mandateRefPrefixes: [] },
        { id: 'b2', propertyId: 'p', name: 'Haus B', mandateRefPrefixes: [] },
      ],
      units: [
        unit('u1', 50),
        unit('u2', 100),
        unit('u3', 50),
        unit('u4', 80),
        unit('u5', 60, 'b2'),
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
      ],
      occupancyPeriods: [
        occ('o1', 'u1', 500),
        occ('o2', 'u2', 1000),
        occ('target', 'u3', 0),
        occ('estimated', 'u4', 9999, { consumptionUnitsEstimated: true }),
        occ('other-building', 'u5', 9999),
        occ('vacancy', 'u4', 9999, { kind: 'vacancy' }),
      ],
    },
  }
}

describe('estimateConsumptionUnits', () => {
  it('schätzt nach mittlerem Verbrauch je m² des Heizkreises', () => {
    const estimate = estimateConsumptionUnits(fixture(), 'target')
    // 1.500 Einheiten auf 150 m² ganzjährig → 10 je m² → 50 m² = 500
    expect(estimate?.value).toBe(500)
    expect(estimate?.comparableCount).toBe(2)
    expect(estimate?.reason).toContain('§ 9a HeizKV')
    expect(estimate?.reason).toContain('Haus A')
  })

  it('berücksichtigt Teilzeiträume', () => {
    const data = fixture()
    data.billingData.occupancyPeriods = data.billingData.occupancyPeriods.map(
      (item) =>
        item.id === 'target'
          ? { ...item, from: '2025-07-01', to: '2025-12-31' }
          : item,
    )
    expect(estimateConsumptionUnits(data, 'target')?.value).toBeCloseTo(
      (1500 / (150 * 365)) * 50 * 184,
      1,
    )
  })

  it('liefert nichts ohne Fläche oder vergleichbare Messwerte', () => {
    const data = fixture()
    expect(estimateConsumptionUnits(data, 'fehlt')).toBeNull()
    data.masterData.units = data.masterData.units.map((unit) =>
      unit.id === 'u3' ? { ...unit, heatedAreaSqm: null } : unit,
    )
    expect(estimateConsumptionUnits(data, 'target')).toBeNull()
    const lonely = fixture()
    lonely.billingData.occupancyPeriods =
      lonely.billingData.occupancyPeriods.filter(
        ({ id }) => id !== 'o1' && id !== 'o2',
      )
    expect(estimateConsumptionUnits(lonely, 'target')).toBeNull()
  })

  it('nennt den Grund, wenn keine Schätzung möglich ist', () => {
    const problem = (data: AppDataFile, id = 'target') => {
      const result = explainConsumptionEstimate(data, id)
      return result.ok ? null : result.problem
    }
    expect(problem(fixture(), 'fehlt')).toBe('Nutzerzeitraum nicht gefunden.')
    const noBuilding = fixture()
    noBuilding.masterData.units = noBuilding.masterData.units.map((unit) =>
      unit.id === 'u3' ? { ...unit, buildingId: null } : unit,
    )
    expect(problem(noBuilding)).toContain('keinem Gebäude')
    const noArea = fixture()
    noArea.masterData.units = noArea.masterData.units.map((unit) =>
      unit.id === 'u3' ? { ...unit, heatedAreaSqm: null } : unit,
    )
    expect(problem(noArea)).toContain('beheizte Fläche')
    const lonely = fixture()
    lonely.billingData.occupancyPeriods =
      lonely.billingData.occupancyPeriods.filter(
        ({ id }) => id !== 'o1' && id !== 'o2',
      )
    expect(problem(lonely)).toContain('Keine gemessenen Vergleichsnutzungen')
    const outside = fixture()
    outside.billingData.occupancyPeriods =
      outside.billingData.occupancyPeriods.map((item) =>
        item.id === 'target'
          ? { ...item, from: '2026-01-01', to: '2026-02-01' }
          : item,
      )
    expect(problem(outside)).toContain('keine Tage')
    expect(explainConsumptionEstimate(fixture(), 'target')).toMatchObject({
      ok: true,
      estimate: { value: 500 },
    })
  })
})
