import type { EnergySource } from '@nebenkosten/schema'

/**
 * Leitungsgebundene Energie (Strom inkl. Wärmepumpenstrom, Fern-/Nahwärme,
 * Erdgas). Sie ist nicht lagerfähig: Rechnungen rechnen einen Liefer- bzw.
 * Verbrauchszeitraum ab, es gibt keinen Anfangs- oder Endbestand.
 * Flüssiggas, Heizöl und Pellets bleiben lagerfähige Brennstoffe.
 */
const GRID_ENERGY_PATTERN =
  /strom|w(?:ä|ae)rmepumpe|fernw(?:ä|ae)rme|nahw(?:ä|ae)rme|erdgas|^wp(?:_|$)/iu

export function isGridEnergySource(
  source: Pick<EnergySource, 'key' | 'name' | 'sourceType'>,
): boolean {
  return [source.sourceType, source.name, source.key].some(
    (value) => value != null && GRID_ENERGY_PATTERN.test(value.trim()),
  )
}

/** Wärmepumpe in Schlüssel, Name oder Energieträger der Energiequelle. */
const HEAT_PUMP_SOURCE_PATTERN = /w(?:ä|ae)rmepumpe|^wp(?:\b|_)/iu
/** Strom als Energieträger (Wärmepumpenstrom, Direktheizung). */
const ELECTRICITY_PATTERN = /strom/iu
/** Gebäude-Energieträger mit Wärmepumpe (z. B. „WP Mono“, „Hybrid WP+Gas“). */
const HEAT_PUMP_BUILDING_PATTERN = /w(?:ä|ae)rmepumpe|\bwp\b|hybrid/iu

/**
 * Energiequelle, deren Strom eine Wärmepumpe antreibt (ADR-0010
 * „Wärmepumpen“). Erkannt an
 * - einer gesetzten Jahresarbeitszahl,
 * - „Wärmepumpe“ bzw. Schlüssel „wp…“ in Schlüssel, Name oder Energieträger,
 * - Strom als Energieträger in einem Gebäude, dessen Energieträger eine
 *   Wärmepumpe nennt („WP …“, „Hybrid …“).
 * Offene Entscheidung: Die Erkennung beruht auf Freitext; Strom für eine
 * Direktheizung in einem Hybridgebäude würde ebenfalls als Wärmepumpe
 * gewertet. Maßgeblich ist dann die Angabe der Jahresarbeitszahl bzw. der
 * erzeugten Wärme durch den Vermieter.
 */
export function isHeatPumpEnergySource(
  source: Pick<EnergySource, 'key' | 'name' | 'sourceType'> & {
    readonly seasonalPerformanceFactor?: number | null
  },
  buildingEnergySourceType?: string | null,
): boolean {
  if (source.seasonalPerformanceFactor != null) return true
  const values = [source.sourceType, source.name, source.key]
    .filter((value): value is string => value != null)
    .map((value) => value.trim())
  if (values.some((value) => HEAT_PUMP_SOURCE_PATTERN.test(value))) return true
  return (
    buildingEnergySourceType != null &&
    HEAT_PUMP_BUILDING_PATTERN.test(buildingEnergySourceType) &&
    values.some((value) => ELECTRICITY_PATTERN.test(value))
  )
}
