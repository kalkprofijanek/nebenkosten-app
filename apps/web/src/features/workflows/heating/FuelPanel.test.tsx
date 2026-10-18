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

it('speichert den CO₂-Preis des Anfangsbestands (Lieferjahr)', () => {
  const STOCK_ID = '3f0c2a7e-1b4d-4c8e-9a6f-2d5b7e1c0a93'
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
      ],
      fuelStocks: [
        {
          id: STOCK_ID,
          energySourceId: 'oil',
          billingPeriodId: 'y',
          openingQuantity: { value: 100, unit: 'l' },
          openingCo2PricePerTonCents: 4_500,
        },
      ],
    },
  }
  let updater: ((current: AppDataFile) => AppDataFile) | undefined
  const apply = vi.fn((next: (current: AppDataFile) => AppDataFile) => {
    updater = next
    return true
  })
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
  const field = screen.getByLabelText(
    'CO₂-Preis des Anfangsbestands in Euro je Tonne (Lieferjahr)',
  )
  expect(field).toHaveValue('45,00')
  fireEvent.change(field, { target: { value: '30,00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Bestand speichern' }))
  expect(updater).toBeDefined()
  const next = updater!(data)
  expect(next.billingData.fuelStocks[0]).toMatchObject({
    id: STOCK_ID,
    openingCo2PricePerTonCents: 3_000,
  })
})

it('zeigt Lieferungen mit deutschem Datum, Menge und Betrag', () => {
  const empty = createEmptyAppDataFile()
  const data: AppDataFile = {
    ...empty,
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'y',
          propertyId: 'p',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
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
          id: 'd1',
          energySourceId: 'oil',
          billingPeriodId: 'y',
          date: '2025-02-10',
          quantity: { value: 2500, unit: 'l' },
          amountCents: 260_000,
          description: 'Fiktive Öllieferung',
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
  const card = screen
    .getByRole('heading', { name: 'Fiktive Öllieferung' })
    .closest('article')!
  expect(card).toHaveTextContent('10.02.2025')
  expect(card).toHaveTextContent(/2\.500 l · 2\.600,00\s€/u)
})
