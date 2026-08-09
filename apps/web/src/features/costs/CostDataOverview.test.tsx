import type { BankBooking } from '@nebenkosten/schema'
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
  })
})
