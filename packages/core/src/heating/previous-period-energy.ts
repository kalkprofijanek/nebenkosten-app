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
      /** Veränderung des Energieverbrauchs in Prozent, eine Stelle. */
      readonly changePercent: number | null
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
  const climate = previousPeriodWeatherFactors(data, period, occupancy)
  const previousYear = energyYear(
    consumption.year,
    previous,
    climate?.previous ?? null,
  )
  const currentYear = energyYear(period.year, current, climate?.current ?? null)
  return {
    status: 'energy',
    previous: previousYear,
    current: currentYear,
    weatherAdjusted: climate !== null,
    climate,
    centralHotWater: previous.centralHotWater || current.centralHotWater,
    changePercent:
      previousYear.totalKwh > 0
        ? round(
            ((currentYear.totalKwh - previousYear.totalKwh) /
              previousYear.totalKwh) *
              100,
            1,
          )
        : null,
  }
}
