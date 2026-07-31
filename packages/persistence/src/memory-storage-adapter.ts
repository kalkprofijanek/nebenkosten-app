import {
  encodeCurrentAppData,
  type EncodedCurrentAppData,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'

import type {
  LoadedAppData,
  RestoreOptions,
  RestoreResult,
  SaveOptions,
  SaveResult,
  SnapshotMeta,
  SnapshotOptions,
  SnapshotStorageAdapter,
} from './contracts'
import { PersistenceError, toPersistenceError } from './errors'
import { selectSnapshotsToRetain } from './snapshot-retention'

interface StoredCurrent {
  readonly data: AppDataFile
  readonly bytes: Uint8Array
  readonly revision: string
  readonly savedAt: string
}

interface StoredSnapshot {
  readonly meta: SnapshotMeta
  readonly data: AppDataFile
}

export interface MemoryStorageAdapterOptions {
  readonly now?: () => Date
  readonly createId?: () => string
}

function cloneLoaded(current: StoredCurrent): LoadedAppData {
  return {
    data: structuredClone(current.data),
    revision: current.revision,
  }
}

function cloneSaved(current: StoredCurrent): SaveResult {
  return {
    ...cloneLoaded(current),
    savedAt: current.savedAt,
  }
}

function toStoredCurrent(encoded: EncodedCurrentAppData): StoredCurrent {
  return {
    data: structuredClone(encoded.data),
    bytes: encoded.bytes.slice(),
    revision: encoded.revision,
    savedAt: encoded.savedAt,
  }
}

export class MemoryStorageAdapter implements SnapshotStorageAdapter {
  private readonly now: () => Date
  private readonly createId: () => string
  private current: StoredCurrent | null = null
  private snapshots: readonly StoredSnapshot[] = []
  private operationTail: Promise<void> = Promise.resolve()

  constructor(options: MemoryStorageAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.createId =
      options.createId ??
      (() => globalThis.crypto?.randomUUID?.() ?? fallbackSnapshotId())
  }

  async load(): Promise<LoadedAppData | null> {
    return this.runExclusive(async () =>
      this.current === null ? null : cloneLoaded(this.current),
    )
  }

  async save(data: AppDataFile, options: SaveOptions): Promise<SaveResult> {
    return this.runExclusive(async () => {
      this.assertExpectedRevision(options.expectedRevision)
      const encoded = await this.encode(data, this.now())
      this.current = toStoredCurrent(encoded)
      return cloneSaved(this.current)
    })
  }

  async createSnapshot(options: SnapshotOptions): Promise<SnapshotMeta> {
    return this.runExclusive(async () => {
      const current = this.requireCurrent()
      this.assertExpectedRevision(options.expectedRevision)
      const createdAt = this.now()
      const snapshot = this.buildSnapshot(
        current,
        options.kind ?? 'automatic',
        createdAt,
      )
      this.snapshots = this.retainSnapshots(
        [...this.snapshots, snapshot],
        createdAt,
      )
      return { ...snapshot.meta }
    })
  }

  async listSnapshots(): Promise<readonly SnapshotMeta[]> {
    return this.runExclusive(async () =>
      this.snapshots
        .map(({ meta }) => ({ ...meta }))
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
            left.id.localeCompare(right.id),
        ),
    )
  }

  async restoreSnapshot(
    snapshotId: string,
    options: RestoreOptions,
  ): Promise<RestoreResult> {
    return this.runExclusive(async () => {
      const current = this.requireCurrent()
      this.assertExpectedRevision(options.expectedRevision)
      const target = this.snapshots.find(({ meta }) => meta.id === snapshotId)
      if (target === undefined) {
        throw new PersistenceError('snapshot_not_found')
      }

      // Complete all fallible validation and hashing before changing either
      // current state or snapshot history.
      const restoredAt = this.now()
      const encoded = await this.encode(target.data, restoredAt)
      const safetySnapshot = this.buildSnapshot(
        current,
        'before_restore',
        restoredAt,
      )
      const nextSnapshots = this.retainSnapshots(
        [...this.snapshots, safetySnapshot],
        restoredAt,
      )

      this.current = toStoredCurrent(encoded)
      this.snapshots = nextSnapshots
      return {
        ...cloneSaved(this.current),
        beforeRestoreSnapshot: { ...safetySnapshot.meta },
      }
    })
  }

  private async encode(
    data: AppDataFile,
    savedAt: Date,
  ): Promise<EncodedCurrentAppData> {
    try {
      return await encodeCurrentAppData(data, { savedAt })
    } catch (error) {
      throw toPersistenceError(error)
    }
  }

  private assertExpectedRevision(expectedRevision: string | null): void {
    const actualRevision = this.current?.revision ?? null
    if (actualRevision !== expectedRevision) {
      throw new PersistenceError('conflict')
    }
  }

  private requireCurrent(): StoredCurrent {
    if (this.current === null) {
      throw new PersistenceError('conflict')
    }
    return this.current
  }

  private buildSnapshot(
    current: StoredCurrent,
    kind: SnapshotMeta['kind'],
    createdAt: Date,
  ): StoredSnapshot {
    const id = this.createId()
    if (this.snapshots.some(({ meta }) => meta.id === id)) {
      throw new PersistenceError('io_failed')
    }

    return {
      meta: {
        id,
        createdAt: createdAt.toISOString(),
        sourceRevision: current.revision,
        schemaVersion: current.data.schemaVersion,
        sha256: current.revision,
        byteLength: current.bytes.byteLength,
        kind,
        pinned: kind !== 'automatic',
      },
      data: structuredClone(current.data),
    }
  }

  private retainSnapshots(
    snapshots: readonly StoredSnapshot[],
    now: Date,
  ): readonly StoredSnapshot[] {
    const retainedIds = new Set(
      selectSnapshotsToRetain(
        snapshots.map(({ meta }) => meta),
        { now },
      ).map(({ id }) => id),
    )
    return snapshots.filter(({ meta }) => retainedIds.has(meta.id))
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation)
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

let fallbackIdCounter = 0

function fallbackSnapshotId(): string {
  fallbackIdCounter += 1
  return `snapshot-${Date.now()}-${fallbackIdCounter}`
}
