import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildAppDataFile } from '../../../tests/characterization/build-app-data'
import { scenarios } from '../../../tests/characterization/cases'
import {
  calculateBilling,
  createCalculationInput,
  heatingEnergyBalance,
  heatingEnergyBalanceForPeriod,
  type CalculationInput,
  type CalculationOutput,
  type EnergySourceCalculationTrace,
} from '../src'

/** Fiktive Energiequelle mit Spur; `kind` steuert Bezeichnung und WP-Erkennung. */
interface SourceSpec {
  id: string
  kind: 'Heizöl' | 'Pellets' | 'Erdgas' | 'Wärmepumpe'
  quantity: number
  energyKwh: number
  costCents?: number
  method?: EnergySourceCalculationTrace['method']
}

function trace(spec: SourceSpec): EnergySourceCalculationTrace {
  return {
    energySourceId: spec.id,
    quantityUnit: spec.kind === 'Wärmepumpe' ? 'kWh' : 'l',
    method: spec.method ?? 'fifo',
    lots: [],
    availableQuantity: spec.quantity,
    availableValueCents: spec.costCents ?? 0,
    requestedRemainingQuantity: 0,
    valuedRemainingQuantity: 0,
    remainingValueCents: 0,
    consumedQuantity: spec.quantity,
    fifoConsumptionCostCents: spec.costCents ?? 100_000,
    overstockQuantity: 0,
    calorificValueKwhPerUnit: spec.quantity
      ? spec.energyKwh / spec.quantity
      : 0,
    energyKwh: spec.energyKwh,
    co2FactorKgPerKwh: 0,
    co2Kg: 0,
  }
}

/**
 * Minimaler Rechenstand eines Heizkreises: Energiequellen, Summe der
 * Verbrauchswerte (`consumptionDenominator`) und optional Warmwasserwärme.
 */
function scenario(options: {
  sources: SourceSpec[]
  generatedHeatKwh?: number
  metered?: boolean
  consumption?: number
  hotWaterHeatKwh?: number
}): { input: CalculationInput; output: CalculationOutput } {
  const input = {
    billingPeriod: { id: 'bp' },
    buildings: [{ id: 'b1', defaultEnergySourceType: null }],
    units: [],
    occupancyPeriods: [],
    meters: [],
    heatingCircuits: [
      {
        id: 'hc',
        buildingId: 'b1',
        consumptionMode: options.metered ? 'metered_kwh' : 'manual',
        generatedHeatKwh: options.generatedHeatKwh ?? null,
      },
    ],
    energySources: options.sources.map(({ id, kind }) => ({
      id,
      heatingCircuitId: 'hc',
      key: id,
      name: kind,
      sourceType: kind,
    })),
  } as unknown as CalculationInput
  const output = {
    heating: {
      trace: {
        circuits: [
          {
            buildingId: 'b1',
            heatingCircuitId: 'hc',
            energySources: options.sources.map(trace),
            split: { consumptionDenominator: options.consumption ?? 0 },
            warmWater: options.hotWaterHeatKwh
              ? { energy: { heatKwh: options.hotWaterHeatKwh } }
              : {},
          },
        ],
      },
    },
  } as unknown as CalculationOutput
  return { input, output }
}

function balance(options: Parameters<typeof scenario>[0]) {
  const { input, output } = scenario(options)
  return heatingEnergyBalance(input, output)[0]!
}

describe('heatingEnergyBalance', () => {
  it('Öl: Nutzungsgrad aus Wärmemengenzähler am Erzeuger', () => {
    const result = balance({
      sources: [
        { id: 'oel', kind: 'Heizöl', quantity: 4_000, energyKwh: 40_000 },
      ],
      generatedHeatKwh: 34_000,
    })
    expect(result).toMatchObject({
      generator: 'boiler',
      energyInputKwh: 40_000,
      heatKwh: 34_000,
      heatSource: 'generator_meter',
      ratio: 0.85,
      expected: { min: 0.6, max: 0.95 },
      status: 'ok',
    })
  })

  it('Pellets: Wohnungswärmezähler plus Warmwasserwärme', () => {
    const result = balance({
      sources: [
        { id: 'p', kind: 'Pellets', quantity: 10_000, energyKwh: 48_000 },
      ],
      metered: true,
      consumption: 32_000,
      hotWaterHeatKwh: 6_400,
    })
    expect(result).toMatchObject({
      heatKwh: 38_400,
      heatSource: 'unit_heat_meters',
      hotWaterHeatKwh: 6_400,
      ratio: 0.8,
      status: 'ok',
    })
  })

  it('Gas: zu wenig gemessene Wärme liegt unter dem Band', () => {
    expect(
      balance({
        sources: [
          { id: 'g', kind: 'Erdgas', quantity: 30_000, energyKwh: 30_000 },
        ],
        generatedHeatKwh: 13_500,
      }),
    ).toMatchObject({ ratio: 0.45, status: 'below_band' })
  })

  it('Wärmepumpe: Jahresarbeitszahl und Band 2–5', () => {
    expect(
      balance({
        sources: [
          { id: 'wp', kind: 'Wärmepumpe', quantity: 10_000, energyKwh: 10_000 },
        ],
        generatedHeatKwh: 36_000,
      }),
    ).toMatchObject({
      generator: 'heat_pump',
      ratio: 3.6,
      expected: { min: 2, max: 5 },
      status: 'ok',
    })
    expect(
      balance({
        sources: [
          { id: 'wp', kind: 'Wärmepumpe', quantity: 5_000, energyKwh: 5_000 },
        ],
        generatedHeatKwh: 36_000,
      }).status,
    ).toBe('above_band')
  })

  it('Hybrid: Band nach Energieanteilen gewichtet', () => {
    const result = balance({
      sources: [
        { id: 'oel', kind: 'Heizöl', quantity: 2_000, energyKwh: 20_000 },
        { id: 'wp', kind: 'Wärmepumpe', quantity: 20_000, energyKwh: 20_000 },
      ],
      generatedHeatKwh: 60_000,
    })
    // 50 % Kessel / 50 % WP: min 0,5 × 0,6 + 0,5 × 2 = 1,3; max 0,475 + 2,5
    expect(result).toMatchObject({
      generator: 'hybrid',
      heatPumpInputKwh: 20_000,
      ratio: 1.5,
      expected: { min: 1.3, max: 2.975 },
      status: 'ok',
    })
  })

  it('fehlende Menge oder fehlender Heizwert: Energieeinsatz unvollständig', () => {
    expect(
      balance({
        sources: [
          {
            id: 'wp',
            kind: 'Wärmepumpe',
            quantity: 0,
            energyKwh: 0,
            method: 'direct_cost_without_quantity',
            costCents: 500_000,
          },
        ],
        generatedHeatKwh: 30_000,
      }),
    ).toMatchObject({
      ratio: null,
      status: 'energy_input_incomplete',
      sources: [{ problem: 'quantity_missing' }],
    })
    expect(
      balance({
        sources: [{ id: 'oel', kind: 'Heizöl', quantity: 3_000, energyKwh: 0 }],
        generatedHeatKwh: 30_000,
      }).sources[0]!.problem,
    ).toBe('calorific_value_missing')
  })

  it('Bandgrenzen gelten einschließlich', () => {
    const at = (heat: number) =>
      balance({
        sources: [
          { id: 'oel', kind: 'Heizöl', quantity: 1_000, energyKwh: 10_000 },
        ],
        generatedHeatKwh: heat,
      }).status
    expect(at(6_000)).toBe('ok')
    expect(at(9_500)).toBe('ok')
    expect(at(5_990)).toBe('below_band')
    expect(at(9_510)).toBe('above_band')
  })

  it('Heizkostenverteiler ohne kWh: keine Bilanz', () => {
    expect(
      balance({
        sources: [
          { id: 'oel', kind: 'Heizöl', quantity: 1_000, energyKwh: 10_000 },
        ],
        consumption: 1_234,
      }),
    ).toMatchObject({
      heatKwh: null,
      ratio: null,
      status: 'no_heat_measurement',
    })
  })
})

describe('heatingEnergyBalanceForPeriod', () => {
  it('rechnet aus dem echten Rechenkern', () => {
    const found = scenarios.find(({ id }) => id === 'case-10-central-hot-water')
    if (!found) throw new Error('Testszenario fehlt')
    const data: AppDataFile = structuredClone(buildAppDataFile(found))
    data.billingData.heatingCircuits[0]!.generatedHeatKwh = 30_000
    const period = data.billingData.billingPeriods[0]!
    const output = calculateBilling(createCalculationInput(data, period.id))
    const energy = output.heating.trace.circuits[0]!.energySources.reduce(
      (sum, { energyKwh }) => sum + energyKwh,
      0,
    )
    const [current] = heatingEnergyBalanceForPeriod(data, period)
    expect(current!.previous).toBeUndefined()
    expect(current!.energyInputKwh).toBeCloseTo(energy, 1)
    expect(current!.heatKwh).toBe(30_000)
    expect(current!.heatSource).toBe('generator_meter')
  })
})
