import {
  createEmptyAppDataFile,
  type AppDataFile,
  type BankBooking,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { calculateRentLedger, matchRentPaymentTenancy } from '../src'

const P = 'property-1'

function booking(
  id: string,
  date: string,
  amountCents: number,
  overrides: Partial<BankBooking> = {},
): BankBooking {
  return {
    id,
    propertyId: P,
    date,
    amountCents,
    category: 'MIETEINGANG',
    tenancyId: 'tenancy-a',
    ...overrides,
  }
}

/**
 * Wohnung A: Mieterin Beispiel ab 2025, 500 € Kaltmiete + 100 € VZ.
 * Wohnung B: Mieter Muster bis 15.06.2025, 400 € + 80 € VZ.
 */
function data(bankBookings: BankBooking[] = []): AppDataFile {
  const file = createEmptyAppDataFile()
  file.masterData.properties = [{ id: P, ownerCompanyId: 'owner' }]
  file.masterData.units = [
    { id: 'unit-a', propertyId: P, label: 'A' },
    { id: 'unit-b', propertyId: P, label: 'B' },
    { id: 'unit-x', propertyId: 'other', label: 'X' },
  ]
  file.masterData.persons = [
    { id: 'p-a', organizationId: 'org', lastName: 'Beispiel' },
    { id: 'p-b', organizationId: 'org', lastName: 'Muster' },
    { id: 'p-x', organizationId: 'org', lastName: 'Fremd' },
  ]
  file.masterData.tenancies = [
    {
      id: 'tenancy-a',
      unitId: 'unit-a',
      personIds: ['p-a'],
      mandateReference: 'AW1_001',
      movedIn: '2025-01-01',
      monthlyRentCents: 50_000,
    },
    {
      id: 'tenancy-b',
      unitId: 'unit-b',
      personIds: ['p-b'],
      movedIn: '2020-01-01',
      movedOut: '2025-06-15',
      monthlyRentCents: 40_000,
    },
    {
      id: 'tenancy-x',
      unitId: 'unit-x',
      personIds: ['p-x'],
      monthlyRentCents: 1_000,
    },
  ]
  file.billingData.billingPeriods = [
    {
      id: 'bp-2025',
      propertyId: P,
      year: 2025,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      status: 'DRAFT',
    },
  ]
  file.billingData.occupancyPeriods = [
    {
      id: 'op-a',
      billingPeriodId: 'bp-2025',
      unitId: 'unit-a',
      tenancyId: 'tenancy-a',
      kind: 'tenant',
    },
    {
      id: 'op-b',
      billingPeriodId: 'bp-2025',
      unitId: 'unit-b',
      tenancyId: 'tenancy-b',
      kind: 'tenant',
      to: '2025-06-15',
    },
  ]
  file.billingData.prepayments = [
    {
      id: 'vz-a',
      occupancyPeriodId: 'op-a',
      mode: 'monthly',
      monthlyAmountCents: 10_000,
    },
    {
      id: 'vz-b',
      occupancyPeriodId: 'op-b',
      mode: 'monthly',
      monthlyAmountCents: 8_000,
    },
  ]
  file.billingData.bankBookings = bankBookings
  return file
}

describe('Mietkonto', () => {
  it('bildet das Soll aus Kaltmiete und Vorauszahlung je Monat', () => {
    const ledger = calculateRentLedger(data(), 'tenancy-a', 2025, '2025-12-31')
    expect(ledger.months.map(({ dueCents }) => dueCents)).toEqual(
      Array(12).fill(60_000),
    )
    expect(ledger.dueTotalCents).toBe(720_000)
  })

  it('rechnet einen Auszug zur Monatsmitte taggenau ab', () => {
    const ledger = calculateRentLedger(data(), 'tenancy-b', 2025, '2025-12-31')
    // Juni: 15 von 30 Tagen von 480 € = 240 €; danach nichts mehr.
    expect(ledger.months.map(({ dueCents }) => dueCents)).toEqual([
      48_000, 48_000, 48_000, 48_000, 48_000, 24_000, 0, 0, 0, 0, 0, 0,
    ])
    expect(ledger.months[6]!.status).toBe('not_occupied')
  })

  it('füllt Zahlungen der Reihe nach auf und weist Rückstand aus', () => {
    const ledger = calculateRentLedger(
      data([
        booking('b1', '2025-01-03', 60_000),
        booking('b2', '2025-02-03', 60_000),
        booking('b3', '2025-03-03', 30_000),
        booking('kaution', '2025-01-02', 150_000, { category: 'KAUTION' }),
        booking('fremd', '2025-01-03', 60_000, { tenancyId: 'tenancy-b' }),
        booking('vorjahr', '2024-12-30', 60_000),
        booking('erstattung', '2025-03-10', -5_000),
      ]),
      'tenancy-a',
      2025,
      '2025-04-15',
    )
    expect(ledger.months.slice(0, 5).map(({ status }) => status)).toEqual([
      'paid',
      'paid',
      'partial',
      'open',
      'not_due',
    ])
    expect(ledger.paidCents).toBe(150_000)
    expect(ledger.dueToDateCents).toBe(240_000)
    expect(ledger.arrearsCents).toBe(90_000)
    expect(ledger.creditCents).toBe(0)
    expect(ledger.payments.map(({ bookingId }) => bookingId)).toEqual([
      'b1',
      'b2',
      'b3',
    ])
  })

  it('zeigt Vorauszahlungen künftiger Monate als bezahlt und Überzahlung als Guthaben', () => {
    const ledger = calculateRentLedger(
      data([booking('jahr', '2025-01-02', 730_000)]),
      'tenancy-a',
      2025,
      '2025-02-01',
    )
    expect(ledger.months.every(({ status }) => status === 'paid')).toBe(true)
    expect(ledger.arrearsCents).toBe(0)
    expect(ledger.creditCents).toBe(10_000)
  })

  it('nutzt ohne Abrechnungsjahr Ein- und Auszugsdatum und nur die Kaltmiete', () => {
    const ledger = calculateRentLedger(data(), 'tenancy-a', 2026, '2026-12-31')
    expect(ledger.months[0]!.dueCents).toBe(50_000)
    expect(ledger.dueTotalCents).toBe(600_000)
  })

  it('wirft bei unbekanntem Mietverhältnis', () => {
    expect(() =>
      calculateRentLedger(data(), 'unbekannt', 2025, '2025-12-31'),
    ).toThrow('Mietverhältnis "unbekannt" wurde nicht gefunden.')
  })
})

describe('Zuordnung von Mieteingängen', () => {
  const unassigned = (overrides: Partial<BankBooking>) =>
    booking('neu', '2025-03-03', 60_000, { tenancyId: undefined, ...overrides })

  it('ordnet eindeutig über den Nachnamen zu', () => {
    expect(
      matchRentPaymentTenancy(
        data(),
        unassigned({ counterparty: 'Erika Beispiel' }),
      ),
    ).toEqual({ kind: 'unique', tenancyId: 'tenancy-a' })
  })

  it('ordnet eindeutig über die Mandatsreferenz zu', () => {
    expect(
      matchRentPaymentTenancy(
        data(),
        unassigned({ purpose: 'Miete Maerz AW1-001' }),
      ),
    ).toEqual({ kind: 'unique', tenancyId: 'tenancy-a' })
  })

  it('ordnet nicht zu, wenn mehrere Mietverhältnisse passen', () => {
    expect(
      matchRentPaymentTenancy(
        data(),
        unassigned({ counterparty: 'Beispiel und Muster GbR' }),
      ),
    ).toEqual({ kind: 'ambiguous', tenancyIds: ['tenancy-a', 'tenancy-b'] })
  })

  it('berücksichtigt nur Mietverhältnisse des Objekts, die am Zahltag bestehen', () => {
    expect(
      matchRentPaymentTenancy(
        data(),
        unassigned({ date: '2025-08-01', counterparty: 'Muster' }),
      ),
    ).toEqual({ kind: 'none' })
    expect(
      matchRentPaymentTenancy(data(), unassigned({ counterparty: 'Fremd' })),
    ).toEqual({ kind: 'none' })
    expect(
      matchRentPaymentTenancy(
        data(),
        unassigned({ date: null, counterparty: 'Beispiel' }),
      ),
    ).toEqual({ kind: 'unique', tenancyId: 'tenancy-a' })
  })

  it('verlangt ganze Wörter und ignoriert kurze Namen', () => {
    const file = data()
    file.masterData.persons[0]!.lastName = 'Bo'
    expect(
      matchRentPaymentTenancy(file, unassigned({ counterparty: 'Bo' })),
    ).toEqual({ kind: 'none' })
    expect(
      matchRentPaymentTenancy(
        data(),
        unassigned({ counterparty: 'Beispielhaus GmbH' }),
      ),
    ).toEqual({ kind: 'none' })
  })
})
