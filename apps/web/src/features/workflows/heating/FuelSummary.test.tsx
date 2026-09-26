import type { EnergySource, FuelDelivery, FuelStock } from '@nebenkosten/schema'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FuelSummary } from './FuelSummary'

afterEach(cleanup)
const source: EnergySource = {
  id: 'oil',
  heatingCircuitId: 'c',
  key: 'oil',
  name: 'Heizöl',
}
const stock: FuelStock = {
  id: 's',
  energySourceId: 'oil',
  billingPeriodId: 'y',
  openingQuantity: { value: 1000, unit: 'l' },
  openingValueCents: 80000,
  remainingQuantity: { value: 1800, unit: 'l' },
}
const deliveries: FuelDelivery[] = [
  {
    id: 'late',
    energySourceId: 'oil',
    billingPeriodId: 'y',
    date: '2026-10-15',
    quantity: { value: 1500, unit: 'l' },
    amountCents: 180000,
  },
  {
    id: 'early',
    energySourceId: 'oil',
    billingPeriodId: 'y',
    date: '2026-02-15',
    quantity: { value: 1200, unit: 'l' },
    amountCents: 132000,
  },
  {
    id: 'middle',
    energySourceId: 'oil',
    billingPeriodId: 'y',
    date: '2026-06-15',
    quantity: { value: 800, unit: 'l' },
    amountCents: 72000,
  },
]
function show(stocks = [stock], entries = deliveries) {
  return render(
    <FuelSummary
      source={source}
      billingPeriodId="y"
      stocks={stocks}
      deliveries={entries}
    />,
  )
}
describe('FuelSummary', () => {
  it('zeigt negative Bestände nicht als gültigen Verbrauch an', () => {
    show([{ ...stock, remainingQuantity: { value: -1, unit: 'l' } }])
    expect(screen.getByRole('alert')).toHaveTextContent('Negative Mengen')
    expect(
      screen.queryByText('Verbrauchskosten (FIFO)'),
    ).not.toBeInTheDocument()
  })
  it('shows source and year scoped FIFO quantities and costs using the existing engine', () => {
    show(
      [stock, { ...stock, id: 'old', billingPeriodId: 'old' }],
      [
        ...deliveries,
        { ...deliveries[0]!, id: 'foreign', energySourceId: 'gas' },
      ],
    )
    expect(
      screen.getByText('1.000 l + 3.500 l − 1.800 l = 2.700 l'),
    ).toBeInTheDocument()
    expect(screen.getByText(/2.570,00/)).toBeInTheDocument()
    expect(screen.getByText(/2.070,00/)).toBeInTheDocument()
  })
  it('shows an empty state', () => {
    show([], [])
    expect(
      screen.getByText(/Noch keine Bestände oder Lieferungen/),
    ).toBeInTheDocument()
  })
  it('does not present capped overstock totals as a valid consumption', () => {
    show([{ ...stock, remainingQuantity: { value: 5000, unit: 'l' } }])
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Restbestand übersteigt',
    )
    expect(
      screen.queryByText('Verbrauchskosten (FIFO)'),
    ).not.toBeInTheDocument()
  })
  it('reports mixed units without crashing', () => {
    show([{ ...stock, remainingQuantity: { value: 100, unit: 'kg' } }])
    expect(screen.getByRole('alert')).toHaveTextContent('Mengeneinheiten')
  })
  it('labels amount-only costs explicitly without claiming FIFO', () => {
    show(
      [],
      [
        {
          id: 'd',
          energySourceId: 'oil',
          billingPeriodId: 'y',
          amountCents: 12345,
        },
      ],
    )
    expect(
      screen.getByText('Direkte Kosten ohne Mengenbewertung'),
    ).toBeInTheDocument()
    expect(screen.getByText(/123,45/)).toBeInTheDocument()
  })
  it('warns about missing rest and incomplete quantities or amounts', () => {
    const { rerender } = show([{ ...stock, remainingQuantity: undefined }])
    expect(screen.getByRole('alert')).toHaveTextContent('Restbestand fehlt')
    rerender(
      <FuelSummary
        source={source}
        billingPeriodId="y"
        stocks={[stock]}
        deliveries={[
          ...deliveries,
          {
            id: 'missing',
            energySourceId: 'oil',
            billingPeriodId: 'y',
            amountCents: 100,
          },
        ]}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Mengen oder Werte fehlen',
    )
    expect(
      screen.queryByText('Verbrauchskosten (FIFO)'),
    ).not.toBeInTheDocument()
  })
})
