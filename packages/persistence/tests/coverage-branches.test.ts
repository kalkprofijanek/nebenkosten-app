import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import {
  FileSystemAccessStorageAdapter,
  JsonFileStorageAdapter,
  MemoryStorageAdapter,
  PersistenceError,
  selectSnapshotsToRetain,
  toPersistenceError,
  type SnapshotMeta,
} from '../src'
import { FakeJsonFilePort } from './fake-file-storage'

const NOW = new Date('2026-07-19T12:00:00.000Z')

function fictionalData(): AppDataFile {
  return {
    ...createEmptyAppDataFile(),
    meta: { appVersion: 'coverage-branch-test' },
  }
}

async function expectCode(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({
    name: 'PersistenceError',
    code,
  })
}

describe('persistence error mapping branches', () => {
  it('preserves an existing public error instance', () => {
    const original = new PersistenceError('conflict')

    expect(toPersistenceError(original)).toBe(original)
  })

  it('uses the requested redacted fallback for an unknown failure', () => {
    const mapped = toPersistenceError(
      new Error('private platform detail'),
      'corrupt_storage',
    )

    expect(mapped).toMatchObject({
      name: 'PersistenceError',
      code: 'corrupt_storage',
    })
    expect(String(mapped)).not.toContain('private platform detail')
  })

  it('does not trust malformed external error codes', () => {
    expect(
      toPersistenceError({ code: 7, schemaVersion: '5' }, 'io_failed'),
    ).toMatchObject({ code: 'io_failed' })
    expect(
      toPersistenceError({ code: 'not-a-public-code' }, 'io_failed'),
    ).toMatchObject({ code: 'io_failed' })
  })
})

describe('file-system capability and failure branches', () => {
  it.each([
    null,
    {},
    { getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) },
    {
      getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    },
  ])('rejects an incomplete handle before accessing it', async (handle) => {
    const adapter = new FileSystemAccessStorageAdapter(handle)

    await expectCode(adapter.load(), 'unsupported_capability')
  })

  it('preserves a redacted persistence error raised by the read capability', async () => {
    const handle = {
      getFile: async () => {
        throw new PersistenceError('permission_denied')
      },
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
      queryPermission: async () => 'granted' as const,
    }
    const adapter = new FileSystemAccessStorageAdapter(handle)

    await expectCode(adapter.load(), 'permission_denied')
  })

  it('maps an explicit permission API failure without leaking its message', async () => {
    const handle = {
      getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
      queryPermission: async () => 'prompt' as const,
      requestPermission: async () => {
        throw new Error('private permission detail')
      },
    }
    const adapter = new FileSystemAccessStorageAdapter(handle)

    await expectCode(adapter.requestWritePermission(), 'permission_denied')
  })

  it('handles a write failure even when the writable has no abort capability', async () => {
    const handle = {
      getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
      createWritable: async () => ({
        write: async () => {
          throw new Error('private write detail')
        },
        close: async () => {},
      }),
      queryPermission: async () => 'granted' as const,
    }
    const adapter = new FileSystemAccessStorageAdapter(handle, {
      now: () => new Date(NOW),
    })

    await expectCode(
      adapter.save(fictionalData(), { expectedRevision: null }),
      'io_failed',
    )
  })
})

describe('JSON port failure preservation and verification branches', () => {
  it('preserves an intentional public read error', async () => {
    const port = new FakeJsonFilePort()
    port.readFailure = new PersistenceError('permission_denied')
    const adapter = new JsonFileStorageAdapter(port)

    await expectCode(adapter.load(), 'permission_denied')
  })

  it('preserves an intentional public write error', async () => {
    const port = new FakeJsonFilePort()
    port.writeFailure = new PersistenceError('quota_exceeded')
    const adapter = new JsonFileStorageAdapter(port, {
      now: () => new Date(NOW),
    })

    await expectCode(
      adapter.save(fictionalData(), { expectedRevision: null }),
      'quota_exceeded',
    )
  })

  it('rejects a target that disappears during post-write verification', async () => {
    let reads = 0
    const port = {
      async read(): Promise<Uint8Array | null> {
        reads += 1
        return reads < 2 ? null : new Uint8Array()
      },
      async write(): Promise<void> {},
    }
    const adapter = new JsonFileStorageAdapter(port, {
      now: () => new Date(NOW),
    })

    await expectCode(
      adapter.save(fictionalData(), { expectedRevision: null }),
      'io_failed',
    )
  })
})

describe('memory and retention defensive branches', () => {
  it('provides working clock and identifier defaults without caller globals', async () => {
    const adapter = new MemoryStorageAdapter()
    const saved = await adapter.save(fictionalData(), {
      expectedRevision: null,
    })
    const snapshot = await adapter.createSnapshot({
      expectedRevision: saved.revision,
    })

    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    expect(snapshot.id).toBeTruthy()
    expect(snapshot.kind).toBe('automatic')
  })

  it('rejects snapshot operations while no current revision exists', async () => {
    const adapter = new MemoryStorageAdapter({
      now: () => new Date(NOW),
      createId: () => 'unused-id',
    })

    await expectCode(
      adapter.createSnapshot({ expectedRevision: 'a'.repeat(64) }),
      'conflict',
    )
  })

  it('rejects duplicate snapshot IDs without replacing the first snapshot', async () => {
    const adapter = new MemoryStorageAdapter({
      now: () => new Date(NOW),
      createId: () => 'duplicate-id',
    })
    const saved = await adapter.save(fictionalData(), {
      expectedRevision: null,
    })
    await adapter.createSnapshot({
      expectedRevision: saved.revision,
      kind: 'manual',
    })

    await expectCode(
      adapter.createSnapshot({
        expectedRevision: saved.revision,
        kind: 'automatic',
      }),
      'io_failed',
    )
    await expect(adapter.listSnapshots()).resolves.toHaveLength(1)
  })

  it('uses IDs as the deterministic tie breaker for equal timestamps', () => {
    const base: Omit<SnapshotMeta, 'id'> = {
      createdAt: NOW.toISOString(),
      sourceRevision: 'a'.repeat(64),
      schemaVersion: 4,
      sha256: 'a'.repeat(64),
      byteLength: 1,
      kind: 'manual',
      pinned: true,
    }

    const retained = selectSnapshotsToRetain(
      [
        { ...base, id: 'snapshot-z' },
        { ...base, id: 'snapshot-a' },
      ],
      { now: NOW },
    )

    expect(retained.map(({ id }) => id)).toEqual(['snapshot-a', 'snapshot-z'])
  })
})
