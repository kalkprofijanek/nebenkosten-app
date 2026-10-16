import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import {
  calculateBilling,
  createCalculationInput,
  section9aAreaSharePreview,
} from '../src'

// Fiktives Szenario: B1 mit zwei Wohnungen à 50 m², B2 mit einer Wohnung.
function appData(): AppDataFile {
  const scenario = scenarios.find(
    ({ id }) => id === 'case-05-multiple-circuits',
  )
  if (!scenario) throw new Error('Testszenario fehlt')
  return structuredClone(buildAppDataFile(scenario))
}

const input = (data: AppDataFile) => createCalculationInput(data, 'bp-1')

function occupancyOf(data: AppDataFile, unitId: string) {
  return data.billingData.occupancyPeriods.find(
    (occupancy) => occupancy.unitId === unitId,
  )!
}

function withArea(data: AppDataFile, unitId: string, sqm: number) {
  data.masterData.units = data.masterData.units.map((unit) =>
    unit.id === unitId
      ? {
          ...unit,
          heatedAreaSqm: { value: sqm, unit: 'm2' },
          usableAreaSqm: { value: sqm, unit: 'm2' },
        }
      : unit,
  )
  return data
}

const preview = (data: AppDataFile, overrides?: ReadonlyMap<string, boolean>) =>
  Object.fromEntries(
    section9aAreaSharePreview(input(data), overrides).map((item) => [
      item.buildingId,
      item,
    ]),
  )

describe('§ 9a Abs. 2 HeizKV: Vorschau der geschätzten Fläche', () => {
  it('zeigt ohne Schätzung 0 % und keine reine Flächenverteilung', () => {
    const result = preview(appData())
    expect(result.B1).toMatchObject({
      estimatedAreaSharePercent: 0,
      limitPercent: 25,
      areaOnly: false,
    })
  })

  it('zeigt die Wirkung einer geplanten Schätzung, ohne die Daten zu ändern', () => {
    const data = appData()
    const occupancy = occupancyOf(data, 'u1')
    const result = preview(data, new Map([[occupancy.id, true]]))
    expect(result.B1).toMatchObject({
      estimatedAreaSharePercent: 50,
      areaOnly: true,
    })
    expect(result.B2).toMatchObject({
      estimatedAreaSharePercent: 0,
      areaOnly: false,
    })
    expect(occupancy.consumptionUnitsEstimated).toBeFalsy()
  })

  it('bleibt bei genau 25 % bei der Verbrauchsverteilung', () => {
    const data = withArea(withArea(appData(), 'u1', 25), 'u2', 75)
    const result = preview(data, new Map([[occupancyOf(data, 'u1').id, true]]))
    expect(result.B1).toMatchObject({
      estimatedAreaSharePercent: 25,
      areaOnly: false,
    })
  })

  it('kann eine bestehende Schätzung probeweise aufheben', () => {
    const data = appData()
    const occupancy = occupancyOf(data, 'u1')
    occupancy.consumptionUnitsEstimated = true
    expect(preview(data).B1!.areaOnly).toBe(true)
    const result = preview(data, new Map([[occupancy.id, false]]))
    expect(result.B1).toMatchObject({
      estimatedAreaSharePercent: 0,
      areaOnly: false,
    })
  })

  it('stimmt mit dem Ergebnis der Abrechnung überein', () => {
    const data = withArea(appData(), 'u1', 10)
    occupancyOf(data, 'u1').consumptionUnitsEstimated = true
    const billing = calculateBilling(input(data))
    const b1 = billing.heating.trace.circuits.find(
      ({ buildingId }) => buildingId === 'B1',
    )!
    expect(preview(data).B1!.estimatedAreaSharePercent).toBeCloseTo(
      b1.split.estimatedAreaSharePercent ?? -1,
      3,
    )
    expect(preview(data).B1!.areaOnly).toBe(b1.split.areaOnlySection9a)
  })
})
