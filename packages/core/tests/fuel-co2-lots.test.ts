import type {
  AppDataFile,
  EnergySource,
  FuelDelivery,
  FuelStock,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import { calculateBilling, createCalculationInput } from '../src'
import { calculateEnergySourceFuel } from '../src/heating/fuel'

// Fiktive Werte: 10 kWh je Liter, 0,25 kg CO₂ je kWh.
const source: EnergySource = {
  id: 'source-1',
  heatingCircuitId: 'circuit-1',
  key: 'haupt',
  calorificValueKwhPerUnit: 10,
  co2FactorKgPerKwh: 0.25,
}

function stock(overrides: Partial<FuelStock> = {}): FuelStock {
  return {
    id: 'stock-1',
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    openingQuantity: { value: 100, unit: 'l' },
    openingPricePerUnitCents: 100,
    remainingQuantity: { value: 120, unit: 'l' },
    ...overrides,
  }
}

function delivery(id: string, date: string): FuelDelivery {
  return {
    id,
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    date,
    quantity: { value: 100, unit: 'l' },
    amountCents: 20_000,
  }
}

const deliveries = [
  delivery('delivery-late', '2024-10-01'),
  delivery('delivery-early', '2024-02-01'),
]

describe('CO₂-Preis je FIFO-Los (ADR-0010, A12)', () => {
  it('bewertet den Anfangsbestand mit dem Preis seines Lieferjahres', () => {
    const result = calculateEnergySourceFuel(
      source,
      [stock({ openingCo2PricePerTonCents: 3_000 })],
      deliveries,
      0,
      { co2PricePerTonCents: 5_500 },
    )
    // Verbrauch 180 l: 100 l Anfangsbestand, 80 l aus der frühen Lieferung.
    // 250 kg × 30 €/t = 7,50 €; 200 kg × 55 €/t = 11,00 €.
    expect(result.co2CostCentsRaw).toBeCloseTo(1_850, 9)
    expect(result.trace.co2CostCents).toBe(1_850)
    expect(result.trace.co2Lots).toEqual([
      {
        kind: 'opening_stock',
        sourceId: 'stock-1',
        consumedQuantity: 100,
        energyKwh: 1_000,
        co2Kg: 250,
        pricePerTonCents: 3_000,
        priceSource: 'opening_stock',
        costCents: 750,
      },
      {
        kind: 'delivery',
        sourceId: 'delivery-early',
        consumedQuantity: 80,
        energyKwh: 800,
        co2Kg: 200,
        pricePerTonCents: 5_500,
        priceSource: 'billing_year',
        costCents: 1_100,
      },
    ])
    // Emissionen bleiben unverändert.
    expect(result.co2KgRaw).toBeCloseTo(450, 9)
  })

  it('setzt verbrauchte Teilmengen des Anfangsbestands an', () => {
    const result = calculateEnergySourceFuel(
      source,
      [
        stock({
          openingCo2PricePerTonCents: 3_000,
          remainingQuantity: { value: 250, unit: 'l' },
        }),
      ],
      deliveries,
      0,
      { co2PricePerTonCents: 5_500 },
    )
    // Rest 250 l: beide Lieferungen und 50 l Anfangsbestand → Verbrauch 50 l.
    expect(result.trace.co2Lots).toHaveLength(1)
    expect(result.trace.co2Lots?.[0]).toMatchObject({
      consumedQuantity: 50,
      co2Kg: 125,
      costCents: 375,
    })
    expect(result.trace.co2CostCents).toBe(375)
  })

  it('rechnet ohne Lieferjahrespreis wie bisher (kein Los-Ausweis)', () => {
    const withoutField = calculateEnergySourceFuel(
      source,
      [stock()],
      deliveries,
      0,
      { co2PricePerTonCents: 5_500 },
    )
    const legacyCall = calculateEnergySourceFuel(source, [stock()], deliveries)
    expect(withoutField.co2CostCentsRaw).toBeNull()
    expect(withoutField.trace).not.toHaveProperty('co2Lots')
    expect(withoutField.trace).not.toHaveProperty('co2CostCents')
    expect(withoutField.trace).toEqual(legacyCall.trace)
  })

  it('bewertet nicht ohne Jahrespreis (Modus manuell)', () => {
    const result = calculateEnergySourceFuel(
      source,
      [stock({ openingCo2PricePerTonCents: 3_000 })],
      deliveries,
    )
    expect(result.co2CostCentsRaw).toBeNull()
    expect(result.trace.co2Lots).toBeUndefined()
  })
})

function fifoAppData(): AppDataFile {
  const scenario = scenarios.find(({ id }) => id === 'case-06-heating-oil-fifo')
  if (!scenario) throw new Error('Testszenario fehlt')
  const data = structuredClone(buildAppDataFile(scenario))
  data.billingData.heatingCircuits = data.billingData.heatingCircuits.map(
    (circuit) => ({
      ...circuit,
      co2: { mode: 'auto', co2PricePerTonCents: 5_500 },
    }),
  )
  return data
}

function calculate(data: AppDataFile) {
  return calculateBilling(createCalculationInput(data, 'bp-1'))
}

describe('CO₂-Kosten des Heizkreises aus den Losen', () => {
  it('übernimmt die Summe je Los in die Heizkostenabrechnung', () => {
    const before = calculate(fifoAppData())
    const data = fifoAppData()
    data.billingData.fuelStocks = data.billingData.fuelStocks.map(
      (fuelStock) => ({ ...fuelStock, openingCo2PricePerTonCents: 3_000 }),
    )
    const after = calculate(data)
    const circuitBefore = before.heating.trace.circuits[0]!
    const circuitAfter = after.heating.trace.circuits[0]!
    const lots = circuitAfter.energySources.flatMap(
      ({ co2Lots }) => co2Lots ?? [],
    )
    expect(lots.length).toBeGreaterThan(0)
    expect(lots[0]).toMatchObject({
      kind: 'opening_stock',
      pricePerTonCents: 3_000,
    })
    expect(circuitAfter.energySources[0]!.co2CostCents).toBe(
      circuitAfter.co2.totalCents,
    )
    expect(circuitAfter.co2.totalCents).toBeLessThan(
      circuitBefore.co2.totalCents,
    )
    // Gleiche Emissionen, gleiche Einstufung.
    expect(circuitAfter.co2.intensityKgPerSqmYear).toBe(
      circuitBefore.co2.intensityKgPerSqmYear,
    )
    expect(circuitAfter.co2.tenantCents + circuitAfter.co2.landlordCents).toBe(
      circuitAfter.co2.totalCents,
    )
  })

  it('rechnet ohne Lieferjahrespreis unverändert', () => {
    const before = calculate(fifoAppData())
    const data = fifoAppData()
    data.billingData.fuelStocks = data.billingData.fuelStocks.map(
      (fuelStock) => ({ ...fuelStock, openingCo2PricePerTonCents: null }),
    )
    expect(calculate(data)).toEqual(before)
  })
})
