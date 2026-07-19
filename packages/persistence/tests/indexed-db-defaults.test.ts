import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { IndexedDbStorageAdapter } from '../src'

describe('IndexedDbStorageAdapter defaults', () => {
  it('uses its default clock and snapshot identifier when only a database is injected', async () => {
    const adapter = new IndexedDbStorageAdapter({
      databaseName: 'nk-fictional-default-options',
      indexedDB: new IDBFactory(),
    })

    const saved = await adapter.save(createEmptyAppDataFile(), {
      expectedRevision: null,
    })
    const snapshot = await adapter.createSnapshot({
      expectedRevision: saved.revision,
    })

    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    expect(snapshot.id).toMatch(/^[0-9a-f-]{36}$/u)
    adapter.close()
  })
})
