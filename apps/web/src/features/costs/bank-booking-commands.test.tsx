import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { encodeCurrentAppData } from '@nebenkosten/import-export'
import { describe, expect, it } from 'vitest'
import {
  addBankBooking,
  bankBookingDedupeHash,
  importBankBookings,
  setBankBookingReviewed,
  updateBankBooking,
} from './bank-booking-commands'

const IDS = {
  organization: '70000000-0000-4000-8000-000000000001',
  company: '70000000-0000-4000-8000-000000000002',
  property: '70000000-0000-4000-8000-000000000003',
  period: '70000000-0000-4000-8000-000000000004',
  category: '70000000-0000-4000-8000-000000000005',
  booking: '70000000-0000-4000-8000-000000000006',
  splitOne: '70000000-0000-4000-8000-000000000007',
  splitTwo: '70000000-0000-4000-8000-000000000008',
} as const

function validFile(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return appDataFileSchema.parse({
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: IDS.organization, name: 'Fiktive Verwaltung' }],
      ownerCompanies: [
        {
          id: IDS.company,
          organizationId: IDS.organization,
          name: 'Fiktive Eigentümerin',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: IDS.property, ownerCompanyId: IDS.company }],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: IDS.period,
          propertyId: IDS.property,
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
      costCategories: [
        {
          id: IDS.category,
          billingPeriodId: IDS.period,
          kind: 'operating',
          label: 'Fiktive Kostenart',
        },
      ],
      bankBookings: [
        {
          id: IDS.booking,
          propertyId: IDS.property,
          date: '2026-03-01',
          amountCents: -10_000,
          counterparty: 'Fiktiver Zahlungspartner',
          purpose: 'Fiktive Leistung',
          category: 'OFFEN',
        },
      ],
    },
  })
}

describe('bank booking commands', () => {
  it('erfasst eine manuelle Bankbuchung mit stabilem Duplikatschutz', () => {
    const source = validFile()
    const created = addBankBooking(
      source,
      {
        propertyId: IDS.property,
        date: '2026-04-15',
        amountCents: -12_345,
        counterparty: 'Fiktiver Dienstleister',
        purpose: 'Fiktive Rechnung 2026-04',
      },
      () => '70000000-0000-4000-8000-000000000009',
    )

    expect(source.billingData.bankBookings).toHaveLength(1)
    expect(created.billingData.bankBookings[1]).toMatchObject({
      propertyId: IDS.property,
      date: '2026-04-15',
      amountCents: -12_345,
      category: 'OFFEN',
      reviewed: false,
    })
    expect(created.billingData.bankBookings[1]?.dedupeHash).toBeTruthy()
    expect(created.billingData.bankBookings[1]?.dedupeHash).toMatch(
      /^bh[0-9a-f]{16}$/u,
    )
    expect(() =>
      addBankBooking(created, {
        propertyId: IDS.property,
        date: '2026-04-15',
        amountCents: -12_345,
        counterparty: 'Fiktiver Dienstleister',
        purpose: 'Fiktive Rechnung 2026-04',
      }),
    ).toThrowError(/bereits/)
  })

  it('importiert neue CSV-Zeilen und überspringt Duplikate', () => {
    const source = validFile()
    source.billingData.bankBookings[0] = {
      ...source.billingData.bankBookings[0]!,
      dedupeHash: 'legacy-hash',
    }
    const result = importBankBookings(
      source,
      IDS.property,
      [
        {
          date: '2026-03-01',
          amountCents: -10_000,
          counterparty: 'Fiktiver Zahlungspartner',
          purpose: 'Fiktive Leistung',
        },
        {
          date: '2026-05-01',
          amountCents: -25_000,
          counterparty: 'Fiktive Stadtwerke',
          purpose: 'Fiktive Jahresrechnung',
        },
      ],
      {
        createId: () => '70000000-0000-4000-8000-000000000010',
        importedAt: '2026-08-17T10:00:00.000Z',
      },
    )

    expect(result.addedCount).toBe(1)
    expect(result.duplicateCount).toBe(1)
    expect(result.data.billingData.bankBookings).toHaveLength(2)
    expect(result.data.billingData.bankBookings[1]).toMatchObject({
      importedAt: '2026-08-17T10:00:00.000Z',
      category: 'OFFEN',
    })
  })

  it('bildet den Duplikatschlüssel deterministisch aus den Buchungsdaten', () => {
    const input = {
      date: '2026-04-15',
      amountCents: -12_345,
      counterparty: 'Fiktiver Dienstleister',
      purpose: 'Fiktive Rechnung',
    }

    expect(bankBookingDedupeHash(input)).toBe(bankBookingDedupeHash(input))
    expect(bankBookingDedupeHash({ ...input, amountCents: -12_346 })).not.toBe(
      bankBookingDedupeHash(input),
    )
  })

  it('klassifiziert und ordnet eine offene Buchung einer Kostenart zu', () => {
    const source = validFile()
    const result = updateBankBooking(source, IDS.booking, {
      category: 'NK_UMLEGBAR',
      billingYear: 2026,
      costCategoryId: IDS.category,
      allocablePercent: 100,
      note: 'Fiktive Prüfung',
    })

    expect(source.billingData.bankBookings[0]?.category).toBe('OFFEN')
    expect(result.billingData.bankBookings[0]).toMatchObject({
      category: 'NK_UMLEGBAR',
      billingYear: 2026,
      costCategoryId: IDS.category,
      reviewed: false,
    })
  })

  it('hält eine Zuordnung mit leeren optionalen Feldern JSON-sicher', async () => {
    const result = updateBankBooking(validFile(), IDS.booking, {
      category: 'NK_UMLEGBAR',
      billingYear: 2026,
      costCategoryId: IDS.category,
      allocablePercent: undefined,
      note: undefined,
      splits: undefined,
    })

    await expect(
      encodeCurrentAppData(result, {
        savedAt: new Date('2026-12-31T12:00:00.000Z'),
      }),
    ).resolves.toBeDefined()
  })

  it('speichert nur centgenaue Splits mit vollständiger Kontrollsumme', () => {
    const result = updateBankBooking(validFile(), IDS.booking, {
      category: 'NK_UMLEGBAR',
      splits: [
        {
          id: IDS.splitOne,
          amountCents: -6_000,
          costCategoryId: IDS.category,
          billingYear: 2026,
          category: 'NK_UMLEGBAR',
        },
        {
          id: IDS.splitTwo,
          amountCents: -4_000,
          costCategoryId: IDS.category,
          billingYear: 2026,
          category: 'NK_UMLEGBAR',
        },
      ],
    })
    expect(result.billingData.bankBookings[0]?.splits).toHaveLength(2)

    expect(() =>
      updateBankBooking(validFile(), IDS.booking, {
        category: 'NK_UMLEGBAR',
        splits: [
          {
            id: IDS.splitOne,
            amountCents: -9_999,
            costCategoryId: IDS.category,
            billingYear: 2026,
          },
        ],
      }),
    ).toThrowError('Summe')
  })

  it('sperrt geprüfte Buchungen bis zur ausdrücklichen Wiedereröffnung', () => {
    const assigned = updateBankBooking(validFile(), IDS.booking, {
      category: 'NK_UMLEGBAR',
      billingYear: 2026,
      costCategoryId: IDS.category,
    })
    const reviewed = setBankBookingReviewed(assigned, IDS.booking, true)

    expect(() =>
      updateBankBooking(reviewed, IDS.booking, {
        category: 'SONSTIGE',
      }),
    ).toThrowError('gesperrt')
    expect(
      setBankBookingReviewed(reviewed, IDS.booking, false).billingData
        .bankBookings[0]?.reviewed,
    ).toBe(false)
  })
})
