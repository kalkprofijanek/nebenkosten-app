import { calculateOccupancyDays } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  HeatMeterReading,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import { METER_READING_TOLERANCE } from '@nebenkosten/validators'
import {
  explainConsumptionEstimate,
  type ConsumptionEstimateResult,
} from '../occupancies/estimate-consumption'
import { tenantDisplayName } from '../prepayments/overview'

/**
 * `measured`: Wert > 0 aus Ablesung/Messdienst; `estimated`: als geschätzt
 * gekennzeichnet; `zero`: ausdrücklich 0; `missing`: kein Wert erfasst.
 */
export type ConsumptionStatus = 'measured' | 'estimated' | 'zero' | 'missing'

export interface ConsumptionRow {
  readonly occupancy: OccupancyPeriod
  readonly unitLabel: string
  readonly tenantName: string
  readonly buildingId: string | null
  readonly buildingName: string
  readonly from: string
  readonly to: string
  readonly days: number
  readonly areaSqm: number | null
  readonly reading: HeatMeterReading | undefined
  readonly units: number | null
  readonly estimated: boolean
  readonly estimateReason: string | null
  /** Stand neu − Stand alt, sofern beide Stände erfasst sind. */
  readonly readingDifference: number | null
  /** Zählerdifferenz weicht vom erfassten Wert ab (wie die Freigabeprüfung). */
  readonly readingMismatch: boolean
  readonly status: ConsumptionStatus
  /** Heizkreis rechnet mit Wohnungswärmezählern (kWh); Werte hier unwirksam. */
  readonly meteredCircuit: boolean
  readonly estimate: ConsumptionEstimateResult
}

export interface BuildingEstimateShare {
  readonly buildingId: string
  readonly buildingName: string
  /** Anteil geschätzter Fläche × Tage an allen Mieter-Nutzungen (0–1). */
  readonly estimatedShare: number
}

export interface ConsumptionOverview {
  readonly period: BillingPeriod
  readonly rows: readonly ConsumptionRow[]
  readonly openCount: number
  readonly estimatedShares: readonly BuildingEstimateShare[]
}

/** § 9a Abs. 2 HeizKV: über 25 % geschätzter Fläche keine Verbrauchsverteilung. */
export const ESTIMATED_SHARE_LIMIT = 0.25

const collator = new Intl.Collator('de-DE', { numeric: true })

function round3(value: number) {
  return Math.round(value * 1000) / 1000
}

function statusOf(units: number | null, estimated: boolean): ConsumptionStatus {
  if (units === null) return 'missing'
  if (estimated) return 'estimated'
  return units > 0 ? 'measured' : 'zero'
}

/** Ob eine Zeile eine Schätzung braucht: kein Wert oder 0, nicht im kWh-Modus. */
export function needsEstimate(row: ConsumptionRow): boolean {
  return (
    !row.meteredCircuit && (row.status === 'missing' || row.status === 'zero')
  )
}

export function buildConsumptionOverview(
  data: AppDataFile,
  billingPeriodId: string,
): ConsumptionOverview | null {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period) return null
  const meteredBuildings = new Set(
    data.billingData.heatingCircuits
      .filter(
        (circuit) =>
          circuit.billingPeriodId === period.id &&
          circuit.consumptionMode === 'metered_kwh',
      )
      .map(({ buildingId }) => buildingId),
  )
  const days = (from?: string | null, to?: string | null) => {
    try {
      return calculateOccupancyDays(
        period.periodStart,
        period.periodEnd,
        from,
        to,
      )
    } catch {
      return 0
    }
  }
  const rows = data.billingData.occupancyPeriods
    .filter(
      (occupancy) =>
        occupancy.billingPeriodId === period.id && occupancy.kind === 'tenant',
    )
    .map((occupancy): ConsumptionRow => {
      const unit = data.masterData.units.find(
        ({ id }) => id === occupancy.unitId,
      )
      const buildingId = unit?.buildingId ?? null
      const reading = occupancy.heatMeterReading ?? undefined
      const units = occupancy.consumptionUnits?.value ?? null
      const estimated = occupancy.consumptionUnitsEstimated === true
      const readingDifference =
        typeof reading?.startValue === 'number' &&
        typeof reading.endValue === 'number'
          ? round3(reading.endValue - reading.startValue)
          : null
      return {
        occupancy,
        unitLabel: unit?.label || unit?.location || occupancy.unitId,
        tenantName: tenantDisplayName(data, occupancy.tenancyId),
        buildingId,
        buildingName:
          data.masterData.buildings.find(({ id }) => id === buildingId)?.name ??
          'ohne Gebäude',
        from: occupancy.from ?? period.periodStart,
        to: occupancy.to ?? period.periodEnd,
        days: days(occupancy.from, occupancy.to),
        areaSqm: unit?.heatedAreaSqm?.value ?? null,
        reading,
        units,
        estimated,
        estimateReason: occupancy.consumptionUnitsEstimateReason ?? null,
        readingDifference,
        readingMismatch:
          readingDifference !== null &&
          (units === null ||
            Math.abs(readingDifference - units) > METER_READING_TOLERANCE),
        status: statusOf(units, estimated),
        meteredCircuit: buildingId !== null && meteredBuildings.has(buildingId),
        estimate: explainConsumptionEstimate(data, occupancy.id),
      }
    })
    .sort(
      (left, right) =>
        collator.compare(left.buildingName, right.buildingName) ||
        collator.compare(left.unitLabel, right.unitLabel) ||
        left.from.localeCompare(right.from),
    )

  const shares = new Map<
    string,
    { name: string; total: number; estimated: number }
  >()
  for (const row of rows) {
    if (row.buildingId === null || row.meteredCircuit) continue
    const weight = (row.areaSqm ?? 0) * row.days
    const entry = shares.get(row.buildingId) ?? {
      name: row.buildingName,
      total: 0,
      estimated: 0,
    }
    entry.total += weight
    if (row.estimated) entry.estimated += weight
    shares.set(row.buildingId, entry)
  }

  return {
    period,
    rows,
    openCount: rows.filter(needsEstimate).length,
    estimatedShares: [...shares]
      .filter(([, entry]) => entry.total > 0 && entry.estimated > 0)
      .map(([buildingId, entry]) => ({
        buildingId,
        buildingName: entry.name,
        estimatedShare: entry.estimated / entry.total,
      })),
  }
}
