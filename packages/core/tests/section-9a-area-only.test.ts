import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import { calculateBilling, createCalculationInput } from '../src'

// Fiktives Szenario: B1 mit zwei Wohnungen à 50 m² (30 und 70 Einheiten),
// B2 mit einer Wohnung (100 m²).
function appData(): AppDataFile {
  const scenario = scenarios.find(
    ({ id }) => id === 'case-05-multiple-circuits',
  )
  if (!scenario) throw new Error('Testszenario fehlt')
  return structuredClone(buildAppDataFile(scenario))
}

function estimate(
  data: AppDataFile,
  unitId: string,
  patch: Record<string, unknown> = {},
) {
  data.billingData.occupancyPeriods = data.billingData.occupancyPeriods.map(
    (occupancy) =>
      occupancy.unitId === unitId
        ? { ...occupancy, consumptionUnitsEstimated: true, ...patch }
        : occupancy,
  )
  return data
}

function calculate(data: AppDataFile) {
  return calculateBilling(createCalculationInput(data, 'bp-1'))
}

function circuit(result: ReturnType<typeof calculate>, buildingId: string) {
  return result.heating.trace.circuits.find(
    (item) => item.buildingId === buildingId,
  )!
}

describe('§ 9a Abs. 2 HeizKV: Flächenverteilung bei über 25 % Schätzung', () => {
  it('verteilt einen Heizkreis mit 50 % geschätzter Fläche nur nach Fläche', () => {
    const before = calculate(appData())
    const result = calculate(estimate(appData(), 'u1'))
    const b1 = circuit(result, 'B1')
    expect(b1.split).toMatchObject({
      baseSharePercent: 100,
      consumptionSharePercent: 0,
      consumptionCents: 0,
      estimatedAreaSharePercent: 50,
      areaOnlySection9a: true,
    })
    expect(b1.split.baseCents).toBe(
      circuit(before, 'B1').split.baseCents +
        circuit(before, 'B1').split.consumptionCents,
    )
    // Gleiche Fläche → gleicher Heizkostenanteil trotz 30 / 70 Einheiten.
    const occupancies = appData().billingData.occupancyPeriods
    const [first, second] = ['u1', 'u2'].map((unitId) =>
      result.tenants.find(
        ({ id }) =>
          occupancies.find((occupancy) => occupancy.id === id)?.unitId ===
          unitId,
      )!,
    )
    expect(first!.costBreakdown.heatingConsumptionCents).toBe(0)
    expect(
      Math.abs(
        first!.costBreakdown.heatingBaseCents -
          second!.costBreakdown.heatingBaseCents,
      ),
    ).toBeLessThanOrEqual(1)
    // Andere Heizkreise bleiben unberührt.
    expect(circuit(result, 'B2').split).toMatchObject({
      areaOnlySection9a: false,
      estimatedAreaSharePercent: 0,
    })
    expect(circuit(result, 'B2').split.consumptionCents).toBe(
      circuit(before, 'B2').split.consumptionCents,
    )
    // Gesamtsumme der Mieteranteile bleibt gleich.
    const total = (r: typeof result) =>
      r.tenants.reduce((sum, tenant) => sum + tenant.shareCents, 0)
    expect(Math.abs(total(result) - total(before))).toBeLessThanOrEqual(1)
  })

  it('bleibt bei höchstens 25 % geschätzter Fläche bei der Verbrauchsverteilung', () => {
    const data = estimate(appData(), 'u1')
    data.masterData.units = data.masterData.units.map((unit) =>
      unit.id === 'u1'
        ? {
            ...unit,
            heatedAreaSqm: { value: 10, unit: 'm2' },
            usableAreaSqm: { value: 10, unit: 'm2' },
          }
        : unit,
    )
    const b1 = circuit(calculate(data), 'B1')
    expect(b1.split.areaOnlySection9a).toBe(false)
    expect(b1.split.estimatedAreaSharePercent).toBeCloseTo(16.667, 2)
    expect(b1.split.consumptionSharePercent).toBeGreaterThan(0)
  })

  it('wendet bei reiner Flächenverteilung keine Kürzung nach § 12 an', () => {
    const plain = calculate(estimate(appData(), 'u1'))
    const reduced = calculate(
      estimate(appData(), 'u1', { applySection12Reduction: true }),
    )
    expect(reduced.tenants.map(({ shareCents }) => shareCents)).toEqual(
      plain.tenants.map(({ shareCents }) => shareCents),
    )
  })
})
