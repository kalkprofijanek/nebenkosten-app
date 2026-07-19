import type {
  CircuitCalculationResult,
  CircuitOperatingElectricityResult,
  HeatingCircuitTrace,
} from '../contracts'
import type { RawCircuitResult } from '../calculation/types'
import { allocateLargestRemainder } from '../rest-cents'
import { roundCentsHalfAwayFromZero } from '../rounding'

function roundQuantity(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function outputCircuit(
  result: RawCircuitResult,
): CircuitCalculationResult {
  const split = new Map(
    allocateLargestRemainder([
      { id: 'base', exactCents: result.baseCosts },
      { id: 'consumption', exactCents: result.consumptionCosts },
    ]).map(({ id, cents }) => [id, cents]),
  )
  const co2 = new Map(
    allocateLargestRemainder([
      { id: 'tenant', exactCents: result.co2Tenant },
      { id: 'landlord', exactCents: result.co2Landlord },
    ]).map(({ id, cents }) => [id, cents]),
  )
  return {
    buildingId: result.buildingId,
    heatingTotalCents: roundCentsHalfAwayFromZero(result.heatingTotal),
    baseCents: split.get('base')!,
    consumptionCents: split.get('consumption')!,
    fuelConsumptionCents: roundCentsHalfAwayFromZero(result.fuelConsumption),
    hotWaterCents: roundCentsHalfAwayFromZero(result.hotWater),
    co2CostCents: roundCentsHalfAwayFromZero(result.co2Cost),
    co2TenantCents: co2.get('tenant')!,
    co2LandlordCents: co2.get('landlord')!,
    co2TenantPercent: roundQuantity(result.co2TenantPercent, 3),
    co2IntensityKgPerSqmYear: roundQuantity(result.co2Intensity, 3),
    co2Kg: roundQuantity(result.co2Kg, 3),
    energyKwh: roundQuantity(result.energyKwh, 3),
  }
}

export function outputCircuitTrace(
  result: RawCircuitResult,
  operatingElectricity: CircuitOperatingElectricityResult,
): HeatingCircuitTrace {
  const fifoConsumptionCostCents = roundCentsHalfAwayFromZero(
    result.fuelConsumption + result.co2Cost,
  )
  const minusCo2Cents = roundCentsHalfAwayFromZero(result.co2Cost)
  const minusHotWaterCents = roundCentsHalfAwayFromZero(result.hotWater)
  const plusHeatingOperatingCostsCents = roundCentsHalfAwayFromZero(
    result.heatingOperating,
  )
  const plusOperatingElectricityCents = roundCentsHalfAwayFromZero(
    result.operatingElectricity,
  )
  const heatingPoolCents = roundCentsHalfAwayFromZero(result.heatingTotal)
  const roundingDifferenceCents =
    heatingPoolCents -
    (fifoConsumptionCostCents -
      minusCo2Cents -
      minusHotWaterCents +
      plusHeatingOperatingCostsCents +
      plusOperatingElectricityCents)

  return {
    buildingId: result.buildingId,
    heatingCircuitId: result.heatingCircuitId,
    energySources: result.energySources,
    co2: result.co2Trace,
    warmWater: result.warmWaterTrace,
    heatingOperatingCostsCents: roundCentsHalfAwayFromZero(
      result.heatingOperating,
    ),
    operatingElectricity,
    split: result.splitTrace,
    reconciliation: {
      fifoConsumptionCostCents,
      minusCo2Cents,
      fuelAfterCo2Cents: roundCentsHalfAwayFromZero(result.fuelConsumption),
      minusHotWaterCents,
      plusHeatingOperatingCostsCents,
      plusOperatingElectricityCents,
      roundingDifferenceCents,
      heatingPoolCents,
    },
  }
}
