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

/**
 * Wärmemenge der Warmwasserbereitung nach § 9 Abs. 2 HeizKV und daraus
 * abgeleiteter Anteil am Energieeinsatz (§ 9 Abs. 3, ADR-0010).
 */
export interface CircuitHotWaterEnergyTrace {
  method: 'heat_meter' | 'volume_formula' | 'area_formula'
  /** Gemessenes Volumen V in m³ (nur `volume_formula`). */
  volumeM3: number | null
  /** Mittlere Warmwassertemperatur tw in °C (nur `volume_formula`). */
  temperatureC: number | null
  temperatureEstimated: boolean
  /** Wohnfläche A_Wohn in m² (nur `area_formula`). */
  areaSqm: number | null
  /** Herkunft der Fläche: Eingabe oder Summe der Wohnflächen des Heizkreises. */
  areaSource: 'input' | 'circuit_usable_area' | null
  condensingNaturalGas: boolean
  /** Q vor dem Faktor 1,11 für brennwertbezogene Erdgasabrechnung. */
  heatKwhBeforeCondensing: number
  /** Maßgebliche Wärmemenge Q in kWh. */
  heatKwh: number
  /** Energieeinsatz des Heizkreises in kWh (Brennstoffverbrauch × Heizwert). */
  energyInputKwh: number
  /** Ungerundeter Anteil s = min(1, Q ÷ Energieeinsatz) als Zahl 0–1. */
  shareExact: number
  /** Q war größer als der Energieeinsatz; s wurde auf 1 begrenzt. */
  capped: boolean
  /**
   * Energieeinsatz unbekannt (Menge oder Heizwert fehlt); s nicht
   * bestimmbar, es gilt ersatzweise `hotWaterSharePercent`.
   */
  energyInputMissing: boolean
}

/** Warmwasseranteile je Kostenart nach § 9 Abs. 1 HeizKV (gerundet, Summe = Topf). */
export interface CircuitHotWaterCostSplit {
  fuelCents: number
  operatingElectricityCents: number
  heatingOperatingCents: number
  /** Warmwasseranteil am CO2-Mieteranteil (§ 7 Abs. 1 CO2KostAufG). */
  co2TenantCents: number
}

/** Verteilschlüssel der Warmwasserkosten (§ 8 Abs. 1 HeizKV). */
export interface CircuitHotWaterAllocationTrace {
  key: 'persons' | 'area' | 'consumption'
  /** Verbrauchsabhängiger Anteil in Prozent (nur `consumption`), sonst 0. */
  consumptionSharePercent: number
  /** Flächenart des Flächenanteils (wie der Grundkostenschlüssel). */
  areaBasis: 'usable_area' | 'heated_area'
  /** Fläche × Zeitanteil aller Nutzungen, ungerundet (`area`/`consumption`). */
  areaTimeDenominator: number | null
  /** Summe der Warmwasser-m³ aller Nutzungen, ungerundet (`consumption`). */
  warmWaterM3Denominator: number | null
  /** Personen × Zeitanteil der Mieter, ungerundet (`persons`). */
  personTimeDenominator: number | null
  /** Flächenabhängiger Teil des Warmwassertopfs in Cent (gerundet). */
  areaCents: number
  /** Verbrauchsabhängiger Teil des Warmwassertopfs in Cent (gerundet). */
  consumptionCents: number
  /** Kein erfasster Warmwasserverbrauch: ersatzweise 100 % nach Fläche. */
  consumptionFallbackToArea: boolean
}

/**
 * Kontrolle der Warmwasserverteilung: Summe der gerundeten Einzelbeträge
 * aller Nutzungen gegenüber dem Topf; die Restcents werden ausgewiesen statt
 * stillschweigend dem Leerstand zugerechnet.
 */
export interface CircuitHotWaterDistributionTrace {
  tenantsCents: number
  vacancyCents: number
  /** Kürzung nach § 12 Abs. 1 HeizKV auf den Warmwasseranteil (Vermieter). */
  section12ReductionCents: number
  /** Topf − Mieter − Leerstand − Kürzung (Rundung der Einzelbeträge). */
  roundingDifferenceCents: number
}

export interface CircuitWarmWaterTrace {
  /**
   * `fuel_percentage_by_persons`: bisheriges Pauschalverfahren;
   * `fuel_percentage`: Pauschalanteil mit Schlüssel nach § 8 HeizKV;
   * `section9_energy`: Anteil nach § 9 Abs. 2/3 HeizKV.
   */
  method:
    | 'none'
    | 'fuel_percentage_by_persons'
    | 'fuel_percentage'
    | 'section9_energy'
  sharePercent: number
  poolCents: number
  personTimeDenominator: number
  fallbackOccupancyIds: string[]
  /** § 9 Abs. 2 HeizKV; nur bei gesetztem `hotWaterEnergy`. */
  energy?: CircuitHotWaterEnergyTrace
  /** Warmwasseranteile je Kostenart; nur bei gesetztem `hotWaterEnergy`. */
  costSplit?: CircuitHotWaterCostSplit
  /** Schlüssel und ungerundete Nenner; fehlt in älteren Rechenständen. */
  allocation?: CircuitHotWaterAllocationTrace
  /** Verteilungskontrolle; fehlt in älteren Rechenständen. */
  distribution?: CircuitHotWaterDistributionTrace
}

export interface CircuitHeatingSplitTrace {
  baseSharePercent: number
  consumptionSharePercent: number
  baseAreaBasis: 'usable_area' | 'heated_area'
  baseDenominator: number
  consumptionDenominator: number
  baseCents: number
  consumptionCents: number
  /**
   * Zeitanteiliger Anteil der beheizten Fläche mit geschätztem Verbrauch an
   * allen Mieter-Nutzungen des Heizkreises (0–100). Fehlt in älteren
   * Rechenständen.
   */
  estimatedAreaSharePercent?: number
  /**
   * § 9a Abs. 2 HeizKV: Über 25 % geschätzter Fläche werden die Heizkosten
   * ausschließlich nach Fläche verteilt. Fehlt in älteren Rechenständen.
   */
  areaOnlySection9a?: boolean
}

/** § 9a Abs. 2 HeizKV: Grenze des geschätzten Flächenanteils. */
export const SECTION_9A_ESTIMATED_AREA_LIMIT = 0.25

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
  /**
   * Vorgabewert Betriebsstromanteil in Prozent der Brennstoffkosten
   * (Heizkreis bzw. Objektvorgabe); fehlt in älteren Rechenständen.
   */
  operatingElectricitySharePercent?: number
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
  /**
   * Davon Warmwasseranteil der CO2-Kosten (in `heatingCo2Cents` enthalten);
   * nur bei Aufteilung nach § 9 Abs. 2 HeizKV.
   */
  hotWaterCo2Cents?: number
}

/**
 * Eigene Bezugsgröße der Warmwasserverteilung (ungerundet). Nur bei
 * zentraler Warmwasserbereitung mit `hotWaterEnergy` oder
 * `hotWaterAllocation`.
 */
export interface TenantHotWaterBasis {
  key: 'persons' | 'area' | 'consumption'
  /** Personen (ohne Angabe 1) × Zeitanteil. */
  personTime: number
  /** Fläche (Grundkostenart) × Zeitanteil. */
  areaTime: number
  /** Erfasster Warmwasserverbrauch in m³. */
  warmWaterM3: number
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
  /** Warmwasser-Bezugsgröße (ADR-0010); fehlt im bisherigen Verfahren. */
  hotWaterBasis?: TenantHotWaterBasis
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
