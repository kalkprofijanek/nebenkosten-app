import {
  createEmptyAppDataFile,
  type AppDataFile,
  type BankBooking,
} from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RentLedgerRoute } from './RentLedgerRoute'

const ID = (n: number) =>
  `55000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P = ID(1)
const PERIOD = ID(20)

afterEach(cleanup)

function booking(n: number, overrides: Partial<BankBooking>): BankBooking {
  return {
    id: ID(100 + n),
    propertyId: P,
    date: '2026-01-03',
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
  file.masterData.properties = [{ id: P, ownerCompanyId: ID(3) }]
  file.masterData.units = [
    { id: ID(5), propertyId: P, label: 'EG links' },
    { id: ID(6), propertyId: P, label: 'OG rechts' },
  ]
  file.masterData.persons = [
    { id: ID(8), organizationId: ID(2), lastName: 'Beispiel' },
    { id: ID(9), organizationId: ID(2), lastName: 'Muster' },
  ]
  file.masterData.tenancies = [
    { id: ID(10), unitId: ID(5), personIds: [ID(8)], monthlyRentCents: 60_000 },
    { id: ID(11), unitId: ID(6), personIds: [ID(9)], monthlyRentCents: 45_000 },
  ]
  file.billingData.billingPeriods = [
    {
      id: PERIOD,
      propertyId: P,
      year: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      status: 'DRAFT',
    },
  ]
  file.billingData.bankBookings = bankBookings
  return file
}

function renderRoute(initial: AppDataFile) {
  let current = initial
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    current = transform(current)
    return true
  })
  const view = render(
    <RentLedgerRoute
      data={current}
      propertyId={P}
      billingPeriodId={PERIOD}
      onApply={onApply}
      today={() => new Date(2026, 1, 15)}
    />,
  )
  return {
    getData: () => current,
    rerender: () =>
      view.rerender(
        <RentLedgerRoute
          data={current}
          propertyId={P}
          billingPeriodId={PERIOD}
          onApply={onApply}
          today={() => new Date(2026, 1, 15)}
        />,
      ),
  }
}

describe('Mietkonto-Seite', () => {
  it('fordert ohne Auswahl ein Objekt und Jahr an', () => {
    render(
      <RentLedgerRoute
        data={data([])}
        propertyId={null}
        billingPeriodId={null}
        onApply={() => true}
      />,
    )
    expect(
      screen.getByText(
        'Bitte zuerst ein Objekt und ein Abrechnungsjahr auswählen.',
      ),
    ).toBeVisible()
  })

  it('ordnet automatisch zu und zeigt Soll, Ist und Rückstand', () => {
    const view = renderRoute(
      data([
        booking(1, { counterparty: 'Erika Beispiel' }),
        booking(2, { counterparty: 'Beispiel und Muster', amountCents: 1 }),
      ]),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Mieteingänge automatisch zuordnen' }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 Zahlung eindeutig zugeordnet, 1 mehrdeutig – bitte von Hand zuordnen.',
    )
    view.rerender()

    const summary = screen.getByRole('table', {
      name: 'Mietkonto je Mietverhältnis',
    })
    expect(summary).toHaveTextContent('EG links – Beispiel')
    // Soll Jan + Feb = 1.200 €, gezahlt 600 € → Rückstand 600 €.
    expect(summary).toHaveTextContent('600,00 €')
    expect(
      screen.getByRole('table', { name: 'Monatsübersicht' }),
    ).toHaveTextContent('bezahlt')
    expect(
      screen.getByRole('table', { name: 'Zugeordnete Zahlungseingänge' }),
    ).toHaveTextContent('automatisch')
  })

  it('ordnet von Hand zu und hebt die Zuordnung wieder auf', () => {
    const view = renderRoute(data([booking(1, { counterparty: 'Unbekannt' })]))
    fireEvent.change(
      screen.getByLabelText('Mietverhältnis für Zahlung vom 03.01.2026'),
      { target: { value: ID(11) } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnen' }))
    expect(view.getData().billingData.bankBookings[0]).toMatchObject({
      tenancyId: ID(11),
      tenancyAssignment: 'manual',
    })
    view.rerender()
    expect(
      screen.getByText('Alle Mieteingänge des Jahres sind zugeordnet.'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung aufheben' }))
    expect(view.getData().billingData.bankBookings[0]?.tenancyId).toBe(
      undefined,
    )
  })

  it('meldet Fehler verständlich', () => {
    render(
      <RentLedgerRoute
        data={data([booking(1, { counterparty: 'Beispiel' })])}
        propertyId={P}
        billingPeriodId={PERIOD}
        onApply={() => false}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Mieteingänge automatisch zuordnen' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Änderung konnte nicht gespeichert werden.',
    )
  })
})
