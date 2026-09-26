import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FuelPanel } from './FuelPanel'
afterEach(cleanup)
it('zeigt nach Quellenwechsel nur die Bestandswerte der ausgewählten Quelle', () => {
  const empty = createEmptyAppDataFile()
  const data: AppDataFile = {
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
        { id: 'gas', heatingCircuitId: 'c', key: 'gas', name: 'Fiktives Gas' },
      ],
      fuelStocks: [
        {
          id: 's1',
          energySourceId: 'oil',
          billingPeriodId: 'y',
          openingQuantity: { value: 100, unit: 'l' },
        },
        {
          id: 's2',
          energySourceId: 'gas',
          billingPeriodId: 'y',
          openingQuantity: { value: 200, unit: 'kg' },
        },
      ],
    },
  }
  const apply = vi.fn(() => true)
  render(
    <FuelPanel
      data={data}
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
  fireEvent.change(screen.getByLabelText('Anfangsbestand Menge'), {
    target: { value: '999' },
  })
  fireEvent.change(
    screen.getByRole('combobox', { name: /Aktive Energiequelle/ }),
    { target: { value: 'gas' } },
  )
  expect(screen.getByLabelText('Anfangsbestand Menge')).toHaveValue('200')
  expect(screen.getByRole('combobox', { name: /^Mengeneinheit/ })).toHaveValue(
    'kg',
  )
})
