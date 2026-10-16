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
  HotWaterDenominatorMethod,
  HotWaterDenominatorSourceTrace,
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

/**
 * Energieeinsatz einer Energiequelle in kWh: Verbrauch × Heizwert, ohne
 * Heizwert bei Mengen in kWh die verbrauchte Menge (wie
 * `circuitEnergyInputKwh`).
 */
export function sourceEnergyInputKwh(
  source: EnergySourceCalculationTrace,
): number {
  if (source.energyKwh !== 0) return source.energyKwh
  return source.quantityUnit === 'kWh' ? source.consumedQuantity : 0
}

/** Energiequelle mit Wärmepumpen-Kennzeichen für den Nenner von s. */
export interface HotWaterDenominatorSourceInput {
  readonly trace: EnergySourceCalculationTrace
  readonly label?: string | null
  readonly heatPump: boolean
  readonly seasonalPerformanceFactor: number | null
  readonly seasonalPerformanceFactorEstimated?: boolean
  readonly seasonalPerformanceFactorReason?: string | null
}

export interface HotWaterDenominator {
  readonly method: HotWaterDenominatorMethod
  readonly denominatorKwh: number
  readonly heatPumpWithoutHeatOutput: boolean
  readonly sources: readonly HotWaterDenominatorSourceTrace[]
}

/**
 * Nenner des Warmwasseranteils s (ADR-0010 „Wärmepumpen“).
 *
 * § 9 Abs. 3 HeizKV (B = Q ÷ Hᵢ) setzt Q ins Verhältnis zum Brennstoff.
 * Bei elektrischen Wärmepumpen ist der Energieeinsatz Strom, aus dem ein
 * Vielfaches an Wärme entsteht; Q ÷ Strom-kWh würde den Warmwasseranteil
 * um die Jahresarbeitszahl überhöhen. Die HeizKV regelt diesen Fall nicht.
 * Offene Entscheidung (sachgerechte Auslegung): Q wird ins Verhältnis zur
 * erzeugten Wärme gesetzt –
 * 1. gemessene Wärmemenge am Erzeuger (`generatedHeatKwh`), sonst
 * 2. Σ Energieeinsatz je Quelle × Jahresarbeitszahl (Wärmepumpenstrom)
 *    bzw. × 1 (Brennstoffe, Fernwärme, Strom ohne Wärmepumpe).
 * Fehlt bei einer Wärmepumpenquelle die Jahresarbeitszahl und ist keine
 * Wärmemenge gemessen, bleibt es beim Energieeinsatz (bisheriges
 * Verhalten) und `heatPumpWithoutHeatOutput` wird gesetzt. Eine
 * Standard-Jahresarbeitszahl setzt der Kern bewusst nicht an (offene
 * Entscheidung); eine geschätzte Jahresarbeitszahl gibt der Vermieter mit
 * Begründung ein.
 *
 * `energyInputKwh` ist der ungerundete Energieeinsatz aus
 * `circuitEnergyInputKwh`; die Umrechnung addiert je Wärmepumpenquelle
 * kWh × (Jahresarbeitszahl − 1), damit ohne Wärmepumpe exakt der bisherige
 * Nenner entsteht.
 */
export function hotWaterDenominator(
  energyInputKwh: number,
  sources: readonly HotWaterDenominatorSourceInput[],
  generatedHeatKwh: number | null | undefined,
): HotWaterDenominator {
  const heatPumpWithoutFactor = sources.some(
    ({ heatPump, seasonalPerformanceFactor }) =>
      heatPump && seasonalPerformanceFactor == null,
  )
  const useFactor =
    generatedHeatKwh == null &&
    !heatPumpWithoutFactor &&
    sources.some(({ heatPump }) => heatPump)
  const traces = sources.map(
    ({
      trace,
      label,
      heatPump,
      seasonalPerformanceFactor,
      seasonalPerformanceFactorEstimated,
      seasonalPerformanceFactorReason,
    }) => {
      const inputKwh = sourceEnergyInputKwh(trace)
      const factor =
        useFactor && heatPump ? (seasonalPerformanceFactor ?? 1) : 1
      return {
        energySourceId: trace.energySourceId,
        label: label ?? null,
        energyInputKwh: inputKwh,
        heatPump,
        seasonalPerformanceFactor: heatPump ? seasonalPerformanceFactor : null,
        seasonalPerformanceFactorEstimated:
          heatPump && seasonalPerformanceFactor != null
            ? Boolean(seasonalPerformanceFactorEstimated)
            : false,
        seasonalPerformanceFactorReason:
          heatPump && seasonalPerformanceFactor != null
            ? (seasonalPerformanceFactorReason ?? null)
            : null,
        generatedHeatKwh: inputKwh * factor,
      }
    },
  )
  if (generatedHeatKwh != null)
    return {
      method: 'measured_heat',
      denominatorKwh: generatedHeatKwh,
      heatPumpWithoutHeatOutput: false,
      sources: traces,
    }
  if (useFactor)
    return {
      method: 'seasonal_performance_factor',
      denominatorKwh: traces.reduce(
        (sum, source) =>
          sum + (source.generatedHeatKwh - source.energyInputKwh),
        energyInputKwh,
      ),
      heatPumpWithoutHeatOutput: false,
      sources: traces,
    }
  return {
    method: 'energy_input',
    denominatorKwh: energyInputKwh,
    heatPumpWithoutHeatOutput: heatPumpWithoutFactor,
    sources: traces,
  }
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
  denominator: HotWaterDenominator = {
    method: 'energy_input',
    denominatorKwh: energyInputKwh,
    heatPumpWithoutHeatOutput: false,
    sources: [],
  },
): CircuitHotWaterEnergyTrace {
  const heat = hotWaterHeatKwh(energy, circuitUsableAreaSqm)
  const share = hotWaterEnergyShare(heat.heatKwh, denominator.denominatorKwh)
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
    denominatorMethod: denominator.method,
    denominatorKwh: denominator.denominatorKwh,
    denominatorSources: [...denominator.sources],
    heatPumpWithoutHeatOutput: denominator.heatPumpWithoutHeatOutput,
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
