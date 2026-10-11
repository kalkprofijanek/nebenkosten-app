/**
 * Warmwasser bei verbundenen Anlagen nach § 9 HeizKV (ADR-0010).
 *
 * § 9 Abs. 2: Die Wärmemenge Q der zentralen Warmwasserbereitung wird mit
 * einem Wärmezähler gemessen; ersatzweise Q = 2,5 × V × (tw − 10) mit dem
 * gemessenen Volumen V (m³) und der mittleren Temperatur tw (°C); wenn weder
 * Q noch V gemessen werden können, Q = 32 × A_Wohn. Bei brennwertbezogener
 * Erdgasabrechnung ist Q mit 1,11 zu multiplizieren.
 * § 9 Abs. 3: Der Anteil am Brennstoffverbrauch ist B = Q ÷ Hᵢ; bezogen auf
 * den Energieeinsatz des Heizkreises in kWh ergibt sich s = Q ÷ Energieeinsatz.
 */
import type { HotWaterEnergy } from '@nebenkosten/schema'
import type {
  CircuitHotWaterEnergyTrace,
  EnergySourceCalculationTrace,
} from '../contracts'

/** Faktor 2,5 kWh/(m³·K) der Volumenformel (§ 9 Abs. 2 Satz 2 HeizKV). */
export const HOT_WATER_VOLUME_FACTOR = 2.5
/** Bezugstemperatur 10 °C der Volumenformel. */
export const HOT_WATER_REFERENCE_TEMPERATURE_C = 10
/** 32 kWh je m² Wohnfläche (§ 9 Abs. 2 Satz 4 HeizKV). */
export const HOT_WATER_AREA_FACTOR_KWH_PER_SQM = 32
/** Brennwertbezogene Erdgasabrechnung: Q × 1,11 (§ 9 Abs. 2 Satz 5 HeizKV). */
export const CONDENSING_NATURAL_GAS_FACTOR = 1.11

export interface HotWaterHeat {
  readonly heatKwhBeforeCondensing: number
  readonly heatKwh: number
  readonly areaSqm: number | null
  readonly areaSource: 'input' | 'circuit_usable_area' | null
}

/**
 * Wärmemenge Q in kWh nach § 9 Abs. 2 HeizKV.
 *
 * `circuitUsableAreaSqm` ist die Ersatzfläche, wenn bei der Flächenformel
 * keine Fläche angegeben ist: Summe der Wohnflächen (`usableAreaSqm`) der
 * Einheiten des Heizkreises. Offene Entscheidung: Die Verordnung spricht von
 * „Wohn- oder Nutzfläche“ der versorgten Räume; ob statt der Wohnfläche die
 * beheizte Fläche maßgeblich sein soll, entscheidet der Vermieter durch
 * Angabe von `areaSqm`. Ebenfalls offen: Die 32 kWh/m² beziehen sich auf ein
 * Jahr; bei abweichender Länge des Abrechnungszeitraums wird nicht
 * zeitanteilig umgerechnet.
 */
export function hotWaterHeatKwh(
  energy: Readonly<HotWaterEnergy>,
  circuitUsableAreaSqm: number,
): HotWaterHeat {
  let heatKwhBeforeCondensing: number
  let areaSqm: number | null = null
  let areaSource: HotWaterHeat['areaSource'] = null
  switch (energy.method) {
    case 'heat_meter':
      heatKwhBeforeCondensing = energy.heatKwh
      break
    case 'volume_formula':
      heatKwhBeforeCondensing =
        HOT_WATER_VOLUME_FACTOR *
        energy.volumeM3 *
        (energy.temperatureC - HOT_WATER_REFERENCE_TEMPERATURE_C)
      break
    case 'area_formula':
      areaSqm = energy.areaSqm ?? circuitUsableAreaSqm
      areaSource = energy.areaSqm != null ? 'input' : 'circuit_usable_area'
      heatKwhBeforeCondensing = HOT_WATER_AREA_FACTOR_KWH_PER_SQM * areaSqm
      break
  }
  const heatKwh = energy.condensingNaturalGas
    ? heatKwhBeforeCondensing * CONDENSING_NATURAL_GAS_FACTOR
    : heatKwhBeforeCondensing
  return { heatKwhBeforeCondensing, heatKwh, areaSqm, areaSource }
}

/**
 * Energieeinsatz des Heizkreises in kWh: Brennstoffverbrauch × Heizwert
 * (ungerundet aus der FIFO-Rechnung); Energiequellen in kWh ohne Heizwert
 * (Strom, Fernwärme) zählen mit ihrer verbrauchten Menge.
 */
export function circuitEnergyInputKwh(
  calorificEnergyKwh: number,
  sources: readonly EnergySourceCalculationTrace[],
): number {
  return sources.reduce(
    (sum, source) =>
      source.energyKwh === 0 && source.quantityUnit === 'kWh'
        ? sum + source.consumedQuantity
        : sum,
    calorificEnergyKwh,
  )
}

/** Anteil s = min(1, Q ÷ Energieeinsatz); `null` ohne Energieeinsatz. */
export function hotWaterEnergyShare(
  heatKwh: number,
  energyInputKwh: number,
): { readonly share: number; readonly capped: boolean } | null {
  if (!(energyInputKwh > 0)) return null
  const exact = heatKwh / energyInputKwh
  return exact > 1
    ? { share: 1, capped: true }
    : { share: exact, capped: false }
}

/** Vollständiger Trace der Wärmemenge und des Anteils (§ 9 Abs. 2/3). */
export function hotWaterEnergyTrace(
  energy: Readonly<HotWaterEnergy>,
  circuitUsableAreaSqm: number,
  energyInputKwh: number,
): CircuitHotWaterEnergyTrace {
  const heat = hotWaterHeatKwh(energy, circuitUsableAreaSqm)
  const share = hotWaterEnergyShare(heat.heatKwh, energyInputKwh)
  return {
    method: energy.method,
    volumeM3: energy.method === 'volume_formula' ? energy.volumeM3 : null,
    temperatureC:
      energy.method === 'volume_formula' ? energy.temperatureC : null,
    temperatureEstimated:
      energy.method === 'volume_formula'
        ? Boolean(energy.temperatureEstimated)
        : false,
    areaSqm: heat.areaSqm,
    areaSource: heat.areaSource,
    condensingNaturalGas: Boolean(energy.condensingNaturalGas),
    heatKwhBeforeCondensing: heat.heatKwhBeforeCondensing,
    heatKwh: heat.heatKwh,
    energyInputKwh,
    shareExact: share?.share ?? 0,
    capped: share?.capped ?? false,
    energyInputMissing: share === null,
  }
}

/** Bezugsgrößen einer Nutzung für die Warmwasserverteilung. */
export interface HotWaterUnits {
  readonly personTime: number
  readonly areaTime: number
  readonly warmWaterM3: number
}
