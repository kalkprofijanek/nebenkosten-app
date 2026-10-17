import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { TENANT_LIST_HEADERS } from '@nebenkosten/import-export'
import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TenantListCsvImport } from './TenantListCsvImport'

const header = TENANT_LIST_HEADERS.join(';')
const csv = [
  header,
  ';EG;;60;;Erika Muster;;;30.06.2025;;180,00;;',
  ';EG;;;;Max Beispiel;;01.07.2025;;;;2.160,00;',
  ';OG;;55;;Familie Probe;;;;;;;ja',
  ';DG;;40;;;;;;;;;',
].join('\n')

afterEach(cleanup)

function data(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return appDataFileSchema.parse({
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [
        { id: '10000000-0000-4000-8000-000000000001', name: 'Verwaltung' },
      ],
      ownerCompanies: [
        {
          id: '10000000-0000-4000-8000-000000000002',
          organizationId: '10000000-0000-4000-8000-000000000001',
          name: 'Bestand',
          additionalNameLines: [],
        },
      ],
      properties: [
        {
          id: '10000000-0000-4000-8000-000000000003',
          ownerCompanyId: '10000000-0000-4000-8000-000000000002',
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'p',
          propertyId: '10000000-0000-4000-8000-000000000003',
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status: 'DRAFT',
        },
      ],
    },
  })
}

function setup(
  apply?: (transform: (current: AppDataFile) => AppDataFile) => boolean,
) {
  const source = data()
  let applied: AppDataFile | undefined
  const onApply = vi.fn(
    apply ??
      ((transform: (current: AppDataFile) => AppDataFile) => {
        applied = transform(source)
        return true
      }),
  )
  render(
    <TenantListCsvImport data={source} billingPeriodId="p" onApply={onApply} />,
  )
  return { onApply, applied: () => applied }
}

function upload(text: string, size = 100) {
  fireEvent.change(screen.getByLabelText('CSV-Mieterliste auswählen'), {
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

describe('Mieterliste-Import in der Oberfläche', () => {
  it('zeigt eine Vorschau und schreibt erst nach bewusster Übernahme', async () => {
    const { onApply, applied } = setup()
    upload(csv)
    const table = await screen.findByRole('table', {
      name: 'Vorschau der Mieterliste',
    })
    expect(onApply).not.toHaveBeenCalled()
    expect(table).toHaveTextContent('EG (neu)')
    expect(table).toHaveTextContent('180,00 € monatlich')
    expect(table).toHaveTextContent('2.160,00 € jährlich')
    expect(table).toHaveTextContent('keine vereinbart')
    expect(table).toHaveTextContent('Leerstand')
    expect(table).toHaveTextContent('Jahresbeginn – 30.06.2025')
    fireEvent.click(
      screen.getByRole('button', { name: 'Geprüfte Mieterliste übernehmen' }),
    )
    expect(onApply).toHaveBeenCalledOnce()
    expect(applied()!.billingData.occupancyPeriods).toHaveLength(4)
    expect(screen.getByRole('status')).toHaveTextContent(
      '4 Belegungen übernommen, 3 Wohnung(en) neu angelegt.',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('listet Zeilenfehler aus der Datei und bietet keine Übernahme an', async () => {
    const { onApply } = setup()
    upload(`${header}\n;;;;;Erika;;;;;180;;\n;EG;;;;Max;;;;;;;`)
    const list = await screen.findByRole('list', {
      name: 'Fehler in der Mieterliste',
    })
    expect(list).toHaveTextContent('Zeile 2: Wohnung fehlt.')
    expect(list).toHaveTextContent('Zeile 3: Vorauszahlung fehlt')
    expect(screen.getByRole('alert')).toHaveTextContent('2 Zeile(n)')
    expect(
      screen.queryByRole('button', { name: 'Geprüfte Mieterliste übernehmen' }),
    ).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('listet Zuordnungsfehler aus dem Probelauf', async () => {
    setup()
    upload(
      `${header}\nHaus X;EG;;;;Erika;;;;;180;;\n;OG;;;;Max;;01.01.2026;;;180;;`,
    )
    const list = await screen.findByRole('list', {
      name: 'Fehler in der Mieterliste',
    })
    expect(list).toHaveTextContent('Haus X')
    expect(list).toHaveTextContent('außerhalb')
  })

  it('meldet falsche Spalten, zu große Dateien und Lesefehler', async () => {
    setup()
    upload('Wohnung;Mieter\nEG;Erika')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Vorlage'),
    )
    upload(csv, 6 * 1024 * 1024)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('5 MB'),
    )
    fireEvent.change(screen.getByLabelText('CSV-Mieterliste auswählen'), {
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
    fireEvent.change(screen.getByLabelText('CSV-Mieterliste auswählen'), {
      target: { files: [] },
    })
  })

  it('verwirft die Vorschau und behandelt abgelehnte Übernahmen', async () => {
    const { onApply } = setup(() => false)
    upload(csv)
    await screen.findByRole('table')
    const button = screen.getByRole('button', {
      name: 'Geprüfte Mieterliste übernehmen',
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
      'konnte nicht übernommen',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau verwerfen' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('bietet die Vorlage als CSV-Datei zum Herunterladen an', async () => {
    setup()
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:vorlage')
    const revoke = vi.fn()
    const original = {
      create: URL.createObjectURL,
      revoke: URL.revokeObjectURL,
    }
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revoke
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    try {
      fireEvent.click(
        screen.getByRole('button', { name: 'Vorlage herunterladen' }),
      )
      expect(click).toHaveBeenCalledOnce()
      const blob = createObjectURL.mock.calls[0]![0]
      expect(blob.type).toBe('text/csv;charset=utf-8')
      expect(await blob.text()).toContain(header)
    } finally {
      click.mockRestore()
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
    }
  })
})
