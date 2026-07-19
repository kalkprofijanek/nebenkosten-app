import {
  CurrentAppDataCodecError,
  decodeCurrentAppDataBytes,
  importLegacyV3Bytes,
} from '@nebenkosten/import-export'
import type { AppDataFile, MigrationResult } from '@nebenkosten/schema'

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024

export type ImportFailureCode =
  | 'invalid_source'
  | 'source_too_large'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'invalid_data'
  | 'unsupported_schema_version'
  | 'newer_schema_version'
  | 'hash_failed'
  | 'migration_failed'
  | 'processing_failed'

export interface ImportSummary {
  readonly organizations: number
  readonly ownerCompanies: number
  readonly properties: number
  readonly buildings: number
  readonly units: number
  readonly persons: number
  readonly tenancies: number
  readonly billingPeriods: number
  readonly costEntries: number
  readonly heatingCircuits: number
  readonly warnings: number
}

export type ImportPreview =
  | {
      readonly ok: true
      readonly sourceFormat: 'current-v4' | 'legacy-v3'
      readonly data: AppDataFile
      readonly summary: ImportSummary
    }
  | {
      readonly ok: false
      readonly code: ImportFailureCode
    }

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const byteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get

function copySource(source: unknown): Uint8Array | ImportFailureCode {
  try {
    if (byteLengthGetter === undefined) return 'invalid_source'
    const byteLength = byteLengthGetter.call(source) as unknown
    if (
      typeof byteLength !== 'number' ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0
    ) {
      return 'invalid_source'
    }
    if (byteLength > MAX_IMPORT_BYTES) return 'source_too_large'

    const copy = new Uint8Array(byteLength)
    Uint8Array.prototype.set.call(copy, source as Uint8Array)
    return copy
  } catch {
    return 'invalid_source'
  }
}

function summarize(data: AppDataFile, warnings: number): ImportSummary {
  return {
    organizations: data.masterData.organizations.length,
    ownerCompanies: data.masterData.ownerCompanies.length,
    properties: data.masterData.properties.length,
    buildings: data.masterData.buildings.length,
    units: data.masterData.units.length,
    persons: data.masterData.persons.length,
    tenancies: data.masterData.tenancies.length,
    billingPeriods: data.billingData.billingPeriods.length,
    costEntries: data.billingData.costEntries.length,
    heatingCircuits: data.billingData.heatingCircuits.length,
    warnings,
  }
}

function migrationFailure(result: Extract<MigrationResult, { ok: false }>) {
  const issueCodes = new Set(result.issues.map(({ code }) => code))
  if (issueCodes.has('migration.source_too_large')) return 'source_too_large'
  if (issueCodes.has('migration.invalid_utf8')) return 'invalid_utf8'
  if (issueCodes.has('migration.invalid_json')) return 'invalid_json'
  if (issueCodes.has('migration.source_hash_failed')) return 'hash_failed'

  switch (result.reason) {
    case 'newer_schema_version':
      return 'newer_schema_version'
    case 'unsupported_schema_version':
      return 'unsupported_schema_version'
    case 'invalid_json_structure':
      return 'invalid_data'
    case 'validation_failed':
      return 'migration_failed'
  }
}

async function prepareLegacy(bytes: Uint8Array): Promise<ImportPreview> {
  const migration = await importLegacyV3Bytes(bytes)
  if (!migration.ok) {
    return { ok: false, code: migrationFailure(migration) }
  }
  return {
    ok: true,
    sourceFormat: 'legacy-v3',
    data: migration.data,
    summary: summarize(migration.data, migration.report.counts.warnings),
  }
}

/**
 * Dekodiert eine ausgewählte Datei ausschließlich für die Importvorschau.
 * Der Aufrufer entscheidet später bewusst über eine mögliche Speicherung.
 */
export async function prepareImport(
  source: Uint8Array,
): Promise<ImportPreview> {
  const copied = copySource(source)
  if (typeof copied === 'string') return { ok: false, code: copied }

  try {
    const decoded = await decodeCurrentAppDataBytes(copied, {
      maxBytes: MAX_IMPORT_BYTES,
    })
    return {
      ok: true,
      sourceFormat: 'current-v4',
      data: decoded.data,
      summary: summarize(decoded.data, 0),
    }
  } catch (error) {
    if (!(error instanceof CurrentAppDataCodecError)) {
      return { ok: false, code: 'processing_failed' }
    }
    if (error.code === 'unsupported_schema_version') {
      try {
        return await prepareLegacy(copied)
      } catch {
        return { ok: false, code: 'processing_failed' }
      }
    }
    const codeByCodecError: Readonly<
      Record<CurrentAppDataCodecError['code'], ImportFailureCode>
    > = {
      invalid_data: 'invalid_data',
      not_json_safe: 'invalid_data',
      invalid_json: 'invalid_json',
      invalid_utf8: 'invalid_utf8',
      source_too_large: 'source_too_large',
      unsupported_schema_version: 'unsupported_schema_version',
      newer_schema_version: 'newer_schema_version',
      hash_failed: 'hash_failed',
    }
    return { ok: false, code: codeByCodecError[error.code] }
  }
}
