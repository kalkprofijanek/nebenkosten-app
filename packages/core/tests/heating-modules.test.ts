import type { EnergySource, FuelDelivery, FuelStock } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { calculateEnergySourceFuel } from '../src/heating/fuel'
import {
  calculateOperatingElectricityPlan,
  type OperatingElectricityCircuitInput,
  type OperatingElectricitySourceInput,
} from '../src/heating/operating-electricity'

function energySource(overrides: Partial<EnergySource> = {}): EnergySource {
  return {
    id: 'source-1',
    heatingCircuitId: 'circuit-1',
    key: 'haupt',
    name: 'Fiktiver Brennstoff',
    sourceType: 'Testenergie',
    calorificValueKwhPerUnit: 10,
    co2FactorKgPerKwh: 0.2664,
    ...overrides,
  }
}

function fuelStock(overrides: Partial<FuelStock> = {}): FuelStock {
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

function delivery(
  id: string,
  date: string,
  quantity: number,
  amountCents: number,
  unit: 'l' | 'kg' = 'l',
): FuelDelivery {
  return {
    id,
    energySourceId: 'source-1',
    billingPeriodId: 'period-1',
    date,
    quantity: { value: quantity, unit },
    amountCents,
  }
}

describe('calculateEnergySourceFuel', () => {
  it('bewertet Anfangsbestand und Lieferungen per FIFO aus dem Restbestand', () => {
    const result = calculateEnergySourceFuel(
      energySource(),
      [fuelStock()],
      [
        delivery('delivery-late', '2024-10-01', 100, 30_000),
        delivery('delivery-early', '2024-02-01', 100, 20_000),
      ],
    )

    expect(result.fullCostCentsRaw).toBe(26_000)
    expect(result.energyKwhRaw).toBe(1_800)
    expect(result.co2KgRaw).toBeCloseTo(479.52)
    expect(result.trace).toEqual({
      energySourceId: 'source-1',
      quantityUnit: 'l',
      method: 'fifo',
      lots: [
        {
          kind: 'opening_stock',
          sourceId: 'stock-1',
          date: null,
          quantity: 100,
          valueCents: 10_000,
        },
        {
          kind: 'delivery',
          sourceId: 'delivery-early',
          date: '2024-02-01',
          quantity: 100,
          valueCents: 20_000,
        },
        {
          kind: 'delivery',
          sourceId: 'delivery-late',
          date: '2024-10-01',
          quantity: 100,
          valueCents: 30_000,
        },
      ],
      availableQuantity: 300,
      availableValueCents: 60_000,
      requestedRemainingQuantity: 120,
      valuedRemainingQuantity: 120,
      remainingValueCents: 34_000,
      consumedQuantity: 180,
      fifoConsumptionCostCents: 26_000,
      overstockQuantity: 0,
      calorificValueKwhPerUnit: 10,
      energyKwh: 1_800,
      co2FactorKgPerKwh: 0.2664,
      co2Kg: 479.52,
    })
  })

  it('führt Kosten ohne Brennstoffmenge als direkte Kosten', () => {
    const costOnlyDelivery: FuelDelivery = {
      id: 'cost-only',
      energySourceId: 'source-1',
      billingPeriodId: 'period-1',
      date: null,
      quantity: null,
      amountCents: 12_345,
    }

    const result = calculateEnergySourceFuel(
      energySource({ co2FactorKgPerKwh: null }),
      [],
      [costOnlyDelivery],
      0.42,
    )

    expect(result.fullCostCentsRaw).toBe(12_345)
    expect(result.trace).toMatchObject({
      quantityUnit: null,
      method: 'direct_cost_without_quantity',
      availableQuantity: 0,
      availableValueCents: 12_345,
      consumedQuantity: 0,
      fifoConsumptionCostCents: 12_345,
      co2FactorKgPerKwh: 0.42,
      energyKwh: 0,
      co2Kg: 0,
    })
  })

  it('begrenzt einen überhöhten Restbestand und macht den Überbestand sichtbar', () => {
    const result = calculateEnergySourceFuel(
      energySource(),
      [
        fuelStock({
          openingQuantity: { value: 10, unit: 'l' },
          openingValueCents: 1_000,
          openingPricePerUnitCents: null,
          remainingQuantity: { value: 15, unit: 'l' },
        }),
      ],
      [],
    )

    expect(result.trace).toMatchObject({
      method: 'fifo',
      availableQuantity: 10,
      requestedRemainingQuantity: 15,
      valuedRemainingQuantity: 10,
      overstockQuantity: 5,
      remainingValueCents: 1_000,
      consumedQuantity: 0,
      fifoConsumptionCostCents: 0,
    })
    expect(result.fullCostCentsRaw).toBe(0)
  })

  it('weist gemischte Mengeneinheiten deterministisch zurück', () => {
    expect(() =>
      calculateEnergySourceFuel(
        energySource(),
        [fuelStock()],
        [delivery('kg-delivery', '2024-02-01', 10, 2_000, 'kg')],
      ),
    ).toThrowError(/kg, l/)
  })

  it('behandelt fehlende optionale Mengen und Werte ohne implizite Fremddaten', () => {
    const emptyStock = fuelStock({
      id: 'stock-empty',
      openingQuantity: null,
      openingValueCents: 500,
      openingPricePerUnitCents: null,
      remainingQuantity: null,
    })
    const ignoredZeroStock = fuelStock({
      id: 'stock-zero',
      openingQuantity: { value: 0, unit: 'l' },
      openingValueCents: 0,
      openingPricePerUnitCents: null,
      remainingQuantity: null,
    })
    const valueLessDelivery: FuelDelivery = {
      id: 'delivery-no-value',
      energySourceId: 'source-1',
      billingPeriodId: 'period-1',
      date: null,
      quantity: null,
      amountCents: null,
    }

    const result = calculateEnergySourceFuel(
      energySource({
        calorificValueKwhPerUnit: null,
        co2FactorKgPerKwh: null,
      }),
      [ignoredZeroStock, emptyStock],
      [valueLessDelivery],
    )

    expect(result.trace).toMatchObject({
      quantityUnit: null,
      method: 'direct_cost_without_quantity',
      availableQuantity: 0,
      availableValueCents: 500,
      requestedRemainingQuantity: 0,
      fifoConsumptionCostCents: 500,
      calorificValueKwhPerUnit: 0,
      co2FactorKgPerKwh: 0,
    })
    expect(result.trace.lots).toEqual([
      {
        kind: 'opening_stock',
        sourceId: 'stock-empty',
        date: null,
        quantity: 0,
        valueCents: 500,
      },
      {
        kind: 'delivery',
        sourceId: 'delivery-no-value',
        date: null,
        quantity: 0,
        valueCents: 0,
      },
    ])
  })
})

describe('calculateOperatingElectricityPlan', () => {
  it('verteilt globales Budget proportional auf zwei Heizkreise', () => {
    const result = calculateOperatingElectricityPlan(
      [
        { buildingId: 'B2', intendedCentsExact: 300 },
        { buildingId: 'B1', intendedCentsExact: 100 },
      ],
      [
        {
          costCategoryId: 'global',
          availableCentsExact: 200,
          buildingId: null,
        },
      ],
    )

    expect([...result.movedCentsExactByBuildingId]).toEqual([
      ['B1', 50],
      ['B2', 150],
    ])
    expect([...result.circuitResultsByBuildingId]).toEqual([
      ['B1', { intendedCents: 100, movedCents: 50, uncoveredCents: 50 }],
      ['B2', { intendedCents: 300, movedCents: 150, uncoveredCents: 150 }],
    ])
    expect(result.publicResult).toEqual({
      sourceBudgetCents: 200,
      intendedCents: 400,
      movedCents: 200,
      uncoveredCents: 200,
      sources: [
        {
          costCategoryId: 'global',
          availableCents: 200,
          deductedCents: 200,
        },
      ],
    })
  })

  it('ignoriert eine gebäudespezifische Quelle für ein unbekanntes Gebäude', () => {
    const result = calculateOperatingElectricityPlan(
      [{ buildingId: 'B1', intendedCentsExact: 100 }],
      [
        {
          costCategoryId: 'unknown-building-source',
          availableCentsExact: 50,
          buildingId: 'B9',
        },
      ],
    )

    expect(result.publicResult).toEqual({
      sourceBudgetCents: 50,
      intendedCents: 100,
      movedCents: 0,
      uncoveredCents: 100,
      sources: [
        {
          costCategoryId: 'unknown-building-source',
          availableCents: 50,
          deductedCents: 0,
        },
      ],
    })
  })

  it('liefert für leere Eingaben einen leeren, ausgeglichenen Plan', () => {
    const result = calculateOperatingElectricityPlan([], [])

    expect(result.publicResult).toEqual({
      sourceBudgetCents: 0,
      intendedCents: 0,
      movedCents: 0,
      uncoveredCents: 0,
      sources: [],
    })
    expect([...result.movedCentsExactByBuildingId]).toEqual([])
    expect([...result.deductedCentsExactByCostCategoryId]).toEqual([])
    expect([...result.circuitResultsByBuildingId]).toEqual([])
  })

  it.each<{
    name: string
    circuits: OperatingElectricityCircuitInput[]
    sources: OperatingElectricitySourceInput[]
    message: RegExp
  }>([
    {
      name: 'leere Heizkreis-ID',
      circuits: [{ buildingId: '', intendedCentsExact: 1 }],
      sources: [],
      message: /nicht leere ID/,
    },
    {
      name: 'leere Quellen-ID',
      circuits: [],
      sources: [
        {
          costCategoryId: '',
          availableCentsExact: 1,
          buildingId: null,
        },
      ],
      message: /nicht leere ID/,
    },
    {
      name: 'doppelte Heizkreis-IDs',
      circuits: [
        { buildingId: 'B1', intendedCentsExact: 10 },
        { buildingId: 'B1', intendedCentsExact: 20 },
      ],
      sources: [],
      message: /eindeutige IDs/,
    },
    {
      name: 'doppelte Quellen-IDs',
      circuits: [],
      sources: [
        {
          costCategoryId: 'source',
          availableCentsExact: 10,
          buildingId: null,
        },
        {
          costCategoryId: 'source',
          availableCentsExact: 20,
          buildingId: null,
        },
      ],
      message: /eindeutige IDs/,
    },
    {
      name: 'negative Heizkreis-Werte',
      circuits: [{ buildingId: 'B1', intendedCentsExact: -1 }],
      sources: [],
      message: /nicht negative Centbeträge/,
    },
    {
      name: 'negative Quellen-Werte',
      circuits: [],
      sources: [
        {
          costCategoryId: 'source',
          availableCentsExact: -1,
          buildingId: null,
        },
      ],
      message: /nicht negative Centbeträge/,
    },
    {
      name: 'nicht endliche Heizkreis-Werte',
      circuits: [
        { buildingId: 'B1', intendedCentsExact: Number.POSITIVE_INFINITY },
      ],
      sources: [],
      message: /endliche, nicht negative Centbeträge/,
    },
    {
      name: 'leere Gebäude-ID an spezifischer Quelle',
      circuits: [],
      sources: [
        {
          costCategoryId: 'source',
          availableCentsExact: 1,
          buildingId: '',
        },
      ],
      message: /nicht leere Gebäude-ID/,
    },
  ])('weist $name zurück', ({ circuits, sources, message }) => {
    expect(() =>
      calculateOperatingElectricityPlan(circuits, sources),
    ).toThrowError(message)
  })

  it('sortiert Quellen deterministisch und belastet sie in stabiler ID-Reihenfolge', () => {
    const circuits = [{ buildingId: 'B1', intendedCentsExact: 75 }]
    const sources: OperatingElectricitySourceInput[] = [
      {
        costCategoryId: 'z-source',
        availableCentsExact: 50,
        buildingId: null,
      },
      {
        costCategoryId: 'a-source',
        availableCentsExact: 50,
        buildingId: null,
      },
    ]

    const forward = calculateOperatingElectricityPlan(circuits, sources)
    const reversed = calculateOperatingElectricityPlan(
      circuits,
      [...sources].reverse(),
    )

    expect(forward.publicResult).toEqual(reversed.publicResult)
    expect(forward.publicResult.sources).toEqual([
      {
        costCategoryId: 'a-source',
        availableCents: 50,
        deductedCents: 50,
      },
      {
        costCategoryId: 'z-source',
        availableCents: 50,
        deductedCents: 25,
      },
    ])
  })

  it('verrechnet spezifische Quellen vor dem verbleibenden globalen Budget', () => {
    const result = calculateOperatingElectricityPlan(
      [
        { buildingId: 'B1', intendedCentsExact: 100 },
        { buildingId: 'B2', intendedCentsExact: 100 },
      ],
      [
        {
          costCategoryId: 'specific',
          availableCentsExact: 50,
          buildingId: 'B1',
        },
        {
          costCategoryId: 'global',
          availableCentsExact: 100,
          buildingId: null,
        },
      ],
    )

    expect(result.movedCentsExactByBuildingId.get('B1')).toBeCloseTo(83.333_333)
    expect(result.movedCentsExactByBuildingId.get('B2')).toBeCloseTo(66.666_667)
    expect(result.publicResult).toMatchObject({
      intendedCents: 200,
      movedCents: 150,
      uncoveredCents: 50,
    })
  })

  it('verteilt einen Restcent bei gleichen Nachkommastellen nach stabiler ID', () => {
    const result = calculateOperatingElectricityPlan(
      [
        { buildingId: 'B2', intendedCentsExact: 0.5 },
        { buildingId: 'B1', intendedCentsExact: 0.5 },
      ],
      [
        {
          costCategoryId: 'global',
          availableCentsExact: 1,
          buildingId: null,
        },
      ],
    )

    expect([...result.circuitResultsByBuildingId]).toEqual([
      ['B1', { intendedCents: 1, movedCents: 1, uncoveredCents: 0 }],
      ['B2', { intendedCents: 0, movedCents: 0, uncoveredCents: 0 }],
    ])
  })

  it('zieht kein globales Budget ab, wenn alle Sollbeträge null sind', () => {
    const result = calculateOperatingElectricityPlan(
      [{ buildingId: 'B1', intendedCentsExact: 0 }],
      [
        {
          costCategoryId: 'global',
          availableCentsExact: 10,
          buildingId: null,
        },
      ],
    )

    expect(result.publicResult).toEqual({
      sourceBudgetCents: 10,
      intendedCents: 0,
      movedCents: 0,
      uncoveredCents: 0,
      sources: [
        {
          costCategoryId: 'global',
          availableCents: 10,
          deductedCents: 0,
        },
      ],
    })
  })
})
