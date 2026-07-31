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

import { createWorkspaceController } from './app/workspace-controller'
import type { CanonicalBackup } from './features/backup/canonical-backup'
import { BackupRestoreRoute } from './BackupRestoreRoute'

function withVersion(version: string): AppDataFile {
  return {
    ...createEmptyAppDataFile(),
    meta: { appVersion: version },
  }
}

afterEach(cleanup)

describe('BackupRestoreRoute', () => {
  it('downloads canonical JSON and shows SHA-256, byte size, and timestamp', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('current'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    await controller.load()
    const downloaded: CanonicalBackup[] = []

    render(
      <BackupRestoreRoute
        controller={controller}
        data={controller.getState().data!}
        onDownload={(backup) => downloaded.push(backup)}
        now={() => new Date('2026-07-26T10:11:12.000Z')}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'JSON-Sicherung herunterladen' }),
    )

    expect(
      screen.getByText(/sämtliche Personen-, Adress-, Bank-/),
    ).toBeVisible()
    await screen.findByText('2026-07-26T10:11:12.000Z')
    expect(screen.getByLabelText('Backup-Nachweis')).toHaveTextContent(
      /SHA-256[a-f0-9]{64}/,
    )
    expect(screen.getByLabelText('Backup-Nachweis')).toHaveTextContent(
      /Dateigröße\d+ Bytes/,
    )
    expect(downloaded).toHaveLength(1)
    expect(downloaded[0]?.bytes.byteLength).toBe(downloaded[0]?.byteLength)
  })

  it('creates a manual snapshot and refreshes the snapshot list', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('current'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    await controller.load()

    render(
      <BackupRestoreRoute
        controller={controller}
        data={controller.getState().data!}
      />,
    )

    expect(
      await screen.findByText('Keine Sicherungsstände vorhanden.'),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Manuellen Snapshot anlegen' }),
    )

    expect(await screen.findByText('Manuell')).toBeVisible()
    expect(await adapter.listSnapshots()).toHaveLength(1)
  })

  it('blocks a canonical backup while the workspace has unsaved changes', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('current'), { expectedRevision: null })
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 60_000,
    })
    await controller.load()
    controller.update(() => withVersion('unsaved'))

    render(
      <BackupRestoreRoute
        controller={controller}
        data={controller.getState().data!}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'JSON-Sicherung herunterladen',
      }),
    ).toBeDisabled()
    controller.dispose()
  })

  it('restores only after explicit confirmation and proves the adapter-created before_restore snapshot', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('original'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    await controller.load()
    const target = await controller.createManualSnapshot()
    expect(target.ok).toBe(true)
    controller.update(() => withVersion('changed'))
    await waitFor(() =>
      expect(controller.getState().data?.meta.appVersion).toBe('changed'),
    )
    await waitFor(() => expect(controller.getState().dirty).toBe(false))

    render(
      <BackupRestoreRoute
        controller={controller}
        data={controller.getState().data!}
      />,
    )

    const restoreButtons = await screen.findAllByRole('button', {
      name: 'Diesen Stand wiederherstellen',
    })
    fireEvent.click(restoreButtons[0]!)
    expect(
      screen.getByRole('dialog', { name: 'Wiederherstellung bestätigen' }),
    ).toBeVisible()
    expect(controller.getState().data?.meta.appVersion).toBe('changed')

    fireEvent.click(
      screen.getByRole('button', { name: 'Verbindlich wiederherstellen' }),
    )

    await screen.findByText('Sicherung vor Wiederherstellung nachgewiesen')
    expect(screen.getByText(/before_restore/)).toBeVisible()
    expect(controller.getState().data?.meta.appVersion).toBe('original')
    expect(
      (await adapter.listSnapshots()).some(
        (item) => item.kind === 'before_restore',
      ),
    ).toBe(true)
  })

  it('does not pretend that snapshots are durable in file preview mode', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('preview'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    await controller.load()

    render(
      <BackupRestoreRoute
        controller={controller}
        data={controller.getState().data!}
        previewMode
      />,
    )

    expect(
      screen.getByText(
        'Vorschaumodus: Snapshots wären nur im Arbeitsspeicher und beim Neuladen verloren.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Manuellen Snapshot anlegen' }),
    ).toBeDisabled()
    expect(adapter.createSnapshot).toBeDefined()
  })

  it('shows only redacted stable error codes', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('current'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 0 })
    await controller.load()
    vi.spyOn(adapter, 'listSnapshots').mockRejectedValue(
      new Error('C:\\private\\Mieterin.json'),
    )

    render(
      <BackupRestoreRoute
        controller={controller}
        data={controller.getState().data!}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sicherungsstände konnten nicht geladen werden (io_failed).',
    )
    expect(screen.queryByText(/Mieterin/)).not.toBeInTheDocument()
  })
})
