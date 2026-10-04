import {
  createEmptyAppDataFile,
  type AppDataFile,
  type BankBooking,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  RentLedgerCommandError,
  assignRentPayment,
  autoAssignRentPayments,
} from './commands'

const ID = (n: number) =>
  `54000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P = ID(1)

function booking(n: number, overrides: Partial<BankBooking>): BankBooking {
  return {
    id: ID(100 + n),
    propertyId: P,
    date: '2026-02-03',
    amountCents: 60_000,
    category: 'MIETEINGANG',
    ...overrides,
  }
}

function data(bankBookings: BankBooking[]): AppDataFile {
  const file = createEmptyAppDataFile()
  file.masterData.organizations = [{ id: ID(2), name: 'Beispielverwaltung' }]
  file.masterData.ownerCompanies = [
    {
      id: ID(3),
      organizationId: ID(2),
      name: 'Beispiel Eigentum',
      additionalNameLines: [],
    },
  ]
  file.masterData.properties = [
    { id: P, ownerCompanyId: ID(3) },
    { id: ID(4), ownerCompanyId: ID(3) },
  ]
  file.masterData.units = [
    { id: ID(5), propertyId: P },
    { id: ID(6), propertyId: P },
    { id: ID(7), propertyId: ID(4) },
  ]
  file.masterData.persons = [
    { id: ID(8), organizationId: ID(2), lastName: 'Beispiel' },
    { id: ID(9), organizationId: ID(2), lastName: 'Muster' },
  ]
  file.masterData.tenancies = [
    {
      id: ID(10),
      unitId: ID(5),
      personIds: [ID(8)],
      monthlyRentCents: 60_000,
    },
    {
      id: ID(11),
      unitId: ID(6),
      personIds: [ID(9)],
      monthlyRentCents: 45_000,
    },
    { id: ID(12), unitId: ID(7), personIds: [] },
  ]
  file.billingData.bankBookings = bankBookings
  return file
}

describe('Mieteingänge zuordnen', () => {
  it('ordnet eindeutige Mieteingänge ohne Rückfrage zu', () => {
    const result = autoAssignRentPayments(
      data([
        booking(1, { counterparty: 'Erika Beispiel' }),
        booking(2, { counterparty: 'Beispiel und Muster' }),
        booking(3, { counterparty: 'Unbekannt' }),
        booking(4, { counterparty: 'Muster', amountCents: -100 }),
        booking(5, { counterparty: 'Muster', category: 'KAUTION' }),
        booking(6, { counterparty: 'Muster', propertyId: ID(4) }),
        booking(7, { counterparty: 'Muster', tenancyId: ID(10) }),
      ]),
      P,
    )
    expect(result.assignedCount).toBe(1)
    expect(result.ambiguousCount).toBe(1)
    const bookings = result.data.billingData.bankBookings
    expect(bookings[0]).toMatchObject({
      tenancyId: ID(10),
      tenancyAssignment: 'auto',
    })
    expect(bookings.slice(1).map(({ tenancyId }) => tenancyId)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ID(10),
    ])
  })

  it('stuft offene Eingänge nur bei passendem Monatssoll als Mieteingang ein', () => {
    const result = autoAssignRentPayments(
      data([
        booking(1, { category: 'OFFEN', counterparty: 'Muster' }),
        booking(2, {
          category: 'OFFEN',
          counterparty: 'Muster',
          amountCents: 45_000,
        }),
        booking(3, {
          category: 'OFFEN',
          counterparty: 'Muster',
          amountCents: 45_000,
          reviewed: true,
        }),
        booking(4, { category: null, counterparty: 'Muster', date: null }),
      ]),
      P,
    )
    expect(result.assignedCount).toBe(1)
    expect(
      result.data.billingData.bankBookings.map(({ category }) => category),
    ).toEqual(['OFFEN', 'MIETEINGANG', 'OFFEN', null])
  })

  it('gibt ohne Treffer denselben Datenstand zurück', () => {
    const file = data([booking(1, { counterparty: 'Unbekannt' })])
    expect(autoAssignRentPayments(file, P).data).toBe(file)
  })

  it('ordnet von Hand zu und hebt die Zuordnung wieder auf', () => {
    const file = data([booking(1, { category: 'OFFEN' })])
    const assigned = assignRentPayment(file, ID(101), ID(11))
    expect(assigned.billingData.bankBookings[0]).toMatchObject({
      category: 'MIETEINGANG',
      tenancyId: ID(11),
      tenancyAssignment: 'manual',
    })
    const cleared = assignRentPayment(assigned, ID(101), null)
    expect(cleared.billingData.bankBookings[0]).not.toHaveProperty('tenancyId')
    expect(cleared.billingData.bankBookings[0]).not.toHaveProperty(
      'tenancyAssignment',
    )
  })

  it('verweigert unzulässige Zuordnungen', () => {
    const file = data([
      booking(1, {}),
      booking(2, { amountCents: -500 }),
      booking(3, { category: 'KAUTION', reviewed: true }),
    ])
    expect(() => assignRentPayment(file, 'fehlt', ID(10))).toThrow(
      RentLedgerCommandError,
    )
    expect(() => assignRentPayment(file, ID(102), ID(10))).toThrow(
      'Nur Zahlungseingänge',
    )
    expect(() => assignRentPayment(file, ID(101), ID(12))).toThrow(
      'gehört nicht zum Objekt',
    )
    expect(() => assignRentPayment(file, ID(101), 'unbekannt')).toThrow(
      'gehört nicht zum Objekt',
    )
    expect(() => assignRentPayment(file, ID(103), ID(10))).toThrow(
      'nicht als Mieteingang',
    )
  })
})
