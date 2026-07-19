import { MemoryStorageAdapter } from '@nebenkosten/persistence'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

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
})
