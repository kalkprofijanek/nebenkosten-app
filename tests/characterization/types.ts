/**
 * Typen fuer die Characterization-Fixtures (PR 05).
 *
 * `Scenario` beschreibt einen frei erfundenen Abrechnungsfall fachlich
 * kompakt (einzige Wahrheitsquelle: `scenarios.json`). Daraus wird die
 * v4-Eingabe-Fixture (`build-app-data.ts`) erzeugt und beim Testlauf gegen
 * `appDataFileSchema` validiert.
 *
 * `Golden` haelt die erwarteten Ergebnisse in ganzen Cent. Sie wurden mit
 * der faktentreu extrahierten Legacy-Engine (`Engine.rechne`) aus denselben
 * Szenarien hergeleitet und verifiziert (siehe README.md, „Herleitung der
 * Golden-Werte"). PR 06 vergleicht das Ergebnis seiner neuen Engine gegen
 * diese Werte.
 */

/** Umlageschluessel im Szenario (v4-Nomenklatur). */
export type ScenarioAllocationKey =
  | 'usable_area'
  | 'heated_area'
  | 'consumption_units'
  | 'residential_units'
  | 'direct'

/** Geltungsbereich einer Kostenart bzw. eines Nutzers. */
export type ScenarioScope =
  | { kind: 'property' }
  | { kind: 'building'; buildingId: string }
  | { kind: 'house'; houseKey: string }

export interface ScenarioDefaults {
  consumptionPercent: number
  basePercent: number
  /** Bezugsflaeche fuer den Grundkostenanteil (Legacy `grundkosten_umlage`). */
  baseArea: 'usable' | 'heated'
  operatingElectricityPercent?: number
}

export interface ScenarioTotals {
  usableAreaSqm?: number
  heatedAreaSqm?: number
  persons?: number
  consumptionUnits?: number
  residentialUnits?: number
}

export interface ScenarioBuilding {
  id: string
  name: string
  shortName: string
  energyType: string | null
  mandatePrefixes: string[]
}

export interface ScenarioDelivery {
  date: string
  quantity: number
  unit: string
  amountEur: number
}

export interface ScenarioSource {
  key: string
  name: string
  type: string
  calorificKwh: number
  co2FactorKgPerKwh: number
  openingQuantity?: number
  openingUnit?: string
  openingValueEur?: number
  remainingQuantity?: number
  deliveries: ScenarioDelivery[]
}

export interface ScenarioCircuitCo2 {
  mode: 'auto' | 'manual'
  pricePerTonEur?: number
  factorKgPerKwh?: number | null
  levyEur?: number
  landlordPercent?: number
  intensity?: number
}

export interface ScenarioCircuitOverrides {
  consumptionPercent?: number
  basePercent?: number
  operatingElectricityPercent?: number
}

export interface ScenarioCircuit {
  buildingId: string
  hasCentralHotWater: boolean
  hotWaterPercent: number | null
  overrides: ScenarioCircuitOverrides | null
  co2: ScenarioCircuitCo2
  sources: ScenarioSource[]
}

export interface ScenarioCost {
  id: string
  kind: 'operating' | 'water' | 'heating'
  label: string
  statementText: string
  betrkv: string
  allocationKey: ScenarioAllocationKey
  scope: ScenarioScope
  amountEur: number
  operatingElectricitySource?: boolean
  allocablePercent?: number
  laborPercent?: number
  hideWhenZero?: boolean
}

export interface ScenarioPrepay {
  mode: 'monthly' | 'annual' | 'none'
  amountEur?: number
}

export interface ScenarioTenant {
  id: string
  unitId: string
  buildingId: string
  mandateSuffix: string
  kind: 'tenant' | 'vacancy'
  from?: string
  to?: string
  usableAreaSqm?: number
  heatedAreaSqm?: number
  persons?: number
  consumptionUnits?: number
  consumptionUnitsEstimated?: boolean
  applyReduction?: boolean
  prepay: ScenarioPrepay
  costScope?: ScenarioScope | null
}

export interface Scenario {
  id: string
  title: string
  coverage: string[]
  year: number
  from: string
  to: string
  defaults: ScenarioDefaults
  totals?: ScenarioTotals
  buildings: ScenarioBuilding[]
  circuits: ScenarioCircuit[]
  costs: ScenarioCost[]
  tenants: ScenarioTenant[]
}

export interface ScenarioFile {
  scenarios: Scenario[]
}

export interface GoldenTotals {
  /** Legacy `erfassteKosten` (Brennstoff + Heizbetrieb + Freianteil + Betrieb/Wasser). */
  recordedCostsCents: number
  /** Legacy `gesamtkosten` (Summe der Nutzeranteile ohne Leerstand). */
  tenantTotalCents: number
  /** Legacy `vermieterKosten` (CO2-Vermieter + Leerstand + unverteilte Heizkosten + Freianteil). */
  landlordTotalCents: number
  /** Reserviert (Legacy-Kontrollidentitaet kennt keinen separaten Posten; siehe docs/ROUNDING.md). */
  unallocatedCents: number
  /** Legacy `vzSumme` (Vorauszahlungen der bewohnten Einheiten). */
  prepaymentsCents: number
  /** Legacy `kontrollDiff` = recorded - tenant - landlord (Soll 0). */
  controlDifferenceCents: number
  /** Legacy `direktKostenSum` — nicht automatisch verteilt (informativ). */
  directCostsCents: number
  /** Legacy `interneKostenSum` (NICHT_UML) — nicht umgelegt (informativ). */
  internalCostsCents: number
}

export interface GoldenCircuit {
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

export interface GoldenHeating {
  totalCents: number
  baseCostsCents: number
  consumptionCostsCents: number
  fuelConsumptionCents: number
  unallocatedLandlordCents: number
  perCircuit: GoldenCircuit[]
}

export interface GoldenCo2 {
  totalCostCents: number
  tenantCents: number
  landlordCents: number
}

export interface GoldenTenant {
  id: string
  isVacancy: boolean
  shareCents: number
  prepaymentCents: number
  balanceCents: number
  status: 'gruen' | 'gelb' | 'rot'
}

export interface Golden {
  id: string
  periodDays: number
  totals: GoldenTotals
  heating: GoldenHeating
  co2: GoldenCo2
  vacancyLandlordCents: number
  tenants: GoldenTenant[]
}
