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
  /** CO2-Mieteranteil × Grundkostenanteil je Flächeneinheit. */
  co2BasePrice: number
  /** CO2-Mieteranteil × Verbrauchskostenanteil je Verbrauchseinheit. */
  co2ConsumptionPrice: number
  energySources: EnergySourceCalculationTrace[]
  co2Trace: CircuitCo2Trace
  warmWaterTrace: CircuitWarmWaterTrace
  heatingOperating: number
  operatingElectricity: number
  operatingElectricityIntended: number
  splitTrace: CircuitHeatingSplitTrace
  /** § 9a Abs. 2 HeizKV: Verteilung ausschließlich nach Fläche. */
  areaOnlySection9a: boolean
  /** Vorgabe Betriebsstromanteil in Prozent der Brennstoffkosten. */
  operatingElectricitySharePercent: number
  /** Warmwasserschlüssel (§ 8 Abs. 1 HeizKV); leer = Personen. */
  hotWaterKey: 'persons' | 'area' | 'consumption'
  /** Neues Verfahren (ADR-0010): `hotWaterEnergy` oder `hotWaterAllocation`. */
  hotWaterExtended: boolean
  /** Anteil s nach § 9 Abs. 2/3 auf alle Kosten; `null` = Pauschalverfahren. */
  hotWaterSection9Share: number | null
  /** Warmwasseranteil am CO2-Mieteranteil (nur § 9-Verfahren). */
  hotWaterCo2Tenant: number
  /** Warmwasser je m² × Zeitanteil (Schlüssel `area`/`consumption`). */
  hotWaterAreaPrice: number
  /** Warmwasser je m³ (Schlüssel `consumption`). */
  hotWaterM3Price: number
  /** CO2-Warmwasseranteil je Personenjahr. */
  co2HotWaterPricePerPerson: number
  /** CO2-Warmwasseranteil je m² × Zeitanteil. */
  co2HotWaterAreaPrice: number
  /** CO2-Warmwasseranteil je m³. */
  co2HotWaterM3Price: number
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
