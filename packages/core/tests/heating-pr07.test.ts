import type { AppDataFile, CostCategory } from '@nebenkosten/schema'
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

function addOperatingElectricitySource(
  appData: AppDataFile,
  amountCents: number,
  scope: CostCategory['scope'] = { kind: 'property' },
): void {
  appData.billingData.costCategories = [
    ...appData.billingData.costCategories,
    {
      id: 'k-operating-electricity',
      billingPeriodId: 'bp-1',
      kind: 'operating',
      label: 'Allgemeinstrom',
      allocationKey: 'usable_area',
      scope,
      totalAmountCents: amountCents,
      isOperatingElectricitySource: true,
    },
  ]
}

describe('PR 07 – Heizkosten- und CO2-Rechenweg', () => {
  it('verschiebt Betriebsstrom netto-null aus einer ausreichend hohen Stromquelle', () => {
    const appData = appDataFor('case-08-heat-pump')
    appData.billingData.billingPeriods[0]!.heatingDefaults!.operatingElectricitySharePercent = 5
    addOperatingElectricitySource(appData, 20_000)

    const result = calculate(appData)

    expect(result.snapshotFormatVersion).toBe(3)
    expect(result.heating.operatingElectricity).toEqual({
      sourceBudgetCents: 20_000,
      intendedCents: 12_000,
      movedCents: 12_000,
      uncoveredCents: 0,
      sources: [
        {
          costCategoryId: 'k-operating-electricity',
          availableCents: 20_000,
          deductedCents: 12_000,
        },
      ],
    })
    expect(result.heating.totalCents).toBe(252_000)
    expect(result.heating.baseCostsCents).toBe(75_600)
    expect(result.heating.consumptionCostsCents).toBe(176_400)
    expect(
      result.tenants.map(({ id, shareCents }) => [id, shareCents]),
    ).toEqual([
      ['op-t1', 156_000],
      ['op-t2', 104_000],
    ])
    expect(result.totals).toMatchObject({
      recordedCostsCents: 260_000,
      tenantTotalCents: 260_000,
      landlordTotalCents: 0,
      controlDifferenceCents: 0,
    })
  })

  it('begrenzt die Umbuchung auf das wirklich vorhandene Strombudget', () => {
    const appData = appDataFor('case-08-heat-pump')
    appData.billingData.billingPeriods[0]!.heatingDefaults!.operatingElectricitySharePercent = 5
    addOperatingElectricitySource(appData, 5_000)

    const result = calculate(appData)

    expect(result.heating.operatingElectricity).toMatchObject({
      sourceBudgetCents: 5_000,
      intendedCents: 12_000,
      movedCents: 5_000,
      uncoveredCents: 7_000,
      sources: [
        {
          costCategoryId: 'k-operating-electricity',
          availableCents: 5_000,
          deductedCents: 5_000,
        },
      ],
    })
    expect(result.heating.totalCents).toBe(245_000)
    expect(result.heating.baseCostsCents).toBe(73_500)
    expect(result.heating.consumptionCostsCents).toBe(171_500)
    expect(
      result.tenants.map(({ id, shareCents }) => [id, shareCents]),
    ).toEqual([
      ['op-t1', 147_000],
      ['op-t2', 98_000],
    ])
    expect(result.totals).toMatchObject({
      recordedCostsCents: 245_000,
      tenantTotalCents: 245_000,
      landlordTotalCents: 0,
      controlDifferenceCents: 0,
    })
  })

  it('verwendet eine gebaeudebezogene Stromquelle nur fuer ihren Heizkreis', () => {
    const appData = appDataFor('case-05-multiple-circuits')
    appData.billingData.billingPeriods[0]!.heatingDefaults!.operatingElectricitySharePercent = 5
    addOperatingElectricitySource(appData, 20_000, {
      kind: 'building',
      buildingId: 'B1',
    })

    const result = calculate(appData)
    const traces = result.heating.trace.circuits

    expect(
      traces.map(({ buildingId, operatingElectricity }) => ({
        buildingId,
        ...operatingElectricity,
      })),
    ).toEqual([
      {
        buildingId: 'B1',
        intendedCents: 15_000,
        movedCents: 15_000,
        uncoveredCents: 0,
      },
      {
        buildingId: 'B2',
        intendedCents: 10_000,
        movedCents: 0,
        uncoveredCents: 10_000,
      },
    ])
    expect(
      result.heating.perCircuit.map(
        ({ buildingId, heatingTotalCents, baseCents, consumptionCents }) => ({
          buildingId,
          heatingTotalCents,
          baseCents,
          consumptionCents,
        }),
      ),
    ).toEqual([
      {
        buildingId: 'B1',
        heatingTotalCents: 335_000,
        baseCents: 100_500,
        consumptionCents: 234_500,
      },
      {
        buildingId: 'B2',
        heatingTotalCents: 200_000,
        baseCents: 60_000,
        consumptionCents: 140_000,
      },
    ])
    expect(
      result.tenants.map(({ id, shareCents }) => [id, shareCents]),
    ).toEqual([
      ['op-t1', 123_100],
      ['op-t2', 216_900],
      ['op-t3', 200_000],
    ])
    expect(result.totals).toMatchObject({
      recordedCostsCents: 540_000,
      tenantTotalCents: 540_000,
      controlDifferenceCents: 0,
    })
  })

  it('legt FIFO, CO2 und Heiztopf als maschinenlesbaren Trace offen', () => {
    const result = calculate(appDataFor('case-12-co2-split'))
    const trace = result.heating.trace
    const circuit = trace.circuits[0]!
    const source = circuit.energySources[0]!

    expect(trace.traceFormatVersion).toBe(1)
    expect(circuit.heatingCircuitId).toBe('hc-B1')
    expect(source).toMatchObject({
      energySourceId: 'es-B1-haupt',
      quantityUnit: 'l',
      method: 'fifo',
      availableQuantity: 2_000,
      availableValueCents: 200_000,
      requestedRemainingQuantity: 0,
      valuedRemainingQuantity: 0,
      remainingValueCents: 0,
      consumedQuantity: 2_000,
      fifoConsumptionCostCents: 200_000,
      calorificValueKwhPerUnit: 10,
      energyKwh: 20_000,
      co2FactorKgPerKwh: 0.2664,
      co2Kg: 5_328,
    })
    expect(source.lots).toHaveLength(1)
    expect(circuit.co2).toMatchObject({
      mode: 'auto',
      totalCents: 29_304,
      tenantCents: 20_513,
      landlordCents: 8_791,
      tenantPercent: 70,
      intensityKgPerSqmYear: 26.567,
    })
    expect(circuit.warmWater).toEqual({
      method: 'none',
      sharePercent: 0,
      poolCents: 0,
      personTimeDenominator: 0,
      fallbackOccupancyIds: [],
    })
    expect(circuit.operatingElectricity).toEqual({
      intendedCents: 0,
      movedCents: 0,
      uncoveredCents: 0,
    })
    expect(circuit.split).toMatchObject({
      baseSharePercent: 30,
      consumptionSharePercent: 70,
      baseCents: 51_209,
      consumptionCents: 119_487,
    })
    expect(circuit.reconciliation).toEqual({
      fifoConsumptionCostCents: 200_000,
      minusCo2Cents: 29_304,
      fuelAfterCo2Cents: 170_696,
      minusHotWaterCents: 0,
      plusHeatingOperatingCostsCents: 0,
      plusOperatingElectricityCents: 0,
      roundingDifferenceCents: 0,
      heatingPoolCents: 170_696,
    })
  })

  it('zaehlt die physische Heizflaeche bei einem Nutzerwechsel nicht doppelt', () => {
    const appData = appDataFor('case-12-co2-split')
    const original = appData.billingData.occupancyPeriods[0]!
    appData.billingData.occupancyPeriods = [
      { ...original, to: '2024-06-30' },
      {
        ...structuredClone(original),
        id: `${original.id}-wechsel`,
        from: '2024-07-01',
        to: '2024-12-31',
      },
      ...appData.billingData.occupancyPeriods.slice(1),
    ]

    const result = calculate(appData)

    expect(result.heating.trace.circuits[0]!.co2).toMatchObject({
      heatedAreaSqm: 200,
      intensityKgPerSqmYear: 26.567,
      tier: 4,
      tenantPercent: 70,
    })
  })

  it('verteilt kleine Heiz- und CO2-Betraege centgenau', () => {
    const appData = appDataFor('case-12-co2-split')
    appData.billingData.fuelDeliveries[0]!.amountCents = 5
    appData.billingData.heatingCircuits[0]!.co2 = {
      mode: 'manual',
      levyCents: 1,
      landlordSharePercent: 50,
      intensityKgPerSqmYear: 0,
    }

    const result = calculate(appData)
    const circuit = result.heating.perCircuit[0]!
    const circuitCo2 = result.heating.trace.circuits[0]!.co2

    expect(circuit.heatingTotalCents).toBe(4)
    expect(circuit.baseCents + circuit.consumptionCents).toBe(
      circuit.heatingTotalCents,
    )
    expect(circuitCo2.tenantCents + circuitCo2.landlordCents).toBe(
      circuitCo2.totalCents,
    )
    expect(
      result.heating.baseCostsCents + result.heating.consumptionCostsCents,
    ).toBe(result.heating.totalCents)
    expect(result.co2.tenantCents + result.co2.landlordCents).toBe(
      result.co2.totalCostCents,
    )
  })

  it('weist eine reine Rundungsdifferenz in der Trace-Abstimmung explizit aus', () => {
    const appData = appDataFor('case-12-co2-split')
    appData.billingData.fuelDeliveries[0]!.amountCents = 5
    const circuit = appData.billingData.heatingCircuits[0]!
    circuit.co2 = {
      mode: 'manual',
      levyCents: 0,
      landlordSharePercent: 0,
      intensityKgPerSqmYear: 0,
    }
    circuit.hasCentralHotWater = true
    circuit.hotWaterSharePercent = 10

    const reconciliation =
      calculate(appData).heating.trace.circuits[0]!.reconciliation

    expect(reconciliation).toMatchObject({
      fifoConsumptionCostCents: 5,
      minusCo2Cents: 0,
      minusHotWaterCents: 1,
      heatingPoolCents: 5,
      roundingDifferenceCents: 1,
    })
    expect(
      reconciliation.fifoConsumptionCostCents -
        reconciliation.minusCo2Cents -
        reconciliation.minusHotWaterCents +
        reconciliation.plusHeatingOperatingCostsCents +
        reconciliation.plusOperatingElectricityCents +
        reconciliation.roundingDifferenceCents,
    ).toBe(reconciliation.heatingPoolCents)
  })

  it('verwendet eine Haus-Quelle ohne eindeutigen Heizkreis nicht als Betriebsstrombudget', () => {
    const appData = appDataFor('case-05-multiple-circuits')
    appData.billingData.billingPeriods[0]!.heatingDefaults!.operatingElectricitySharePercent = 5
    addOperatingElectricitySource(appData, 20_000, {
      kind: 'house',
      houseKey: 'AW1',
    })

    const result = calculate(appData)

    expect(result.heating.operatingElectricity).toEqual({
      sourceBudgetCents: 0,
      intendedCents: 25_000,
      movedCents: 0,
      uncoveredCents: 25_000,
      sources: [],
    })
    expect(result.totals.recordedCostsCents).toBe(540_000)
    expect(result.totals.controlDifferenceCents).toBe(0)
  })

  it('stimmt Restcents ueber mehrere Heizkreise hierarchisch ab', () => {
    const appData = appDataFor('case-05-multiple-circuits')
    for (const delivery of appData.billingData.fuelDeliveries) {
      delivery.amountCents = 2
    }
    for (const circuit of appData.billingData.heatingCircuits) {
      circuit.co2 = {
        mode: 'manual',
        levyCents: 1,
        landlordSharePercent: 50,
        intensityKgPerSqmYear: 0,
      }
    }

    const result = calculate(appData)

    expect(result.heating.baseCostsCents).toBe(
      result.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.baseCents,
        0,
      ),
    )
    expect(result.heating.consumptionCostsCents).toBe(
      result.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.consumptionCents,
        0,
      ),
    )
    expect(result.heating.totalCents).toBe(
      result.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.heatingTotalCents,
        0,
      ),
    )
    expect(result.co2.tenantCents).toBe(
      result.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.co2TenantCents,
        0,
      ),
    )
    expect(result.co2.landlordCents).toBe(
      result.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.co2LandlordCents,
        0,
      ),
    )
    expect(result.co2.totalCostCents).toBe(
      result.heating.perCircuit.reduce(
        (sum, circuit) => sum + circuit.co2CostCents,
        0,
      ),
    )
  })
})
