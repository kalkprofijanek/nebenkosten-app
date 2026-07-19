import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MemoryStorageAdapter, PersistenceError } from '../src'
import {
  createClock,
  createFictionalCurrentFile,
  FIRST_SAVE,
  RESTORE_SAVE,
  SECOND_SAVE,
} from './fixtures'

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    )
  }
  return value
}

function expectedRevision(value: unknown): string {
  const canonicalBytes = `${JSON.stringify(sortJson(value), null, 2)}\n`
  return createHash('sha256').update(canonicalBytes, 'utf8').digest('hex')
}

function expectPersistenceCode(
  error: unknown,
  expected: PersistenceError['code'],
): void {
  expect(error).toBeInstanceOf(PersistenceError)
  expect((error as PersistenceError).code).toBe(expected)
}

describe('MemoryStorageAdapter', () => {
  it('loads null when no current state exists', async () => {
    const adapter = new MemoryStorageAdapter()

    await expect(adapter.load()).resolves.toBeNull()
    await expect(adapter.listSnapshots()).resolves.toEqual([])
  })

  it('creates only with expectedRevision null and returns a deterministic SHA revision', async () => {
    const input = createFictionalCurrentFile()
    const untouched = structuredClone(input)
    const adapter = new MemoryStorageAdapter({
      now: () => new Date(FIRST_SAVE),
    })

    const saved = await adapter.save(input, { expectedRevision: null })

    expect(input).toEqual(untouched)
    expect(saved.data.meta.savedAt).toBe(FIRST_SAVE.toISOString())
    expect(saved.savedAt).toBe(FIRST_SAVE.toISOString())
    expect(saved.revision).toMatch(/^[a-f0-9]{64}$/u)
    expect(saved.revision).toBe(expectedRevision(saved.data))
    await expect(
      adapter.save(input, { expectedRevision: null }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PersistenceError && error.code === 'conflict',
    )
  })

  it('saves against a matching revision and leaves stored data unchanged after a stale conflict', async () => {
    const adapter = new MemoryStorageAdapter({
      now: createClock(FIRST_SAVE, SECOND_SAVE),
    })
    const first = await adapter.save(createFictionalCurrentFile(), {
      expectedRevision: null,
    })
    const changed = {
      ...first.data,
      meta: { ...first.data.meta, appVersion: 'fictional-next' },
    }
    const second = await adapter.save(changed, {
      expectedRevision: first.revision,
    })

    await expect(
      adapter.save(createFictionalCurrentFile(), {
        expectedRevision: first.revision,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPersistenceCode(error, 'conflict')
      return true
    })
    await expect(adapter.load()).resolves.toEqual({
      data: second.data,
      revision: second.revision,
    })
  })

  it('round-trips the complete current v4 shape and returns defensive clones', async () => {
    const input = createFictionalCurrentFile()
    const adapter = new MemoryStorageAdapter({
      now: () => new Date(FIRST_SAVE),
    })
    const saved = await adapter.save(input, { expectedRevision: null })

    input.masterData.organizations[0]!.name = 'Caller mutation'
    saved.data.billingData.costEntries[0]!.amountCents = 999_999
    const loaded = await adapter.load()
    loaded!.data.billingData.auditEvents[0]!.details = {
      callerMutation: true,
    }

    const loadedAgain = await adapter.load()
    expect(loadedAgain!.data.masterData.organizations[0]!.name).toBe(
      'Fiktive Testverwaltung',
    )
    expect(loadedAgain!.data.billingData.costEntries[0]!.amountCents).toBe(
      12_345,
    )
    expect(
      loadedAgain!.data.billingData.calculationResults[0]!
        .snapshotFormatVersion,
    ).toBe(2)
    expect(loadedAgain!.data.billingData.auditEvents[0]!.details).toEqual({
      absentMeaning: null,
      zero: 0,
    })
    expect(
      loadedAgain!.data.masterData.organizations[0]!.legacyUnmapped,
    ).toEqual([
      {
        path: ['futureFlag'],
        value: { enabled: true, note: 'fictional' },
      },
    ])
  })

  it('creates immutable revision-bound snapshots and lists newest first', async () => {
    let snapshotIndex = 0
    const adapter = new MemoryStorageAdapter({
      createId: () => `snapshot-${++snapshotIndex}`,
      now: createClock(FIRST_SAVE, SECOND_SAVE, RESTORE_SAVE),
    })
    const first = await adapter.save(createFictionalCurrentFile(), {
      expectedRevision: null,
    })
    const firstSnapshot = await adapter.createSnapshot({
      expectedRevision: first.revision,
      kind: 'manual',
    })
    const second = await adapter.save(
      {
        ...first.data,
        meta: { ...first.data.meta, appVersion: 'fictional-next' },
      },
      { expectedRevision: first.revision },
    )
    const secondSnapshot = await adapter.createSnapshot({
      expectedRevision: second.revision,
      kind: 'automatic',
    })

    expect(firstSnapshot).toMatchObject({
      id: 'snapshot-1',
      sourceRevision: first.revision,
      schemaVersion: 4,
      kind: 'manual',
      pinned: true,
    })
    expect(secondSnapshot).toMatchObject({
      id: 'snapshot-2',
      sourceRevision: second.revision,
      kind: 'automatic',
      pinned: false,
    })
    expect(firstSnapshot.sha256).toBe(first.revision)
    expect(firstSnapshot.byteLength).toBeGreaterThan(0)
    const snapshots = await adapter.listSnapshots()
    expect(snapshots.map(({ id }) => id)).toEqual(['snapshot-2', 'snapshot-1'])

    ;(snapshots[0] as { id: string }).id = 'caller-mutated'
    expect((await adapter.listSnapshots())[0]!.id).toBe('snapshot-2')
  })

  it('restores atomically, pins a before_restore snapshot, and preserves the historical target', async () => {
    let snapshotIndex = 0
    const adapter = new MemoryStorageAdapter({
      createId: () => `snapshot-${++snapshotIndex}`,
      now: createClock(FIRST_SAVE, SECOND_SAVE, RESTORE_SAVE),
    })
    const original = await adapter.save(createFictionalCurrentFile(), {
      expectedRevision: null,
    })
    const target = await adapter.createSnapshot({
      expectedRevision: original.revision,
      kind: 'manual',
    })
    const changed = await adapter.save(
      {
        ...original.data,
        meta: { ...original.data.meta, appVersion: 'fictional-changed' },
      },
      { expectedRevision: original.revision },
    )

    const restored = await adapter.restoreSnapshot(target.id, {
      expectedRevision: changed.revision,
    })

    expect(restored.data.meta.appVersion).toBe('test-suite')
    expect(restored.data.meta.savedAt).toBe(RESTORE_SAVE.toISOString())
    expect(restored.revision).not.toBe(original.revision)
    expect(restored.revision).not.toBe(changed.revision)
    const snapshots = await adapter.listSnapshots()
    expect(snapshots).toContainEqual(
      expect.objectContaining({
        sourceRevision: changed.revision,
        kind: 'before_restore',
        pinned: true,
      }),
    )
    expect(snapshots).toContainEqual(target)
  })

  it('leaves state and snapshots unchanged when restore conflicts or the target is missing', async () => {
    let snapshotIndex = 0
    const adapter = new MemoryStorageAdapter({
      createId: () => `snapshot-${++snapshotIndex}`,
      now: createClock(FIRST_SAVE, SECOND_SAVE),
    })
    const current = await adapter.save(createFictionalCurrentFile(), {
      expectedRevision: null,
    })
    const target = await adapter.createSnapshot({
      expectedRevision: current.revision,
    })
    const before = await adapter.listSnapshots()

    await expect(
      adapter.restoreSnapshot(target.id, {
        expectedRevision: 'f'.repeat(64),
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPersistenceCode(error, 'conflict')
      return true
    })
    await expect(
      adapter.restoreSnapshot('missing-snapshot', {
        expectedRevision: current.revision,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPersistenceCode(error, 'snapshot_not_found')
      return true
    })
    await expect(adapter.load()).resolves.toEqual({
      data: current.data,
      revision: current.revision,
    })
    await expect(adapter.listSnapshots()).resolves.toEqual(before)
  })
})
