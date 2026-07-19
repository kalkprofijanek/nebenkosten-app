import {
  CurrentAppDataCodecError,
  decodeCurrentAppDataBytes,
  encodeCurrentAppData,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'

import type { LoadedAppData, SaveOptions, SaveResult } from './contracts'
import { PersistenceError } from './errors'

export interface JsonFilePort {
  read(): Promise<Uint8Array | null>
  write(bytes: Uint8Array): Promise<void>
}

export interface JsonFileStorageAdapterOptions {
  readonly now?: () => Date
}

function isEmpty(bytes: Uint8Array | null): boolean {
  return bytes === null || bytes.byteLength === 0
}

function codecError(
  error: unknown,
  context: 'candidate' | 'stored',
): PersistenceError {
  if (!(error instanceof CurrentAppDataCodecError)) {
    return new PersistenceError('io_failed')
  }
  if (error.code === 'newer_schema_version') {
    return new PersistenceError('newer_schema_version', {
      schemaVersion: error.schemaVersion,
    })
  }
  if (context === 'stored' && error.code === 'unsupported_schema_version') {
    return new PersistenceError('unsupported_schema_version', {
      schemaVersion: error.schemaVersion,
    })
  }
  if (context === 'candidate') {
    if (error.code === 'not_json_safe') {
      return new PersistenceError('not_json_safe')
    }
    if (error.code === 'source_too_large') {
      return new PersistenceError('source_too_large')
    }
    if (error.code === 'hash_failed') {
      return new PersistenceError('hash_failed')
    }
    return new PersistenceError('invalid_data')
  }
  return new PersistenceError('corrupt_storage')
}

async function decodeStored(bytes: Uint8Array): Promise<LoadedAppData> {
  try {
    const decoded = await decodeCurrentAppDataBytes(bytes)
    return {
      data: decoded.data,
      revision: decoded.revision,
    }
  } catch (error) {
    throw codecError(error, 'stored')
  }
}

function revisionsMatch(
  actualRevision: string | null,
  expectedRevision: string | null,
): boolean {
  return actualRevision === expectedRevision
}

export class JsonFileStorageAdapter {
  readonly #port: JsonFilePort
  readonly #now: () => Date

  constructor(port: JsonFilePort, options: JsonFileStorageAdapterOptions = {}) {
    this.#port = port
    this.#now = options.now ?? (() => new Date())
  }

  async #readBytes(): Promise<Uint8Array | null> {
    try {
      const bytes = await this.#port.read()
      return bytes === null ? null : Uint8Array.from(bytes)
    } catch (error) {
      if (error instanceof PersistenceError) throw error
      throw new PersistenceError('io_failed')
    }
  }

  async load(): Promise<LoadedAppData | null> {
    const bytes = await this.#readBytes()
    if (isEmpty(bytes)) return null
    return decodeStored(bytes!)
  }

  async save(data: AppDataFile, options: SaveOptions): Promise<SaveResult> {
    let encoded: Awaited<ReturnType<typeof encodeCurrentAppData>>
    try {
      encoded = await encodeCurrentAppData(data, { savedAt: this.#now() })
    } catch (error) {
      throw codecError(error, 'candidate')
    }

    const existingBytes = await this.#readBytes()
    const existing = isEmpty(existingBytes)
      ? null
      : await decodeStored(existingBytes!)
    if (!revisionsMatch(existing?.revision ?? null, options.expectedRevision)) {
      throw new PersistenceError('conflict')
    }

    try {
      await this.#port.write(Uint8Array.from(encoded.bytes))
    } catch (error) {
      if (error instanceof PersistenceError) throw error
      throw new PersistenceError('io_failed')
    }

    const verifiedBytes = await this.#readBytes()
    if (isEmpty(verifiedBytes)) throw new PersistenceError('io_failed')
    let verified: LoadedAppData
    try {
      verified = await decodeCurrentAppDataBytes(verifiedBytes!)
    } catch {
      throw new PersistenceError('io_failed')
    }
    if (verified.revision !== encoded.revision) {
      throw new PersistenceError('io_failed')
    }

    return {
      data: encoded.data,
      revision: encoded.revision,
      savedAt: encoded.savedAt,
    }
  }
}
