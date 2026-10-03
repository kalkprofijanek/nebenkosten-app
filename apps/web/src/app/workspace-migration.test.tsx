import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { PersistenceError } from '@nebenkosten/persistence'
import { describe, expect, it, vi } from 'vitest'

import { createWorkspaceController } from './workspace-controller'

function setup() {
  const data = createEmptyAppDataFile()
  const adapter = {
    load: vi.fn().mockResolvedValue({
      data,
      revision: 'original-v4',
      migration: { sourceSchemaVersion: 4, targetSchemaVersion: 5 },
    }),
    save: vi.fn(),
    migrateStoredData: vi.fn().mockResolvedValue({
      data,
      revision: 'saved-v5',
      savedAt: '2026-09-28T12:00:00.000Z',
      beforeMigrationSnapshot: { id: 'source-backup' },
    }),
  }
  return { adapter, data, controller: createWorkspaceController({ adapter }) }
}

describe('workspace migration', () => {
  it('requires confirmation without editing, importing or autosaving the preview', async () => {
    const { adapter, controller, data } = setup()
    await controller.load()
    expect(controller.getState().status).toBe('migration_pending')
    expect(controller.update((current) => current)).toBe(false)
    expect(await controller.importData(data)).toBe(false)
    expect(controller.createNew()).toBe(false)
    expect(controller.retrySave()).toBe(false)
    expect(await controller.migrateStoredData(false)).toEqual({
      ok: false,
      code: 'confirmation_required',
    })
    expect(adapter.save).not.toHaveBeenCalled()
    expect(adapter.migrateStoredData).not.toHaveBeenCalled()
  })

  it('opens the migrated workspace only after the revision-checked migration succeeds', async () => {
    const { adapter, controller } = setup()
    await controller.load()
    expect(await controller.migrateStoredData(true)).toMatchObject({ ok: true })
    expect(adapter.migrateStoredData).toHaveBeenCalledWith({
      expectedRevision: 'original-v4',
      confirmed: true,
    })
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      revision: 'saved-v5',
      dirty: false,
      saving: false,
    })
    expect(adapter.save).not.toHaveBeenCalled()
  })

  it('keeps a failed migration read-only and allows an explicit retry', async () => {
    const { adapter, controller } = setup()
    adapter.migrateStoredData.mockRejectedValueOnce(
      new PersistenceError('quota_exceeded'),
    )
    await controller.load()
    expect(await controller.migrateStoredData(true)).toMatchObject({
      ok: false,
    })
    expect(controller.getState()).toMatchObject({
      status: 'migration_pending',
      revision: 'original-v4',
      dirty: false,
      saving: false,
    })
    expect(controller.retrySave()).toBe(false)
    expect(await controller.migrateStoredData(true)).toMatchObject({ ok: true })
  })

  it('does not clear a conflict reported during migration', async () => {
    const { adapter, controller } = setup()
    let complete!: (value: unknown) => void
    adapter.migrateStoredData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    await controller.load()
    const pending = controller.migrateStoredData(true)
    controller.reportExternalRevision('other-tab')
    complete({ data: createEmptyAppDataFile(), revision: 'saved-v5' })
    expect(await pending).toMatchObject({ ok: false, code: 'conflict' })
    expect(controller.getState().status).toBe('conflict')
  })
})
