import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import { calculateBilling, createCalculationInput } from '../src'

function appDataFor(caseId: string): AppDataFile {
  const scenario = scenarios.find(({ id }) => id === caseId)
  if (!scenario) throw new Error(`Testszenario "${caseId}" fehlt`)
  return structuredClone(buildAppDataFile(scenario))
}

function calculate(appData: AppDataFile) {
  return calculateBilling(createCalculationInput(appData, 'bp-1'))
}

describe('Umlage-Nachweis je Kostenart (operatingPositions)', () => {
  it('legt brutto, umlagefähig, Nenner und Schlüssel offen', () => {
    const result = calculate(appDataFor('case-01-full-year'))
    const [position] = result.operatingPositions!

    expect(position).toMatchObject({
      costCategoryId: expect.any(String),
      allocationKey: 'usable_area',
      grossCents: 120_000,
      nonAllocableCents: 0,
      allocableCents: 120_000,
      operatingElectricityDeductedCents: 0,
      distributedCents: 120_000,
      distribution: 'key',
      denominatorUnit: 'm²',
      vacancyCents: 0,
    })
    expect(position!.denominator).toBeGreaterThan(0)
    expect(position!.scope).toEqual({ kind: 'property' })
  })

  it('weist den Leerstandsanteil je Kostenart dem Vermieter zu', () => {
    const result = calculate(appDataFor('case-03-vacancy'))
    const [position] = result.operatingPositions!
    const tenantShares = result.tenants
      .filter(({ isVacancy }) => !isVacancy)
      .flatMap(({ costBreakdown }) => costBreakdown.operatingByCategory)
      .reduce((sum, item) => sum + item.amountCents, 0)

    expect(position!.vacancyCents).toBeGreaterThan(0)
    expect(position!.vacancyCents + tenantShares).toBe(
      position!.distributedCents,
    )
  })

  it('kennzeichnet direkte, Heiz- und nicht umlagefähige Kostenarten', () => {
    const direct = calculate(appDataFor('case-13-direct-costs'))
    expect(
      direct.operatingPositions!.find(
        ({ allocationKey }) => allocationKey === 'direct',
      ),
    ).toMatchObject({ distribution: 'direct', denominator: null })

    const heating = calculate(appDataFor('case-05-multiple-circuits'))
    expect(heating.operatingPositions![0]).toMatchObject({
      distribution: 'heating_pool',
      denominator: null,
      vacancyCents: 0,
    })

    const appData = appDataFor('case-01-full-year')
    appData.billingData.costCategories[0]!.betrkvCategory = 'NICHT_UML'
    expect(calculate(appData).operatingPositions![0]).toMatchObject({
      distribution: 'not_allocable',
      nonAllocableCents: 120_000,
      allocableCents: 0,
    })
  })

  it('zeigt den nicht umlagefähigen Anteil bei Umlagegrad unter 100 %', () => {
    const appData = appDataFor('case-01-full-year')
    appData.billingData.costCategories[0]!.allocablePercent = 75
    const [position] = calculate(appData).operatingPositions!
    expect(position).toMatchObject({
      grossCents: 120_000,
      nonAllocableCents: 30_000,
      allocableCents: 90_000,
    })
  })

  it('nennt Nenner und Einheit für Einheiten- und Wohneinheitenschlüssel', () => {
    const appData = appDataFor('case-04-multiple-buildings')
    const result = calculate(appData)
    const elevator = result.operatingPositions!.find(
      ({ allocationKey }) => allocationKey === 'residential_units',
    )
    expect(elevator).toMatchObject({ denominatorUnit: 'WE', denominator: 3 })

    appData.billingData.costCategories[0]!.allocationKey = 'consumption_units'
    expect(calculate(appData).operatingPositions![0]).toMatchObject({
      denominatorUnit: 'Einheiten',
    })
    appData.billingData.costCategories[0]!.allocationKey = 'heated_area'
    expect(calculate(appData).operatingPositions![0]).toMatchObject({
      denominatorUnit: 'm²',
    })
    appData.billingData.costCategories[0]!.allocationKey = null
    expect(calculate(appData).operatingPositions![0]).toMatchObject({
      denominator: null,
      denominatorUnit: null,
    })
  })

  it('weist Nutzungstage, Zeitfaktor und eigene Bezugsgrößen je Mieter aus', () => {
    const result = calculate(appDataFor('case-02-tenant-change'))
    const [first, second] = result.tenants

    expect(first!.days! + second!.days!).toBe(result.periodDays)
    expect(first!.timeFactor).toBeCloseTo(first!.days! / result.periodDays, 6)
    expect(first!.ownBasis).toMatchObject({
      consumptionUnit: 'Einheiten',
    })
    expect(first!.ownBasis!.usableAreaSqm).toBeGreaterThan(0)
  })
})

describe('CO2-Mieteranteil nach Heizkreis-Schlüssel', () => {
  it('verteilt den CO2-Mieteranteil wie die Heizkosten (30 % Fläche / 70 % Verbrauch)', () => {
    const appData = appDataFor('case-12-co2-split')
    appData.billingData.occupancyPeriods =
      appData.billingData.occupancyPeriods.map((occupancy, index) => ({
        ...occupancy,
        consumptionUnits: {
          value: index === 0 ? 80 : 20,
          unit: 'einheiten' as const,
        },
      }))
    const result = calculate(appData)
    const co2Tenant = result.heating.trace.circuits[0]!.co2.tenantCents
    const [first, second] = result.tenants

    // gleiche Flächen (je 50 %), Verbrauch 80/20
    const expectedFirst = co2Tenant * (0.3 * 0.5 + 0.7 * 0.8)
    const expectedSecond = co2Tenant * (0.3 * 0.5 + 0.7 * 0.2)
    expect(
      Math.abs(first!.costBreakdown.heatingCo2Cents - expectedFirst),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(second!.costBreakdown.heatingCo2Cents - expectedSecond),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        first!.costBreakdown.heatingCo2Cents +
          second!.costBreakdown.heatingCo2Cents -
          co2Tenant,
      ),
    ).toBeLessThanOrEqual(1)
  })
})
