import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import type { Scenario } from '../../../tests/characterization/types'
import {
  calculateBilling,
  compareYears,
  createCalculationInput,
  yearOverYearReport,
} from '../src'

function scenario(id: string): Scenario {
  const found = scenarios.find((item) => item.id === id)
  if (!found) throw new Error(`Testszenario "${id}" fehlt`)
  return structuredClone(found)
}

/** Fiktives Folgejahr desselben Objekts (Zeitraum um ein Jahr verschoben). */
function nextYear(base: Scenario, patch: (next: Scenario) => void): Scenario {
  const next = JSON.parse(
    JSON.stringify(base).replaceAll(String(base.year), String(base.year + 1)),
  ) as Scenario
  patch(next)
  return next
}

function year(value: Scenario, climateFactor?: number) {
  const data = buildAppDataFile(value)
  if (climateFactor)
    data.billingData.billingPeriods[0]!.climateFactor = {
      postalCode: '00000',
      factor: climateFactor,
      periodStart: `${value.year}-01-01`,
      periodEnd: `${value.year}-12-31`,
      source: 'Fiktiv',
    }
  const input = createCalculationInput(data, 'bp-1')
  return { input, output: calculateBilling(input) }
}

describe('compareYears', () => {
  it('vergleicht Kostenarten und markiert Ausreißer über ± 25 %', () => {
    const base = scenario('case-01-full-year')
    const report = compareYears(
      year(base),
      year(
        nextYear(base, (next) => {
          next.costs[0]!.amountEur = 1_560
          next.costs.push({
            ...next.costs[0]!,
            id: 'k-neu',
            label: 'Gartenpflege',
            statementText: 'Gartenpflege',
            amountEur: 100,
          })
        }),
      ),
    )
    expect(report.previousYear).toBe(2024)
    expect(report.currentYear).toBe(2025)
    const waste = report.costs.find(
      ({ label }) => label === 'Muellbeseitigung',
    )!
    expect(waste).toMatchObject({
      presence: 'both',
      previousCents: 120_000,
      currentCents: 156_000,
      changeCents: 36_000,
      changeRatio: 0.3,
      outlier: true,
    })
    expect(
      report.costs.find(({ label }) => label === 'Gartenpflege'),
    ).toMatchObject({ presence: 'new', previousCents: null, outlier: true })
    expect(report.total.changeRatio).toBeCloseTo(0.3833, 4)
  })

  it('weist je Wohnung Nutzerwechsel und Leerstand aus', () => {
    const base = scenario('case-01-full-year')
    const report = compareYears(
      year(base),
      year(
        nextYear(base, (next) => {
          next.tenants[1]!.id = 't3'
          next.tenants[0]!.kind = 'vacancy'
        }),
      ),
    )
    const [first, second] = report.units
    // Auszug ohne Nachmieter gilt als Nutzerwechsel.
    expect(first).toMatchObject({ unitId: 'u1', tenantChanged: true })
    expect(first!.currentVacancyDays).toBe(365)
    expect(first!.previousVacancyDays).toBe(0)
    expect(second).toMatchObject({ unitId: 'u2', tenantChanged: true })
    // Gleiche Kosten, gleiche Flächen: Wohnung 2 trägt unverändert 40 %.
    expect(second!.changeCents).toBe(0)
    expect(second!.outlier).toBe(false)
  })

  it('rechnet Heizkreise mit Kosten je kWh und Witterungsbereinigung', () => {
    const base = scenario('case-10-central-hot-water')
    const report = compareYears(
      year(base, 1.3),
      year(
        nextYear(base, (next) => {
          next.circuits[0]!.sources[0]!.deliveries[0]!.amountEur = 6_000
        }),
        1.2,
      ),
    )
    const [circuit] = report.circuits
    expect(circuit).toMatchObject({
      buildingId: 'B1',
      previousEnergyKwh: 40_000,
      currentEnergyKwh: 40_000,
      previousAdjustedKwh: 52_000,
      currentAdjustedKwh: 48_000,
    })
    expect(circuit!.currentCentsPerKwh! / circuit!.previousCentsPerKwh!).toBe(
      1.5,
    )
    expect(circuit!.centsPerKwhOutlier).toBe(true)
    expect(circuit!.outlier).toBe(true)
    const fuel = report.costs.find(({ key }) => key === 'fuel:B1')!
    expect(fuel.changeRatio).toBe(0.5)
    expect(fuel.outlier).toBe(true)
  })
})

describe('yearOverYearReport', () => {
  it('meldet fehlendes Vorjahr', () => {
    const data = buildAppDataFile(scenario('case-01-full-year'))
    expect(
      yearOverYearReport(data, data.billingData.billingPeriods[0]!),
    ).toEqual({ status: 'no_previous_period' })
  })
})
