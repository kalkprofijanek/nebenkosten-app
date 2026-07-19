import type { AppDataFile } from '@nebenkosten/schema'
import { MAX_CURRENT_APP_DATA_BYTES } from '@nebenkosten/import-export'

import {
  JsonFileStorageAdapter,
  type JsonFileStorageAdapterOptions,
} from './json-file-storage-adapter'
import type { LoadedAppData, SaveOptions, SaveResult } from './contracts'
import { PersistenceError } from './errors'

export type FileSystemPermissionState = 'denied' | 'granted' | 'prompt'

interface ReadWritePermissionDescriptor {
  readonly mode: 'readwrite'
}

interface FileLike {
  readonly size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

interface WritableFileLike {
  abort?(): Promise<void>
  close(): Promise<void>
  write(value: Uint8Array): Promise<void>
}

export interface FileSystemAccessFileHandle {
  getFile(): Promise<FileLike>
  createWritable(): Promise<WritableFileLike>
  queryPermission(
    descriptor?: ReadWritePermissionDescriptor,
  ): Promise<FileSystemPermissionState>
  requestPermission?(
    descriptor?: ReadWritePermissionDescriptor,
  ): Promise<FileSystemPermissionState>
}

function hasRequiredCapabilities(
  value: unknown,
): value is FileSystemAccessFileHandle {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<FileSystemAccessFileHandle>
  return (
    typeof candidate.getFile === 'function' &&
    typeof candidate.createWritable === 'function' &&
    typeof candidate.queryPermission === 'function'
  )
}

function isPermissionFailure(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  )
}

export class FileSystemAccessStorageAdapter {
  readonly #handle: unknown
  readonly #delegate: JsonFileStorageAdapter

  constructor(handle: unknown, options: JsonFileStorageAdapterOptions = {}) {
    this.#handle = handle
    this.#delegate = new JsonFileStorageAdapter(
      {
        read: () => this.#read(),
        write: (bytes) => this.#write(bytes),
      },
      options,
    )
  }

  #supportedHandle(): FileSystemAccessFileHandle {
    if (!hasRequiredCapabilities(this.#handle)) {
      throw new PersistenceError('unsupported_capability')
    }
    return this.#handle
  }

  async #read(): Promise<Uint8Array> {
    const handle = this.#supportedHandle()
    try {
      const file = await handle.getFile()
      if (file.size > MAX_CURRENT_APP_DATA_BYTES) {
        throw new PersistenceError('source_too_large')
      }
      return new Uint8Array(await file.arrayBuffer())
    } catch (error) {
      if (error instanceof PersistenceError) throw error
      if (isPermissionFailure(error)) {
        throw new PersistenceError('permission_denied')
      }
      throw new PersistenceError('io_failed')
    }
  }

  async #write(bytes: Uint8Array): Promise<void> {
    const handle = this.#supportedHandle()
    let permission: FileSystemPermissionState
    try {
      permission = await handle.queryPermission({ mode: 'readwrite' })
    } catch {
      throw new PersistenceError('permission_denied')
    }
    if (permission !== 'granted') {
      throw new PersistenceError('permission_denied')
    }

    let writable: WritableFileLike
    try {
      writable = await handle.createWritable()
    } catch (error) {
      if (isPermissionFailure(error)) {
        throw new PersistenceError('permission_denied')
      }
      throw new PersistenceError('io_failed')
    }

    try {
      await writable.write(Uint8Array.from(bytes))
      await writable.close()
    } catch (error) {
      try {
        await writable.abort?.()
      } catch {
        // The original redacted I/O failure remains authoritative.
      }
      if (isPermissionFailure(error)) {
        throw new PersistenceError('permission_denied')
      }
      throw new PersistenceError('io_failed')
    }
  }

  load(): Promise<LoadedAppData | null> {
    return this.#delegate.load()
  }

  save(data: AppDataFile, options: SaveOptions): Promise<SaveResult> {
    return this.#delegate.save(data, options)
  }

  async requestWritePermission(): Promise<void> {
    const handle = this.#supportedHandle()
    if (typeof handle.requestPermission !== 'function') {
      throw new PersistenceError('unsupported_capability')
    }
    let permission: FileSystemPermissionState
    try {
      permission = await handle.requestPermission({ mode: 'readwrite' })
    } catch {
      throw new PersistenceError('permission_denied')
    }
    if (permission !== 'granted') {
      throw new PersistenceError('permission_denied')
    }
  }
}
