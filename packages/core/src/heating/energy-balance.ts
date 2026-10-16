/**
 * Energiebilanz je Heizkreis (PR-32): Energieeinsatz (Brennstoffmenge ×
 * Heizwert bzw. Wärmepumpenstrom in kWh) gegenüber der gemessenen Wärme.
 * Daraus ergibt sich bei Kesseln der Nutzungsgrad, bei Wärmepumpen die
 * Jahresarbeitszahl (JAZ). Die Bilanz ist eine Plausibilitätsprüfung für den
 * Vermieter; sie verändert keine Berechnung und gehört nicht ins Mieter-PDF.
 *
 * Gemessene Wärme in dieser Reihenfolge:
 * 1. `HeatingCircuit.generatedHeatKwh` (Wärmemengenzähler am Erzeuger),
 * 2. Wohnungswärmezähler: Summe der kWh aller Nutzungen (Messmodus
 *    `metered_kwh` oder erfasste Stände von Wohnungswärmezählern), zuzüglich
 *    der Warmwasserwärme nach § 9 Abs. 2 HeizKV, sofern das Warmwasser über
 *    den Heizkreis bereitet wird.
 * Heizkostenverteiler liefern nur Einheiten; dann entfällt die Bilanz.
 *
 * Offene Entscheidung: Die Bänder (Kessel 60–95 %, Wärmepumpe JAZ 2–5) sind
 * Erfahrungswerte der App, keine Rechtsnorm; sie sind einstellbar.
 */
import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { calculateBilling } from '../calculation/calculate-billing'
import type {
  CalculationInput,
  CalculationOutput,
  HeatingCircuitTrace,
} from '../contracts'
import { createCalculationInput } from '../input/create-calculation-input'
import { isHeatPumpEnergySource } from './energy-carrier'

export interface EnergyBalanceBands {
  /** Nutzungsgrad von Kesseln (Brennstoff → Wärme) als Anteil 0–1. */
  readonly boiler: { readonly min: number; readonly max: number }
  /** Jahresarbeitszahl von Wärmepumpen (Strom → Wärme). */
  readonly heatPump: { readonly min: number; readonly max: number }
}

export const DEFAULT_ENERGY_BALANCE_BANDS: EnergyBalanceBands = {
  boiler: { min: 0.6, max: 0.95 },
  heatPump: { min: 2, max: 5 },
}

export type EnergyBalanceGenerator = 'boiler' | 'heat_pump' | 'hybrid'

export type EnergyBalanceHeatSource =
  /** Wärmemengenzähler am Erzeuger (`generatedHeatKwh`). */
  | 'generator_meter'
  /** Summe der Wohnungswärmezähler (+ Warmwasserwärme). */
  | 'unit_heat_meters'

export interface EnergyBalanceSource {
  readonly energySourceId: string
  readonly label: string | null
  readonly heatPump: boolean
  readonly quantity: number
  readonly quantityUnit: string | null
  readonly energyKwh: number
  readonly costCents: number
  /** Kosten ohne Menge oder Menge ohne Heizwert: Energieeinsatz unbekannt. */
  readonly problem: 'quantity_missing' | 'calorific_value_missing' | null
}

export interface CircuitEnergyBalance {
  readonly buildingId: string
  readonly heatingCircuitId: string | null
  readonly generator: EnergyBalanceGenerator
  readonly sources: readonly EnergyBalanceSource[]
  /** Energieeinsatz aller Quellen in kWh. */
  readonly energyInputKwh: number
  /** Davon Wärmepumpenstrom in kWh. */
  readonly heatPumpInputKwh: number
  readonly heatKwh: number | null
  readonly heatSource: EnergyBalanceHeatSource | null
  /** Warmwasserwärme, die in `heatKwh` enthalten ist (nur Wohnungszähler). */
  readonly hotWaterHeatKwh: number
  /** Wärme ÷ Energieeinsatz: Nutzungsgrad (Kessel) bzw. JAZ (Wärmepumpe). */
  readonly ratio: number | null
  /** Erwartete Spanne des Verhältnisses (bei Hybrid nach Energieanteilen). */
  readonly expected: { readonly min: number; readonly max: number }
  readonly status:
    | 'ok'
    | 'below_band'
    | 'above_band'
    | 'no_heat_measurement'
    | 'energy_input_incomplete'
  readonly previous?: {
    readonly year: number
    readonly ratio: number | null
    readonly energyInputKwh: number
    readonly heatKwh: number | null
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function sourcesOf(
  input: CalculationInput,
  circuit: HeatingCircuitTrace,
): EnergyBalanceSource[] {
  const buildingType = input.buildings.find(
    ({ id }) => id === circuit.buildingId,
  )?.defaultEnergySourceType
  return circuit.energySources.map((trace) => {
    const entity = input.energySources.find(
      ({ id }) => id === trace.energySourceId,
    )
    const costCents = trace.fifoConsumptionCostCents
    const problem =
      trace.method === 'direct_cost_without_quantity' && costCents > 0
        ? 'quantity_missing'
        : trace.consumedQuantity > 0 && trace.energyKwh <= 0
          ? 'calorific_value_missing'
          : null
    return {
      energySourceId: trace.energySourceId,
      label: entity ? (entity.name ?? entity.sourceType ?? entity.key) : null,
      heatPump: entity ? isHeatPumpEnergySource(entity, buildingType) : false,
      quantity: trace.consumedQuantity,
      quantityUnit: trace.quantityUnit,
      energyKwh: trace.energyKwh,
      costCents,
      problem,
    }
  })
}

/** Alle Mieter-Nutzungen des Gebäudes tragen Stände von Wohnungswärmezählern. */
function usesUnitHeatMeters(
  input: CalculationInput,
  buildingId: string,
): boolean {
  const unitHeatNumbers = new Set(
    input.meters
      .filter(({ kind }) => kind === 'unit_heat')
      .map(({ meterNumber }) => meterNumber),
  )
  const units = new Map(input.units.map((unit) => [unit.id, unit]))
  const occupancies = input.occupancyPeriods.filter((occupancy) => {
    if (occupancy.billingPeriodId !== input.billingPeriod.id) return false
    if (occupancy.kind !== 'tenant') return false
    const building =
      occupancy.costScope?.kind === 'building'
        ? occupancy.costScope.buildingId
        : units.get(occupancy.unitId)?.buildingId
    return building === buildingId
  })
  return (
    occupancies.length > 0 &&
    occupancies.every((occupancy) => {
      const number = occupancy.heatMeterReading?.meterNumber
      return number != null && unitHeatNumbers.has(number)
    })
  )
}

function measuredHeat(
  input: CalculationInput,
  circuit: HeatingCircuitTrace,
): {
  heatKwh: number
  source: EnergyBalanceHeatSource
  hotWater: number
} | null {
  const entity = input.heatingCircuits.find(
    ({ id }) => id === circuit.heatingCircuitId,
  )
  if (entity?.generatedHeatKwh)
    return {
      heatKwh: entity.generatedHeatKwh,
      source: 'generator_meter',
      hotWater: 0,
    }
  const metered =
    entity?.consumptionMode === 'metered_kwh' ||
    usesUnitHeatMeters(input, circuit.buildingId)
  if (!metered || circuit.split.areaOnlySection9a) return null
  const hotWater = circuit.warmWater.energy?.heatKwh ?? 0
  return {
    heatKwh: circuit.split.consumptionDenominator + hotWater,
    source: 'unit_heat_meters',
    hotWater,
  }
}

/** Energiebilanz aller Heizkreise eines berechneten Abrechnungsjahres. */
export function heatingEnergyBalance(
  input: CalculationInput,
  output: CalculationOutput,
  bands: EnergyBalanceBands = DEFAULT_ENERGY_BALANCE_BANDS,
): CircuitEnergyBalance[] {
  return output.heating.trace.circuits.map((circuit) => {
    const sources = sourcesOf(input, circuit)
    const energyInputKwh = sources.reduce((sum, s) => sum + s.energyKwh, 0)
    const heatPumpInputKwh = sources
      .filter(({ heatPump }) => heatPump)
      .reduce((sum, s) => sum + s.energyKwh, 0)
    const pumpShare = energyInputKwh > 0 ? heatPumpInputKwh / energyInputKwh : 0
    const generator: EnergyBalanceGenerator =
      heatPumpInputKwh <= 0 ? 'boiler' : pumpShare >= 1 ? 'heat_pump' : 'hybrid'
    const hasPump = sources.some(({ heatPump }) => heatPump)
    const share = energyInputKwh > 0 ? pumpShare : hasPump ? 1 : 0
    const expected = {
      min: round(
        bands.boiler.min * (1 - share) + bands.heatPump.min * share,
        3,
      ),
      max: round(
        bands.boiler.max * (1 - share) + bands.heatPump.max * share,
        3,
      ),
    }
    const heat = measuredHeat(input, circuit)
    const incomplete =
      energyInputKwh <= 0 || sources.some(({ problem }) => problem !== null)
    const ratio =
      heat && !incomplete ? round(heat.heatKwh / energyInputKwh, 3) : null
    const status: CircuitEnergyBalance['status'] = incomplete
      ? 'energy_input_incomplete'
      : ratio === null
        ? 'no_heat_measurement'
        : ratio < expected.min
          ? 'below_band'
          : ratio > expected.max
            ? 'above_band'
            : 'ok'
    return {
      buildingId: circuit.buildingId,
      heatingCircuitId: circuit.heatingCircuitId,
      generator,
      sources,
      energyInputKwh: round(energyInputKwh, 1),
      heatPumpInputKwh: round(heatPumpInputKwh, 1),
      heatKwh: heat ? round(heat.heatKwh, 1) : null,
      heatSource: heat?.source ?? null,
      hotWaterHeatKwh: round(heat?.hotWater ?? 0, 1),
      ratio,
      expected,
      status,
    }
  })
}

/**
 * Energiebilanz eines Abrechnungsjahres mit Vergleich zum Vorjahr desselben
 * Objekts (gleiches Gebäude), sofern das Vorjahr im System berechenbar ist.
 */
export function heatingEnergyBalanceForPeriod(
  data: AppDataFile,
  period: Readonly<BillingPeriod>,
  bands: EnergyBalanceBands = DEFAULT_ENERGY_BALANCE_BANDS,
): CircuitEnergyBalance[] {
  const balanceOf = (id: string) => {
    const input = createCalculationInput(data, id)
    return heatingEnergyBalance(input, calculateBilling(input), bands)
  }
  const current = balanceOf(period.id)
  const previousPeriod = data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
  if (!previousPeriod) return current
  let previous: CircuitEnergyBalance[]
  try {
    previous = balanceOf(previousPeriod.id)
  } catch {
    return current
  }
  return current.map((circuit) => {
    const match = previous.find(
      ({ buildingId }) => buildingId === circuit.buildingId,
    )
    return match
      ? {
          ...circuit,
          previous: {
            year: previousPeriod.year,
            ratio: match.ratio,
            energyInputKwh: match.energyInputKwh,
            heatKwh: match.heatKwh,
          },
        }
      : circuit
  })
}
