/**
 * Vergleich mit dem vorhergehenden Abrechnungszeitraum derselben Mietpartei
 * (§ 6a Abs. 3 HeizKV).
 *
 * Der Energieverbrauch umfasst nach § 6a Abs. 3 Satz 2 HeizKV Wärme und
 * Warmwasser. Liegt das Vorjahr im System, werden beide Jahre berechnet und
 * je Jahr Heizwärme und Warmwasser als Anteil am Energieeinsatz nach den
 * Verteilschlüsseln ermittelt (`tenantEnergyKwh`). Nur die Heizwärme wird mit
 * den Klimafaktoren des DWD bereinigt (ADR-0005); das Warmwasser ist nicht
 * witterungsabhängig und wird unbereinigt addiert.
 *
 * Ist das nicht möglich (z. B. nur ein übernommener Vorjahresverbrauch nach
 * Eigentümerwechsel), bleibt es beim Vergleich der erfassten
 * Verbrauchseinheiten der Heizung (`units_only`).
 *
 * Gleiche Basis (§ 6a Abs. 3 Satz 1 Nr. 2 HeizKV: Vergleich mit dem
 * Verbrauch „des Nutzers“ im vorhergehenden Abrechnungszeitraum):
 * - Verglichen wird nur mit Nutzungen desselben Mietverhältnisses in
 *   derselben Wohnung; bei Nutzerwechsel entfällt der Vergleich mit Hinweis
 *   (`not_resident`), Werte eines anderen Nutzers werden nie verwendet.
 * - Decken Nutzung und Vorjahresnutzung nicht jeweils das ganze
 *   Abrechnungsjahr ab, wird der Vorjahreswert nach Gradtagszahlen (VDI 2067,
 *   ADR-0007) auf den Nutzungszeitraum des Abrechnungsjahres umgerechnet
 *   (Warmwasser nach Tagen), `comparisonBasis`.
 * - Die DWD-Klimafaktoren gelten für Zwölfmonatszeiträume; sie werden nur
 *   angewandt, wenn beide Nutzungen ihr ganzes Abrechnungsjahr umfassen.
 */
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import { calculateBilling } from '../calculation/calculate-billing'
import type { CalculationOutput } from '../contracts'
import { createCalculationInput } from '../input/create-calculation-input'
import { tenantEnergyKwh, type TenantEnergyKwh } from './consumption-benchmark'
import { degreeDayPermille } from './degree-days'
import {
  checkClimateFactor,
  previousPeriodClimateFactor,
} from './weather-adjustment'

export type PreviousPeriodConsumption =
  /** Keine Vorjahresabrechnung im System (z. B. Eigentümerwechsel). */
  | { readonly kind: 'no_period' }
  /** Die Mietpartei hat die Wohnung im Vorjahr nicht genutzt. */
  | { readonly kind: 'not_resident' }
  /** Vorjahresnutzung im System, aber ohne erfassten Verbrauch. */
  | { readonly kind: 'no_consumption' }
  | {
      readonly kind: 'available'
      /** Vorjahr im System (`system`) oder übernommener Wert (`stored`). */
      readonly origin: 'system' | 'stored'
      readonly year: number
      /** Erfasster Heizverbrauch (Einheiten bzw. kWh) des Vorjahres. */
      readonly value: number
      /** Herkunft des übernommenen Vorjahreswerts. */
      readonly source: string | null
      /** Abrechnungsjahr des Vorjahres im System. */
      readonly previousPeriodId: string | null
      /** Nutzungen derselben Mietpartei und Wohnung im Vorjahr. */
      readonly previousOccupancyIds: readonly string[]
      /** Mindestens eine Vorjahresnutzung ist geschätzt (§ 9a HeizKV). */
      readonly previousEstimated: boolean
    }

function previousPeriodOf(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
): BillingPeriod | undefined {
  return data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
}

/**
 * Vorjahresverbrauch derselben Mietpartei (gleiches Objekt, gleiche Wohnung,
 * gleiches Mietverhältnis). Ohne Vorjahresabrechnung im System gilt der
 * übernommene Vorjahresverbrauch der Nutzung (z. B. aus der Abrechnung des
 * Voreigentümers).
 */
export function previousPeriodConsumption(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  occupancy: Readonly<OccupancyPeriod>,
): PreviousPeriodConsumption {
  const previousPeriod = previousPeriodOf(data, period)
  const stored = occupancy.previousConsumption
  if (
    stored &&
    stored.year === period.year - 1 &&
    (!previousPeriod ||
      !data.billingData.occupancyPeriods.some(
        ({ billingPeriodId }) => billingPeriodId === previousPeriod.id,
      ))
  )
    return {
      kind: 'available',
      origin: 'stored',
      year: stored.year,
      value: stored.value,
      source: stored.source ?? null,
      previousPeriodId: null,
      previousOccupancyIds: [],
      previousEstimated: false,
    }
  if (!previousPeriod)
    return occupancy.kind === 'tenant' &&
      occupancy.from != null &&
      occupancy.from > period.periodStart
      ? { kind: 'not_resident' }
      : { kind: 'no_period' }
  const previous = data.billingData.occupancyPeriods.filter(
    (candidate) =>
      candidate.billingPeriodId === previousPeriod.id &&
      candidate.unitId === occupancy.unitId &&
      candidate.tenancyId != null &&
      candidate.tenancyId === occupancy.tenancyId,
  )
  if (previous.length === 0) return { kind: 'not_resident' }
  const withConsumption = previous.find(
    ({ consumptionUnits }) => consumptionUnits != null,
  )
  return withConsumption?.consumptionUnits
    ? {
        kind: 'available',
        origin: 'system',
        year: previousPeriod.year,
        value: withConsumption.consumptionUnits.value,
        source: null,
        previousPeriodId: previousPeriod.id,
        previousOccupancyIds: previous.map(({ id }) => id),
        previousEstimated: previous.some(
          ({ consumptionUnitsEstimated }) => consumptionUnitsEstimated === true,
        ),
      }
    : { kind: 'no_consumption' }
}

export interface PreviousPeriodClimateFactors {
  /** Postleitzahl des Klimafaktors im Abrechnungsjahr. */
  readonly postalCode: string
  readonly current: number
  readonly previous: number
}

/**
 * Klimafaktoren für den witterungsbereinigten Vorjahresvergleich, wenn der
 * Faktor des Abrechnungsjahres passt (`checkClimateFactor`) und für das
 * Vorjahr einer vorliegt (`previousPeriodClimateFactor`); sonst `null`.
 */
export function previousPeriodWeatherFactors(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  occupancy: Readonly<OccupancyPeriod>,
): PreviousPeriodClimateFactors | null {
  const property = data.masterData.properties.find(
    ({ id }) => id === period.propertyId,
  )
  const check = checkClimateFactor(period, property)
  if (check.status !== 'matching' || !period.climateFactor) return null
  const previous = previousPeriodClimateFactor(data, period, occupancy)
  return previous === null
    ? null
    : {
        postalCode: period.climateFactor.postalCode,
        current: check.factor,
        previous,
      }
}

export interface ComparisonWindow {
  readonly from: string
  readonly to: string
}

export interface PreviousPeriodComparisonBasis {
  /** Nutzungszeitraum im Abrechnungsjahr (auf das Jahr begrenzt). */
  readonly current: ComparisonWindow
  /** Nutzungszeitraum im Vorjahr, auf den sich der Vorjahreswert bezieht. */
  readonly previous: ComparisonWindow
  /** Beide Zeiträume umfassen ihr ganzes Abrechnungsjahr. */
  readonly fullYears: boolean
  /**
   * Umrechnung des Vorjahreswerts auf den Nutzungszeitraum (`null` bei
   * ganzen Jahren): derselbe Kalenderzeitraum im Vorjahr (`mapped`), Faktor
   * für die Heizwärme nach Gradtagszahlen und für Warmwasser nach Tagen.
   */
  readonly proRata: {
    readonly mapped: ComparisonWindow
    readonly heatingFactor: number
    readonly hotWaterFactor: number
    /** Gradtagsanteil des umgerechneten Zeitraums in Promille. */
    readonly mappedPermille: number
    /** Gradtagsanteil der Vorjahresnutzung in Promille. */
    readonly previousPermille: number
  } | null
}

const DAY_MS = 86_400_000

function isoTime(value: string): number {
  return Date.parse(`${value}T00:00:00Z`)
}

function inclusiveDays(window: ComparisonWindow): number {
  return Math.round((isoTime(window.to) - isoTime(window.from)) / DAY_MS) + 1
}

/** Datum um ganze Jahre verschoben; 29.02. wird im Gemeinjahr zum 28.02. */
export function shiftIsoDateByYears(value: string, years: number): string {
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const target = year + years
  const leap = target % 4 === 0 && (target % 100 !== 0 || target % 400 === 0)
  const safeDay = month === 2 && day === 29 && !leap ? 28 : day
  return `${String(target).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

function clampWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  bounds: ComparisonWindow,
): ComparisonWindow {
  return {
    from: from && from > bounds.from ? from : bounds.from,
    to: to && to < bounds.to ? to : bounds.to,
  }
}

/**
 * Vergleichsbasis Vorjahr / Abrechnungsjahr: Nutzungszeiträume beider Jahre
 * und – wenn sie nicht jeweils das ganze Jahr umfassen – die Umrechnung des
 * Vorjahreswerts auf den Nutzungszeitraum nach Gradtagszahlen.
 *
 * Offene Entscheidung: Ein übernommener Vorjahresverbrauch
 * (`previousConsumption`) gilt als Verbrauch des ganzen Vorjahres, weil das
 * Schema keinen Zeitraum dafür kennt.
 */
export function previousPeriodComparisonBasis(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  occupancy: Readonly<OccupancyPeriod>,
  consumption: Extract<PreviousPeriodConsumption, { kind: 'available' }>,
): PreviousPeriodComparisonBasis {
  const currentBounds = { from: period.periodStart, to: period.periodEnd }
  const current = clampWindow(occupancy.from, occupancy.to, currentBounds)
  const yearShift = consumption.year - period.year
  const previousPeriod =
    consumption.previousPeriodId === null
      ? undefined
      : data.billingData.billingPeriods.find(
          ({ id }) => id === consumption.previousPeriodId,
        )
  const previousBounds = previousPeriod
    ? { from: previousPeriod.periodStart, to: previousPeriod.periodEnd }
    : {
        from: shiftIsoDateByYears(period.periodStart, yearShift),
        to: shiftIsoDateByYears(period.periodEnd, yearShift),
      }
  const previousOccupancies = data.billingData.occupancyPeriods.filter(
    ({ id }) => consumption.previousOccupancyIds.includes(id),
  )
  const previous =
    previousOccupancies.length === 0
      ? previousBounds
      : previousOccupancies
          .map((candidate) =>
            clampWindow(candidate.from, candidate.to, previousBounds),
          )
          .reduce((left, right) => ({
            from: right.from < left.from ? right.from : left.from,
            to: right.to > left.to ? right.to : left.to,
          }))
  const fullYears =
    current.from === currentBounds.from &&
    current.to === currentBounds.to &&
    previous.from === previousBounds.from &&
    previous.to === previousBounds.to
  if (fullYears) return { current, previous, fullYears, proRata: null }
  const mapped = clampWindow(
    shiftIsoDateByYears(current.from, yearShift),
    shiftIsoDateByYears(current.to, yearShift),
    previousBounds,
  )
  const mappedPermille = degreeDayPermille(mapped.from, mapped.to)
  const previousPermille = degreeDayPermille(previous.from, previous.to)
  const hotWaterFactor = inclusiveDays(mapped) / inclusiveDays(previous)
  return {
    current,
    previous,
    fullYears,
    proRata: {
      mapped,
      // Ohne Gradtage im Vorjahreszeitraum (reiner Sommer) nach Tagen.
      heatingFactor:
        previousPermille > 0
          ? mappedPermille / previousPermille
          : hotWaterFactor,
      hotWaterFactor,
      mappedPermille,
      previousPermille,
    },
  }
}

export type ConsumptionEstimation =
  /** Verbrauch erfasst. */
  | 'none'
  /** Geschätzt (§ 9a HeizKV), Grundlage nicht aus dem Vorjahr. */
  | 'estimated'
  /** Geschätzt auf Grundlage des Vorjahresverbrauchs: Vergleich zirkulär. */
  | 'estimated_from_previous_period'

/**
 * Art der Verbrauchsermittlung einer Nutzung für den Vorjahresvergleich.
 *
 * Offene Entscheidung: Das Schema kennt kein strukturiertes Schätzverfahren;
 * die Ableitung aus dem Vorjahr wird am Begründungstext erkannt
 * („Vorjahr“, „vorherige(n) Abrechnung“, „Vorperiode“).
 */
export function consumptionEstimation(
  occupancy: Pick<
    OccupancyPeriod,
    'consumptionUnitsEstimated' | 'consumptionUnitsEstimateReason'
  >,
): ConsumptionEstimation {
  if (occupancy.consumptionUnitsEstimated !== true) return 'none'
  return /vorjahr|vorperiode|vorherige[nr]? (abrechnung|zeitraum)|vergleichszeitraum/iu.test(
    occupancy.consumptionUnitsEstimateReason ?? '',
  )
    ? 'estimated_from_previous_period'
    : 'estimated'
}

export interface TenantEnergyYear {
  readonly year: number
  /** Heizwärme laut Verteilung, ganze kWh. */
  readonly heatingKwh: number
  /** Heizwärme × Klimafaktor (ohne Bereinigung gleich `heatingKwh`). */
  readonly heatingAdjustedKwh: number
  /** Warmwasser, ganze kWh, nicht bereinigt. */
  readonly hotWaterKwh: number
  /** `heatingAdjustedKwh + hotWaterKwh`. */
  readonly totalKwh: number
  readonly climateFactor: number | null
}

export type PreviousPeriodEnergyComparison =
  | {
      readonly status: 'energy'
      readonly previous: TenantEnergyYear
      readonly current: TenantEnergyYear
      /** Heizwärme beider Jahre mit Klimafaktoren bereinigt. */
      readonly weatherAdjusted: boolean
      readonly climate: PreviousPeriodClimateFactors | null
      /** Warmwasser wird in mindestens einem Jahr zentral bereitet. */
      readonly centralHotWater: boolean
      /**
       * Veränderung des Energieverbrauchs in Prozent, eine Stelle; `null`,
       * wenn der Vergleich nicht aussagekräftig ist (Schätzung aus dem
       * Vorjahr) oder der Vorjahreswert 0 ist.
       */
      readonly changePercent: number | null
      /** Zeiträume und Umrechnung des Vorjahreswerts. */
      readonly basis: PreviousPeriodComparisonBasis
      /**
       * Vorjahr vor der Umrechnung auf den Nutzungszeitraum (ganze kWh,
       * unbereinigt); `null` ohne Umrechnung.
       */
      readonly previousBeforeProRata: {
        readonly heatingKwh: number
        readonly hotWaterKwh: number
      } | null
      /**
       * Klimafaktoren liegen vor, wurden aber nicht angewandt, weil ein
       * Zeitraum kein ganzes Abrechnungsjahr ist (Jahresfaktor des DWD).
       */
      readonly climateNotAppliedPartialPeriod: boolean
      readonly currentEstimation: ConsumptionEstimation
      readonly previousEstimated: boolean
    }
  | {
      readonly status: 'units_only'
      readonly reason:
        /** Nur ein übernommener Vorjahresverbrauch (Heizung), kein Vorjahr im System. */
        | 'stored_previous_consumption'
        /** Das Vorjahr lässt sich nicht berechnen. */
        | 'previous_calculation_failed'
        /** Energieeinsatz oder Verbrauch eines Jahres nicht ermittelbar. */
        | 'energy_not_determinable'
    }
  | {
      readonly status: 'unavailable'
      readonly reason: Exclude<PreviousPeriodConsumption['kind'], 'available'>
    }

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function energyYear(
  year: number,
  energy: TenantEnergyKwh,
  climateFactor: number | null,
): TenantEnergyYear {
  const heatingKwh = round(energy.heatingKwh, 0)
  const heatingAdjustedKwh =
    climateFactor === null
      ? heatingKwh
      : round(energy.heatingKwh * climateFactor, 0)
  const hotWaterKwh = round(energy.hotWaterKwh, 0)
  return {
    year,
    heatingKwh,
    heatingAdjustedKwh,
    hotWaterKwh,
    totalKwh: heatingAdjustedKwh + hotWaterKwh,
    climateFactor,
  }
}

/**
 * Energieverbrauch (Heizwärme + Warmwasser) der Mietpartei im Vorjahr und im
 * Abrechnungsjahr. `currentOutput` vermeidet eine erneute Berechnung des
 * Abrechnungsjahres.
 */
export function compareTenantEnergyWithPreviousPeriod(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  occupancy: Readonly<OccupancyPeriod>,
  options: { readonly currentOutput?: CalculationOutput } = {},
): PreviousPeriodEnergyComparison {
  const consumption = previousPeriodConsumption(data, period, occupancy)
  if (consumption.kind !== 'available')
    return { status: 'unavailable', reason: consumption.kind }
  if (consumption.origin === 'stored' || !consumption.previousPeriodId)
    return { status: 'units_only', reason: 'stored_previous_consumption' }
  let previousOutput: CalculationOutput
  let currentOutput: CalculationOutput
  try {
    previousOutput = calculateBilling(
      createCalculationInput(data as AppDataFile, consumption.previousPeriodId),
    )
    currentOutput =
      options.currentOutput ??
      calculateBilling(createCalculationInput(data as AppDataFile, period.id))
  } catch {
    return { status: 'units_only', reason: 'previous_calculation_failed' }
  }
  const current = tenantEnergyKwh(currentOutput, occupancy.id)
  const previousParts = consumption.previousOccupancyIds.map((id) =>
    tenantEnergyKwh(previousOutput, id),
  )
  if (!current || previousParts.some((part) => part === null))
    return { status: 'units_only', reason: 'energy_not_determinable' }
  const previous = (previousParts as TenantEnergyKwh[]).reduce(
    (sum, part) => ({
      heatingKwh: sum.heatingKwh + part.heatingKwh,
      hotWaterKwh: sum.hotWaterKwh + part.hotWaterKwh,
      centralHotWater: sum.centralHotWater || part.centralHotWater,
    }),
    { heatingKwh: 0, hotWaterKwh: 0, centralHotWater: false },
  )
  const basis = previousPeriodComparisonBasis(
    data,
    period,
    occupancy,
    consumption,
  )
  const factors = previousPeriodWeatherFactors(data, period, occupancy)
  const climate = basis.fullYears ? factors : null
  const scaledPrevious: TenantEnergyKwh = basis.proRata
    ? {
        ...previous,
        heatingKwh: previous.heatingKwh * basis.proRata.heatingFactor,
        hotWaterKwh: previous.hotWaterKwh * basis.proRata.hotWaterFactor,
      }
    : previous
  const previousYear = energyYear(
    consumption.year,
    scaledPrevious,
    climate?.previous ?? null,
  )
  const currentYear = energyYear(period.year, current, climate?.current ?? null)
  const currentEstimation = consumptionEstimation(occupancy)
  return {
    status: 'energy',
    previous: previousYear,
    current: currentYear,
    weatherAdjusted: climate !== null,
    climate,
    centralHotWater: previous.centralHotWater || current.centralHotWater,
    changePercent:
      previousYear.totalKwh > 0 &&
      currentEstimation !== 'estimated_from_previous_period'
        ? round(
            ((currentYear.totalKwh - previousYear.totalKwh) /
              previousYear.totalKwh) *
              100,
            1,
          )
        : null,
    basis,
    previousBeforeProRata: basis.proRata
      ? {
          heatingKwh: round(previous.heatingKwh, 0),
          hotWaterKwh: round(previous.hotWaterKwh, 0),
        }
      : null,
    climateNotAppliedPartialPeriod: !basis.fullYears && factors !== null,
    currentEstimation,
    previousEstimated: consumption.previousEstimated,
  }
}
