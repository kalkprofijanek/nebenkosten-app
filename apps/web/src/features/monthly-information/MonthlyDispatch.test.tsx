import type { AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonthlyInformationRoute } from './MonthlyInformationRoute'
import { ID, PROPERTY, monthlyFixture } from './test-fixture'

const renderPdfBlob = vi.fn<(...args: unknown[]) => Promise<Blob>>()
const renderZipBlob = vi.fn<(...args: unknown[]) => Promise<Blob>>()
const downloadBlob = vi.fn()
const blobBytes = vi.fn<(...args: unknown[]) => Promise<Uint8Array>>(
  async () => new Uint8Array([1, 2, 3]),
)

vi.mock('../pdf/render', () => ({
  renderPdfBlob: (...args: unknown[]) => renderPdfBlob(...args),
  renderZipBlob: (...args: unknown[]) => renderZipBlob(...args),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
  blobBytes: (...args: unknown[]) => blobBytes(...args),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ERIKA_EMAIL = ['erika', 'example.invalid'].join('@')
const NO_REMOTE_READING =
  'Für dieses Objekt ist im gewählten Monat keine Fernablesbarkeit erfasst (Objekt bearbeiten → ‚Erfassungsgeräte fernablesbar seit‘).'

/** Erika (EG links): E-Mail mit Zustimmung und Versandanschrift; Max ohne Anschrift. */
function dispatchFixture(since: string | null = '2026-01-01'): AppDataFile {
  const data = monthlyFixture()
  if (since) data.masterData.properties[0]!.remoteReading = { since }
  data.masterData.persons[0]!.email = ERIKA_EMAIL
  data.masterData.tenancies[0] = {
    ...data.masterData.tenancies[0]!,
    shippingAddressStreet: `Beispielweg ${1}`,
    shippingAddressPostalCodeAndCity: '12345 Musterstadt',
    monthlyInformationDelivery: {
      channel: 'email',
      emailConsentDate: '2025-12-01',
    },
  }
  return data
}

function renderRoute(initial: AppDataFile = dispatchFixture()) {
  let current = initial
  const onApply = vi.fn((transform: (file: AppDataFile) => AppDataFile) => {
    current = transform(current)
    return true
  })
  const props = {
    propertyId: PROPERTY,
    onApply,
    today: () => new Date(2026, 3, 15),
    createId: () => ID(8001),
  }
  const view = render(<MonthlyInformationRoute data={current} {...props} />)
  return {
    getData: () => current,
    rerender: () =>
      view.rerender(<MonthlyInformationRoute data={current} {...props} />),
  }
}

const versand = () => screen.getByRole('region', { name: 'Versand März 2026' })

describe('Versand der Monatsinformation', () => {
  it('bietet den Versand nur bei erfasster Fernablesbarkeit an', () => {
    renderRoute(dispatchFixture(null))
    expect(versand()).toHaveTextContent(NO_REMOTE_READING)
    expect(within(versand()).queryByRole('button')).toBeNull()
    cleanup()

    // Fernablesbar erst nach dem Monatsende.
    renderRoute(dispatchFixture('2026-04-01'))
    expect(versand()).toHaveTextContent(NO_REMOTE_READING)
    cleanup()

    // Fernablesbar am letzten Tag des Monats genügt.
    renderRoute(dispatchFixture('2026-03-31'))
    expect(versand()).not.toHaveTextContent(NO_REMOTE_READING)
    expect(
      within(versand()).getByRole('button', { name: 'Alle PDFs als ZIP' }),
    ).toBeEnabled()
  })

  it('listet Mieter mit Versandweg und meldet fehlende Anschriften je Zeile', () => {
    renderRoute()
    expect(versand()).toHaveTextContent('Die App verschickt nichts selbst')
    const table = screen.getByRole('table', { name: 'Versandliste des Monats' })
    const [, erika, max] = within(table).getAllByRole('row')
    expect(erika).toHaveTextContent('Erika Beispiel')
    expect(erika).toHaveTextContent('EG links')
    expect(erika).toHaveTextContent(ERIKA_EMAIL)
    expect(max).toHaveTextContent('Brief')
    expect(within(max!).getByRole('alert')).toHaveTextContent(
      'Versandadresse fehlt',
    )
    expect(within(max!).queryByRole('button', { name: /PDF/ })).toBeNull()
    expect(within(max!).queryByRole('link')).toBeNull()
  })

  it('erzeugt einen eigenen E-Mail-Entwurf je Mieter ohne BCC', () => {
    renderRoute()
    const link = screen.getByRole('link', {
      name: 'E-Mail-Entwurf Erika Beispiel',
    })
    const href = link.getAttribute('href')!
    expect(href.startsWith(`mailto:${ERIKA_EMAIL}?subject=`)).toBe(true)
    expect(href.toLowerCase()).not.toContain('bcc')
    expect(href).not.toMatch(/[\s„“–]/u)
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('subject')).toBe(
      'Verbrauchsinformation März 2026 – EG links',
    )
    const body = params.get('body')!
    expect(body).toMatch(/^Guten Tag Erika Beispiel,\r\n/u)
    expect(body).toContain(
      'im angehängten PDF „Verbrauchsinformation_2026-03_EG-links.pdf“',
    )
  })

  it('lädt ein einzelnes PDF und alle PDFs als ZIP herunter', async () => {
    renderPdfBlob.mockResolvedValue(new Blob(['pdf']))
    renderZipBlob.mockResolvedValue(new Blob(['zip']))
    renderRoute()
    fireEvent.click(screen.getByRole('button', { name: 'PDF Erika Beispiel' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(downloadBlob.mock.calls[0]![1]).toBe(
      'Verbrauchsinformation_2026-03_EG-links.pdf',
    )
    expect(JSON.stringify(renderPdfBlob.mock.calls[0]![0])).toContain(
      'Erika Beispiel',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Alle PDFs als ZIP' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2))
    expect(renderZipBlob.mock.calls[0]![0]).toEqual([
      {
        fileName: 'Verbrauchsinformation_2026-03_EG-links.pdf',
        bytes: new Uint8Array([1, 2, 3]),
      },
    ])
    expect(downloadBlob.mock.calls[1]![1]).toBe(
      'Verbrauchsinformationen_2026-03.zip',
    )
  })

  it('meldet Fehler beim Erzeugen des PDFs', async () => {
    renderPdfBlob.mockRejectedValueOnce(new Error('Fiktiver Renderfehler'))
    renderPdfBlob.mockRejectedValueOnce('kein Error-Objekt')
    renderRoute()
    fireEvent.click(screen.getByRole('button', { name: 'PDF Erika Beispiel' }))
    expect(
      await within(versand()).findByText('Fiktiver Renderfehler'),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Alle PDFs als ZIP' }))
    expect(
      await within(versand()).findByText(
        'Das PDF konnte nicht erzeugt werden.',
      ),
    ).toBeVisible()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('protokolliert den Monat mit Ausnahmen und entfernt das Protokoll nach Bestätigung', () => {
    const view = renderRoute()
    expect(screen.getByLabelText('Monat versendet am')).toHaveValue(
      '2026-04-15',
    )
    fireEvent.click(screen.getByLabelText('Max Muster nicht versendet'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Versand protokollieren' }),
    )
    expect(versand()).toHaveTextContent('Begründung anzugeben')
    expect(
      view.getData().billingData.monthlyInformationDispatches,
    ).toBeUndefined()

    fireEvent.change(screen.getByLabelText('Begründung Max Muster'), {
      target: { value: 'Anschrift unbekannt' },
    })
    fireEvent.change(screen.getByLabelText('Monat versendet am'), {
      target: { value: '2026-04-03' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Versand protokollieren' }),
    )
    expect(view.getData().billingData.monthlyInformationDispatches).toEqual([
      {
        id: ID(8001),
        propertyId: PROPERTY,
        month: '2026-03',
        dispatchedOn: '2026-04-03',
        entries: [
          { tenancyId: ID(12), channel: 'email', status: 'sent' },
          {
            tenancyId: ID(13),
            channel: 'letter',
            status: 'not_sent',
            note: 'Anschrift unbekannt',
          },
        ],
      },
    ])
    view.rerender()
    expect(within(versand()).getByRole('status')).toHaveTextContent(
      'Versendet am 03.04.2026 (1 per E-Mail, 0 per Brief, 1 nicht versendet)',
    )
    const table = screen.getByRole('table', { name: 'Versandliste des Monats' })
    expect(table).toHaveTextContent('nicht versendet: Anschrift unbekannt')
    expect(table).toHaveTextContent('versendet')
    expect(screen.queryByLabelText('Monat versendet am')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Protokoll entfernen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(
      view.getData().billingData.monthlyInformationDispatches,
    ).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Protokoll entfernen' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Entfernen bestätigen' }),
    )
    expect(view.getData().billingData.monthlyInformationDispatches).toEqual([])
    view.rerender()
    expect(screen.getByLabelText('Monat versendet am')).toBeVisible()
  })

  it('zeigt abgelehnte Änderungen und gesperrte Jahre als Fehler', () => {
    const data = dispatchFixture()
    data.billingData.billingPeriods = data.billingData.billingPeriods.map(
      (period) => ({ ...period, status: 'FINALIZED' as const }),
    )
    renderRoute(data)
    fireEvent.click(
      screen.getByRole('button', { name: 'Versand protokollieren' }),
    )
    expect(versand()).toHaveTextContent('gesperrtes Abrechnungsjahr (2026)')
  })
})
