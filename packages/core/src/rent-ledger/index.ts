/**
 * Mietkonto (ADR-0003): Soll und Ist je Monat eines Mietverhältnisses.
 *
 * Soll = Kaltmiete (`Tenancy.monthlyRentCents`) + vereinbarte Vorauszahlung
 * des Nutzungszeitraums, bei Teilmonaten taggenau anteilig. Ist = dem
 * Mietverhältnis zugeordnete Mieteingänge (Bankbuchungen der Kategorie
 * `MIETEINGANG`) des Jahres; sie füllen die Monate der Reihe nach auf.
 *
 * Rein informativ: Die Nebenkostenabrechnung rechnet weiter mit den
 * vereinbarten Vorauszahlungen (menschliche Entscheidung 2026-10).
 */
import type {
  AppDataFile,
  BankBooking,
  OccupancyPeriod,
  Prepayment,
  Tenancy,
} from '@nebenkosten/schema'
import { calculateMonthlyOccupancyFactor, daysInYear } from '../periods'
import { roundCentsHalfAwayFromZero } from '../rounding'

export type RentMonthStatus =
  'paid' | 'partial' | 'open' | 'not_due' | 'not_occupied'

export interface RentLedgerMonth {
  /** 1 = Januar. */
  month: number
  dueCents: number
  paidCents: number
  status: RentMonthStatus
}

export interface RentLedgerPayment {
  bookingId: string
  date: string | null
  amountCents: number
}

export interface RentLedger {
  tenancyId: string
  year: number
  months: RentLedgerMonth[]
  dueTotalCents: number
  /** Soll aller Monate, die am Stichtag begonnen haben. */
  dueToDateCents: number
  paidCents: number
  arrearsCents: number
  creditCents: number
  payments: RentLedgerPayment[]
}

interface Window {
  from: string
  to: string
  prepayment?: Prepayment
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function maxIso(left: string, right: string | null | undefined): string {
  return right && right > left ? right : left
}

function minIso(left: string, right: string | null | undefined): string {
  return right && right < left ? right : left
}

/** Belegte Zeitfenster des Mietverhältnisses im Jahr. */
function occupancyWindows(
  data: AppDataFile,
  tenancy: Tenancy,
  year: number,
): Window[] {
  const yearStart = iso(year, 1, 1)
  const yearEnd = iso(year, 12, 31)
  const periodIds = new Set(
    data.billingData.billingPeriods
      .filter((period) => period.year === year)
      .map(({ id }) => id),
  )
  const periods = data.billingData.billingPeriods
  const occupancies = data.billingData.occupancyPeriods.filter(
    (occupancy: OccupancyPeriod) =>
      occupancy.tenancyId === tenancy.id &&
      occupancy.kind === 'tenant' &&
      periodIds.has(occupancy.billingPeriodId),
  )
  if (occupancies.length > 0)
    return occupancies.map((occupancy) => {
      const period = periods.find(({ id }) => id === occupancy.billingPeriodId)!
      return {
        from: maxIso(period.periodStart, occupancy.from),
        to: minIso(period.periodEnd, occupancy.to),
        prepayment: data.billingData.prepayments.find(
          ({ occupancyPeriodId }) => occupancyPeriodId === occupancy.id,
        ),
      }
    })
  const from = maxIso(yearStart, tenancy.movedIn)
  const to = minIso(yearEnd, tenancy.movedOut)
  return from <= to ? [{ from, to }] : []
}

function prepaymentForMonth(
  window: Window,
  factor: number,
  year: number,
  month: number,
): number {
  const prepayment = window.prepayment
  if (!prepayment || prepayment.mode === 'none_agreed') return 0
  if (prepayment.mode === 'monthly')
    return prepayment.monthlyAmountCents * factor
  const monthDays = lastDayOfMonth(year, month)
  return (prepayment.annualAmountCents / daysInYear(year)) * monthDays * factor
}

export function calculateRentLedger(
  data: AppDataFile,
  tenancyId: string,
  year: number,
  today: string,
): RentLedger {
  const tenancy = data.masterData.tenancies.find(({ id }) => id === tenancyId)
  if (!tenancy)
    throw new Error(`Mietverhältnis "${tenancyId}" wurde nicht gefunden.`)
  const windows = occupancyWindows(data, tenancy, year)
  const rent = tenancy.monthlyRentCents ?? 0

  const dues = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const monthStart = iso(year, month, 1)
    const monthEnd = iso(year, month, lastDayOfMonth(year, month))
    const exact = windows.reduce((sum, window) => {
      const factor = calculateMonthlyOccupancyFactor(
        monthStart,
        monthEnd,
        window.from,
        window.to,
      )
      return (
        sum + rent * factor + prepaymentForMonth(window, factor, year, month)
      )
    }, 0)
    return { month, monthStart, dueCents: roundCentsHalfAwayFromZero(exact) }
  })

  const payments: RentLedgerPayment[] = data.billingData.bankBookings
    .filter(
      (booking: BankBooking) =>
        booking.tenancyId === tenancyId &&
        booking.category === 'MIETEINGANG' &&
        booking.amountCents > 0 &&
        booking.date != null &&
        booking.date.startsWith(`${String(year).padStart(4, '0')}-`),
    )
    .sort((left, right) =>
      `${left.date}|${left.id}`.localeCompare(`${right.date}|${right.id}`),
    )
    .map(({ id, date, amountCents }) => ({
      bookingId: id,
      date: date ?? null,
      amountCents,
    }))
  const paidCents = payments.reduce(
    (sum, { amountCents }) => sum + amountCents,
    0,
  )

  let remaining = paidCents
  const months = dues.map(({ month, monthStart, dueCents }) => {
    const covered = Math.min(remaining, dueCents)
    remaining -= covered
    const status: RentMonthStatus =
      dueCents === 0
        ? 'not_occupied'
        : covered >= dueCents
          ? 'paid'
          : monthStart > today
            ? 'not_due'
            : covered > 0
              ? 'partial'
              : 'open'
    return { month, dueCents, paidCents: covered, status }
  })

  const dueTotalCents = dues.reduce((sum, { dueCents }) => sum + dueCents, 0)
  const dueToDateCents = dues
    .filter(({ monthStart }) => monthStart <= today)
    .reduce((sum, { dueCents }) => sum + dueCents, 0)
  return {
    tenancyId,
    year,
    months,
    dueTotalCents,
    dueToDateCents,
    paidCents,
    arrearsCents: Math.max(0, dueToDateCents - paidCents),
    creditCents: Math.max(0, paidCents - dueTotalCents),
    payments,
  }
}

export type RentPaymentMatch =
  | { kind: 'unique'; tenancyId: string }
  | { kind: 'ambiguous'; tenancyIds: string[] }
  | { kind: 'none' }

/** Kleinbuchstaben, Umlaute vereinheitlicht, nur Buchstaben und Ziffern. */
function normalizedWords(value: string): string {
  return ` ${value
    .toLocaleLowerCase('de-DE')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `
}

function containsWords(
  text: string,
  needle: string | null | undefined,
): boolean {
  if (!needle) return false
  const words = normalizedWords(needle)
  return words.trim().length >= 3 && text.includes(words)
}

/**
 * Sucht das Mietverhältnis zu einem Zahlungseingang über Nachname bzw.
 * Anzeigename der Mieter und die Mandatsreferenz in Auftraggeber und
 * Verwendungszweck. Berücksichtigt nur Mietverhältnisse des Objekts, die
 * am Zahltag bestehen. Zugeordnet wird nur bei genau einem Treffer.
 */
export function matchRentPaymentTenancy(
  data: AppDataFile,
  booking: Pick<
    BankBooking,
    'propertyId' | 'date' | 'counterparty' | 'purpose'
  >,
): RentPaymentMatch {
  const text = normalizedWords(
    `${booking.counterparty ?? ''} ${booking.purpose ?? ''}`,
  )
  const unitIds = new Set(
    data.masterData.units
      .filter(({ propertyId }) => propertyId === booking.propertyId)
      .map(({ id }) => id),
  )
  const personsById = new Map(
    data.masterData.persons.map((person) => [person.id, person]),
  )
  const tenancyIds = data.masterData.tenancies
    .filter(
      (tenancy) =>
        unitIds.has(tenancy.unitId) &&
        (booking.date == null ||
          ((!tenancy.movedIn || tenancy.movedIn <= booking.date) &&
            (!tenancy.movedOut || tenancy.movedOut >= booking.date))),
    )
    .filter(
      (tenancy) =>
        containsWords(text, tenancy.mandateReference) ||
        tenancy.personIds.some((personId) => {
          const person = personsById.get(personId)
          return (
            containsWords(text, person?.lastName) ||
            containsWords(text, person?.displayName)
          )
        }),
    )
    .map(({ id }) => id)
  if (tenancyIds.length === 1)
    return { kind: 'unique', tenancyId: tenancyIds[0]! }
  if (tenancyIds.length > 1) return { kind: 'ambiguous', tenancyIds }
  return { kind: 'none' }
}
