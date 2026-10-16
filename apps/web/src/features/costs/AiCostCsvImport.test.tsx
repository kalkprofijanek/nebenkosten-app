import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { AiCostCsvImport } from './AiCostCsvImport'

const header =
  'Kostenart;Belegdatum;Leistung von;Leistung bis;Beschreibung;Belegnummer;Betrag brutto EUR;Umlagefaehig Prozent;Lohnanteil EUR;Lieferant;Begruendung;Rueckfrage'
const csv = `${header}\nReinigung;2025-01-01;;;Test;R-1;1,23;100;;;;`
afterEach(cleanup)
function setup(
  apply?: (transform: (current: AppDataFile) => AppDataFile) => boolean,
) {
  const data = createEmptyAppDataFile()
  data.billingData.billingPeriods.push({
    id: 'p',
    propertyId: 'obj',
    year: 2025,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    status: 'DRAFT',
  })
  data.billingData.costCategories.push({
    id: 'c',
    billingPeriodId: 'p',
    kind: 'operating',
    label: 'Reinigung',
  })
  const onApply = vi.fn(
    apply ??
      ((transform) => {
        transform(data)
        return true
      }),
  )
  render(<AiCostCsvImport data={data} billingPeriodId="p" onApply={onApply} />)
  return onApply
}
function upload(text: string, size = 100) {
  fireEvent.change(screen.getByLabelText('CSV-Erfassungsliste auswählen'), {
    target: {
      files: [
        {
          size,
          arrayBuffer: async () => new TextEncoder().encode(text).buffer,
        },
      ],
    },
  })
}
describe('KI-CSV-Vorschau', () => {
  it('zeigt geprüfte Positionen und schreibt erst nach bewusster Übernahme', async () => {
    const onApply = setup()
    upload(csv)
    await screen.findByRole('table', { name: 'Vorschau der Erfassungsliste' })
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText('1,23 €')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Geprüfte Kostenpositionen übernehmen',
      }),
    )
    expect(onApply).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 Kostenpositionen übernommen',
    )
  })
  it('zeigt Zuordnungsfehler ohne Übernahme', async () => {
    const onApply = setup()
    upload(csv.replace('Reinigung;2025', 'Unbekannt;2025'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Kostenart'),
    )
    expect(
      screen.queryByRole('button', {
        name: 'Geprüfte Kostenpositionen übernehmen',
      }),
    ).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })
  it('verhindert übergroße Dateien vor dem Lesen', async () => {
    setup()
    upload(csv, 6 * 1024 * 1024)
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('5 MB')
  })
  it('verwirft eine Vorschau ohne Schreiben', async () => {
    const onApply = setup()
    upload(csv)
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau verwerfen' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })
  it('hält die Vorschau bei abgelehnter Übernahme und zeigt Exceptions', async () => {
    const onApply = setup(() => false)
    upload(csv)
    await screen.findByRole('table')
    const button = screen.getByRole('button', {
      name: 'Geprüfte Kostenpositionen übernehmen',
    })
    fireEvent.click(button)
    expect(screen.getByRole('table')).toBeInTheDocument()
    onApply.mockImplementation(() => {
      throw new Error('Gesperrt')
    })
    fireEvent.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent('Gesperrt')
    onApply.mockImplementation(() => {
      throw 'unbekannt'
    })
    fireEvent.click(button)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'konnten nicht übernommen',
    )
  })
  it('beachtet eine leere Dateiauswahl und Lesefehler', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('CSV-Erfassungsliste auswählen'), {
      target: { files: [] },
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('CSV-Erfassungsliste auswählen'), {
      target: {
        files: [
          {
            size: 10,
            arrayBuffer: async () => {
              throw 'unbekannt'
            },
          },
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'konnte nicht gelesen',
      ),
    )
  })
  it('verhindert das spätere Ergebnis einer älteren Dateiauswahl', async () => {
    setup()
    let finish!: (bytes: ArrayBuffer) => void
    const delayed = new Promise<ArrayBuffer>((resolve) => {
      finish = resolve
    })
    fireEvent.change(screen.getByLabelText('CSV-Erfassungsliste auswählen'), {
      target: { files: [{ size: 100, arrayBuffer: () => delayed }] },
    })
    upload(csv.replace('Test;', 'Aktuell;'))
    await screen.findByRole('table')
    finish(new TextEncoder().encode(csv).buffer)
    await waitFor(() =>
      expect(screen.getByRole('table')).toHaveTextContent('Aktuell'),
    )
    expect(screen.getByRole('table')).not.toHaveTextContent('Test')
  })
})
