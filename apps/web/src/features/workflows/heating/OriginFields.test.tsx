import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { updateFuelDelivery } from '../../heating/heating-commands'
import { FuelPanel } from './FuelPanel'

afterEach(cleanup)

const DELIVERY_ID = '5b1d8c2e-7f3a-4e9b-8c1d-2a6f4e8b0c17'

/** Fiktiver Ölkessel mit einer Lieferung des Voreigentümers. */
function data(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
      heatingCircuits: [
        {
          id: 'c',
          buildingId: 'b',
          billingPeriodId: 'y',
          heatingSystemId: 'h',
          hasCentralHotWater: false,
        },
      ],
      energySources: [
        { id: 'oil', heatingCircuitId: 'c', key: 'oil', name: 'Fiktives Öl' },
      ],
      fuelDeliveries: [
        {
          id: DELIVERY_ID,
          energySourceId: 'oil',
          billingPeriodId: 'y',
          date: '2026-02-01',
          quantity: { value: 1_000, unit: 'l' },
          amountCents: 100_000,
          origin: 'previous_owner',
          amountBasis: 'estimate',
        },
      ],
    },
  }
}

function renderPanel(initial: AppDataFile) {
  let updater: ((current: AppDataFile) => AppDataFile) | undefined
  const apply = vi.fn((next: (current: AppDataFile) => AppDataFile) => {
    updater = next
    return true
  })
  render(
    <FuelPanel
      data={initial}
      selection={{
        ownerCompanyId: null,
        propertyId: 'p',
        billingPeriodId: 'y',
      }}
      onSelectionChange={vi.fn()}
      onApply={apply}
      apply={apply}
    />,
  )
  return { result: () => updater!(initial) }
}

it('erfasst Betragsgrundlage und Herkunft einer neuen Lieferung', () => {
  const panel = renderPanel(data())
  fireEvent.change(screen.getByLabelText('Lieferdatum'), {
    target: { value: '2026-09-01' },
  })
  fireEvent.change(screen.getByLabelText('Liefermenge'), {
    target: { value: '500' },
  })
  fireEvent.change(screen.getByLabelText('Lieferbetrag in Euro'), {
    target: { value: '550,00' },
  })
  fireEvent.change(screen.getByLabelText('Betragsgrundlage'), {
    target: { value: 'advance_payments' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Lieferung hinzufügen' }))
  const added = panel.result().billingData.fuelDeliveries.at(-1)!
  expect(added.amountBasis).toBe('advance_payments')
  expect(added).not.toHaveProperty('origin')
})

it('speichert die Bewertung des Anfangsbestands', () => {
  const panel = renderPanel(data())
  fireEvent.change(screen.getByLabelText('Bewertung des Anfangsbestands'), {
    target: { value: 'seller_valuation' },
  })
  fireEvent.change(screen.getByLabelText('Begründung der Bewertung'), {
    target: { value: 'Kein Lieferschein (fiktiv)' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Bestand speichern' }))
  expect(panel.result().billingData.fuelStocks[0]).toMatchObject({
    valuationBasis: 'seller_valuation',
    valuationReason: 'Kein Lieferschein (fiktiv)',
  })
})

it('behält Herkunft und Betragsgrundlage, wenn ein anderer Weg die Lieferung ändert', () => {
  const source = data()
  const [delivery] = source.billingData.fuelDeliveries
  const rest: Record<string, unknown> = { ...delivery! }
  delete rest.origin
  delete rest.amountBasis
  delete rest.id
  const updated = updateFuelDelivery(source, DELIVERY_ID, {
    ...(rest as Parameters<typeof updateFuelDelivery>[2]),
    description: 'Geändert',
  })
  expect(updated.billingData.fuelDeliveries[0]).toMatchObject({
    description: 'Geändert',
    origin: 'previous_owner',
    amountBasis: 'estimate',
  })
})
