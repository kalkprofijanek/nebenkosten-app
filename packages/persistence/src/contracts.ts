import type { AppDataFile } from '@nebenkosten/schema'

export type PersistenceErrorCode =
  | 'invalid_data'
  | 'not_json_safe'
  | 'invalid_json'
  | 'invalid_utf8'
  | 'source_too_large'
  | 'unsupported_schema_version'
  | 'newer_schema_version'
  | 'hash_failed'
  | 'conflict'
  | 'snapshot_not_found'
  | 'corrupt_storage'
  | 'quota_exceeded'
  | 'permission_denied'
  | 'unsupported_capability'
  | 'io_failed'

export interface LoadedAppData {
  readonly data: AppDataFile
  readonly revision: string
}

export interface SaveResult extends LoadedAppData {
  readonly savedAt: string
}

export interface SaveOptions {
  readonly expectedRevision: string | null
}

export type SnapshotKind =
  'automatic' | 'manual' | 'before_import' | 'before_restore'

export interface SnapshotMeta {
  readonly id: string
  readonly createdAt: string
  readonly sourceRevision: string
  readonly schemaVersion: number
  readonly sha256: string
  readonly byteLength: number
  readonly kind: SnapshotKind
  readonly pinned: boolean
}

export interface SnapshotOptions {
  readonly expectedRevision: string
  readonly kind?: SnapshotKind
}

export interface RestoreOptions {
  readonly expectedRevision: string
}

export interface RestoreResult extends SaveResult {
  readonly beforeRestoreSnapshot: SnapshotMeta
}

export interface StorageAdapter {
  load(): Promise<LoadedAppData | null>
  save(data: AppDataFile, options: SaveOptions): Promise<SaveResult>
}

export interface SnapshotStorageAdapter extends StorageAdapter {
  createSnapshot(options: SnapshotOptions): Promise<SnapshotMeta>
  listSnapshots(): Promise<readonly SnapshotMeta[]>
  restoreSnapshot(
    snapshotId: string,
    options: RestoreOptions,
  ): Promise<RestoreResult>
}
