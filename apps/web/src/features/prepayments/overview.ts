import { calculatePrepaymentCents } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
  Prepayment,
} from '@nebenkosten/schema'

export interface PreviousPrepayment {
  readonly year: number
  readonly billingPeriodId: string
  readonly occupancyPeriodId: string
  readonly prepayment: Prepayment | undefined
  /** Monatswert für den Vergleich; `null` bei Jahresbetrag oder ohne Eintrag. */
  readonly monthlyCents: number | null
}

export interface PrepaymentOverviewRow {
  readonly occupancy: OccupancyPeriod
  readonly unitLabel: string
  readonly tenantName: string
  readonly from: string
  readonly to: string
  readonly prepayment: Prepayment | undefined
  readonly monthlyCents: number | null
  /** Jahressoll für die Belegung im Abrechnungsjahr (wie in der Berechnung). */
  readonly annualTargetCents: number
  readonly previous: PreviousPrepayment | null
  readonly differenceCents: number | null
}

export interface PrepaymentOverview {
  readonly period: BillingPeriod
  readonly previousPeriod: BillingPeriod | undefined
  readonly rows: readonly PrepaymentOverviewRow[]
  readonly totals: {
    readonly monthlyCents: number
    readonly annualTargetCents: number
    readonly previousMonthlyCents: number
    readonly differenceCents: number
  }
}

export function tenantDisplayName(
  data: AppDataFile,
  tenancyId: string | null | undefined,
): string {
  const tenancy = data.masterData.tenancies.find(({ id }) => id === tenancyId)
  return (
    data.masterData.persons
      .filter((person) => tenancy?.personIds.includes(person.id))
      .map(
        (person) =>
          person.displayName ||
          [person.firstName, person.lastName].filter(Boolean).join(' '),
      )
      .filter(Boolean)
      .join(', ') || 'Name nicht erfasst'
  )
}

/** Monatswert einer Vorauszahlung; Jahresbeträge sind nicht vergleichbar. */
export function monthlyEquivalent(
  prepayment: Prepayment | undefined,
): number | null {
  if (prepayment?.mode === 'monthly') return prepayment.monthlyAmountCents
  if (prepayment?.mode === 'none_agreed') return 0
  return null
}

function prepaymentFor(data: AppDataFile, occupancyPeriodId: string) {
  return data.billingData.prepayments.find(
    (item) => item.occupancyPeriodId === occupancyPeriodId,
  )
}

function previousPrepayment(
  data: AppDataFile,
  previousPeriod: BillingPeriod | undefined,
  tenancyId: string | null | undefined,
): PreviousPrepayment | null {
  if (!previousPeriod || tenancyId == null) return null
  const occupancy = data.billingData.occupancyPeriods
    .filter(
      (item) =>
        item.billingPeriodId === previousPeriod.id &&
        item.kind === 'tenant' &&
        item.tenancyId === tenancyId,
    )
    .sort((left, right) =>
      (left.to ?? previousPeriod.periodEnd).localeCompare(
        right.to ?? previousPeriod.periodEnd,
      ),
    )
    .at(-1)
  if (!occupancy) return null
  const prepayment = prepaymentFor(data, occupancy.id)
  return {
    year: previousPeriod.year,
    billingPeriodId: previousPeriod.id,
    occupancyPeriodId: occupancy.id,
    prepayment,
    monthlyCents: monthlyEquivalent(prepayment),
  }
}

const collator = new Intl.Collator('de-DE', { numeric: true })

/** Alle Mieter-Belegungen des Abrechnungsjahres mit Vorauszahlung. */
export function buildPrepaymentOverview(
  data: AppDataFile,
  billingPeriodId: string,
): PrepaymentOverview | null {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period) return null
  const previousPeriod = data.billingData.billingPeriods.find(
    (item) =>
      item.propertyId === period.propertyId && item.year === period.year - 1,
  )
  const rows = data.billingData.occupancyPeriods
    .filter(
      (occupancy) =>
        occupancy.billingPeriodId === period.id && occupancy.kind === 'tenant',
    )
    .map((occupancy): PrepaymentOverviewRow => {
      const prepayment = prepaymentFor(data, occupancy.id)
      const monthlyCents = monthlyEquivalent(prepayment)
      const previous = previousPrepayment(
        data,
        previousPeriod,
        occupancy.tenancyId,
      )
      const unit = data.masterData.units.find(
        ({ id }) => id === occupancy.unitId,
      )
      return {
        occupancy,
        unitLabel: unit?.label || occupancy.unitId,
        tenantName: tenantDisplayName(data, occupancy.tenancyId),
        from: occupancy.from ?? period.periodStart,
        to: occupancy.to ?? period.periodEnd,
        prepayment,
        monthlyCents,
        annualTargetCents: calculatePrepaymentCents(
          prepayment,
          occupancy,
          period,
        ),
        previous,
        differenceCents:
          monthlyCents !== null &&
          previous !== null &&
          previous.monthlyCents !== null
            ? monthlyCents - previous.monthlyCents
            : null,
      }
    })
    .sort(
      (left, right) =>
        collator.compare(left.unitLabel, right.unitLabel) ||
        left.from.localeCompare(right.from),
    )
  const sum = (pick: (row: PrepaymentOverviewRow) => number | null) =>
    rows.reduce((total, row) => total + (pick(row) ?? 0), 0)
  return {
    period,
    previousPeriod,
    rows,
    totals: {
      monthlyCents: sum((row) => row.monthlyCents),
      annualTargetCents: sum((row) => row.annualTargetCents),
      previousMonthlyCents: sum((row) => row.previous?.monthlyCents ?? null),
      differenceCents: sum((row) => row.differenceCents),
    },
  }
}
