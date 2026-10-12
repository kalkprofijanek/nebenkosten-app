import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FuelPanel } from './FuelPanel'
import { parseFuelTaxes, vatFromGrossCents } from './fuel-taxes'

afterEach(cleanup)

const DELIVERY_ID = '6b1f3c2d-8e4a-4f7b-9c1d-2a3e4f5b6c7d'

/** Fiktiver Heizkreis mit Heizöl; keine echten Rechnungswerte. */
function data(withDelivery = false): AppDataFile {
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
      fuelDeliveries: withDelivery
        ? [
            {
              id: DELIVERY_ID,
              energySourceId: 'oil',
              billingPeriodId: 'y',
              date: '2026-03-01',
              quantity: { value: 1000, unit: 'l' },
              amountCents: 107_000,
              description: 'Fiktive Lieferung',
              taxesAndLevies: { vatCents: 7_000, vatRatePercent: 7 },
            },
          ]
        : [],
    },
  }
}

function renderPanel(file: AppDataFile) {
  let updater: ((current: AppDataFile) => AppDataFile) | undefined
  const apply = vi.fn((next: (current: AppDataFile) => AppDataFile) => {
    updater = next
    return true
  })
  render(
    <FuelPanel
      data={file}
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
  return () => updater!(file)
}

describe('Steuern und Abgaben an der Lieferung (§ 6a Abs. 3 Nr. 1 b HeizKV)', () => {
  it('berechnet die Umsatzsteuer aus dem Bruttobetrag', () => {
    expect(vatFromGrossCents(119_000, 19)).toBe(19_000)
    expect(vatFromGrossCents(107_000, 7)).toBe(7_000)
    expect(vatFromGrossCents(1_000, 19)).toBe(160)
    expect(vatFromGrossCents(-1_000, 19)).toBe(-160)
  })

  it('liefert undefined ohne Angaben', () => {
    expect(parseFuelTaxes(new FormData())).toBeUndefined()
  })

  it('erfasst die Angaben bei einer neuen Lieferung', () => {
    const next = renderPanel(data())
    fireEvent.change(screen.getByLabelText('Lieferbetrag in Euro'), {
      target: { value: '1.190,00' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Umsatzsteuer aus Bruttobetrag berechnen',
      }),
    )
    expect(screen.getByLabelText('Umsatzsteuer in Euro')).toHaveValue('190,00')
    expect(screen.getByLabelText('Umsatzsteuersatz')).toHaveValue('19')
    fireEvent.change(
      screen.getByLabelText('Energiesteuer bzw. Stromsteuer in Euro'),
      { target: { value: '61,35' } },
    )
    fireEvent.change(
      screen.getByLabelText('CO₂-Kosten nach BEHG laut Rechnung in Euro'),
      { target: { value: '150,00' } },
    )
    fireEvent.change(screen.getByLabelText('Sonstige Abgaben in Euro'), {
      target: { value: '1,20' },
    })
    fireEvent.change(
      screen.getByLabelText('Bezeichnung der sonstigen Abgaben'),
      { target: { value: 'Fiktive Umlage' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Lieferung hinzufügen' }),
    )
    expect(next().billingData.fuelDeliveries[0]?.taxesAndLevies).toEqual({
      vatCents: 19_000,
      vatRatePercent: 19,
      energyTaxCents: 6_135,
      co2LevyCents: 15_000,
      otherLeviesCents: 120,
      otherLeviesLabel: 'Fiktive Umlage',
    })
  })

  it('meldet einen fehlenden Bruttobetrag', () => {
    renderPanel(data())
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Umsatzsteuer aus Bruttobetrag berechnen',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bitte zuerst den Lieferbetrag (brutto) eingeben.',
    )
  })

  it('zeigt und ändert vorhandene Angaben beim Bearbeiten', () => {
    const next = renderPanel(data(true))
    fireEvent.click(
      screen.getByRole('button', { name: 'Fiktive Lieferung bearbeiten' }),
    )
    expect(screen.getByLabelText('Umsatzsteuersatz bearbeiten')).toHaveValue(
      '7',
    )
    expect(
      screen.getByLabelText('Umsatzsteuer in Euro bearbeiten'),
    ).toHaveValue('70,00')
    fireEvent.change(screen.getByLabelText('Umsatzsteuer in Euro bearbeiten'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('Umsatzsteuersatz bearbeiten'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Lieferung speichern' }))
    expect(next().billingData.fuelDeliveries[0]?.taxesAndLevies).toBeUndefined()
  })
})
