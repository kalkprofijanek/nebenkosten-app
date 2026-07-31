import {
  decodeCurrentAppDataBytes,
  encodeCurrentAppData,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'

import type {
  LoadedAppData,
  RestoreOptions,
  RestoreResult,
  SaveOptions,
  SaveResult,
  SnapshotKind,
  SnapshotMeta,
  SnapshotOptions,
} from './contracts'
import { PersistenceError, toPersistenceError } from './errors'
import { selectSnapshotsToRetain } from './snapshot-retention'

const DATABASE_VERSION = 1
const CURRENT_STORE = 'current'
const SNAPSHOT_STORE = 'snapshots'
const CURRENT_KEY = 'app-data'
const SHA256_HEX = /^[0-9a-f]{64}$/u
const SNAPSHOT_KINDS = new Set<SnapshotKind>([
  'automatic',
  'manual',
  'before_import',
  'before_restore',
])

interface CurrentRecord {
  readonly revision: string
  readonly bytes: Uint8Array
  readonly savedAt: string
}

interface SnapshotRecord extends SnapshotMeta {
  readonly bytes: Uint8Array
}

export interface IndexedDbStorageAdapterOptions {
  readonly databaseName: string
  readonly indexedDB?: IDBFactory
  readonly now?: () => Date
  readonly createId?: () => string
}

function defaultSnapshotId(): string {
  return globalThis.crypto.randomUUID()
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes)
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  )
}

function sameCurrentRecord(
  left: CurrentRecord | undefined,
  right: CurrentRecord | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right
  }
  return (
    left.revision === right.revision &&
    left.savedAt === right.savedAt &&
    sameBytes(left.bytes, right.bytes)
  )
}

function sameSnapshotRecord(
  left: SnapshotRecord,
  right: SnapshotRecord,
): boolean {
  return (
    left.id === right.id &&
    left.createdAt === right.createdAt &&
    left.sourceRevision === right.sourceRevision &&
    left.schemaVersion === right.schemaVersion &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.kind === right.kind &&
    left.pinned === right.pinned &&
    sameBytes(left.bytes, right.bytes)
  )
}

function sameSnapshotHistory(
  current: readonly SnapshotRecord[],
  validated: readonly SnapshotRecord[],
): boolean {
  if (current.length !== validated.length) return false
  const validatedById = new Map(
    validated.map((snapshot) => [snapshot.id, snapshot]),
  )
  return current.every((snapshot) => {
    const previous = validatedById.get(snapshot.id)
    return previous !== undefined && sameSnapshotRecord(snapshot, previous)
  })
}

function copySnapshotMeta(record: SnapshotRecord): SnapshotMeta {
  return {
    id: record.id,
    createdAt: record.createdAt,
    sourceRevision: record.sourceRevision,
    schemaVersion: record.schemaVersion,
    sha256: record.sha256,
    byteLength: record.byteLength,
    kind: record.kind,
    pinned: record.pinned,
  }
}

function snapshotMeta(
  id: string,
  current: CurrentRecord,
  createdAt: string,
  kind: SnapshotKind,
): SnapshotMeta {
  return {
    id,
    createdAt,
    sourceRevision: current.revision,
    schemaVersion: 4,
    sha256: current.revision,
    byteLength: current.bytes.byteLength,
    kind,
    pinned: kind !== 'automatic',
  }
}

function snapshotRecord(meta: SnapshotMeta, bytes: Uint8Array): SnapshotRecord {
  return {
    ...meta,
    bytes: copyBytes(bytes),
  }
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  )
}

function assertSnapshotRecord(value: unknown): asserts value is SnapshotRecord {
  if (typeof value !== 'object' || value === null) {
    throw new PersistenceError('corrupt_storage')
  }
  const record = value as Partial<SnapshotRecord>
  const validKind =
    typeof record.kind === 'string' &&
    SNAPSHOT_KINDS.has(record.kind as SnapshotKind)
  const expectedPinned = validKind && record.kind !== 'automatic'
  if (
    typeof record.id !== 'string' ||
    record.id.length === 0 ||
    record.id.length > 200 ||
    !isIsoTimestamp(record.createdAt) ||
    typeof record.sourceRevision !== 'string' ||
    !SHA256_HEX.test(record.sourceRevision) ||
    record.schemaVersion !== 4 ||
    typeof record.sha256 !== 'string' ||
    !SHA256_HEX.test(record.sha256) ||
    record.sha256 !== record.sourceRevision ||
    !Number.isSafeInteger(record.byteLength) ||
    (record.byteLength ?? -1) < 0 ||
    !validKind ||
    record.pinned !== expectedPinned ||
    !(record.bytes instanceof Uint8Array) ||
    record.bytes.byteLength !== record.byteLength
  ) {
    throw new PersistenceError('corrupt_storage')
  }
}

function persistenceFailure(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) {
    return error
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new PersistenceError('quota_exceeded')
  }
  return toPersistenceError(error, 'io_failed')
}

function corruptStorageFailure(error: unknown): PersistenceError {
  const mapped = toPersistenceError(error, 'corrupt_storage')
  if (
    mapped.code === 'newer_schema_version' ||
    mapped.code === 'unsupported_schema_version'
  ) {
    return mapped
  }
  return new PersistenceError('corrupt_storage')
}

export class IndexedDbStorageAdapter {
  private readonly databaseName: string
  private readonly indexedDB: IDBFactory
  private readonly now: () => Date
  private readonly createId: () => string
  private databasePromise: Promise<IDBDatabase> | null = null

  constructor(options: IndexedDbStorageAdapterOptions) {
    this.databaseName = options.databaseName
    this.indexedDB = options.indexedDB ?? globalThis.indexedDB
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? defaultSnapshotId
  }

  async load(): Promise<LoadedAppData | null> {
    try {
      const database = await this.openDatabase()
      const transaction = database.transaction(CURRENT_STORE, 'readonly')
      const record = (await requestResult(
        transaction.objectStore(CURRENT_STORE).get(CURRENT_KEY),
      )) as CurrentRecord | undefined
      await transactionDone(transaction)
      if (record === undefined) {
        return null
      }
      return await this.decodeCurrent(record)
    } catch (error) {
      throw persistenceFailure(error)
    }
  }

  async save(data: AppDataFile, options: SaveOptions): Promise<SaveResult> {
    try {
      const encoded = await encodeCurrentAppData(data, {
        savedAt: this.now(),
      })
      const next: CurrentRecord = {
        revision: encoded.revision,
        bytes: copyBytes(encoded.bytes),
        savedAt: encoded.savedAt,
      }
      const validatedCurrent = await this.readValidatedCurrent()
      this.assertExpectedRevision(validatedCurrent, options.expectedRevision)
      const database = await this.openDatabase()
      const transaction = database.transaction(CURRENT_STORE, 'readwrite')
      const store = transaction.objectStore(CURRENT_STORE)
      const current = (await requestResult(store.get(CURRENT_KEY))) as
        CurrentRecord | undefined
      this.assertExpectedRevision(current, options.expectedRevision)
      if (!sameCurrentRecord(current, validatedCurrent)) {
        throw new PersistenceError('conflict')
      }
      store.put(next, CURRENT_KEY)
      await transactionDone(transaction)
      return {
        data: structuredClone(encoded.data),
        revision: encoded.revision,
        savedAt: encoded.savedAt,
      }
    } catch (error) {
      throw persistenceFailure(error)
    }
  }

  async createSnapshot(options: SnapshotOptions): Promise<SnapshotMeta> {
    try {
      const [validatedCurrent, validatedSnapshots] = await Promise.all([
        this.readValidatedCurrent(),
        this.readValidatedSnapshots(),
      ])
      this.assertExpectedRevision(validatedCurrent, options.expectedRevision)
      if (validatedCurrent === undefined) {
        throw new PersistenceError('conflict')
      }
      const createdAt = this.now()
      const database = await this.openDatabase()
      const transaction = database.transaction(
        [CURRENT_STORE, SNAPSHOT_STORE],
        'readwrite',
      )
      const current = (await requestResult(
        transaction.objectStore(CURRENT_STORE).get(CURRENT_KEY),
      )) as CurrentRecord | undefined
      this.assertExpectedRevision(current, options.expectedRevision)
      if (current === undefined) {
        throw new PersistenceError('conflict')
      }
      if (!sameCurrentRecord(current, validatedCurrent)) {
        throw new PersistenceError('conflict')
      }
      const kind = options.kind ?? 'automatic'
      const meta = snapshotMeta(
        this.createId(),
        current,
        createdAt.toISOString(),
        kind,
      )
      const snapshotStore = transaction.objectStore(SNAPSHOT_STORE)
      const storedSnapshots = (await requestResult(
        snapshotStore.getAll(),
      )) as unknown[]
      for (const snapshot of storedSnapshots) assertSnapshotRecord(snapshot)
      const currentSnapshots = storedSnapshots as SnapshotRecord[]
      if (!sameSnapshotHistory(currentSnapshots, validatedSnapshots)) {
        throw new PersistenceError('conflict')
      }
      const nextSnapshot = snapshotRecord(meta, current.bytes)
      const retainedIds = new Set(
        selectSnapshotsToRetain(
          [...currentSnapshots, nextSnapshot].map(copySnapshotMeta),
          {
            now: createdAt,
          },
        ).map(({ id }) => id),
      )
      snapshotStore.add(nextSnapshot)
      for (const existing of currentSnapshots) {
        if (!retainedIds.has(existing.id)) {
          snapshotStore.delete(existing.id)
        }
      }
      await transactionDone(transaction)
      return structuredClone(meta)
    } catch (error) {
      throw persistenceFailure(error)
    }
  }

  async listSnapshots(): Promise<SnapshotMeta[]> {
    try {
      const records = await this.readValidatedSnapshots()
      return records
        .map(copySnapshotMeta)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.id.localeCompare(left.id),
        )
    } catch (error) {
      throw persistenceFailure(error)
    }
  }

  async restoreSnapshot(
    id: string,
    options: RestoreOptions,
  ): Promise<RestoreResult> {
    try {
      const initial = await this.readRestoreInputs(id)
      this.assertExpectedRevision(initial.current, options.expectedRevision)
      if (initial.current === undefined) {
        throw new PersistenceError('conflict')
      }
      const target = await this.decodeSnapshot(initial.target)
      const restoredAt = this.now()
      const restored = await encodeCurrentAppData(target.data, {
        savedAt: restoredAt,
      })
      const next: CurrentRecord = {
        revision: restored.revision,
        bytes: copyBytes(restored.bytes),
        savedAt: restored.savedAt,
      }
      const safetyMeta = snapshotMeta(
        this.createId(),
        initial.current,
        restoredAt.toISOString(),
        'before_restore',
      )

      const database = await this.openDatabase()
      const transaction = database.transaction(
        [CURRENT_STORE, SNAPSHOT_STORE],
        'readwrite',
      )
      const currentStore = transaction.objectStore(CURRENT_STORE)
      const snapshotStore = transaction.objectStore(SNAPSHOT_STORE)
      const current = (await requestResult(currentStore.get(CURRENT_KEY))) as
        CurrentRecord | undefined
      this.assertExpectedRevision(current, options.expectedRevision)
      if (!sameCurrentRecord(current, initial.current)) {
        throw new PersistenceError('conflict')
      }
      const stillPresent = (await requestResult(snapshotStore.get(id))) as
        SnapshotRecord | undefined
      if (stillPresent === undefined) {
        throw new PersistenceError('snapshot_not_found')
      }
      assertSnapshotRecord(stillPresent)
      if (!sameSnapshotRecord(stillPresent, initial.target)) {
        throw new PersistenceError('conflict')
      }
      if (current === undefined) {
        throw new PersistenceError('conflict')
      }
      snapshotStore.add(snapshotRecord(safetyMeta, current.bytes))
      currentStore.put(next, CURRENT_KEY)
      await transactionDone(transaction)
      return {
        data: structuredClone(restored.data),
        revision: restored.revision,
        savedAt: restored.savedAt,
        beforeRestoreSnapshot: { ...safetyMeta },
      }
    } catch (error) {
      throw persistenceFailure(error)
    }
  }

  close(): void {
    const pending = this.databasePromise
    this.databasePromise = null
    if (pending !== null) {
      void pending.then(
        (database) => database.close(),
        () => undefined,
      )
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise !== null) {
      return this.databasePromise
    }
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(CURRENT_STORE)) {
          database.createObjectStore(CURRENT_STORE)
        }
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' })
        }
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () =>
        reject(new PersistenceError('unsupported_capability'))
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }
    })
    return this.databasePromise
  }

  private assertExpectedRevision(
    current: CurrentRecord | undefined,
    expectedRevision: string | null,
  ): void {
    const currentRevision = current?.revision ?? null
    if (currentRevision !== expectedRevision) {
      throw new PersistenceError('conflict')
    }
  }

  private async decodeCurrent(record: CurrentRecord): Promise<LoadedAppData> {
    let decoded: Awaited<ReturnType<typeof decodeCurrentAppDataBytes>>
    try {
      decoded = await decodeCurrentAppDataBytes(copyBytes(record.bytes))
    } catch (error) {
      throw corruptStorageFailure(error)
    }
    if (decoded.revision !== record.revision) {
      throw new PersistenceError('corrupt_storage')
    }
    if (decoded.data.meta.savedAt !== record.savedAt) {
      throw new PersistenceError('corrupt_storage')
    }
    return {
      data: structuredClone(decoded.data),
      revision: decoded.revision,
    }
  }

  private async decodeSnapshot(record: SnapshotRecord): Promise<LoadedAppData> {
    assertSnapshotRecord(record)
    let decoded: Awaited<ReturnType<typeof decodeCurrentAppDataBytes>>
    try {
      decoded = await decodeCurrentAppDataBytes(copyBytes(record.bytes))
    } catch (error) {
      throw corruptStorageFailure(error)
    }
    if (
      decoded.revision !== record.sha256 ||
      decoded.revision !== record.sourceRevision ||
      decoded.bytes.byteLength !== record.byteLength
    ) {
      throw new PersistenceError('corrupt_storage')
    }
    return {
      data: structuredClone(decoded.data),
      revision: decoded.revision,
    }
  }

  private async readRestoreInputs(id: string): Promise<{
    readonly current: CurrentRecord | undefined
    readonly target: SnapshotRecord
  }> {
    const database = await this.openDatabase()
    const transaction = database.transaction(
      [CURRENT_STORE, SNAPSHOT_STORE],
      'readonly',
    )
    const currentRequest = requestResult(
      transaction.objectStore(CURRENT_STORE).get(CURRENT_KEY),
    ) as Promise<CurrentRecord | undefined>
    const targetRequest = requestResult(
      transaction.objectStore(SNAPSHOT_STORE).get(id),
    ) as Promise<SnapshotRecord | undefined>
    const [current, target] = await Promise.all([currentRequest, targetRequest])
    await transactionDone(transaction)
    if (target === undefined) {
      throw new PersistenceError('snapshot_not_found')
    }
    assertSnapshotRecord(target)
    if (current === undefined) {
      throw new PersistenceError('conflict')
    }
    await this.decodeCurrent(current)
    return { current, target }
  }

  private async readValidatedCurrent(): Promise<CurrentRecord | undefined> {
    const database = await this.openDatabase()
    const transaction = database.transaction(CURRENT_STORE, 'readonly')
    const current = (await requestResult(
      transaction.objectStore(CURRENT_STORE).get(CURRENT_KEY),
    )) as CurrentRecord | undefined
    await transactionDone(transaction)
    if (current !== undefined) {
      await this.decodeCurrent(current)
    }
    return current
  }

  private async readValidatedSnapshots(): Promise<SnapshotRecord[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction(SNAPSHOT_STORE, 'readonly')
    const records = (await requestResult(
      transaction.objectStore(SNAPSHOT_STORE).getAll(),
    )) as unknown[]
    await transactionDone(transaction)
    for (const record of records) assertSnapshotRecord(record)
    const validatedRecords = records as SnapshotRecord[]
    await Promise.all(
      validatedRecords.map((record) => this.decodeSnapshot(record)),
    )
    return validatedRecords.map((record) => ({
      ...record,
      bytes: copyBytes(record.bytes),
    }))
  }
}
