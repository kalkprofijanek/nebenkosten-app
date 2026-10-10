/**
 * Vergleich mit dem normierten Durchschnittsnutzer (§ 6a Abs. 3 Nr. 4
 * HeizKV) anhand von Klassengrenzen einer Vergleichsquelle, z. B. dem
 * Heizspiegel für Deutschland (ADR-0004).
 *
 * Der Verbrauch eines Nutzers wird als Anteil am Energieeinsatz des
 * Heizkreises in kWh ausgedrückt, nach denselben Schlüsseln wie die Kosten:
 *
 * - Heizwärme: Energieeinsatz × (1 − Warmwasseranteil) × eigener Verbrauch ÷
 *   Verbrauch aller Nutzungen (einschließlich Leerstand),
 * - Warmwasser (nur wenn die Vergleichswerte es enthalten): Energieeinsatz ×
 *   Warmwasseranteil × eigene Personenzeit ÷ Personenzeit aller Nutzer.
 *
 * Bezug ist die Fläche des Grundkostenschlüssels; bei kürzerer Nutzung wird
 * auf ein ganzes Jahr hochgerechnet (`annualized`): mit Nutzungszeitraum
 * nach Gradtagszahlen (VDI 2067, ADR-0007), sonst linear nach Tagen.
 */
import type { ConsumptionBenchmark, HeatingCircuit } from '@nebenkosten/schema'
import type { CalculationOutput } from '../contracts'
import { degreeDayPermille } from './degree-days'

export type ConsumptionBenchmarkClass = 'low' | 'medium' | 'elevated' | 'high'

export type ConsumptionBenchmarkUnavailableReason =
  /** Für den Heizkreis sind keine Vergleichswerte erfasst. */
  | 'no_benchmark'
  /** Leerstand: kein Nutzer, dem der Vergleich mitzuteilen wäre. */
  | 'vacancy'
  /** Nutzung oder Heizkreis nicht in der Berechnung enthalten. */
  | 'not_in_calculation'
  /** Energieeinsatz des Heizkreises in kWh nicht ermittelbar. */
  | 'energy_input_unknown'
  /** Kein Verbrauch für die Verteilung erfasst. */
  | 'consumption_unknown'
  /** Keine Fläche für den Bezug je m². */
  | 'area_unknown'
  /**
   * Vergleichswerte enthalten Warmwasser, das Warmwasser wird aber nicht
   * über den Heizkreis bereitet; die Energie dafür ist nicht bekannt.
   */
  | 'hot_water_energy_unknown'

export interface ConsumptionBenchmarkRangeKwh {
  lowMax: number
  mediumMax: number
  elevatedMax: number
}

export type TenantConsumptionBenchmark =
  | {
      status: 'compared'
      occupancyPeriodId: string
      benchmark: ConsumptionBenchmark
      /** Anteil am Energieeinsatz für Heizwärme im Nutzungszeitraum. */
      heatingKwh: number
      /** Anteil am Energieeinsatz für Warmwasser (0, wenn nicht enthalten). */
      hotWaterKwh: number
      energyKwh: number
      areaSqm: number
      /** Auf ein ganzes Jahr hochgerechnet (Nutzung kürzer als Zeitraum). */
      annualized: boolean
      /** Verfahren der Hochrechnung (`none` bei ganzjähriger Nutzung). */
      annualization: 'none' | 'degree_days' | 'linear'
      /** Eigener Verbrauch je m² und Jahr, eine Nachkommastelle. */
      kwhPerSqmYear: number
      benchmarkClass: ConsumptionBenchmarkClass
      /** Klassengrenzen umgerechnet auf Fläche und Nutzungszeitraum. */
      rangeKwh: ConsumptionBenchmarkRangeKwh
    }
  | {
      status: 'unavailable'
      occupancyPeriodId: string
      reason: ConsumptionBenchmarkUnavailableReason
    }

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function classifyConsumptionBenchmark(
  kwhPerSqmYear: number,
  benchmark: ConsumptionBenchmark,
): ConsumptionBenchmarkClass {
  if (kwhPerSqmYear <= benchmark.lowMaxKwhPerSqmYear) return 'low'
  if (kwhPerSqmYear <= benchmark.mediumMaxKwhPerSqmYear) return 'medium'
  if (kwhPerSqmYear <= benchmark.elevatedMaxKwhPerSqmYear) return 'elevated'
  return 'high'
}

/** Anteil eines Nutzers am Energieeinsatz seines Heizkreises in kWh. */
export interface TenantEnergyKwh {
  /** Heizwärme: Energieeinsatz × (1 − Warmwasseranteil) × Verbrauchsanteil. */
  heatingKwh: number
  /** Warmwasser: Energieeinsatz × Warmwasseranteil × Anteil an der Personenzeit. */
  hotWaterKwh: number
  /** Warmwasser wird zentral über den Heizkreis bereitet. */
  centralHotWater: boolean
}

type TenantEnergyShare =
  | {
      status: 'ok'
      tenant: CalculationOutput['tenants'][number]
      basis: NonNullable<CalculationOutput['tenants'][number]['ownBasis']>
      trace: CalculationOutput['heating']['trace']['circuits'][number]
      energy: TenantEnergyKwh
    }
  | {
      status: 'unavailable'
      reason: Extract<
        ConsumptionBenchmarkUnavailableReason,
        | 'vacancy'
        | 'not_in_calculation'
        | 'energy_input_unknown'
        | 'consumption_unknown'
      >
    }

/**
 * Ermittelt Heizwärme und Warmwasser eines Nutzers nach den Schlüsseln der
 * Kostenverteilung (ungerundet). Ohne `heatingCircuitId` gilt der Heizkreis
 * des Gebäudes, dem die Nutzung zugeordnet ist.
 */
function tenantEnergyShare(
  output: CalculationOutput,
  occupancyPeriodId: string,
  heatingCircuitId?: string,
): TenantEnergyShare {
  const tenant = output.tenants.find(({ id }) => id === occupancyPeriodId)
  if (tenant?.isVacancy) return { status: 'unavailable', reason: 'vacancy' }
  const basis = tenant?.ownBasis
  const trace = output.heating.trace.circuits.find((candidate) =>
    heatingCircuitId === undefined
      ? candidate.buildingId === basis?.buildingId
      : candidate.heatingCircuitId === heatingCircuitId,
  )
  const result = output.heating.perCircuit.find(
    ({ buildingId }) => buildingId === trace?.buildingId,
  )
  if (
    !tenant ||
    !basis ||
    !trace ||
    !result ||
    basis.buildingId !== trace.buildingId
  )
    return { status: 'unavailable', reason: 'not_in_calculation' }
  if (!(result.energyKwh > 0))
    return { status: 'unavailable', reason: 'energy_input_unknown' }
  if (!(basis.consumption > 0) || !(trace.split.consumptionDenominator > 0))
    return { status: 'unavailable', reason: 'consumption_unknown' }

  const centralHotWater = trace.warmWater.method !== 'none'
  const hotWaterShare = centralHotWater ? trace.warmWater.sharePercent / 100 : 0
  const heatingKwh =
    (result.energyKwh * (1 - hotWaterShare) * basis.consumption) /
    trace.split.consumptionDenominator
  // Personenzeit wie in der Warmwasserverteilung: ohne Personenangabe zählt
  // eine Person; Leerstand zählt nicht. Ungerundet nachgerechnet, weil der
  // Trace den Nenner nur auf drei Stellen ausweist.
  const personTimeOf = (candidate: (typeof output.tenants)[number]) =>
    candidate.isVacancy || candidate.ownBasis?.buildingId !== trace.buildingId
      ? 0
      : (candidate.ownBasis.persons > 0 ? candidate.ownBasis.persons : 1) *
        (candidate.timeFactor ?? 1)
  const personTimeTotal = output.tenants.reduce(
    (sum, candidate) => sum + personTimeOf(candidate),
    0,
  )
  const hotWaterKwh =
    centralHotWater && personTimeTotal > 0
      ? (result.energyKwh * hotWaterShare * personTimeOf(tenant)) /
        personTimeTotal
      : 0
  return {
    status: 'ok',
    tenant,
    basis,
    trace,
    energy: { heatingKwh, hotWaterKwh, centralHotWater },
  }
}

/**
 * Heizwärme und Warmwasser eines Nutzers in kWh als Anteil am Energieeinsatz
 * seines Heizkreises (ungerundet, § 6a Abs. 3 Satz 2 HeizKV). `null` bei
 * Leerstand, unbekanntem Energieeinsatz oder fehlendem Verbrauch.
 */
export function tenantEnergyKwh(
  output: CalculationOutput,
  occupancyPeriodId: string,
): TenantEnergyKwh | null {
  const share = tenantEnergyShare(output, occupancyPeriodId)
  return share.status === 'ok' ? share.energy : null
}

export function compareTenantWithConsumptionBenchmark(
  output: CalculationOutput,
  occupancyPeriodId: string,
  circuit: Readonly<HeatingCircuit> | null | undefined,
  /**
   * Nutzungs- und Abrechnungszeitraum für die Hochrechnung nach
   * Gradtagszahlen; ohne Angabe linear nach Tagen.
   */
  usage?: {
    readonly from: string
    readonly to: string
    readonly periodStart: string
    readonly periodEnd: string
  },
): TenantConsumptionBenchmark {
  const unavailable = (
    reason: ConsumptionBenchmarkUnavailableReason,
  ): TenantConsumptionBenchmark => ({
    status: 'unavailable',
    occupancyPeriodId,
    reason,
  })
  const benchmark = circuit?.consumptionBenchmark
  if (!circuit || !benchmark) return unavailable('no_benchmark')
  const share = tenantEnergyShare(output, occupancyPeriodId, circuit.id)
  if (share.status === 'unavailable') return unavailable(share.reason)
  const { tenant, basis, trace } = share
  const areaSqm =
    trace.split.baseAreaBasis === 'usable_area'
      ? basis.usableAreaSqm
      : basis.heatedAreaSqm
  if (!(areaSqm > 0)) return unavailable('area_unknown')
  if (benchmark.includesHotWater && !share.energy.centralHotWater)
    return unavailable('hot_water_energy_unknown')

  const { heatingKwh } = share.energy
  const hotWaterKwh = benchmark.includesHotWater ? share.energy.hotWaterKwh : 0
  const timeFactor = tenant.timeFactor ?? 1
  const energyKwh = heatingKwh + hotWaterKwh
  const annualized = timeFactor > 0 && timeFactor < 1
  const annualization = !annualized ? 'none' : usage ? 'degree_days' : 'linear'
  // Heizwärme nach Gradtagszahlen (witterungsabhängig), Warmwasser nach
  // Tagen (gleichmäßig über das Jahr).
  const heatingYearFactor =
    annualization === 'degree_days' && usage
      ? degreeDayPermille(usage.from, usage.to) /
        degreeDayPermille(usage.periodStart, usage.periodEnd)
      : annualized
        ? timeFactor
        : 1
  const hotWaterYearFactor = annualized ? timeFactor : 1
  const annualKwh =
    heatingKwh / heatingYearFactor + hotWaterKwh / hotWaterYearFactor
  const kwhPerSqmYear = round(annualKwh / areaSqm, 1)
  // Klassengrenzen auf den Nutzungszeitraum: derselbe Faktor wie zwischen
  // Verbrauch im Zeitraum und hochgerechnetem Jahresverbrauch.
  const periodFactor = annualKwh > 0 ? energyKwh / annualKwh : 1
  const toPeriod = (perSqmYear: number) =>
    round(perSqmYear * areaSqm * periodFactor, 0)
  return {
    status: 'compared',
    occupancyPeriodId,
    benchmark,
    heatingKwh: round(heatingKwh, 0),
    hotWaterKwh: round(hotWaterKwh, 0),
    energyKwh: round(energyKwh, 0),
    areaSqm,
    annualized,
    annualization,
    kwhPerSqmYear,
    benchmarkClass: classifyConsumptionBenchmark(kwhPerSqmYear, benchmark),
    rangeKwh: {
      lowMax: toPeriod(benchmark.lowMaxKwhPerSqmYear),
      mediumMax: toPeriod(benchmark.mediumMaxKwhPerSqmYear),
      elevatedMax: toPeriod(benchmark.elevatedMaxKwhPerSqmYear),
    },
  }
}
