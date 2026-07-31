import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import {
  MemoryStorageAdapter,
  PersistenceError,
  type SaveOptions,
  type SaveResult,
  type SnapshotStorageAdapter,
  type StorageAdapter,
} from '@nebenkosten/persistence'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkspaceController } from './workspace-controller'

function withVersion(version: string): AppDataFile {
  return {
    ...createEmptyAppDataFile(),
    meta: { appVersion: version },
  }
}

function saved(data: AppDataFile, revision: string): SaveResult {
  return {
    data,
    revision,
    savedAt: '2026-07-19T12:00:00.000Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

class FakeAdapter implements StorageAdapter {
  readonly load = vi.fn<StorageAdapter['load']>()
  readonly save =
    vi.fn<(data: AppDataFile, options: SaveOptions) => Promise<SaveResult>>()
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('workspace controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads a missing workspace as an explicit empty state without saving', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue(null)
    const controller = createWorkspaceController({ adapter })

    await controller.load()

    expect(controller.getState()).toEqual({
      status: 'empty',
      data: null,
      revision: null,
      dirty: false,
      saving: false,
      errorCode: null,
    })
    expect(adapter.save).not.toHaveBeenCalled()
  })

  it('loads an existing workspace as a clean ready state', async () => {
    const adapter = new FakeAdapter()
    const data = withVersion('loaded')
    adapter.load.mockResolvedValue({ data, revision: 'revision-1' })
    const controller = createWorkspaceController({ adapter })

    await controller.load()

    expect(controller.getState()).toMatchObject({
      status: 'ready',
      data,
      revision: 'revision-1',
      dirty: false,
      saving: false,
    })
  })

  it('creates a new workspace only after the explicit command', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue(null)
    adapter.save.mockImplementation(async (data) => saved(data, 'revision-1'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 50,
    })
    await controller.load()

    expect(controller.createNew()).toBe(true)
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      data: createEmptyAppDataFile(),
      revision: null,
      dirty: true,
    })

    await vi.advanceTimersByTimeAsync(50)

    expect(adapter.save).toHaveBeenCalledWith(createEmptyAppDataFile(), {
      expectedRevision: null,
    })
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      revision: 'revision-1',
      dirty: false,
    })
  })

  it('updates data immutably and debounces autosave with the loaded revision', async () => {
    const adapter = new FakeAdapter()
    const loaded = withVersion('loaded')
    adapter.load.mockResolvedValue({ data: loaded, revision: 'revision-1' })
    adapter.save.mockImplementation(async (data) => saved(data, 'revision-2'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 100,
    })
    await controller.load()

    const previousState = controller.getState()
    expect(
      controller.update((draft) => {
        draft.meta.appVersion = 'changed'
        return draft
      }),
    ).toBe(true)

    expect(loaded.meta.appVersion).toBe('loaded')
    expect(previousState.data?.meta.appVersion).toBe('loaded')
    expect(controller.getState().data?.meta.appVersion).toBe('changed')
    expect(controller.getState()).not.toBe(previousState)

    await vi.advanceTimersByTimeAsync(99)
    expect(adapter.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(adapter.save).toHaveBeenCalledWith(withVersion('changed'), {
      expectedRevision: 'revision-1',
    })
  })

  it('coalesces rapid changes into one autosave', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save.mockImplementation(async (data) => saved(data, 'revision-2'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 100,
    })
    await controller.load()

    controller.update(() => withVersion('first'))
    await vi.advanceTimersByTimeAsync(60)
    controller.update(() => withVersion('second'))
    await vi.advanceTimersByTimeAsync(99)
    expect(adapter.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(adapter.save).toHaveBeenCalledTimes(1)
    expect(adapter.save.mock.calls[0]?.[0]).toEqual(withVersion('second'))
  })

  it('runs a follow-up save when data changes during an active save', async () => {
    const adapter = new FakeAdapter()
    const firstSave = deferred<SaveResult>()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save
      .mockReturnValueOnce(firstSave.promise)
      .mockImplementationOnce(async (data) => saved(data, 'revision-3'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 100,
    })
    await controller.load()

    controller.update(() => withVersion('first'))
    await vi.advanceTimersByTimeAsync(100)
    expect(controller.getState().saving).toBe(true)

    controller.update(() => withVersion('second'))
    firstSave.resolve(saved(withVersion('first'), 'revision-2'))
    await flushMicrotasks()
    expect(controller.getState()).toMatchObject({
      dirty: true,
      revision: 'revision-2',
    })

    await vi.advanceTimersByTimeAsync(100)

    expect(adapter.save).toHaveBeenCalledTimes(2)
    expect(adapter.save.mock.calls[1]).toEqual([
      withVersion('second'),
      { expectedRevision: 'revision-2' },
    ])
    expect(controller.getState()).toMatchObject({
      dirty: false,
      revision: 'revision-3',
    })
  })

  it('retains local data and stops autosave after a conflict', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save.mockRejectedValue(new PersistenceError('conflict'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 10,
    })
    await controller.load()

    controller.update(() => withVersion('local'))
    await vi.advanceTimersByTimeAsync(10)

    expect(controller.getState()).toMatchObject({
      status: 'conflict',
      data: withVersion('local'),
      revision: 'revision-1',
      dirty: true,
      saving: false,
      errorCode: 'conflict',
    })
    expect(controller.update(() => withVersion('later'))).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(adapter.save).toHaveBeenCalledTimes(1)
  })

  it('stops autosave when another tab announces a different revision', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 10,
    })
    await controller.load()

    controller.update(() => withVersion('local'))
    controller.reportExternalRevision('revision-2')
    await vi.advanceTimersByTimeAsync(100)

    expect(controller.getState()).toMatchObject({
      status: 'conflict',
      data: withVersion('local'),
      revision: 'revision-1',
      dirty: true,
      errorCode: 'conflict',
    })
    expect(adapter.save).not.toHaveBeenCalled()
  })

  it('reloads a newer external revision when this tab has no local changes', async () => {
    const adapter = new FakeAdapter()
    adapter.load
      .mockResolvedValueOnce({
        data: withVersion('loaded'),
        revision: 'revision-1',
      })
      .mockResolvedValueOnce({
        data: withVersion('external'),
        revision: 'revision-2',
      })
    const controller = createWorkspaceController({ adapter })
    await controller.load()

    controller.reportExternalRevision('revision-2')
    expect(controller.getState().status).toBe('loading')
    await flushMicrotasks()

    expect(controller.getState()).toMatchObject({
      status: 'ready',
      data: withVersion('external'),
      revision: 'revision-2',
      dirty: false,
      saving: false,
      errorCode: null,
    })
    expect(adapter.load).toHaveBeenCalledTimes(2)
  })

  it('preserves an external conflict when an older in-flight save resolves', async () => {
    const adapter = new FakeAdapter()
    const pendingSave = deferred<SaveResult>()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save.mockReturnValue(pendingSave.promise)
    const controller = createWorkspaceController({ adapter, debounceMs: 10 })
    await controller.load()

    controller.update(() => withVersion('local'))
    await vi.advanceTimersByTimeAsync(10)
    controller.reportExternalRevision('revision-from-other-tab')
    pendingSave.resolve(saved(withVersion('local'), 'revision-2'))
    await flushMicrotasks()

    expect(controller.getState()).toMatchObject({
      status: 'conflict',
      revision: 'revision-1',
      dirty: true,
      saving: false,
      errorCode: 'conflict',
    })
  })

  it.each(['newer_schema_version', 'corrupt_storage'] as const)(
    'blocks safely when loading fails with %s',
    async (code) => {
      const adapter = new FakeAdapter()
      adapter.load.mockRejectedValue(new PersistenceError(code))
      const controller = createWorkspaceController({ adapter })

      await controller.load()

      expect(controller.getState()).toEqual({
        status: 'blocked',
        data: null,
        revision: null,
        dirty: false,
        saving: false,
        errorCode: code,
      })
      expect(controller.createNew()).toBe(false)
      expect(adapter.save).not.toHaveBeenCalled()
    },
  )

  it('uses a generic safe error state for other load failures', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockRejectedValue(new Error('private platform detail'))
    const controller = createWorkspaceController({ adapter })

    await controller.load()

    expect(controller.getState()).toEqual({
      status: 'error',
      data: null,
      revision: null,
      dirty: false,
      saving: false,
      errorCode: 'io_failed',
    })
    expect(adapter.save).not.toHaveBeenCalled()
  })

  it('retains local data in a safe error state after a failed save', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save.mockRejectedValue(new PersistenceError('quota_exceeded'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 10,
    })
    await controller.load()

    controller.update(() => withVersion('local'))
    await vi.advanceTimersByTimeAsync(10)

    expect(controller.getState()).toMatchObject({
      status: 'error',
      data: withVersion('local'),
      revision: 'revision-1',
      dirty: true,
      saving: false,
      errorCode: 'quota_exceeded',
    })
    expect(adapter.save).toHaveBeenCalledTimes(1)
  })

  it('retries a recoverable failed save without losing local data', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save
      .mockRejectedValueOnce(new PersistenceError('quota_exceeded'))
      .mockImplementationOnce(async (data) => saved(data, 'revision-2'))
    const controller = createWorkspaceController({ adapter, debounceMs: 10 })
    await controller.load()

    controller.update(() => withVersion('local'))
    await vi.advanceTimersByTimeAsync(10)
    expect(controller.retrySave()).toBe(true)
    await vi.advanceTimersByTimeAsync(10)

    expect(controller.getState()).toMatchObject({
      status: 'ready',
      data: withVersion('local'),
      revision: 'revision-2',
      dirty: false,
    })
  })

  it('imports into an empty workspace only after the explicit command', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue(null)
    adapter.save.mockImplementation(async (data) => saved(data, 'revision-1'))
    const controller = createWorkspaceController({ adapter, debounceMs: 10 })
    await controller.load()

    expect(await controller.importData(withVersion('imported'))).toBe(true)
    await vi.advanceTimersByTimeAsync(10)

    expect(adapter.save).toHaveBeenCalledWith(withVersion('imported'), {
      expectedRevision: null,
    })
  })

  it('creates a manual snapshot before replacing an existing workspace', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('existing'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 10 })
    await controller.load()

    expect(await controller.importData(withVersion('imported'))).toBe(true)
    expect(await adapter.listSnapshots()).toEqual([
      expect.objectContaining({ kind: 'before_import', pinned: true }),
    ])
    await vi.advanceTimersByTimeAsync(10)

    expect((await adapter.load())?.data.meta.appVersion).toBe('imported')
  })

  it('exposes manual snapshots only for a clean persisted revision', async () => {
    const adapter = new MemoryStorageAdapter()
    await adapter.save(withVersion('current'), { expectedRevision: null })
    const controller = createWorkspaceController({ adapter, debounceMs: 10 })
    await controller.load()

    const created = await controller.createManualSnapshot()
    const listed = await controller.listSnapshots()

    expect(created).toMatchObject({
      ok: true,
      value: { kind: 'manual', pinned: true },
    })
    expect(listed).toMatchObject({
      ok: true,
      value: [expect.objectContaining({ kind: 'manual', pinned: true })],
    })

    controller.update(() => withVersion('dirty'))
    expect(await controller.createManualSnapshot()).toEqual({
      ok: false,
      code: 'conflict',
    })
  })

  it('reports missing snapshot capability without changing workspace state', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    const controller = createWorkspaceController({ adapter })
    await controller.load()
    const before = controller.getState()

    expect(await controller.listSnapshots()).toEqual({
      ok: false,
      code: 'unsupported_capability',
    })
    expect(await controller.createManualSnapshot()).toEqual({
      ok: false,
      code: 'unsupported_capability',
    })
    expect(controller.getState()).toBe(before)
  })

  it('requires confirmation and returns the adapter-created before_restore proof', async () => {
    const adapter = new MemoryStorageAdapter({
      createId: (() => {
        const ids = ['manual-target', 'before-restore-proof']
        return () => ids.shift()!
      })(),
    })
    const original = await adapter.save(withVersion('original'), {
      expectedRevision: null,
    })
    const target = await adapter.createSnapshot({
      expectedRevision: original.revision,
      kind: 'manual',
    })
    await adapter.save(withVersion('changed'), {
      expectedRevision: original.revision,
    })
    const controller = createWorkspaceController({ adapter, debounceMs: 10 })
    await controller.load()
    const changedRevision = controller.getState().revision

    expect(await controller.restoreSnapshot(target.id, false)).toEqual({
      ok: false,
      code: 'confirmation_required',
    })
    expect(controller.getState().data?.meta.appVersion).toBe('changed')

    const restored = await controller.restoreSnapshot(target.id, true)

    expect(restored).toMatchObject({
      ok: true,
      value: {
        beforeRestoreSnapshot: {
          id: 'before-restore-proof',
          kind: 'before_restore',
          pinned: true,
          sourceRevision: changedRevision,
        },
      },
    })
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      data: withVersion('original'),
      revision: expect.any(String),
      dirty: false,
      saving: false,
      errorCode: null,
    })
  })

  it('does not depend on a fallible snapshot relist after an applied restore', async () => {
    const adapter = new MemoryStorageAdapter()
    const original = await adapter.save(withVersion('original'), {
      expectedRevision: null,
    })
    const target = await adapter.createSnapshot({
      expectedRevision: original.revision,
      kind: 'manual',
    })
    await adapter.save(withVersion('changed'), {
      expectedRevision: original.revision,
    })
    const controller = createWorkspaceController({ adapter })
    await controller.load()
    vi.spyOn(adapter, 'listSnapshots').mockRejectedValue(
      new Error('fiktiver Fehler nach Restore'),
    )

    const restored = await controller.restoreSnapshot(target.id, true)

    expect(restored).toMatchObject({
      ok: true,
      value: {
        beforeRestoreSnapshot: { kind: 'before_restore', pinned: true },
      },
    })
    expect(controller.getState()).toMatchObject({
      status: 'ready',
      data: withVersion('original'),
      dirty: false,
      saving: false,
      errorCode: null,
    })
  })

  it('redacts adapter errors from snapshot operations', async () => {
    class FailingSnapshotAdapter extends FakeAdapter {
      readonly createSnapshot = vi
        .fn<SnapshotStorageAdapter['createSnapshot']>()
        .mockRejectedValue(new Error('C:\\private\\tenant-name.json'))
      readonly listSnapshots = vi
        .fn<SnapshotStorageAdapter['listSnapshots']>()
        .mockRejectedValue(new Error('C:\\private\\tenant-name.json'))
      readonly restoreSnapshot = vi
        .fn<SnapshotStorageAdapter['restoreSnapshot']>()
        .mockRejectedValue(new Error('C:\\private\\tenant-name.json'))
    }
    const adapter = new FailingSnapshotAdapter()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    const controller = createWorkspaceController({ adapter })
    await controller.load()

    expect(await controller.listSnapshots()).toEqual({
      ok: false,
      code: 'io_failed',
    })
    expect(await controller.createManualSnapshot()).toEqual({
      ok: false,
      code: 'io_failed',
    })
    expect(await controller.restoreSnapshot('secret-id', true)).toEqual({
      ok: false,
      code: 'io_failed',
    })
  })

  it('warns before unload only while dirty, saving, or conflicted', async () => {
    const adapter = new FakeAdapter()
    const pendingSave = deferred<SaveResult>()
    adapter.load.mockResolvedValue({
      data: withVersion('loaded'),
      revision: 'revision-1',
    })
    adapter.save.mockReturnValue(pendingSave.promise)
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 10,
    })
    await controller.load()
    expect(controller.shouldWarnBeforeUnload()).toBe(false)

    controller.update(() => withVersion('dirty'))
    expect(controller.shouldWarnBeforeUnload()).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(controller.getState().saving).toBe(true)
    expect(controller.shouldWarnBeforeUnload()).toBe(true)

    pendingSave.reject(new PersistenceError('conflict'))
    await flushMicrotasks()
    expect(controller.getState().status).toBe('conflict')
    expect(controller.shouldWarnBeforeUnload()).toBe(true)
  })

  it('notifies subscribers, supports unsubscribe, and disposes timers', async () => {
    const adapter = new FakeAdapter()
    adapter.load.mockResolvedValue(null)
    adapter.save.mockImplementation(async (data) => saved(data, 'revision-1'))
    const controller = createWorkspaceController({
      adapter,
      debounceMs: 10,
    })
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = controller.subscribe(first)
    controller.subscribe(second)

    await controller.load()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    unsubscribe()
    controller.createNew()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)

    controller.dispose()
    await vi.advanceTimersByTimeAsync(10)
    expect(adapter.save).not.toHaveBeenCalled()
    expect(controller.update(() => withVersion('ignored'))).toBe(false)
  })
})
