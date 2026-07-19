import type { PersistenceErrorCode } from './contracts'

const PUBLIC_MESSAGES: Readonly<Record<PersistenceErrorCode, string>> = {
  invalid_data: 'Die Daten sind ungültig.',
  not_json_safe: 'Die Daten können nicht verlustfrei gespeichert werden.',
  invalid_json: 'Die gespeicherten Daten sind kein gültiges JSON.',
  invalid_utf8: 'Die gespeicherten Daten sind kein gültiges UTF-8.',
  source_too_large: 'Die Daten überschreiten die erlaubte Größe.',
  unsupported_schema_version: 'Die Datenversion wird nicht unterstützt.',
  newer_schema_version:
    'Die Daten wurden mit einer neueren Anwendungsversion erstellt.',
  hash_failed: 'Die Datenintegrität konnte nicht geprüft werden.',
  conflict: 'Der gespeicherte Stand wurde zwischenzeitlich geändert.',
  snapshot_not_found: 'Der Sicherungsstand wurde nicht gefunden.',
  corrupt_storage: 'Der gespeicherte Stand ist beschädigt.',
  quota_exceeded: 'Der lokale Speicherplatz reicht nicht aus.',
  permission_denied: 'Der Zugriff auf den lokalen Speicher wurde verweigert.',
  unsupported_capability: 'Diese Speicherfunktion wird nicht unterstützt.',
  io_failed: 'Der lokale Speicherzugriff ist fehlgeschlagen.',
}

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode
  readonly schemaVersion?: number

  constructor(
    code: PersistenceErrorCode,
    options: { readonly schemaVersion?: number } = {},
  ) {
    super(PUBLIC_MESSAGES[code])
    this.name = 'PersistenceError'
    this.code = code
    this.schemaVersion = options.schemaVersion
  }
}

function isPersistenceErrorCode(value: unknown): value is PersistenceErrorCode {
  return typeof value === 'string' && value in PUBLIC_MESSAGES
}

/**
 * Converts codec failures without copying source data or raw platform messages
 * into the public persistence error surface.
 */
export function toPersistenceError(
  error: unknown,
  fallback: PersistenceErrorCode = 'io_failed',
): PersistenceError {
  if (error instanceof PersistenceError) {
    return error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    isPersistenceErrorCode(error.code)
  ) {
    const schemaVersion =
      'schemaVersion' in error && typeof error.schemaVersion === 'number'
        ? error.schemaVersion
        : undefined
    return new PersistenceError(error.code, { schemaVersion })
  }

  return new PersistenceError(fallback)
}
