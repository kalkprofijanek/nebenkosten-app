import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  FileSystemAccessStorageAdapter,
  JsonFileStorageAdapter,
  PersistenceError,
} from '../src'
import { FakeFileSystemHandle, FakeJsonFilePort } from './fake-file-storage'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const FIXED_NOW = new Date('2026-07-19T10:11:12.000Z')
const SECRET_MARKER =
  'Mieterin Geheim, IBAN DE001234, C:\\private-data\\backup-secret.json'

interface FileStorage {
  load(): Promise<{
    readonly data: AppDataFile
    readonly revision: string
  } | null>
  save(
    data: AppDataFile,
    options: { readonly expectedRevision: string | null },
  ): Promise<{ readonly data: AppDataFile; readonly revision: string }>
}

interface StorageHarness {
  readonly adapter: FileStorage
  bytes(): Uint8Array | null
  replaceBytes(bytes: Uint8Array | null): void
  writeCount(): number
}

function buildFictionalData(label = 'Fiktive Hausverwaltung'): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    meta: { appVersion: '8.0.0-test' },
    masterData: {
      ...empty.masterData,
      organizations: [
        {
          id: 'organization-fictional',
          name: label,
          createdAt: '2026-01-02T03:04:05.000Z',
        },
      ],
    },
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  )
}

function storedBytes(
  data: AppDataFile,
  savedAt = FIXED_NOW.toISOString(),
): Uint8Array {
  const stored = {
    ...data,
    meta: { ...data.meta, savedAt },
  }
  return encoder.encode(`${JSON.stringify(sortJsonValue(stored), null, 2)}\n`)
}

function newerSchemaBytes(): Uint8Array {
  return encoder.encode('{"schemaVersion":5,"private":"do-not-overwrite"}\n')
}

function unsupportedSchemaBytes(): Uint8Array {
  return encoder.encode('{"schemaVersion":2,"private":"do-not-overwrite"}\n')
}

function corruptBytes(): Uint8Array {
  return encoder.encode(
    `{"schemaVersion":4,"private":"${SECRET_MARKER.replaceAll('\\', '\\\\')}"}\n`,
  )
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const trustedBytes = new Uint8Array(bytes.byteLength)
  trustedBytes.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', trustedBytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function expectPersistenceError(
  operation: Promise<unknown>,
  code: string,
  forbiddenFragments: readonly string[] = [],
): Promise<PersistenceError> {
  try {
    await operation
    expect.unreachable(`Expected PersistenceError with code ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceError)
    const persistenceError = error as PersistenceError
    expect(persistenceError.code).toBe(code)
    const exposed = `${String(persistenceError)} ${JSON.stringify(
      persistenceError,
    )}`
    for (const fragment of forbiddenFragments)
      expect(exposed).not.toContain(fragment)
    return persistenceError
  }
}

function jsonHarness(initialBytes: Uint8Array | null = null): StorageHarness {
  const port = new FakeJsonFilePort(initialBytes)
  return {
    adapter: new JsonFileStorageAdapter(port, {
      now: () => new Date(FIXED_NOW),
    }),
    bytes: () => port.bytes(),
    replaceBytes: (bytes) => port.replaceBytes(bytes),
    writeCount: () => port.writeCalls,
  }
}

function fileSystemHarness(
  initialBytes: Uint8Array = new Uint8Array(),
): StorageHarness {
  const handle = new FakeFileSystemHandle(initialBytes)
  return {
    adapter: new FileSystemAccessStorageAdapter(handle, {
      now: () => new Date(FIXED_NOW),
    }),
    bytes: () => handle.bytes(),
    replaceBytes: (bytes) => handle.replaceBytes(bytes ?? new Uint8Array()),
    writeCount: () => handle.createWritableCalls,
  }
}

const adapterFactories = [
  ['JsonFileStorageAdapter', jsonHarness],
  ['FileSystemAccessStorageAdapter', fileSystemHarness],
] as const

describe.each(adapterFactories)('%s file contract', (_name, createHarness) => {
  it('loads an empty target and creates the first revision only with expectedRevision null', async () => {
    const harness = createHarness()
    const input = buildFictionalData()

    await expect(harness.adapter.load()).resolves.toBeNull()
    const saved = await harness.adapter.save(input, {
      expectedRevision: null,
    })

    expect(saved.data).toEqual({
      ...input,
      meta: { ...input.meta, savedAt: FIXED_NOW.toISOString() },
    })
    expect(saved.revision).toMatch(/^[0-9a-f]{64}$/u)
    expect(harness.writeCount()).toBe(1)
  })

  it('loads the same detached data and exact byte revision after reopening', async () => {
    const harness = createHarness()
    const input = buildFictionalData()
    const saved = await harness.adapter.save(input, {
      expectedRevision: null,
    })
    const bytes = harness.bytes()

    expect(bytes).not.toBeNull()
    expect(saved.revision).toBe(await sha256(bytes!))
    expect(decoder.decode(bytes!)).toBe(decoder.decode(storedBytes(input)))

    const reloaded = await createHarness(bytes!).adapter.load()
    expect(reloaded).toEqual({
      data: saved.data,
      revision: saved.revision,
    })
    expect(reloaded?.data).not.toBe(saved.data)
  })

  it('rejects a stale expected revision without changing existing bytes', async () => {
    const harness = createHarness()
    const first = await harness.adapter.save(buildFictionalData('Stand A'), {
      expectedRevision: null,
    })
    const beforeConflict = harness.bytes()
    const staleRevision = `${
      first.revision.startsWith('0') ? '1' : '0'
    }${first.revision.slice(1)}`

    await expectPersistenceError(
      harness.adapter.save(buildFictionalData('Stand B'), {
        expectedRevision: staleRevision,
      }),
      'conflict',
    )

    expect(harness.bytes()).toEqual(beforeConflict)
    expect(harness.writeCount()).toBe(1)
  })

  it('detects external valid-byte modification before writing', async () => {
    const harness = createHarness()
    const loadedRevision = (
      await harness.adapter.save(buildFictionalData('Stand A'), {
        expectedRevision: null,
      })
    ).revision
    const externalBytes = storedBytes(
      buildFictionalData('Extern geänderter Stand'),
      '2026-07-19T10:12:13.000Z',
    )
    harness.replaceBytes(externalBytes)

    await expectPersistenceError(
      harness.adapter.save(buildFictionalData('Lokaler Stand B'), {
        expectedRevision: loadedRevision,
      }),
      'conflict',
    )

    expect(harness.bytes()).toEqual(externalBytes)
    expect(harness.writeCount()).toBe(1)
  })

  it('never overwrites a newer-schema target', async () => {
    const existing = newerSchemaBytes()
    const harness = createHarness(existing)

    await expectPersistenceError(
      harness.adapter.save(buildFictionalData(), {
        expectedRevision: null,
      }),
      'newer_schema_version',
    )

    expect(harness.bytes()).toEqual(existing)
    expect(harness.writeCount()).toBe(0)
  })

  it('classifies an older unsupported schema before writing', async () => {
    const existing = unsupportedSchemaBytes()
    const harness = createHarness(existing)

    await expectPersistenceError(
      harness.adapter.save(buildFictionalData(), {
        expectedRevision: null,
      }),
      'unsupported_schema_version',
    )

    expect(harness.bytes()).toEqual(existing)
    expect(harness.writeCount()).toBe(0)
  })

  it('never overwrites corrupt existing data', async () => {
    const existing = corruptBytes()
    const harness = createHarness(existing)

    await expectPersistenceError(
      harness.adapter.save(buildFictionalData(), {
        expectedRevision: null,
      }),
      'corrupt_storage',
      [SECRET_MARKER, 'backup-secret.json', 'DE001234'],
    )

    expect(harness.bytes()).toEqual(existing)
    expect(harness.writeCount()).toBe(0)
  })

  it('validates the candidate before opening a writable target', async () => {
    const harness = createHarness()
    const invalidCandidate = {
      ...buildFictionalData(),
      schemaVersion: 4,
      billingData: undefined,
    } as unknown as AppDataFile

    await expectPersistenceError(
      harness.adapter.save(invalidCandidate, { expectedRevision: null }),
      'not_json_safe',
    )

    expect(harness.writeCount()).toBe(0)
    expect(harness.bytes()?.byteLength ?? 0).toBe(0)
  })

  it('does not mutate the caller input while updating savedAt defensively', async () => {
    const harness = createHarness()
    const input = buildFictionalData()
    const before = structuredClone(input)

    const result = await harness.adapter.save(input, {
      expectedRevision: null,
    })

    expect(input).toEqual(before)
    expect(input.meta.savedAt).toBeUndefined()
    expect(result.data.meta.savedAt).toBe(FIXED_NOW.toISOString())
    expect(result.data).not.toBe(input)
    expect(result.data.masterData).not.toBe(input.masterData)
  })
})

describe('JsonFileStorageAdapter I/O safety', () => {
  it.each([
    ['read', 'io_failed'],
    ['write', 'io_failed'],
  ] as const)('maps a redacted %s failure to %s', async (operation, code) => {
    const port = new FakeJsonFilePort()
    const rawFailure = new Error(SECRET_MARKER)
    if (operation === 'read') port.readFailure = rawFailure
    else port.writeFailure = rawFailure
    const adapter = new JsonFileStorageAdapter(port, {
      now: () => new Date(FIXED_NOW),
    })

    await expectPersistenceError(
      adapter.save(buildFictionalData(SECRET_MARKER), {
        expectedRevision: null,
      }),
      code,
      [SECRET_MARKER, 'backup-secret.json', 'DE001234'],
    )
  })

  it('rereads and rejects bytes changed after the write', async () => {
    const port = new FakeJsonFilePort()
    port.tamperAfterWrite = corruptBytes()
    const adapter = new JsonFileStorageAdapter(port, {
      now: () => new Date(FIXED_NOW),
    })

    await expectPersistenceError(
      adapter.save(buildFictionalData(), { expectedRevision: null }),
      'io_failed',
      [SECRET_MARKER],
    )
    expect(port.readCalls).toBeGreaterThanOrEqual(2)
  })
})

describe('FileSystemAccessStorageAdapter permissions', () => {
  it('uses an already granted permission without requesting it', async () => {
    const handle = new FakeFileSystemHandle(new Uint8Array(), {
      permission: 'granted',
    })
    const adapter = new FileSystemAccessStorageAdapter(handle, {
      now: () => new Date(FIXED_NOW),
    })

    await adapter.save(buildFictionalData(), { expectedRevision: null })

    expect(handle.queryPermissionCalls).toBeGreaterThanOrEqual(1)
    expect(handle.requestPermissionCalls).toBe(0)
  })

  it.each(['prompt', 'denied'] as const)(
    'does not implicitly request a %s permission',
    async (permission) => {
      const handle = new FakeFileSystemHandle(new Uint8Array(), {
        permission,
        requestedPermission: 'granted',
      })
      const adapter = new FileSystemAccessStorageAdapter(handle, {
        now: () => new Date(FIXED_NOW),
      })

      await expectPersistenceError(
        adapter.save(buildFictionalData(), { expectedRevision: null }),
        'permission_denied',
      )

      expect(handle.requestPermissionCalls).toBe(0)
      expect(handle.createWritableCalls).toBe(0)
    },
  )

  it('requests write permission only through the explicit method', async () => {
    const handle = new FakeFileSystemHandle(new Uint8Array(), {
      permission: 'prompt',
      requestedPermission: 'granted',
    })
    const adapter = new FileSystemAccessStorageAdapter(handle, {
      now: () => new Date(FIXED_NOW),
    })

    await adapter.requestWritePermission()
    await adapter.save(buildFictionalData(), { expectedRevision: null })

    expect(handle.requestPermissionCalls).toBe(1)
    expect(handle.createWritableCalls).toBe(1)
  })

  it('reports a denied explicit permission request without writing', async () => {
    const handle = new FakeFileSystemHandle(new Uint8Array(), {
      permission: 'prompt',
      requestedPermission: 'denied',
    })
    const adapter = new FileSystemAccessStorageAdapter(handle)

    await expectPersistenceError(
      adapter.requestWritePermission(),
      'permission_denied',
    )
    expect(handle.requestPermissionCalls).toBe(1)
    expect(handle.createWritableCalls).toBe(0)
  })

  it('reports unsupported capability when permission requesting is unavailable', async () => {
    const handle = new FakeFileSystemHandle(new Uint8Array(), {
      permission: 'prompt',
    })
    const unsupportedHandle = {
      getFile: handle.getFile.bind(handle),
      createWritable: handle.createWritable.bind(handle),
      queryPermission: handle.queryPermission.bind(handle),
    }
    const adapter = new FileSystemAccessStorageAdapter(unsupportedHandle)

    await expectPersistenceError(
      adapter.requestWritePermission(),
      'unsupported_capability',
    )
    expect(handle.createWritableCalls).toBe(0)
  })
})

describe('FileSystemAccessStorageAdapter I/O and capability safety', () => {
  it.each([
    ['getFile', 'io_failed'],
    ['queryPermission', 'permission_denied'],
    ['createWritable', 'io_failed'],
    ['write', 'io_failed'],
    ['close', 'io_failed'],
  ] as const)('maps a redacted %s failure to %s', async (operation, code) => {
    const handle = new FakeFileSystemHandle(new Uint8Array(), {
      name: SECRET_MARKER,
    })
    handle.failures = { [operation]: new Error(SECRET_MARKER) }
    const adapter = new FileSystemAccessStorageAdapter(handle, {
      now: () => new Date(FIXED_NOW),
    })

    await expectPersistenceError(
      adapter.save(buildFictionalData(SECRET_MARKER), {
        expectedRevision: null,
      }),
      code,
      [SECRET_MARKER, 'backup-secret.json', 'DE001234'],
    )
  })

  it('rereads after close and rejects a mismatching file revision', async () => {
    const handle = new FakeFileSystemHandle()
    handle.tamperAfterClose = corruptBytes()
    const adapter = new FileSystemAccessStorageAdapter(handle, {
      now: () => new Date(FIXED_NOW),
    })

    await expectPersistenceError(
      adapter.save(buildFictionalData(), { expectedRevision: null }),
      'io_failed',
      [SECRET_MARKER],
    )

    expect(handle.closeCalls).toBe(1)
    expect(handle.getFileCalls).toBeGreaterThanOrEqual(2)
  })

  it.each(['getFile', 'createWritable'] as const)(
    'maps a revoked permission during %s to permission_denied',
    async (operation) => {
      const handle = new FakeFileSystemHandle()
      handle.failures = {
        [operation]: new DOMException('private detail', 'NotAllowedError'),
      }
      const adapter = new FileSystemAccessStorageAdapter(handle, {
        now: () => new Date(FIXED_NOW),
      })

      await expectPersistenceError(
        adapter.save(buildFictionalData(), { expectedRevision: null }),
        'permission_denied',
        ['private detail'],
      )
    },
  )

  it('rejects an oversized file before allocating its bytes', async () => {
    let arrayBufferCalls = 0
    const handle = {
      async getFile() {
        return {
          size: 25 * 1024 * 1024 + 1,
          async arrayBuffer() {
            arrayBufferCalls += 1
            return new ArrayBuffer(0)
          },
        }
      },
      async createWritable() {
        throw new Error('must not write')
      },
      async queryPermission() {
        return 'granted' as const
      },
    }
    const adapter = new FileSystemAccessStorageAdapter(handle)

    await expectPersistenceError(adapter.load(), 'source_too_large')
    expect(arrayBufferCalls).toBe(0)
  })

  it('reports an unsupported handle before reading or writing', async () => {
    const adapter = new FileSystemAccessStorageAdapter({} as never)

    await expectPersistenceError(
      adapter.save(buildFictionalData(), { expectedRevision: null }),
      'unsupported_capability',
    )
  })
})
