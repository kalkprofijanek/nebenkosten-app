import {
  CURRENT_SCHEMA_VERSION,
  appDataFileSchema,
  type AppDataFile,
} from '@nebenkosten/schema'

import { canonicalJson } from './canonical-json'
import { CurrentAppDataCodecError } from './errors'
import { assertJsonSafe } from './json-safety'

export const MAX_CURRENT_APP_DATA_BYTES = 25 * 1024 * 1024

export interface CurrentAppDataCodecOptions {
  readonly maxBytes?: number
}

export interface EncodeCurrentAppDataOptions extends CurrentAppDataCodecOptions {
  readonly savedAt: Date | string
}

export interface EncodedCurrentAppData {
  readonly data: AppDataFile
  readonly bytes: Uint8Array
  readonly revision: string
  readonly savedAt: string
}

export interface DecodedCurrentAppData {
  readonly data: AppDataFile
  readonly bytes: Uint8Array
  readonly revision: string
}

function byteLimit(options: CurrentAppDataCodecOptions): number {
  const limit = options.maxBytes ?? MAX_CURRENT_APP_DATA_BYTES
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new CurrentAppDataCodecError('source_too_large')
  }
  return limit
}

function assertWithinLimit(
  bytes: Uint8Array,
  options: CurrentAppDataCodecOptions,
): void {
  if (bytes.byteLength > byteLimit(options)) {
    throw new CurrentAppDataCodecError('source_too_large')
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (subtle === undefined) {
      throw new Error('Unavailable')
    }
    const digest = await subtle.digest('SHA-256', Uint8Array.from(bytes))
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  } catch {
    throw new CurrentAppDataCodecError('hash_failed')
  }
}

function normalizedSavedAt(savedAt: Date | string): string {
  if (savedAt instanceof Date) {
    try {
      return savedAt.toISOString()
    } catch {
      throw new CurrentAppDataCodecError('invalid_data')
    }
  }
  return savedAt
}

function parseCurrentData(value: unknown): AppDataFile {
  const result = appDataFileSchema.safeParse(value)
  if (!result.success) {
    throw new CurrentAppDataCodecError('invalid_data')
  }
  return result.data
}

function safeSchemaVersion(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return undefined
  }
  return value
}

function schemaVersionFrom(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  return (
    safeSchemaVersion(record.schemaVersion) ?? safeSchemaVersion(record.version)
  )
}

function assertCurrentSchemaVersion(value: unknown): void {
  const schemaVersion = schemaVersionFrom(value)
  if (schemaVersion !== undefined && schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new CurrentAppDataCodecError('newer_schema_version', {
      schemaVersion,
    })
  }
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new CurrentAppDataCodecError('unsupported_schema_version', {
      schemaVersion,
    })
  }
}

export async function encodeCurrentAppData(
  data: AppDataFile,
  options: EncodeCurrentAppDataOptions,
): Promise<EncodedCurrentAppData> {
  try {
    assertJsonSafe(data)
  } catch (error) {
    if (error instanceof CurrentAppDataCodecError) throw error
    throw new CurrentAppDataCodecError('not_json_safe')
  }
  const savedAt = normalizedSavedAt(options.savedAt)
  const validatedData = parseCurrentData({
    ...data,
    meta: {
      ...data.meta,
      savedAt,
    },
  })
  let detachedData: AppDataFile
  let bytes: Uint8Array
  try {
    detachedData = structuredClone(validatedData)
    bytes = new TextEncoder().encode(canonicalJson(detachedData))
  } catch {
    throw new CurrentAppDataCodecError('not_json_safe')
  }
  assertWithinLimit(bytes, options)
  const revision = await sha256Hex(bytes)

  return {
    data: detachedData,
    bytes,
    revision,
    savedAt,
  }
}

export async function decodeCurrentAppDataBytes(
  sourceBytes: Uint8Array,
  options: CurrentAppDataCodecOptions = {},
): Promise<DecodedCurrentAppData> {
  const bytes = Uint8Array.from(sourceBytes)
  assertWithinLimit(bytes, options)

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new CurrentAppDataCodecError('invalid_utf8')
  }

  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new CurrentAppDataCodecError('invalid_json')
  }

  assertCurrentSchemaVersion(value)
  const data = parseCurrentData(value)
  const revision = await sha256Hex(bytes)
  return { data, bytes, revision }
}
