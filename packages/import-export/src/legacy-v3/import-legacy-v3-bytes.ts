import {
  migrateV3ToCurrent,
  type MigrationOptions,
  type MigrationResult,
  type ValidationIssue,
} from '@nebenkosten/schema'

/** Feste Obergrenze, bevor potenziell teure Dekodierung oder Hashing beginnt. */
export const MAX_LEGACY_V3_IMPORT_BYTES = 10 * 1024 * 1024

export type ImportLegacyV3Options = Omit<MigrationOptions, 'sourceSha256'>

function invalidSource(
  code: string,
  title: string,
  detail?: string,
): MigrationResult {
  const issue: ValidationIssue = {
    severity: 'error',
    code,
    area: 'migration',
    title,
    ...(detail === undefined ? {} : { detail }),
  }

  return {
    ok: false,
    reason: 'invalid_json_structure',
    issues: [issue],
  }
}

function bytesToLowercaseHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get

function copyTrustedBytes(
  source: unknown,
): Uint8Array<ArrayBuffer> | undefined {
  try {
    if (!typedArrayByteLengthGetter) return undefined
    const byteLength = typedArrayByteLengthGetter.call(source) as number
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      byteLength > MAX_LEGACY_V3_IMPORT_BYTES
    )
      return undefined
    const copy = new Uint8Array(byteLength)
    Uint8Array.prototype.set.call(copy, source as ArrayLike<number>)
    return copy
  } catch {
    return undefined
  }
}

function readOptionsSafely(
  options: unknown,
): ImportLegacyV3Options | undefined {
  try {
    if (
      typeof options !== 'object' ||
      options === null ||
      Object.getPrototypeOf(options) !== Object.prototype
    )
      return undefined
    const allowedKeys = new Set([
      'sourceFileName',
      'organizationName',
      'appVersion',
      'now',
    ])
    const result: ImportLegacyV3Options = {}
    for (const key of Reflect.ownKeys(options)) {
      if (typeof key !== 'string' || !allowedKeys.has(key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(options, key)
      if (!descriptor || !('value' in descriptor)) return undefined
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: descriptor.value,
      })
    }
    return result
  } catch {
    return undefined
  }
}

/**
 * Sichere Dateigrenze für den Legacy-v3-Import.
 *
 * Der Hash entsteht aus einer unveränderten Kopie der Original-Bytes vor dem
 * JSON-Parsing. Parserfehler enthalten bewusst weder Rohdaten noch Meldungen
 * der Laufzeit, da diese Ausschnitte der Quelldatei enthalten können.
 */
export async function importLegacyV3Bytes(
  sourceBytes: Uint8Array,
  options: ImportLegacyV3Options = {},
): Promise<MigrationResult> {
  const safeOptions = readOptionsSafely(options)
  if (!safeOptions)
    return invalidSource(
      'migration.invalid_import_options',
      'Die Importoptionen sind ungültig.',
    )

  let actualByteLength: number
  try {
    actualByteLength = typedArrayByteLengthGetter?.call(sourceBytes) as number
  } catch {
    return invalidSource(
      'migration.invalid_source_bytes',
      'Die Importquelle ist keine gültige Bytefolge.',
    )
  }

  if (actualByteLength > MAX_LEGACY_V3_IMPORT_BYTES) {
    return invalidSource(
      'migration.source_too_large',
      'Die Importdatei ist zu groß.',
      'Legacy-Importe sind auf 10 MiB begrenzt.',
    )
  }

  const originalBytes = copyTrustedBytes(sourceBytes)
  if (!originalBytes)
    return invalidSource(
      'migration.invalid_source_bytes',
      'Die Importquelle ist keine gültige Bytefolge.',
    )
  let jsonText: string

  try {
    jsonText = new TextDecoder('utf-8', { fatal: true }).decode(originalBytes)
  } catch {
    return invalidSource(
      'migration.invalid_utf8',
      'Die Importdatei ist nicht als UTF-8 kodiert.',
    )
  }

  let digest: ArrayBuffer
  try {
    digest = await globalThis.crypto.subtle.digest('SHA-256', originalBytes)
  } catch {
    return invalidSource(
      'migration.source_hash_failed',
      'Der Quelldatei-Hash konnte nicht sicher gebildet werden.',
    )
  }
  const sourceSha256 = bytesToLowercaseHex(new Uint8Array(digest))

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText) as unknown
  } catch {
    return invalidSource(
      'migration.invalid_json',
      'Die Importdatei enthält kein gültiges JSON.',
    )
  }

  return migrateV3ToCurrent(parsed, { ...safeOptions, sourceSha256 })
}
