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
