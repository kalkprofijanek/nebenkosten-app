import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
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
