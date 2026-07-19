import { MemoryStorageAdapter } from '@nebenkosten/persistence'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createWorkspaceController } from './app/workspace-controller'
import { WorkspaceApp } from './WorkspaceApp'

afterEach(() => {
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
})
