import { MemoryStorageAdapter } from '@nebenkosten/persistence'
import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./CalculationRoute', () => ({
  CalculationRoute: ({
    onApply,
  }: {
    onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
  }) => (
    <button type="button" onClick={() => onApply((current) => current)}>
      Testberechnung anwenden
    </button>
  ),
}))

vi.mock('./PdfExportRoute', () => ({
  PdfExportRoute: ({
    billingPeriodId,
    onApply,
  }: {
    billingPeriodId: string | null
    onApply: (transform: (data: AppDataFile) => AppDataFile) => boolean
  }) => (
    <section>
      <h1>PDF-Testansicht</h1>
      <output>{billingPeriodId ?? 'Kein Zeitraum'}</output>
      <button type="button" onClick={() => onApply((current) => current)}>
        PDF-Status anwenden
      </button>
    </section>
  ),
}))

import { createWorkspaceController } from './app/workspace-controller'
import { createCompany } from './features/master-data/commands'
import { WorkspaceApp } from './WorkspaceApp'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('WorkspaceApp', () => {
  it('loads an empty local workspace and creates it only on explicit request', async () => {
    const controller = createWorkspaceController({
      adapter: new MemoryStorageAdapter(),
      debounceMs: 0,
    })

    render(<WorkspaceApp controller={controller} />)

    const createButton = await screen.findByRole('button', {
      name: 'Arbeitsbestand anlegen',
    })
    expect(screen.getByText('Noch kein Arbeitsbestand')).toBeVisible()

    fireEvent.click(createButton)

    await waitFor(() =>
      expect(screen.getByText('Lokal gespeichert')).toBeVisible(),
    )
    expect(controller.getState().data?.schemaVersion).toBe(4)
  })

  it('warnt beim Verlassen, solange lokale Änderungen ungesichert sind', async () => {
    const controller = createWorkspaceController({
      adapter: new MemoryStorageAdapter(),
      debounceMs: 60_000,
    })

    render(<WorkspaceApp controller={controller} />)

    const createButton = await screen.findByRole('button', {
      name: 'Arbeitsbestand anlegen',
    })
    fireEvent.click(createButton)

    const event = new Event('beforeunload', { cancelable: true })
    fireEvent(window, event)

    expect(event.defaultPrevented).toBe(true)
    controller.dispose()
  })

  it('lässt ein sauberes Arbeitsdokument ohne Warnung schließen', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(createEmptyAppDataFile(), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })

    render(<WorkspaceApp controller={controller} />)
    await screen.findByText('Lokal gespeichert')

    const event = new Event('beforeunload', { cancelable: true })
    fireEvent(window, event)

    expect(event.defaultPrevented).toBe(false)
    controller.dispose()
  })

  it('wendet eine Berechnung auch ohne ausgewählten Zeitraum direkt an', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(createEmptyAppDataFile(), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    window.location.hash = '#/berechnung'

    render(<WorkspaceApp controller={controller} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Testberechnung anwenden' }),
    )

    await waitFor(() => expect(controller.getState().dirty).toBe(false))
    expect(controller.getState().data?.billingData.billingPeriods).toEqual([])
    controller.dispose()
  })

  it('öffnet den PDF-Export auch ohne ausgewählten Zeitraum', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(createEmptyAppDataFile(), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    window.location.hash = '#/pdf-export'

    render(<WorkspaceApp controller={controller} />)

    expect(
      await screen.findByRole('heading', { name: 'PDF-Testansicht' }),
    ).toBeVisible()
    expect(
      screen.getByText('Kein Zeitraum', { selector: 'output' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'PDF-Status anwenden' }))
    await waitFor(() => expect(controller.getState().dirty).toBe(false))
    controller.dispose()
  })

  it('behält eine neu angelegte Firma auch bei vorhandenem Bestand aktiv', async () => {
    const adapter = new MemoryStorageAdapter()
    const existing = createCompany(
      createEmptyAppDataFile(),
      { organizationName: 'Erste Verwaltung', ownerCompanyName: 'Erste Firma' },
      {
        createId: (() => {
          const ids: ReturnType<Crypto['randomUUID']>[] = [
            '40000000-0000-4000-8000-000000000001',
            '40000000-0000-4000-8000-000000000002',
          ]
          return () => ids.shift()!
        })(),
      },
    )
    await adapter.save(existing, { expectedRevision: null })
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 60_000,
    })
    window.location.hash = '#/firmen'
    render(<WorkspaceApp controller={controller} />)
    await screen.findByLabelText('Aktive Firma')

    fireEvent.change(screen.getByLabelText('Mandantenname'), {
      target: { value: 'Zweite Verwaltung' },
    })
    fireEvent.change(screen.getByLabelText('Firmenname'), {
      target: { value: 'Zweite Firma' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Firma anlegen' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Aktive Firma')).toHaveValue(
        controller.getState().data?.masterData.ownerCompanies.at(-1)?.id,
      ),
    )
    controller.dispose()
  })

  it('bindet die PR-10-Freigabeprüfung in den ausgewählten Zeitraum ein', async () => {
    const adapter = new MemoryStorageAdapter()
    const empty = createEmptyAppDataFile()
    await adapter.save(
      {
        ...empty,
        masterData: {
          ...empty.masterData,
          organizations: [
            {
              id: '40000000-0000-4000-8000-000000000012',
              name: 'Fiktive Verwaltung',
            },
          ],
          ownerCompanies: [
            {
              id: '40000000-0000-4000-8000-000000000013',
              organizationId: '40000000-0000-4000-8000-000000000012',
              name: 'Fiktive Eigentümerin',
              additionalNameLines: [],
            },
          ],
          properties: [
            {
              id: '40000000-0000-4000-8000-000000000011',
              ownerCompanyId: '40000000-0000-4000-8000-000000000013',
            },
          ],
        },
        billingData: {
          ...empty.billingData,
          billingPeriods: [
            {
              id: '40000000-0000-4000-8000-000000000010',
              propertyId: '40000000-0000-4000-8000-000000000011',
              year: 2026,
              periodStart: '2026-01-01',
              periodEnd: '2026-12-31',
              status: 'DRAFT',
            },
          ],
        },
      },
      { expectedRevision: null },
    )
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    window.location.hash = '#/freigabe'

    render(<WorkspaceApp controller={controller} />)

    expect(
      await screen.findByRole('heading', { name: 'Prüfung und Freigabe' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Prüfung starten' }),
    ).toBeVisible()
    controller.dispose()
  })

  it('setzt eine Berechnung während der Prüfung kontrolliert auf Entwurf zurück', async () => {
    const adapter = new MemoryStorageAdapter()
    const empty = createEmptyAppDataFile()
    await adapter.save(
      {
        ...empty,
        masterData: {
          ...empty.masterData,
          organizations: [
            {
              id: '40000000-0000-4000-8000-000000000023',
              name: 'Fiktive Verwaltung',
            },
          ],
          ownerCompanies: [
            {
              id: '40000000-0000-4000-8000-000000000022',
              organizationId: '40000000-0000-4000-8000-000000000023',
              name: 'Fiktive Eigentümerin',
              additionalNameLines: [],
            },
          ],
          properties: [
            {
              id: '40000000-0000-4000-8000-000000000021',
              ownerCompanyId: '40000000-0000-4000-8000-000000000022',
            },
          ],
        },
        billingData: {
          ...empty.billingData,
          billingPeriods: [
            {
              id: '40000000-0000-4000-8000-000000000020',
              propertyId: '40000000-0000-4000-8000-000000000021',
              year: 2026,
              periodStart: '2026-01-01',
              periodEnd: '2026-12-31',
              status: 'IN_REVIEW',
            },
          ],
        },
      },
      { expectedRevision: null },
    )
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    window.location.hash = '#/berechnung'
    render(<WorkspaceApp controller={controller} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Testberechnung anwenden' }),
    )

    await waitFor(() =>
      expect(
        controller.getState().data?.billingData.billingPeriods[0]?.status,
      ).toBe('DRAFT'),
    )
    expect(
      controller.getState().data?.billingData.auditEvents.at(-1)?.action,
    ).toBe('billing_period.review_invalidated')
    controller.dispose()
  })

  it('opens backup and restore from the workspace navigation', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(createEmptyAppDataFile(), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    window.location.hash = '#/sicherung'

    render(<WorkspaceApp controller={controller} />)

    expect(
      await screen.findByRole('heading', {
        name: 'Sicherung und Wiederherstellung',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'JSON-Sicherung herunterladen',
      }),
    ).toBeVisible()
    controller.dispose()
  })
})
