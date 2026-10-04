import { calculateRentLedger, matchRentPaymentTenancy } from '@nebenkosten/core'
import {
  appDataFileSchema,
  type AppDataFile,
  type BankBooking,
} from '@nebenkosten/schema'

export class RentLedgerCommandError extends Error {
  override readonly name = 'RentLedgerCommandError'
}

export interface AutoAssignResult {
  readonly data: AppDataFile
  readonly assignedCount: number
  readonly ambiguousCount: number
}

function validated(file: AppDataFile): AppDataFile {
  const result = appDataFileSchema.safeParse(file)
  if (!result.success)
    throw new RentLedgerCommandError(
      'Der neue Datenstand verletzt das Dateischema.',
    )
  return result.data
}

/** Soll des Monats, in dem die Buchung liegt (0 ohne Datum). */
function dueForBookingMonth(
  data: AppDataFile,
  tenancyId: string,
  date: string | null | undefined,
): number {
  if (!date) return 0
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return (
    calculateRentLedger(data, tenancyId, year, date).months[month - 1]
      ?.dueCents ?? 0
  )
}

/**
 * Ordnet Zahlungseingänge eines Objekts ohne Rückfrage einem Mietverhältnis
 * zu, wenn genau eines passt (menschliche Entscheidung 2026-10):
 * - Buchungen der Kategorie „Mieteingang“ bei eindeutigem Namen/Mandat,
 * - noch offene, ungeprüfte Eingänge zusätzlich nur, wenn der Betrag genau
 *   dem Monatssoll entspricht; sie werden dann als „Mieteingang“ eingestuft.
 * Mehrdeutige Treffer bleiben zur Zuordnung von Hand stehen.
 */
export function autoAssignRentPayments(
  data: AppDataFile,
  propertyId: string,
): AutoAssignResult {
  let assignedCount = 0
  let ambiguousCount = 0
  const bankBookings = data.billingData.bankBookings.map(
    (booking): BankBooking => {
      const isRent = booking.category === 'MIETEINGANG'
      const isOpen =
        (booking.category == null || booking.category === 'OFFEN') &&
        booking.reviewed !== true
      if (
        booking.propertyId !== propertyId ||
        booking.amountCents <= 0 ||
        booking.tenancyId != null ||
        (!isRent && !isOpen)
      )
        return booking
      const match = matchRentPaymentTenancy(data, booking)
      if (match.kind === 'ambiguous') ambiguousCount += 1
      if (match.kind !== 'unique') return booking
      if (
        isOpen &&
        booking.amountCents !==
          dueForBookingMonth(data, match.tenancyId, booking.date)
      )
        return booking
      assignedCount += 1
      return {
        ...booking,
        category: 'MIETEINGANG',
        tenancyId: match.tenancyId,
        tenancyAssignment: 'auto',
      }
    },
  )
  return {
    data:
      assignedCount === 0
        ? data
        : validated({
            ...data,
            billingData: { ...data.billingData, bankBookings },
          }),
    assignedCount,
    ambiguousCount,
  }
}

/** Zuordnung von Hand; `null` hebt sie auf. */
export function assignRentPayment(
  data: AppDataFile,
  bookingId: string,
  tenancyId: string | null,
): AppDataFile {
  const booking = data.billingData.bankBookings.find(
    ({ id }) => id === bookingId,
  )
  if (!booking)
    throw new RentLedgerCommandError('Buchung wurde nicht gefunden.')
  if (booking.amountCents <= 0)
    throw new RentLedgerCommandError(
      'Nur Zahlungseingänge können einem Mietverhältnis zugeordnet werden.',
    )
  if (tenancyId !== null) {
    const tenancy = data.masterData.tenancies.find(({ id }) => id === tenancyId)
    const unit = tenancy
      ? data.masterData.units.find(({ id }) => id === tenancy.unitId)
      : undefined
    if (!unit || unit.propertyId !== booking.propertyId)
      throw new RentLedgerCommandError(
        'Das Mietverhältnis gehört nicht zum Objekt der Buchung.',
      )
    if (booking.category !== 'MIETEINGANG' && booking.reviewed === true)
      throw new RentLedgerCommandError(
        'Die geprüfte Buchung ist nicht als Mieteingang eingestuft.',
      )
  }
  const unassigned = Object.fromEntries(
    Object.entries(booking).filter(
      ([key]) => key !== 'tenancyId' && key !== 'tenancyAssignment',
    ),
  ) as BankBooking
  const updated: BankBooking =
    tenancyId === null
      ? unassigned
      : {
          ...booking,
          category: 'MIETEINGANG',
          tenancyId,
          tenancyAssignment: 'manual',
        }
  return validated({
    ...data,
    billingData: {
      ...data.billingData,
      bankBookings: data.billingData.bankBookings.map((entry) =>
        entry.id === bookingId ? updated : entry,
      ),
    },
  })
}
