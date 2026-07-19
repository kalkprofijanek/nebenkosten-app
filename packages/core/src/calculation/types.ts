import type {
  CostCategory,
  OccupancyPeriod,
  Tenancy,
  Unit,
} from '@nebenkosten/schema'
import type {
  CalculationInput,
  CircuitCo2Trace,
  CircuitHeatingSplitTrace,
  CircuitWarmWaterTrace,
  EnergySourceCalculationTrace,
} from '../contracts'

export interface OccupancyContext {
  occupancy: Readonly<OccupancyPeriod>
  unit: Readonly<Unit>
  tenancy?: Readonly<Tenancy>
  days: number
  timeFactor: number
  buildingId?: string
  usableArea: number
  heatedArea: number
  persons: number
  consumptionUnits: number
}

export interface AllocationBasis {
  usableArea: number
  heatedArea: number
  persons: number
  consumptionUnits: number
  residentialUnits: number
}

export interface RawCircuitResult {
  buildingId: string
  heatingCircuitId: string | null
  heatingTotal: number
  baseCosts: number
  consumptionCosts: number
  fuelConsumption: number
  hotWater: number
  co2Cost: number
  co2Tenant: number
  co2Landlord: number
  co2TenantPercent: number
  co2Intensity: number
  co2Kg: number
  energyKwh: number
  basePrice: number
  consumptionPrice: number
  hotWaterPricePerPerson: number
  co2PricePerConsumptionUnit: number
  energySources: EnergySourceCalculationTrace[]
  co2Trace: CircuitCo2Trace
  warmWaterTrace: CircuitWarmWaterTrace
  heatingOperating: number
  operatingElectricity: number
  operatingElectricityIntended: number
  splitTrace: CircuitHeatingSplitTrace
}

export interface RawCostPosition {
  category: Readonly<CostCategory>
  amount: number
  effectiveAmount: number
  freeLandlordAmount: number
  basis: AllocationBasis
}

export interface AggregateFuelResult {
  fullCost: number
  energyKwh: number
  co2Kg: number
  sources: EnergySourceCalculationTrace[]
}

export interface PreparedCircuit {
  buildingId: string
  circuit: CalculationInput['heatingCircuits'][number] | undefined
  contexts: OccupancyContext[]
  fuel: AggregateFuelResult
}
