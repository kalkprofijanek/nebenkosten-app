import type {
  BillingPeriod,
  Building,
  CostCategory,
  CostEntry,
  EnergySource,
  FuelDelivery,
  FuelStock,
  HeatingCircuit,
  HeatingSystem,
  Meter,
  MeterReading,
  OccupancyPeriod,
  Prepayment,
  Property,
  Tenancy,
  Unit,
  ValidationIssue,
} from '@nebenkosten/schema'

export const CORE_SNAPSHOT_FORMAT_VERSION = 1 as const

export interface CalculationInput {
  readonly sourceSchemaVersion: number
  readonly billingPeriod: Readonly<BillingPeriod>
  readonly property: Readonly<Property>
  readonly buildings: readonly Readonly<Building>[]
  readonly units: readonly Readonly<Unit>[]
  readonly tenancies: readonly Readonly<Tenancy>[]
  readonly occupancyPeriods: readonly Readonly<OccupancyPeriod>[]
  readonly prepayments: readonly Readonly<Prepayment>[]
  readonly costCategories: readonly Readonly<CostCategory>[]
  readonly costEntries: readonly Readonly<CostEntry>[]
  readonly heatingSystems: readonly Readonly<HeatingSystem>[]
  readonly heatingCircuits: readonly Readonly<HeatingCircuit>[]
  readonly energySources: readonly Readonly<EnergySource>[]
  readonly fuelStocks: readonly Readonly<FuelStock>[]
  readonly fuelDeliveries: readonly Readonly<FuelDelivery>[]
  readonly meters: readonly Readonly<Meter>[]
  readonly meterReadings: readonly Readonly<MeterReading>[]
}

export interface CalculationTotals {
  recordedCostsCents: number
  tenantTotalCents: number
  landlordTotalCents: number
  unallocatedCents: number
  prepaymentsCents: number
  controlDifferenceCents: number
  directCostsCents: number
  internalCostsCents: number
}

export interface CircuitCalculationResult {
  buildingId: string
  heatingTotalCents: number
  baseCents: number
  consumptionCents: number
  fuelConsumptionCents: number
  hotWaterCents: number
  co2CostCents: number
  co2TenantCents: number
  co2LandlordCents: number
  co2TenantPercent: number
  co2IntensityKgPerSqmYear: number
  co2Kg: number
  energyKwh: number
}

export interface HeatingCalculationResult {
  totalCents: number
  baseCostsCents: number
  consumptionCostsCents: number
  fuelConsumptionCents: number
  unallocatedLandlordCents: number
  perCircuit: CircuitCalculationResult[]
}

export interface Co2CalculationResult {
  totalCostCents: number
  tenantCents: number
  landlordCents: number
}

export interface TenantCalculationResult {
  id: string
  isVacancy: boolean
  shareCents: number
  prepaymentCents: number
  balanceCents: number
  status: 'gruen' | 'gelb' | 'rot'
}

export interface CalculationOutput {
  snapshotFormatVersion: typeof CORE_SNAPSHOT_FORMAT_VERSION
  periodDays: number
  totals: CalculationTotals
  heating: HeatingCalculationResult
  co2: Co2CalculationResult
  vacancyLandlordCents: number
  tenants: TenantCalculationResult[]
  warnings: ValidationIssue[]
}
