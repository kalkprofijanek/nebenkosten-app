import type { BankBooking, CostCategory, CostEntry } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CostDataOverview } from './CostDataOverview'

afterEach(cleanup)

const PROPERTY_ID = '30000000-0000-4000-8000-000000000001'

function booking(index: number): BankBooking {
  return {
    id: `30000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
    propertyId: PROPERTY_ID,
    amountCents: -(index + 1) * 100,
    purpose: `Buchung ${index + 1}`,
    billingYear: 2026,
  }
}

describe('CostDataOverview', () => {
  it('zeigt verständliche Leerzustände', () => {
    render(
      <CostDataOverview
        categories={[]}
        entries={[]}
        bankBookings={[]}
        propertyId={PROPERTY_ID}
        billingYear={2026}
      />,
    )

    expect(screen.getByText(/Noch keine Kostenarten/u)).toBeVisible()
    expect(screen.getByText(/Noch keine Kostenpositionen/u)).toBeVisible()
    expect(screen.getByText(/Keine Bankbuchungen/u)).toBeVisible()
  })

  it('blättert lange Buchungslisten in überschaubaren Seiten', () => {
    render(
      <CostDataOverview
        categories={[]}
        entries={[]}
        bankBookings={Array.from({ length: 51 }, (_, index) => booking(index))}
        propertyId={PROPERTY_ID}
        billingYear={2026}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Bankbuchungen (51)' }),
    ).toBeVisible()
    expect(screen.getByText('Buchung 1')).toBeVisible()
    expect(screen.queryByText('Buchung 51')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

    expect(screen.getByText('Buchung 51')).toBeVisible()
    expect(screen.queryByText('Buchung 1')).not.toBeInTheDocument()
    expect(screen.getByText('Seite 2 von 2')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(screen.getByText('Buchung 1')).toBeVisible()
  })

  it('zeigt alle Kosten-, Beleg- und Buchungsvarianten nachvollziehbar', () => {
    const categoryIds = [
      '30000000-0000-4000-8000-000000000101',
      '30000000-0000-4000-8000-000000000102',
      '30000000-0000-4000-8000-000000000103',
    ] as const
    const categories: CostCategory[] = [
      {
        id: categoryIds[0],
        billingPeriodId: '30000000-0000-4000-8000-000000000111',
        kind: 'operating',
        label: 'Test Betrieb',
        allocationKey: 'usable_area',
        statementText: 'Fiktiver Abrechnungstext',
        totalAmountCents: 9_999,
      },
      {
        id: categoryIds[1],
        billingPeriodId: '30000000-0000-4000-8000-000000000111',
        kind: 'water',
        label: 'Test Wasser',
        allocationKey: 'heated_area',
      },
      {
        id: categoryIds[2],
        billingPeriodId: '30000000-0000-4000-8000-000000000111',
        kind: 'heating',
        label: 'Test Heizung',
      },
    ]
    const entries: CostEntry[] = [
      {
        id: '30000000-0000-4000-8000-000000000121',
        costCategoryId: categoryIds[0],
        date: '2026-01-02',
        description: 'Fiktive Rechnung',
        receiptReference: 'TEST-BELEG',
        amountCents: 1_000,
      },
      {
        id: '30000000-0000-4000-8000-000000000122',
        costCategoryId: categoryIds[1],
        date: 'Testdatum',
        amountCents: 2_000,
      },
      ...Array.from({ length: 49 }, (_, index): CostEntry => ({
        id: `30000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
        costCategoryId: categoryIds[2],
        amountCents: 100,
      })),
      {
        id: '30000000-0000-4000-8000-000000000123',
        costCategoryId: '30000000-0000-4000-8000-000000000199',
        amountCents: 3_000,
      },
    ]
    const bankBookings: BankBooking[] = [
      {
        id: '30000000-0000-4000-8000-000000000131',
        propertyId: PROPERTY_ID,
        amountCents: -100,
        billingYear: 2026,
        costCategoryId: categoryIds[0],
        counterparty: 'Fiktive Gegenpartei',
        purpose: 'Fiktiver Zweck',
        category: 'NK_UMLEGBAR',
        reviewed: true,
        date: '2026-02-03',
      },
      {
        id: '30000000-0000-4000-8000-000000000132',
        propertyId: PROPERTY_ID,
        amountCents: -200,
        billingYear: 2026,
        costCategoryId: '30000000-0000-4000-8000-000000000198',
        category: 'SONSTIGE',
      },
      {
        id: '30000000-0000-4000-8000-000000000133',
        propertyId: PROPERTY_ID,
        amountCents: -300,
        splits: [
          {
            id: '30000000-0000-4000-8000-000000000141',
            amountCents: -300,
            billingYear: 2026,
          },
        ],
      },
      {
        id: '30000000-0000-4000-8000-000000000134',
        propertyId: PROPERTY_ID,
        amountCents: -400,
        splits: [
          {
            id: '30000000-0000-4000-8000-000000000142',
            amountCents: -400,
            costCategoryId: categoryIds[1],
          },
        ],
      },
      {
        id: '30000000-0000-4000-8000-000000000135',
        propertyId: PROPERTY_ID,
        amountCents: -500,
      },
      {
        id: '30000000-0000-4000-8000-000000000136',
        propertyId: PROPERTY_ID,
        amountCents: -600,
        billingYear: 2025,
      },
      {
        id: '30000000-0000-4000-8000-000000000137',
        propertyId: '30000000-0000-4000-8000-000000000999',
        amountCents: -700,
      },
    ]

    render(
      <CostDataOverview
        categories={categories}
        entries={entries}
        bankBookings={bankBookings}
        propertyId={PROPERTY_ID}
        billingYear={2026}
      />,
    )

    expect(screen.getByText('Betriebskosten')).toBeVisible()
    expect(screen.getByText('Wasser')).toBeVisible()
    expect(screen.getByText('Heizung')).toBeVisible()
    expect(screen.getByText('Fiktiver Abrechnungstext')).toBeVisible()
    expect(screen.getByText('Nicht festgelegt')).toBeVisible()
    expect(screen.getByText('02.01.2026')).toBeVisible()
    expect(screen.getByText('Testdatum')).toBeVisible()
    expect(screen.getAllByText('Ohne Datum').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ohne Beschreibung').length).toBeGreaterThan(0)
    expect(screen.getByText('Fiktive Gegenpartei')).toBeVisible()
    expect(screen.getByText('Geprüft · Umlagefähig')).toBeVisible()
    expect(screen.getByText('Sonstige')).toBeVisible()
    expect(screen.getAllByText('Noch offen').length).toBeGreaterThan(0)
    expect(screen.queryByText(/-6,00/)).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Weiter',
      }),
    )
    expect(screen.getByText('Seite 2 von 2')).toBeVisible()
  })
})
