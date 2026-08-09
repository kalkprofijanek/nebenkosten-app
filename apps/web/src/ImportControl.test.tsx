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
  type ImportSummary,
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

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    organizations: 0,
    ownerCompanies: 0,
    properties: 0,
    buildings: 0,
    units: 0,
    persons: 0,
    tenancies: 0,
    billingPeriods: 0,
    occupancyPeriods: 0,
    costCategories: 0,
    costEntries: 0,
    heatingCircuits: 0,
    energySources: 0,
    bankBookings: 0,
    meters: 0,
    warnings: 0,
    ...overrides,
  }
}

function migrationReport() {
  return {
    sourceFileName: 'fiktive-abrechnung.json',
    sourceSha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    detectedSchemaVersion: 3,
    targetSchemaVersion: 4,
    counts: {
      ownerCompanies: 2,
      properties: 3,
      billingPeriods: 4,
      occupancyPeriods: 5,
      costCategories: 6,
      costEntries: 7,
      heatingCircuits: 8,
      energySources: 9,
      bankBookings: 10,
      meters: 11,
      warnings: 1,
    },
    issues: [
      {
        severity: 'warning' as const,
        code: 'migration.fictional_warning',
        area: 'migration' as const,
        title: 'Fiktiver redigierter Hinweis',
        path: ['firmen', 0, 'objekte', 0],
        detail: 'Nur redigierte Metadaten',
      },
    ],
    changedFields: [
      {
        sourcePath: 'firmen[0].name1',
        targetPath: 'masterData.ownerCompanies[0].name',
        rule: 'verbatim',
        note: 'Fiktive Regelnotiz',
      },
      {
        sourcePath: 'firmen[0].objekte[0].abrechnungen[0].kosten',
        targetPath: 'billingData.costEntries[0].amountCents',
        rule: 'euro_to_cents',
      },
    ],
    droppedFields: [
      {
        sourcePath: 'firmen[0].objekte[0].bloecke[0].hk',
        reason: 'Redundanter Anzeige-Alias',
        valueType: 'string',
      },
    ],
    unmappedFields: ['firmen[0].<unknown-field>'],
    migratedAt: '2026-07-26T10:00:00.000Z',
    appVersion: 'pr12-test',
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

  it('zeigt den vollständigen redigierten Migrationsbericht und lässt den Dialog abbrechen', async () => {
    const data = createEmptyAppDataFile()
    data.masterData.organizations = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Nicht im Dialog ausgeben',
      },
    ]
    vi.mocked(prepareImport).mockResolvedValue({
      ok: true,
      sourceFormat: 'legacy-v3',
      data,
      summary: summary({
        ownerCompanies: 2,
        properties: 3,
        billingPeriods: 4,
        costEntries: 7,
        heatingCircuits: 8,
        warnings: 1,
      }),
      migrationReport: migrationReport(),
      validationSummaries: [
        {
          reference: 'abrechnungsjahr-1',
          year: 2026,
          errorCount: 2,
          warningCount: 1,
          infoCount: 3,
          canBecomeReady: false,
          issueCodes: [
            'master_data.owner_iban_missing',
            'totals.calculation_missing',
          ],
        },
      ],
    })
    render(<ImportControl disabled={false} onConfirm={vi.fn()} />)

    chooseFile()

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(
      screen.getByText((text) => text.includes('Format: Legacy v3')),
    ).toBeVisible()
    expect(screen.getByText(/a{64}/u)).toBeVisible()
    expect(screen.getByText('Schema 3')).toBeVisible()
    expect(screen.getByText('Schema 4')).toBeVisible()
    expect(screen.getByText('pr12-test')).toBeVisible()
    expect(screen.getByText('2026-07-26T10:00:00.000Z')).toBeVisible()
    for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(screen.getByText(String(count))).toBeVisible()
    }
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Fiktiver redigierter Hinweis',
    )
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Nur redigierte Metadaten',
    )
    expect(screen.getByText('migration.fictional_warning')).toBeVisible()
    expect(screen.getByText('verbatim')).toBeVisible()
    expect(screen.getByRole('dialog')).toHaveTextContent('Fiktive Regelnotiz')
    expect(screen.getByText('euro_to_cents')).toBeVisible()
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Redundanter Anzeige-Alias',
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('Werttyp: string')
    expect(screen.getByText('firmen[0].<unknown-field>')).toBeVisible()
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Fachliche Plausibilitätsprüfung',
    )
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Abrechnungsjahr 1 (2026)',
    )
    expect(screen.getByText('master_data.owner_iban_missing')).toBeVisible()
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '2 Fehler, 1 Warnungen, 3 Hinweise',
    )
    expect(screen.getByRole('dialog')).not.toHaveTextContent(
      'Nicht im Dialog ausgeben',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('weist auch leere Berichtskategorien und fehlende App-Version aus', async () => {
    vi.mocked(prepareImport).mockResolvedValue({
      ok: true,
      sourceFormat: 'legacy-v3',
      data: createEmptyAppDataFile(),
      summary: summary(),
      migrationReport: {
        ...migrationReport(),
        appVersion: null,
        issues: [],
        changedFields: [],
        droppedFields: [],
        unmappedFields: [],
      },
      validationSummaries: [],
    })
    render(<ImportControl disabled={false} onConfirm={vi.fn()} />)

    chooseFile()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Nicht angegeben')
    expect(dialog).toHaveTextContent('Keine Warnungen oder Hinweise.')
    expect(dialog).toHaveTextContent('Keine Feldtransformationen.')
    expect(dialog).toHaveTextContent('Keine Felder verworfen.')
    expect(dialog).toHaveTextContent('Keine unbekannten Felder konserviert.')
    expect(dialog).toHaveTextContent(
      'Keine Abrechnungsjahre fachlich zu prüfen.',
    )
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
      await screen.findByRole('button', {
        name: 'Geprüften Import übernehmen',
      }),
    )

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(data))
    expect(prepareImport).toHaveBeenCalledWith(expect.any(Uint8Array), {
      sourceFileName: 'daten.json',
      appVersion: '1.0.1',
    })
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
      await screen.findByRole('button', {
        name: 'Geprüften Import übernehmen',
      }),
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
      await screen.findByRole('button', {
        name: 'Geprüften Import übernehmen',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'nicht sicher übernommen',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent('interner Fehler')
  })
})
