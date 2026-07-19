import { createEmptyAppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_IMPORT_BYTES,
  prepareImport,
} from './features/import/prepare-import'
import { ImportControl } from './ImportControl'

vi.mock('./features/import/prepare-import', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./features/import/prepare-import')>()
  return { ...original, prepareImport: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function summary(
  overrides: Partial<{
    ownerCompanies: number
    properties: number
    billingPeriods: number
    warnings: number
  }> = {},
) {
  return {
    organizations: 0,
    ownerCompanies: 0,
    properties: 0,
    buildings: 0,
    units: 0,
    persons: 0,
    tenancies: 0,
    billingPeriods: 0,
    costEntries: 0,
    heatingCircuits: 0,
    warnings: 0,
    ...overrides,
  }
}

function chooseFile() {
  const input = screen.getByLabelText('Daten importieren')
  fireEvent.change(input, {
    target: {
      files: [new File(['{}'], 'daten.json', { type: 'application/json' })],
    },
  })
}

describe('ImportControl', () => {
  it('reagiert ohne Datei nicht und kann deaktiviert werden', () => {
    render(<ImportControl disabled onConfirm={vi.fn()} />)
    const input = screen.getByLabelText('Daten importieren')

    expect(input).toBeDisabled()
    fireEvent.change(input, { target: { files: [] } })
    expect(prepareImport).not.toHaveBeenCalled()
  })

  it('zeigt nur anonymisierte Importzahlen und lässt den Dialog abbrechen', async () => {
    vi.mocked(prepareImport).mockResolvedValue({
      ok: true,
      sourceFormat: 'legacy-v3',
      data: createEmptyAppDataFile(),
      summary: summary({
        ownerCompanies: 2,
        properties: 3,
        billingPeriods: 4,
        warnings: 1,
      }),
    })
    render(<ImportControl disabled={false} onConfirm={vi.fn()} />)

    chooseFile()

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(
      screen.getByText((text) => text.includes('Format: Legacy v3')),
    ).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('übernimmt einen bestätigten Import und schließt den Dialog', async () => {
    const data = createEmptyAppDataFile()
    vi.mocked(prepareImport).mockResolvedValue({
      ok: true,
      sourceFormat: 'current-v4',
      data,
      summary: summary(),
    })
    const onConfirm = vi.fn().mockResolvedValue(true)
    render(<ImportControl disabled={false} onConfirm={onConfirm} />)

    chooseFile()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import übernehmen' }),
    )

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(data))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('zeigt sichere Fehlercodes und fehlgeschlagene Übernahmen an', async () => {
    vi.mocked(prepareImport).mockResolvedValueOnce({
      ok: false,
      code: 'invalid_json',
    })
    const { rerender } = render(
      <ImportControl disabled={false} onConfirm={vi.fn()} />,
    )
    chooseFile()
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid_json')

    vi.mocked(prepareImport).mockResolvedValueOnce({
      ok: true,
      sourceFormat: 'current-v4',
      data: createEmptyAppDataFile(),
      summary: summary(),
    })
    rerender(
      <ImportControl
        disabled={false}
        onConfirm={vi.fn().mockResolvedValue(false)}
      />,
    )
    chooseFile()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import übernehmen' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'nicht sicher übernommen',
    )
  })

  it('stoppt übergroße Dateien vor dem Einlesen', async () => {
    const arrayBuffer = vi.fn()
    render(<ImportControl disabled={false} onConfirm={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Daten importieren'), {
      target: {
        files: [
          {
            size: MAX_IMPORT_BYTES + 1,
            arrayBuffer,
          },
        ],
      },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'source_too_large',
    )
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(prepareImport).not.toHaveBeenCalled()
  })

  it('redigiert Lese- und Speicherfehler', async () => {
    vi.mocked(prepareImport).mockRejectedValueOnce(
      new Error('C:\\private\\name.json'),
    )
    const onConfirm = vi.fn().mockRejectedValue(new Error('interner Fehler'))
    const { rerender } = render(
      <ImportControl disabled={false} onConfirm={onConfirm} />,
    )

    chooseFile()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'processing_failed',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('private')

    vi.mocked(prepareImport).mockResolvedValueOnce({
      ok: true,
      sourceFormat: 'current-v4',
      data: createEmptyAppDataFile(),
      summary: summary(),
    })
    rerender(<ImportControl disabled={false} onConfirm={onConfirm} />)
    chooseFile()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Import übernehmen' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'nicht sicher übernommen',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('interner Fehler')
  })
})
