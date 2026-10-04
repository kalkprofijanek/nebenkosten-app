import type {
  AllocationScope,
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
import type { MeteredConsumptionTrace } from '../metered-consumption'

export const CORE_SNAPSHOT_FORMAT_VERSION = 3 as const
export const HEATING_TRACE_FORMAT_VERSION = 1 as const

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

export interface OperatingElectricitySourceResult {
  costCategoryId: string
  availableCents: number
  deductedCents: number
}

export interface OperatingElectricityResult {
  sourceBudgetCents: number
  intendedCents: number
  movedCents: number
  uncoveredCents: number
  sources: OperatingElectricitySourceResult[]
}

export interface CircuitOperatingElectricityResult {
  intendedCents: number
  movedCents: number
  uncoveredCents: number
}

export interface FuelLotTrace {
  kind: 'opening_stock' | 'delivery'
  sourceId: string
  date: string | null
  quantity: number
  valueCents: number
}

export interface EnergySourceCalculationTrace {
  energySourceId: string
  quantityUnit: string | null
  method: 'fifo' | 'direct_cost_without_quantity'
  lots: FuelLotTrace[]
  availableQuantity: number
  availableValueCents: number
  requestedRemainingQuantity: number
  valuedRemainingQuantity: number
  remainingValueCents: number
  consumedQuantity: number
  fifoConsumptionCostCents: number
  overstockQuantity: number
  calorificValueKwhPerUnit: number
  energyKwh: number
  co2FactorKgPerKwh: number
  co2Kg: number
}

export interface CircuitCo2Trace {
  mode: 'auto' | 'manual'
  pricePerTonCents: number | null
  heatedAreaSqm: number
  periodDays: number
  annualizationFactor: number
  intensityKgPerSqmYear: number
  tier: number | 'manual'
  tenantPercent: number
  landlordPercent: number
  totalCents: number
  tenantCents: number
  landlordCents: number
}

export interface CircuitWarmWaterTrace {
  method: 'none' | 'fuel_percentage_by_persons'
  sharePercent: number
  poolCents: number
  personTimeDenominator: number
  fallbackOccupancyIds: string[]
}

export interface CircuitHeatingSplitTrace {
  baseSharePercent: number
  consumptionSharePercent: number
  baseAreaBasis: 'usable_area' | 'heated_area'
  baseDenominator: number
  consumptionDenominator: number
  baseCents: number
  consumptionCents: number
}

export interface CircuitHeatingReconciliation {
  fifoConsumptionCostCents: number
  minusCo2Cents: number
  fuelAfterCo2Cents: number
  minusHotWaterCents: number
  plusHeatingOperatingCostsCents: number
  plusOperatingElectricityCents: number
  roundingDifferenceCents: number
  heatingPoolCents: number
}

export interface HeatingCircuitTrace {
  buildingId: string
  heatingCircuitId: string | null
  energySources: EnergySourceCalculationTrace[]
  co2: CircuitCo2Trace
  warmWater: CircuitWarmWaterTrace
  heatingOperatingCostsCents: number
  operatingElectricity: CircuitOperatingElectricityResult
  split: CircuitHeatingSplitTrace
  reconciliation: CircuitHeatingReconciliation
}

export interface HeatingCalculationTrace {
  traceFormatVersion: typeof HEATING_TRACE_FORMAT_VERSION
  operatingElectricity: OperatingElectricityResult
  circuits: HeatingCircuitTrace[]
}

export interface HeatingCalculationResult {
  totalCents: number
  baseCostsCents: number
  consumptionCostsCents: number
  fuelConsumptionCents: number
  unallocatedLandlordCents: number
  perCircuit: CircuitCalculationResult[]
  operatingElectricity: OperatingElectricityResult
  trace: HeatingCalculationTrace
}

export interface Co2CalculationResult {
  totalCostCents: number
  tenantCents: number
  landlordCents: number
}

export interface TenantOperatingCostItem {
  costCategoryId: string
  amountCents: number
}

/**
 * Rein informative Kostenart-Aufschlüsselung je Mieter (PR 11, für die
 * Einzelabrechnung/§259 BGB). Unabhängig von der Restcent-Verteilung der
 * verbindlichen `shareCents`/`balanceCents` berechnet — Einzelposten können
 * daher in Summe geringfügig von der Gesamtsumme abweichen.
 */
export interface TenantCostBreakdown {
  operatingByCategory: TenantOperatingCostItem[]
  heatingBaseCents: number
  heatingConsumptionCents: number
  hotWaterCents: number
  heatingCo2Cents: number
}

/**
 * Eigene Bezugsgrößen eines Nutzungszeitraums (Trace für die
 * Einzelabrechnung nach § 259 BGB). Flächen sind ungewichtet; der
 * Zeitfaktor steht separat in `TenantCalculationResult.timeFactor`.
 */
export interface TenantAllocationBasis {
  buildingId: string | null
  usableAreaSqm: number
  heatedAreaSqm: number
  persons: number
  /** Verbrauch für die Heizkostenverteilung (gemessene kWh oder Einheiten). */
  consumption: number
  consumptionUnit: 'kWh' | 'Einheiten'
}

/** Lohnanteil einer Kostenart, der auf diesen Nutzer entfällt (§ 35a EStG). */
export interface TenantSection35aItem {
  costCategoryId: string
  laborCents: number
}

/**
 * Geschätzter Lohn-/Fahrtkostenanteil für die Steuererklärung des Mieters
 * (§ 35a EStG, Legacy `lohn35a`). Rein informativ, ohne Einfluss auf Anteil
 * und Saldo. Heizungs-Betriebskosten werden nach dem Anteil des Nutzers an
 * Grund- und Verbrauchskosten seines Heizkreises zugerechnet.
 */
export interface TenantSection35a {
  totalCents: number
  items: TenantSection35aItem[]
}

export interface TenantCalculationResult {
  id: string
  isVacancy: boolean
  shareCents: number
  prepaymentCents: number
  balanceCents: number
  status: 'gruen' | 'gelb' | 'rot'
  costBreakdown: TenantCostBreakdown
  /** Nutzungstage im Abrechnungszeitraum (ab Trace-Erweiterung, optional für alte Snapshots). */
  days?: number
  /** Nutzungstage ÷ Periodentage (Kalendertage, § 9b HeizKV). */
  timeFactor?: number
  ownBasis?: TenantAllocationBasis
  /** § 35a EStG; fehlt in Snapshots vor seiner Einführung. */
  section35a?: TenantSection35a
}

/**
 * Umlage-Nachweis je Kostenart (Trace, rein informativ). Alle Beträge sind
 * einzeln kaufmännisch gerundet; die verbindlichen Summen stehen in
 * `totals`.
 */
export interface OperatingPositionTrace {
  costCategoryId: string
  label: string
  betrkvCategory: string | null
  allocationKey: string | null
  scope: AllocationScope | null
  /** Betrag laut Belegen bzw. Kostenart (brutto). */
  grossCents: number
  /** Nicht umlagefähiger Anteil (Umlagegrad < 100 % oder NICHT_UML). */
  nonAllocableCents: number
  /** Umlagefähiger Anteil vor der Betriebsstrom-Umbuchung. */
  allocableCents: number
  /** In die Heizkosten umgebuchter Betriebsstrom. */
  operatingElectricityDeductedCents: number
  /** Tatsächlich nach dem Schlüssel verteilter Betrag. */
  distributedCents: number
  /** Heizungs-Betriebskosten fließen in den Heiztopf statt in die Umlage. */
  distribution: 'key' | 'heating_pool' | 'direct' | 'not_allocable'
  /** Gesamteinheiten des Schlüssels (zeitgewichtet), `null` ohne Schlüssel. */
  denominator: number | null
  denominatorUnit: 'm²' | 'Einheiten' | 'kWh' | 'WE' | null
  /** Auf Leerstand/nicht vermietete Anteile entfallender Betrag (Vermieter). */
  vacancyCents: number
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
  meteringTrace?: MeteredConsumptionTrace
  /** Umlage-Nachweis je Kostenart; fehlt in älteren Snapshots. */
  operatingPositions?: OperatingPositionTrace[]
}
