import { appDataFileSchema } from '@nebenkosten/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDbStorageAdapter } from '../src'
import {
  createFictionalDatabaseFixture,
  createLosslessFictionalFile,
  deleteFictionalDatabase,
  withFictionalLabel,
} from './indexed-db-fixture'

const FIXED_NOW = new Date('2026-05-06T07:08:09.000Z')

type Adapter = InstanceType<typeof IndexedDbStorageAdapter>

const openAdapters: Adapter[] = []

function createAdapter(
  fixture: ReturnType<typeof createFictionalDatabaseFixture>,
  now: () => Date = () => FIXED_NOW,
): Adapter {
  const adapter = new IndexedDbStorageAdapter({
    ...fixture,
    now,
  })
  openAdapters.push(adapter)
  return adapter
}

function createClock(...timestamps: string[]): () => Date {
  let index = 0
  return () => {
    const timestamp = timestamps[Math.min(index, timestamps.length - 1)]!
    index += 1
    return new Date(timestamp)
  }
}

async function replaceCurrentRecord(
  fixture: ReturnType<typeof createFictionalDatabaseFixture>,
  record: {
    readonly revision: string
    readonly savedAt: string
    readonly bytes: Uint8Array
  },
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = fixture.indexedDB.open(fixture.databaseName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  const transaction = database.transaction('current', 'readwrite')
  transaction.objectStore('current').put(record, 'app-data')
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

async function mutateSnapshotRecord(
  fixture: ReturnType<typeof createFictionalDatabaseFixture>,
  id: string,
  mutate: (record: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = fixture.indexedDB.open(fixture.databaseName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  const transaction = database.transaction('snapshots', 'readwrite')
  const store = transaction.objectStore('snapshots')
  const record = await new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const request = store.get(id)
      request.onerror = () => reject(request.error)
      request.onsuccess = () =>
        resolve(request.result as Record<string, unknown>)
    },
  )
  store.put(mutate(record))
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

async function countSnapshotRecords(
  fixture: ReturnType<typeof createFictionalDatabaseFixture>,
): Promise<number> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = fixture.indexedDB.open(fixture.databaseName)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  const transaction = database.transaction('snapshots', 'readonly')
  const count = await new Promise<number>((resolve, reject) => {
    const request = transaction.objectStore('snapshots').count()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  database.close()
  return count
}

afterEach(async () => {
  await Promise.all(openAdapters.splice(0).map((adapter) => adapter.close()))
})

describe('IndexedDbStorageAdapter', () => {
  it('bootstraps an empty database and can reopen it without inventing data', async () => {
    const fixture = createFictionalDatabaseFixture('bootstrap')
    const first = createAdapter(fixture)

    await expect(first.load()).resolves.toBeNull()

    first.close()
    const reopened = createAdapter(fixture)
    await expect(reopened.load()).resolves.toBeNull()

    const databases = await fixture.indexedDB.databases()
    expect(databases).toContainEqual(
      expect.objectContaining({ name: fixture.databaseName }),
    )
  })

  it('saves and reloads a schema-valid v4 file losslessly after reopening', async () => {
    const fixture = createFictionalDatabaseFixture('lossless')
    const input = createLosslessFictionalFile('lossless')
    expect(appDataFileSchema.safeParse(input).success).toBe(true)
    const first = createAdapter(fixture)

    const saved = await first.save(input, { expectedRevision: null })
    first.close()

    const reopened = createAdapter(fixture)
    const loaded = await reopened.load()

    expect(saved.savedAt).toBe(FIXED_NOW.toISOString())
    expect(loaded).toEqual({ data: saved.data, revision: saved.revision })
    expect(appDataFileSchema.safeParse(loaded?.data).success).toBe(true)
    expect(input.meta.savedAt).toBeNull()
  })

  it('allows exactly one winner when two instances race with the same revision', async () => {
    const fixture = createFictionalDatabaseFixture('cas-race')
    const bootstrap = createAdapter(fixture)
    const initial = await bootstrap.save(
      createLosslessFictionalFile('initial'),
      {
        expectedRevision: null,
      },
    )
    const writerA = createAdapter(fixture)
    const writerB = createAdapter(fixture)

    const results = await Promise.allSettled([
      writerA.save(withFictionalLabel(initial.data, 'writer-a'), {
        expectedRevision: initial.revision,
      }),
      writerB.save(withFictionalLabel(initial.data, 'writer-b'), {
        expectedRevision: initial.revision,
      }),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({
      name: 'PersistenceError',
      code: 'conflict',
    })

    const winner = results.find(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<Adapter['save']>>
      > => result.status === 'fulfilled',
    )
    await expect(bootstrap.load()).resolves.toEqual({
      data: winner?.value.data,
      revision: winner?.value.revision,
    })
  })

  it('returns defensive copies from save and load', async () => {
    const fixture = createFictionalDatabaseFixture('copies')
    const adapter = createAdapter(fixture)
    const input = createLosslessFictionalFile('copies')
    const saved = await adapter.save(input, { expectedRevision: null })

    input.masterData.organizations[0]!.name = 'Mutation am Aufruferobjekt'
    saved.data.masterData.organizations[0]!.name = 'Mutation am Rueckgabewert'

    const loaded = await adapter.load()
    expect(loaded?.data.masterData.organizations[0]?.name).toBe(
      'Testorganisation copies (fiktiv)',
    )

    loaded!.data.masterData.organizations[0]!.name = 'Mutation am Ladeergebnis'
    const loadedAgain = await adapter.load()
    expect(loadedAgain?.data.masterData.organizations[0]?.name).toBe(
      'Testorganisation copies (fiktiv)',
    )
  })

  it('keeps immutable snapshots durable and returns defensive snapshot lists', async () => {
    const fixture = createFictionalDatabaseFixture('snapshots')
    const adapter = createAdapter(fixture)
    const initial = await adapter.save(
      createLosslessFictionalFile('snapshot-a'),
      {
        expectedRevision: null,
      },
    )
    const snapshot = await adapter.createSnapshot({
      expectedRevision: initial.revision,
      kind: 'manual',
    })

    const changed = await adapter.save(
      withFictionalLabel(initial.data, 'snapshot-b'),
      { expectedRevision: initial.revision },
    )
    const firstList = await adapter.listSnapshots()
    expect(firstList).toEqual([snapshot])
    const mutableSnapshotMeta = firstList[0] as { pinned: boolean }
    mutableSnapshotMeta.pinned = false

    adapter.close()
    const reopened = createAdapter(fixture)
    expect(await reopened.listSnapshots()).toEqual([snapshot])

    const restored = await reopened.restoreSnapshot(snapshot.id, {
      expectedRevision: changed.revision,
    })
    expect(restored.data.meta.appVersion).toBe('fictional-snapshot-a')
    expect(restored.revision).not.toBe(changed.revision)
    expect(await reopened.listSnapshots()).toContainEqual(snapshot)
  })

  it('rejects malformed or tampered snapshot metadata before listing, retention, or restore', async () => {
    const fixture = createFictionalDatabaseFixture('snapshot-corruption')
    const adapter = createAdapter(fixture)
    const current = await adapter.save(
      createLosslessFictionalFile('snapshot-corruption'),
      { expectedRevision: null },
    )
    const snapshot = await adapter.createSnapshot({
      expectedRevision: current.revision,
      kind: 'manual',
    })
    await mutateSnapshotRecord(fixture, snapshot.id, (record) => ({
      ...record,
      pinned: false,
    }))

    await expect(adapter.listSnapshots()).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'corrupt_storage',
    })
    await expect(
      adapter.createSnapshot({ expectedRevision: current.revision }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'corrupt_storage',
    })
    await expect(countSnapshotRecords(fixture)).resolves.toBe(1)
    await expect(
      adapter.restoreSnapshot(snapshot.id, {
        expectedRevision: current.revision,
      }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'corrupt_storage',
    })
  })

  it('atomically creates a pinned before_restore safety snapshot', async () => {
    const fixture = createFictionalDatabaseFixture('before-restore')
    const adapter = createAdapter(fixture)
    const original = await adapter.save(
      createLosslessFictionalFile('original'),
      {
        expectedRevision: null,
      },
    )
    const target = await adapter.createSnapshot({
      expectedRevision: original.revision,
      kind: 'manual',
    })
    const current = await adapter.save(
      withFictionalLabel(original.data, 'current-before-restore'),
      { expectedRevision: original.revision },
    )

    const restored = await adapter.restoreSnapshot(target.id, {
      expectedRevision: current.revision,
    })
    const snapshots = await adapter.listSnapshots()
    const safety = snapshots.find(
      (snapshot) => snapshot.kind === 'before_restore',
    )

    expect(restored.data.meta.appVersion).toBe('fictional-original')
    expect(safety).toMatchObject({
      sourceRevision: current.revision,
      kind: 'before_restore',
      pinned: true,
    })

    const recoveredCurrent = await adapter.restoreSnapshot(safety!.id, {
      expectedRevision: restored.revision,
    })
    expect(recoveredCurrent.data.meta.appVersion).toBe(
      'fictional-current-before-restore',
    )
  })

  it('uses the snapshot and restore event times instead of the source save time', async () => {
    const fixture = createFictionalDatabaseFixture('event-times')
    const adapter = createAdapter(
      fixture,
      createClock(
        '2026-05-01T01:00:00.000Z',
        '2026-05-02T02:00:00.000Z',
        '2026-05-03T03:00:00.000Z',
        '2026-05-04T04:00:00.000Z',
      ),
    )
    const original = await adapter.save(
      createLosslessFictionalFile('event-times-original'),
      { expectedRevision: null },
    )
    const target = await adapter.createSnapshot({
      expectedRevision: original.revision,
      kind: 'manual',
    })
    const current = await adapter.save(
      withFictionalLabel(original.data, 'event-times-current'),
      { expectedRevision: original.revision },
    )

    const restored = await adapter.restoreSnapshot(target.id, {
      expectedRevision: current.revision,
    })
    const safety = (await adapter.listSnapshots()).find(
      ({ kind }) => kind === 'before_restore',
    )

    expect(target.createdAt).toBe('2026-05-02T02:00:00.000Z')
    expect(restored.savedAt).toBe('2026-05-04T04:00:00.000Z')
    expect(safety?.createdAt).toBe(restored.savedAt)
  })

  it('refuses to overwrite or snapshot an existing unvalidated record', async () => {
    const fixture = createFictionalDatabaseFixture('validate-before-write')
    const adapter = createAdapter(fixture)
    const saved = await adapter.save(
      createLosslessFictionalFile('valid-before-corruption'),
      { expectedRevision: null },
    )
    await replaceCurrentRecord(fixture, {
      revision: saved.revision,
      savedAt: saved.savedAt,
      bytes: new TextEncoder().encode('{"schemaVersion":4}\n'),
    })

    await expect(
      adapter.save(withFictionalLabel(saved.data, 'must-not-overwrite'), {
        expectedRevision: saved.revision,
      }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'corrupt_storage',
    })
    await expect(
      adapter.createSnapshot({ expectedRevision: saved.revision }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'corrupt_storage',
    })
    await expect(adapter.listSnapshots()).resolves.toEqual([])
  })

  it('preserves the newer-schema error before save and snapshot writes', async () => {
    const fixture = createFictionalDatabaseFixture('newer-before-write')
    const adapter = createAdapter(fixture)
    await adapter.load()
    const newerRevision = 'e'.repeat(64)
    await replaceCurrentRecord(fixture, {
      revision: newerRevision,
      savedAt: FIXED_NOW.toISOString(),
      bytes: new TextEncoder().encode('{"schemaVersion":5}\n'),
    })

    await expect(
      adapter.save(createLosslessFictionalFile('must-not-downgrade'), {
        expectedRevision: newerRevision,
      }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'newer_schema_version',
      schemaVersion: 5,
    })
    await expect(
      adapter.createSnapshot({ expectedRevision: newerRevision }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'newer_schema_version',
      schemaVersion: 5,
    })
    await expect(adapter.listSnapshots()).resolves.toEqual([])
  })

  it('leaves current data and snapshot history unchanged on restore conflict', async () => {
    const fixture = createFictionalDatabaseFixture('restore-conflict')
    const adapter = createAdapter(fixture)
    const original = await adapter.save(createLosslessFictionalFile('target'), {
      expectedRevision: null,
    })
    const target = await adapter.createSnapshot({
      expectedRevision: original.revision,
      kind: 'manual',
    })
    const current = await adapter.save(
      withFictionalLabel(original.data, 'current'),
      { expectedRevision: original.revision },
    )
    const snapshotsBefore = await adapter.listSnapshots()

    await expect(
      adapter.restoreSnapshot(target.id, {
        expectedRevision: original.revision,
      }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      code: 'conflict',
    })

    await expect(adapter.load()).resolves.toEqual({
      data: current.data,
      revision: current.revision,
    })
    await expect(adapter.listSnapshots()).resolves.toEqual(snapshotsBefore)
  })

  it('closes cleanly so its database can be deleted without a blocked request', async () => {
    const fixture = createFictionalDatabaseFixture('cleanup')
    const adapter = createAdapter(fixture)
    await adapter.load()

    adapter.close()
    await expect(
      deleteFictionalDatabase(fixture.indexedDB, fixture.databaseName),
    ).resolves.toBeUndefined()

    await expect(fixture.indexedDB.databases()).resolves.not.toContainEqual(
      expect.objectContaining({ name: fixture.databaseName }),
    )
  })
})
