/**
 * Plausibilitätsprüfungen zu Schätzungen (§ 9a HeizKV) und zur Auswahl der
 * Vergleichswerte (§ 6a Abs. 3 Nr. 4 HeizKV). Die Prüfungen sind Hinweise
 * und Warnungen; sie verändern keine Berechnung.
 */
import {
  calculateOccupancyDays,
  calculatePeriodDays,
  type CalculationOutput,
} from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  HeatingCircuit,
  ValidationIssue,
} from '@nebenkosten/schema'
import { blank, periodOccupancies } from './helpers'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

/**
 * Abweichung einer Schätzung vom Vorjahresverbrauch, ab der ein Hinweis
 * erscheint. Offene Entscheidung: Die HeizKV nennt keine Grenze; 20 % ist
 * eine Plausibilitätsschwelle der App.
 */
export const ESTIMATE_PREVIOUS_DEVIATION_LIMIT = 0.2

function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: digits })
}

function unitLabel(data: AppDataFile, unitId: string): string {
  const unit = data.masterData.units.find(({ id }) => id === unitId)
  return `Wohnung ${unit?.label ?? unit?.location ?? 'ohne Bezeichnung'}`
}

function hasHeatingCircuit(data: AppDataFile, period: BillingPeriod): boolean {
  return data.billingData.heatingCircuits.some(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
}

/** Tagesanteil einer Nutzung am Abrechnungszeitraum (0–1). */
function occupancyDayShare(
  period: BillingPeriod,
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  try {
    const total = calculatePeriodDays(period.periodStart, period.periodEnd)
    return (
      calculateOccupancyDays(period.periodStart, period.periodEnd, from, to) /
      total
    )
  } catch {
    return null
  }
}

/**
 * § 9a Abs. 1 HeizKV: Eine Schätzung braucht eine Grundlage (Vorjahr,
 * vergleichbare Räume). Gemeldet werden Schätzungen ohne Begründung und
 * Schätzungen, die deutlich vom Vorjahresverbrauch derselben Nutzung
 * abweichen.
 */
export function estimateIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  if (!hasHeatingCircuit(data, period)) return
  for (const occupancy of periodOccupancies(data, period.id)) {
    if (
      occupancy.kind === 'vacancy' ||
      occupancy.consumptionUnitsEstimated !== true
    )
      continue
    const entity = { type: 'OccupancyPeriod', id: occupancy.id }
    const label = unitLabel(data, occupancy.unitId)
    if (blank(occupancy.consumptionUnitsEstimateReason))
      add(
        issue(
          'warning',
          'heating.estimate_reason_missing',
          'occupancy',
          'Geschätzter Verbrauch ohne Begründung',
          {
            entity,
            detail: `${label}: Der Verbrauch ist als geschätzt gekennzeichnet, eine Begründung fehlt. Nach § 9a Abs. 1 HeizKV ist der Verbrauch auf der Grundlage des Verbrauchs der Räume in vergleichbaren Zeiträumen oder vergleichbarer anderer Räume zu ermitteln; Grund und Grundlage der Schätzung angeben.`,
          },
        ),
      )
    const previous = occupancy.previousConsumption
    const current = occupancy.consumptionUnits?.value
    if (
      !previous ||
      previous.year !== period.year - 1 ||
      previous.value <= 0 ||
      current == null
    )
      continue
    // Offene Entscheidung: Der Vorjahreswert wird als Jahreswert behandelt
    // und auf die Nutzungstage dieses Zeitraums umgerechnet.
    const share = occupancyDayShare(period, occupancy.from, occupancy.to)
    if (share === null || share <= 0) continue
    const expected = previous.value * share
    const deviation = (current - expected) / expected
    if (Math.abs(deviation) <= ESTIMATE_PREVIOUS_DEVIATION_LIMIT) continue
    add(
      issue(
        'info',
        'heating.estimate_deviates_from_previous',
        'occupancy',
        'Schätzung weicht deutlich vom Vorjahr ab',
        {
          entity,
          detail: `${label}: Geschätzt sind ${formatNumber(current)} Einheiten, der Vorjahresverbrauch ${previous.year} ergibt für den Nutzungszeitraum ${formatNumber(expected)} Einheiten (${deviation > 0 ? '+' : '−'}${formatNumber(Math.abs(deviation) * 100, 0)} %). Bitte die Grundlage der Schätzung prüfen (§ 9a Abs. 1 HeizKV).`,
        },
      ),
    )
  }
}

/**
 * § 9a Abs. 2 HeizKV: Ist der Verbrauch für mehr als 25 % der beheizten
 * Fläche geschätzt, verteilt die Berechnung die Heizkosten ausschließlich
 * nach Fläche. Das muss bewusst bestätigt werden.
 */
export function section9aAreaOnlyIssues(
  output: CalculationOutput,
  add: Add,
): void {
  for (const circuit of output.heating.trace.circuits) {
    if (!circuit.split.areaOnlySection9a) continue
    const share = circuit.split.estimatedAreaSharePercent
    add(
      issue(
        'warning',
        'heating.section9a_area_only',
        'heating',
        'Mehr als 25 % der Fläche geschätzt: Verteilung nur nach Fläche',
        {
          entity: {
            type: 'HeatingCircuit',
            id: circuit.heatingCircuitId ?? circuit.buildingId,
          },
          detail: `${share == null ? 'Für mehr als 25 %' : `Für ${formatNumber(share)} %`} der beheizten Fläche ist der Verbrauch geschätzt. Nach § 9a Abs. 2 HeizKV sind die Heizkosten dann ausschließlich nach der Wohn- oder Nutzfläche zu verteilen; eine verbrauchsabhängige Abrechnung entfällt, die Kürzung nach § 12 Abs. 1 HeizKV ebenso. Die Berechnung verteilt entsprechend. Bitte prüfen, ob für einzelne Nutzungen doch Ablesewerte vorliegen.`,
        },
      ),
    )
  }
}

/** Flächenspanne einer Heizspiegel-Kategorie in m² (Grenzen inklusive). */
export interface AreaRange {
  readonly min: number
  readonly max: number
}

function parseGermanNumber(value: string): number {
  return Number(value.replace(/\./gu, '').replace(',', '.'))
}

const NUMBER = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)`
const SQM = String.raw`\s*(?:m²|m2|qm|quadratmeter)`

/**
 * Liest eine Flächenklasse aus dem Kategorietext, z. B. „251–500 m²“,
 * „bis 250 m²“, „über 1.000 m²“. `null`, wenn keine Flächenangabe erkennbar.
 */
export function parseCategoryAreaRange(category: string): AreaRange | null {
  const text = category.toLocaleLowerCase('de-DE')
  const range = new RegExp(
    String.raw`${NUMBER}${SQM}?\s*(?:–|—|-|bis)\s*${NUMBER}${SQM}`,
    'u',
  ).exec(text)
  if (range)
    return {
      min: parseGermanNumber(range[1]!),
      max: parseGermanNumber(range[2]!),
    }
  const lower = new RegExp(
    String.raw`(?:über|ueber|mehr als|ab|>)\s*${NUMBER}${SQM}`,
    'u',
  ).exec(text)
  if (lower) {
    return { min: parseGermanNumber(lower[1]!), max: Infinity }
  }
  const upper = new RegExp(
    String.raw`(?:bis|unter|weniger als|<)\s*${NUMBER}${SQM}`,
    'u',
  ).exec(text)
  if (upper) return { min: 0, max: parseGermanNumber(upper[1]!) }
  return null
}

export type EnergyCarrier =
  'oil' | 'gas' | 'district_heating' | 'heat_pump' | 'wood'

const CARRIER_PATTERNS: readonly [EnergyCarrier, RegExp][] = [
  ['oil', /(?<!\p{L})(?:heiz)?(?:öl|oel)(?!\p{L})|heizöl|heizoel/iu],
  ['gas', /gas/iu],
  ['district_heating', /fernwärme|fernwaerme|nahwärme|nahwaerme/iu],
  ['heat_pump', /wärmepumpe|waermepumpe/iu],
  ['wood', /pellet|holz|hackschnitzel/iu],
]

const CARRIER_LABELS: Record<EnergyCarrier, string> = {
  oil: 'Heizöl',
  gas: 'Gas',
  district_heating: 'Fern- bzw. Nahwärme',
  heat_pump: 'Wärmepumpe',
  wood: 'Holz/Pellets',
}

/** Energieträger, die ein Freitext erkennbar nennt. */
export function detectEnergyCarriers(
  value: string | null | undefined,
): Set<EnergyCarrier> {
  const result = new Set<EnergyCarrier>()
  for (const [carrier, pattern] of CARRIER_PATTERNS)
    if (pattern.test(value ?? '')) result.add(carrier)
  return result
}

/**
 * Beheizte Fläche der Einheiten im Gebäude des Heizkreises; ohne beheizte
 * Fläche zählt die Wohn-/Nutzfläche. Offene Entscheidung: Der Heizspiegel
 * bildet Klassen nach der Gebäudefläche; hier zählt die in der App erfasste
 * Fläche aller Einheiten des Gebäudes.
 */
function circuitArea(data: AppDataFile, circuit: HeatingCircuit): number {
  return data.masterData.units
    .filter(({ buildingId }) => buildingId === circuit.buildingId)
    .reduce(
      (sum, unit) =>
        sum + (unit.heatedAreaSqm?.value ?? unit.usableAreaSqm?.value ?? 0),
      0,
    )
}

function formatRange(range: AreaRange): string {
  if (range.max === Infinity) return `ab ${formatNumber(range.min, 0)} m²`
  if (range.min === 0) return `bis ${formatNumber(range.max, 0)} m²`
  return `${formatNumber(range.min, 0)}–${formatNumber(range.max, 0)} m²`
}

/**
 * Die Nutzerkategorie der Vergleichswerte muss zum Gebäude passen
 * (§ 6a Abs. 3 Nr. 4 HeizKV: „derselben Nutzerkategorie“): Flächenklasse und
 * Energieträger werden geprüft, soweit sie im Kategorietext erkennbar sind.
 */
export function consumptionBenchmarkCategoryIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  for (const circuit of data.billingData.heatingCircuits) {
    const benchmark = circuit.consumptionBenchmark
    if (circuit.billingPeriodId !== period.id || !benchmark) continue
    const entity = { type: 'HeatingCircuit', id: circuit.id }
    const range = parseCategoryAreaRange(benchmark.category)
    const area = circuitArea(data, circuit)
    if (range && area > 0 && (area < range.min || area > range.max))
      add(
        issue(
          'warning',
          'heating.consumption_benchmark_area_mismatch',
          'heating',
          'Vergleichswerte passen nicht zur Gebäudefläche',
          {
            entity,
            detail: `Die Kategorie „${benchmark.category}“ gilt für Gebäude ${formatRange(range)}, die beheizte Fläche des Heizkreises beträgt ${formatNumber(area)} m². Vergleichswerte derselben Nutzerkategorie verwenden (§ 6a Abs. 3 Nr. 4 HeizKV).`,
          },
        ),
      )
    const categoryCarriers = detectEnergyCarriers(benchmark.category)
    if (categoryCarriers.size === 0) continue
    const circuitCarriers = new Set<EnergyCarrier>()
    for (const source of data.billingData.energySources)
      if (source.heatingCircuitId === circuit.id)
        for (const carrier of detectEnergyCarriers(
          `${source.sourceType ?? ''} ${source.name ?? ''}`,
        ))
          circuitCarriers.add(carrier)
    if (circuitCarriers.size === 0) continue
    if ([...categoryCarriers].some((carrier) => circuitCarriers.has(carrier)))
      continue
    add(
      issue(
        'warning',
        'heating.consumption_benchmark_carrier_mismatch',
        'heating',
        'Vergleichswerte für einen anderen Energieträger',
        {
          entity,
          detail: `Die Kategorie „${benchmark.category}“ nennt ${[...categoryCarriers].map((carrier) => CARRIER_LABELS[carrier]).join(', ')}, der Heizkreis wird mit ${[...circuitCarriers].map((carrier) => CARRIER_LABELS[carrier]).join(', ')} betrieben. Vergleichswerte desselben Energieträgers verwenden (§ 6a Abs. 3 Nr. 4 HeizKV).`,
        },
      ),
    )
  }
}

/** Statische Plausibilitätsprüfungen (ohne Berechnungsergebnis). */
export function collectPlausibilityIssues(
  data: AppDataFile,
  period: BillingPeriod,
): ValidationIssue[] {
  const result: ValidationIssue[] = []
  const add: Add = (value) => result.push(value)
  estimateIssues(data, period, add)
  consumptionBenchmarkCategoryIssues(data, period, add)
  return result
}
