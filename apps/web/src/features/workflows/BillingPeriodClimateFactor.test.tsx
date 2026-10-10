import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'
import { createMeteredFixture, meteringId } from '../metering/metered-fixture'
import { BillingPeriodsRoute } from './BillingPeriodsRoute'

const selection = {
  ownerCompanyId: meteringId(2),
  propertyId: meteringId(3),
  billingPeriodId: meteringId(10),
}

function fixture(locked = false): AppDataFile {
  const data = createMeteredFixture()
  data.masterData.properties[0]!.address = {
    postalCodeAndCity: '04109 Leipzig',
  }
  if (locked) data.billingData.billingPeriods[0]!.status = 'READY_FOR_PDF'
  return data
}

afterEach(() => {
  cleanup()
})

describe('Klimafaktor am Abrechnungsjahr', () => {
  it.each(['größere Folgedatei', 'geänderte Postleitzahl'])(
    'verwirft eine alte Dateianfrage nach %s',
    async (change) => {
      render(
        <BillingPeriodsRoute
          data={fixture()}
          selection={selection}
          onSelectionChange={vi.fn()}
          onApply={() => true}
        />,
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }),
      )
      fireEvent.click(screen.getByLabelText('Klimafaktor erfassen'))
      let resolve!: (text: string) => void
      const delayed = new File([], 'fiktive-dwd.csv')
      Object.defineProperty(delayed, 'text', {
        value: () =>
          new Promise<string>((done) => {
            resolve = done
          }),
      })
      const input = screen.getByLabelText('DWD-Klimafaktor-CSV importieren')
      fireEvent.change(input, { target: { files: [delayed] } })
      if (change === 'größere Folgedatei') {
        const oversized = new File([], 'zu-gross.csv')
        Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 })
        fireEvent.change(input, { target: { files: [oversized] } })
        expect(
          screen.getByText('Die CSV-Datei ist größer als 5 MB.'),
        ).toBeVisible()
      } else {
        fireEvent.change(screen.getByLabelText('Postleitzahl Klimafaktor'), {
          target: { value: '01234' },
        })
      }
      await act(async () =>
        resolve('DatAnf;DatEnd;PLZ;KF_k\n20260101;20261231;4109;1,08'),
      )
      expect(screen.getByLabelText('DWD-Klimafaktor')).toHaveValue('')
      if (change === 'größere Folgedatei')
        expect(
          screen.getByText('Die CSV-Datei ist größer als 5 MB.'),
        ).toBeVisible()
    },
  )

  it('speichert manuell erfasste Faktoren und schlägt die Objekt-PLZ vor', () => {
    let current = fixture()
    render(
      <BillingPeriodsRoute
        data={current}
        selection={selection}
        onSelectionChange={vi.fn()}
        onApply={(transform) => {
          current = transform(current)
          return true
        }}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }),
    )
    fireEvent.click(screen.getByLabelText('Klimafaktor erfassen'))
    expect(screen.getByLabelText('Postleitzahl Klimafaktor')).toHaveValue(
      '04109',
    )
    expect(screen.getByLabelText('DWD-Klimafaktor')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('DWD-Klimafaktor'), {
      target: { value: '1,08' },
    })
    fireEvent.change(screen.getByLabelText('Quelle Klimafaktor'), {
      target: { value: 'Fiktive manuelle Referenz' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Änderungen speichern' }),
    )
    expect(current.billingData.billingPeriods[0]?.climateFactor).toEqual({
      postalCode: '04109',
      factor: 1.08,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      source: 'Fiktive manuelle Referenz',
    })
  })

  it('verwendet die bestehende Jahressperre für Klimafaktor-Änderungen', () => {
    const initial = fixture(true)
    let current = initial
    render(
      <BillingPeriodsRoute
        data={initial}
        selection={selection}
        onSelectionChange={vi.fn()}
        onApply={(transform) => {
          try {
            current = applyEditableBillingPeriodChange(
              current,
              meteringId(10),
              transform,
            )
            return true
          } catch {
            return false
          }
        }}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }),
    )
    fireEvent.click(screen.getByLabelText('Klimafaktor erfassen'))
    fireEvent.change(screen.getByLabelText('DWD-Klimafaktor'), {
      target: { value: '1,08' },
    })
    fireEvent.change(screen.getByLabelText('Quelle Klimafaktor'), {
      target: { value: 'Fiktive manuelle Referenz' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Änderungen speichern' }),
    )
    expect(current.billingData.billingPeriods[0]?.climateFactor).toBeUndefined()
  })

  it('übernimmt nur den DWD-Faktor der Objekt-PLZ aus der CSV', async () => {
    render(
      <BillingPeriodsRoute
        data={fixture()}
        selection={selection}
        onSelectionChange={vi.fn()}
        onApply={() => true}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrechnungsjahr bearbeiten' }),
    )
    fireEvent.click(screen.getByLabelText('Klimafaktor erfassen'))
    const file = new File([], 'dwd.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', {
      value: async () => 'DatAnf;DatEnd;PLZ;KF_k\n20260101;20261231;4109;1,08',
    })
    fireEvent.change(screen.getByLabelText('DWD-Klimafaktor-CSV importieren'), {
      target: { files: [file] },
    })
    await waitFor(() =>
      expect(screen.getByLabelText('DWD-Klimafaktor')).not.toHaveValue(''),
    )
    expect(screen.getByLabelText('DWD-Klimafaktor')).toHaveValue('1,08')
    expect(screen.getByLabelText('Quelle Klimafaktor')).toHaveValue(
      'Deutscher Wetterdienst',
    )
  })
})
