import type { AppDataFile, HeatingCircuit } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import { calculateBilling, createCalculationInput } from '../src'
import {
  CONDENSING_NATURAL_GAS_FACTOR,
  circuitEnergyInputKwh,
  hotWaterEnergyShare,
  hotWaterEnergyTrace,
  hotWaterHeatKwh,
} from '../src/heating/hot-water'
import type { EnergySourceCalculationTrace } from '../src'

function appDataFor(caseId = 'case-10-central-hot-water'): AppDataFile {
  const scenario = scenarios.find(({ id }) => id === caseId)
  if (!scenario) throw new Error(`Testszenario "${caseId}" fehlt`)
  return structuredClone(buildAppDataFile(scenario))
}

function calculate(appData: AppDataFile) {
  return calculateBilling(createCalculationInput(appData, 'bp-1'))
}

function circuitOf(appData: AppDataFile): HeatingCircuit {
  return appData.billingData.heatingCircuits[0]!
}

/**
 * Musterfall: 4.000 l Heizöl × 10 kWh/l = 40.000 kWh, 4.000 € Brennstoff,
 * CO2-Preis 45 €/t, Wartung 300 €, Allgemeinstrom 500 € mit 5 %
 * Betriebsstromanteil, zwei Wohnungen zu je 50 m².
 */
function sectionNineAppData(
  patch: Partial<HeatingCircuit> = {},
  options: { vacancy?: boolean } = {},
): AppDataFile {
  const appData = appDataFor()
  const period = appData.billingData.billingPeriods[0]!
  period.heatingDefaults = {
    ...period.heatingDefaults,
    operatingElectricitySharePercent: 5,
  }
  Object.assign(circuitOf(appData), {
    co2: { mode: 'auto', co2PricePerTonCents: 4_500 },
    ...patch,
  })
  appData.billingData.costCategories.push(
    {
      id: 'k-wartung',
      billingPeriodId: 'bp-1',
      kind: 'heating',
      label: 'Wartung Heizung',
      allocationKey: 'heated_area',
      scope: { kind: 'building', buildingId: 'B1' },
      totalAmountCents: 30_000,
      laborSharePercent: 100,
    },
    {
      id: 'k-strom',
      billingPeriodId: 'bp-1',
      kind: 'operating',
      label: 'Allgemeinstrom',
      allocationKey: 'usable_area',
      scope: { kind: 'property' },
      totalAmountCents: 50_000,
      isOperatingElectricitySource: true,
    },
  )
  if (options.vacancy) {
    const second = appData.billingData.occupancyPeriods[1]!
    Object.assign(second, { kind: 'vacancy', tenancyId: null, persons: null })
    appData.billingData.prepayments = appData.billingData.prepayments.filter(
      ({ occupancyPeriodId }) => occupancyPeriodId !== second.id,
    )
  }
  return appData
}

function sourceTrace(
  patch: Partial<EnergySourceCalculationTrace>,
): EnergySourceCalculationTrace {
  return {
    energySourceId: 's',
    quantityUnit: 'l',
    method: 'fifo',
    lots: [],
    availableQuantity: 0,
    availableValueCents: 0,
    requestedRemainingQuantity: 0,
    valuedRemainingQuantity: 0,
    remainingValueCents: 0,
    consumedQuantity: 0,
    fifoConsumptionCostCents: 0,
    overstockQuantity: 0,
    calorificValueKwhPerUnit: 0,
    energyKwh: 0,
    co2FactorKgPerKwh: 0,
    co2Kg: 0,
    ...patch,
  }
}

describe('Wärmemenge nach § 9 Abs. 2 HeizKV', () => {
  it('übernimmt die gemessene Wärmemenge', () => {
    expect(
      hotWaterHeatKwh({ method: 'heat_meter', heatKwh: 8_000 }, 0).heatKwh,
    ).toBe(8_000)
  })

  it('rechnet die Volumenformel 2,5 × V × (tw − 10)', () => {
    const heat = hotWaterHeatKwh(
      { method: 'volume_formula', volumeM3: 100, temperatureC: 60 },
      0,
    )
    expect(heat.heatKwh).toBe(12_500)
  })

  it('rechnet die Flächenformel 32 × A mit eingegebener oder Ersatzfläche', () => {
    expect(
      hotWaterHeatKwh(
        { method: 'area_formula', areaSqm: 100, reason: 'kein Zähler' },
        999,
      ),
    ).toMatchObject({ heatKwh: 3_200, areaSqm: 100, areaSource: 'input' })
    expect(
      hotWaterHeatKwh({ method: 'area_formula', reason: 'kein Zähler' }, 150),
    ).toMatchObject({
      heatKwh: 4_800,
      areaSqm: 150,
      areaSource: 'circuit_usable_area',
    })
  })

  it('multipliziert bei brennwertbezogener Erdgasabrechnung mit 1,11', () => {
    const heat = hotWaterHeatKwh(
      { method: 'heat_meter', heatKwh: 1_000, condensingNaturalGas: true },
      0,
    )
    expect(CONDENSING_NATURAL_GAS_FACTOR).toBe(1.11)
    expect(heat.heatKwhBeforeCondensing).toBe(1_000)
    expect(heat.heatKwh).toBeCloseTo(1_110, 9)
  })

  it('begrenzt den Anteil s auf höchstens 1 und meldet fehlenden Energieeinsatz', () => {
    expect(hotWaterEnergyShare(2_000, 10_000)).toEqual({
      share: 0.2,
      capped: false,
    })
    expect(hotWaterEnergyShare(20_000, 10_000)).toEqual({
      share: 1,
      capped: true,
    })
    expect(hotWaterEnergyShare(1, 0)).toBeNull()
    const trace = hotWaterEnergyTrace(
      { method: 'heat_meter', heatKwh: 1 },
      0,
      0,
    )
    expect(trace).toMatchObject({ energyInputMissing: true, shareExact: 0 })
  })

  it('zählt Energiequellen in kWh ohne Heizwert mit ihrer Menge', () => {
    expect(
      circuitEnergyInputKwh(1_000, [
        sourceTrace({ energyKwh: 1_000, consumedQuantity: 100 }),
        sourceTrace({ quantityUnit: 'kWh', consumedQuantity: 500 }),
      ]),
    ).toBe(1_500)
  })
})

describe('§ 9 Abs. 1 HeizKV: Anteil s auf alle Kosten des Betriebs', () => {
  it('ohne neue Felder unverändert das Pauschalverfahren', () => {
    const result = calculate(sectionNineAppData())
    const trace = result.heating.trace.circuits[0]!
    expect(trace.warmWater.method).toBe('fuel_percentage_by_persons')
    expect(trace.warmWater.sharePercent).toBe(30)
    expect(trace.warmWater.costSplit).toBeUndefined()
    expect(trace.warmWater.energy).toBeUndefined()
    expect(trace.warmWater.poolCents).toBe(
      Math.round(trace.reconciliation.fuelAfterCo2Cents * 0.3),
    )
    expect(trace.operatingElectricitySharePercent).toBe(5)
    expect(result.tenants.every((tenant) => !tenant.hotWaterBasis)).toBe(true)
  })

  it('teilt Brennstoff, Betriebsstrom, Wartung und CO2 mit s', () => {
    const result = calculate(
      sectionNineAppData({
        hotWaterEnergy: { method: 'heat_meter', heatKwh: 8_000 },
      }),
    )
    const trace = result.heating.trace.circuits[0]!
    const { warmWater, reconciliation } = trace
    expect(warmWater.method).toBe('section9_energy')
    expect(warmWater.energy).toMatchObject({
      heatKwh: 8_000,
      energyInputKwh: 40_000,
      shareExact: 0.2,
      capped: false,
    })
    expect(warmWater.sharePercent).toBe(20)
    const split = warmWater.costSplit!
    expect(split.heatingOperatingCents).toBe(6_000)
    expect(split.operatingElectricityCents).toBe(
      Math.round(trace.operatingElectricity.movedCents * 0.2),
    )
    expect(split.fuelCents).toBe(
      Math.round(reconciliation.fuelAfterCo2Cents * 0.2),
    )
    expect(
      split.fuelCents +
        split.operatingElectricityCents +
        split.heatingOperatingCents,
    ).toBe(warmWater.poolCents)
    expect(split.co2TenantCents).toBe(Math.round(trace.co2.tenantCents * 0.2))
    // Heizkosten + Warmwasser = alle Kosten des Betriebs (auf den Cent).
    const allCosts =
      reconciliation.fuelAfterCo2Cents +
      reconciliation.plusOperatingElectricityCents +
      reconciliation.plusHeatingOperatingCostsCents
    expect(
      Math.abs(
        reconciliation.heatingPoolCents + warmWater.poolCents - allCosts,
      ),
    ).toBeLessThanOrEqual(1)
    expect(result.totals.controlDifferenceCents).toBe(0)
    // Personenschlüssel (Standard): CO2-Warmwasseranteil nach Personen.
    const tenants = result.tenants
    const co2Hot = tenants.reduce(
      (sum, tenant) => sum + (tenant.costBreakdown.hotWaterCo2Cents ?? 0),
      0,
    )
    expect(Math.abs(co2Hot - split.co2TenantCents)).toBeLessThanOrEqual(1)
    expect(tenants[0]!.hotWaterBasis).toMatchObject({
      key: 'persons',
      personTime: 2,
    })
    const distribution = warmWater.distribution!
    expect(
      distribution.tenantsCents +
        distribution.vacancyCents +
        distribution.section12ReductionCents +
        distribution.roundingDifferenceCents,
    ).toBe(warmWater.poolCents)
  })

  it('verteilt den CO2-Mieteranteil ohne Verlust auf Heizung und Warmwasser', () => {
    const result = calculate(
      sectionNineAppData({
        hotWaterEnergy: { method: 'heat_meter', heatKwh: 8_000 },
      }),
    )
    const co2Total = result.tenants.reduce(
      (sum, tenant) => sum + tenant.costBreakdown.heatingCo2Cents,
      0,
    )
    expect(Math.abs(co2Total - result.co2.tenantCents)).toBeLessThanOrEqual(1)
  })

  it('rechnet die Lohnkosten nach § 35a auch für den Warmwasseranteil', () => {
    const result = calculate(
      sectionNineAppData({
        hotWaterEnergy: { method: 'heat_meter', heatKwh: 8_000 },
      }),
    )
    const labor = result.tenants.reduce(
      (sum, tenant) =>
        sum +
        (tenant.section35a?.items.find(
          ({ costCategoryId }) => costCategoryId === 'k-wartung',
        )?.laborCents ?? 0),
      0,
    )
    expect(Math.abs(labor - 30_000)).toBeLessThanOrEqual(1)
  })

  it('fällt ohne Energieeinsatz auf den Pauschalanteil zurück', () => {
    const appData = sectionNineAppData({
      hotWaterEnergy: { method: 'heat_meter', heatKwh: 8_000 },
    })
    appData.billingData.energySources[0]!.calorificValueKwhPerUnit = 0
    const trace = calculate(appData).heating.trace.circuits[0]!
    expect(trace.warmWater.method).toBe('fuel_percentage_by_persons')
    expect(trace.warmWater.energy?.energyInputMissing).toBe(true)
    expect(trace.warmWater.sharePercent).toBe(30)
  })
})

describe('§ 8 Abs. 1 HeizKV: Verteilschlüssel Warmwasser', () => {
  it('verteilt nach Fläche × Zeitanteil; der Leerstand trägt seinen Flächenanteil', () => {
    const result = calculate(
      sectionNineAppData(
        {
          hotWaterEnergy: {
            method: 'area_formula',
            reason: 'Weder Wärmemenge noch Volumen messbar',
          },
          hotWaterAllocation: { key: 'area' },
        },
        { vacancy: true },
      ),
    )
    const { warmWater } = result.heating.trace.circuits[0]!
    expect(warmWater.method).toBe('section9_energy')
    expect(warmWater.energy).toMatchObject({
      areaSqm: 100,
      areaSource: 'circuit_usable_area',
      heatKwh: 3_200,
    })
    expect(warmWater.allocation).toMatchObject({
      key: 'area',
      areaTimeDenominator: 100,
      areaCents: warmWater.poolCents,
      consumptionCents: 0,
    })
    const [tenant, vacancy] = result.tenants
    expect(vacancy!.isVacancy).toBe(true)
    expect(
      Math.abs(vacancy!.costBreakdown.hotWaterCents - warmWater.poolCents / 2),
    ).toBeLessThanOrEqual(1)
    expect(
      tenant!.costBreakdown.hotWaterCents +
        vacancy!.costBreakdown.hotWaterCents,
    ).toBe(warmWater.poolCents)
    expect(warmWater.distribution).toEqual({
      tenantsCents: tenant!.costBreakdown.hotWaterCents,
      vacancyCents: vacancy!.costBreakdown.hotWaterCents,
      section12ReductionCents: 0,
      roundingDifferenceCents: 0,
    })
    expect(tenant!.hotWaterBasis).toEqual({
      key: 'area',
      personTime: 2,
      areaTime: 50,
      warmWaterM3: 0,
    })
    expect(result.totals.controlDifferenceCents).toBe(0)
  })

  it('verteilt im Pauschalverfahren mit Flächenschlüssel nur den Brennstoffanteil', () => {
    const result = calculate(
      sectionNineAppData({ hotWaterAllocation: { key: 'area' } }),
    )
    const { warmWater } = result.heating.trace.circuits[0]!
    expect(warmWater.method).toBe('fuel_percentage')
    expect(warmWater.personTimeDenominator).toBe(0)
    const sum = result.tenants.reduce(
      (total, tenant) => total + tenant.costBreakdown.hotWaterCents,
      0,
    )
    expect(sum).toBe(warmWater.poolCents)
  })

  it('verteilt 70 % nach Warmwasser-m³ und 30 % nach Fläche', () => {
    const appData = sectionNineAppData({
      hotWaterEnergy: {
        method: 'volume_formula',
        volumeM3: 40,
        temperatureC: 55,
        temperatureEstimated: true,
      },
      hotWaterAllocation: { key: 'consumption', consumptionSharePercent: 70 },
    })
    const [first, second] = appData.billingData.occupancyPeriods
    first!.warmWater = { value: 30, unit: 'm3' }
    second!.warmWater = { value: 10, unit: 'm3' }
    const result = calculate(appData)
    const { warmWater } = result.heating.trace.circuits[0]!
    expect(warmWater.energy?.heatKwh).toBe(4_500)
    expect(warmWater.allocation).toMatchObject({
      key: 'consumption',
      consumptionSharePercent: 70,
      warmWaterM3Denominator: 40,
      consumptionFallbackToArea: false,
    })
    const pool = warmWater.poolCents
    expect(
      Math.abs(
        result.tenants[0]!.costBreakdown.hotWaterCents -
          pool * (0.7 * 0.75 + 0.3 * 0.5),
      ),
    ).toBeLessThanOrEqual(1)
    // Einzelrundung der Mieterbeträge: der Restcent wird ausgewiesen.
    const distributed =
      result.tenants[0]!.costBreakdown.hotWaterCents +
      result.tenants[1]!.costBreakdown.hotWaterCents
    expect(Math.abs(pool - distributed)).toBeLessThanOrEqual(1)
    expect(warmWater.distribution).toMatchObject({
      tenantsCents: distributed,
      vacancyCents: 0,
      roundingDifferenceCents: pool - distributed,
    })
  })

  it('verteilt ohne erfassten Warmwasserverbrauch ersatzweise nach Fläche', () => {
    const result = calculate(
      sectionNineAppData({
        hotWaterAllocation: {
          key: 'consumption',
          consumptionSharePercent: 50,
        },
      }),
    )
    const { allocation } = result.heating.trace.circuits[0]!.warmWater
    expect(allocation).toMatchObject({
      consumptionFallbackToArea: true,
      consumptionSharePercent: 0,
    })
  })
})
