import {
  CurrentAppDataCodecError,
  decodeCurrentAppDataBytes,
  importLegacyV3Bytes,
} from '@nebenkosten/import-export'
import {
  safeFileNameSchema,
  type AppDataFile,
  type MigrationReport,
  type MigrationResult,
} from '@nebenkosten/schema'
import { validateBillingPeriod } from '@nebenkosten/validators'

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
  readonly occupancyPeriods: number
  readonly costCategories: number
  readonly costEntries: number
  readonly heatingCircuits: number
  readonly energySources: number
  readonly bankBookings: number
  readonly meters: number
  readonly warnings: number
}

export interface ImportMetadata {
  readonly sourceFileName: string
  readonly appVersion: string
}

export interface ImportValidationSummary {
  readonly reference: string
  readonly year: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly canBecomeReady: boolean
  readonly issueCodes: readonly string[]
}

export type ImportPreview =
  | {
      readonly ok: true
      readonly sourceFormat: 'current-v4'
      readonly data: AppDataFile
      readonly summary: ImportSummary
    }
  | {
      readonly ok: true
      readonly sourceFormat: 'legacy-v3'
      readonly data: AppDataFile
      readonly summary: ImportSummary
      readonly migrationReport: MigrationReport
      readonly validationSummaries: readonly ImportValidationSummary[]
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
    occupancyPeriods: data.billingData.occupancyPeriods.length,
    costCategories: data.billingData.costCategories.length,
    costEntries: data.billingData.costEntries.length,
    heatingCircuits: data.billingData.heatingCircuits.length,
    energySources: data.billingData.energySources.length,
    bankBookings: data.billingData.bankBookings.length,
    meters: data.masterData.meters.length,
    warnings,
  }
}

function summarizeValidation(
  data: AppDataFile,
): readonly ImportValidationSummary[] {
  return data.billingData.billingPeriods.map((period, index) => {
    const report = validateBillingPeriod(data, period.id)
    return {
      reference: `abrechnungsjahr-${index + 1}`,
      year: period.year,
      errorCount: report.errorCount,
      warningCount: report.warningCount,
      infoCount: report.infoCount,
      canBecomeReady: report.canBecomeReady,
      issueCodes: report.issues.map(({ code }) => code),
    }
  })
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

async function prepareLegacy(
  bytes: Uint8Array,
  metadata: ImportMetadata,
): Promise<ImportPreview> {
  const migration = await importLegacyV3Bytes(bytes, metadata)
  if (!migration.ok) {
    return { ok: false, code: migrationFailure(migration) }
  }
  return {
    ok: true,
    sourceFormat: 'legacy-v3',
    data: migration.data,
    summary: summarize(migration.data, migration.report.counts.warnings),
    migrationReport: migration.report,
    validationSummaries: summarizeValidation(migration.data),
  }
}

function copyMetadata(metadata: unknown): ImportMetadata | undefined {
  try {
    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      Object.getPrototypeOf(metadata) !== Object.prototype
    )
      return undefined
    const descriptors = Object.getOwnPropertyDescriptors(metadata)
    const sourceFileName = descriptors.sourceFileName
    const appVersion = descriptors.appVersion
    if (
      !sourceFileName ||
      !('value' in sourceFileName) ||
      !appVersion ||
      !('value' in appVersion)
    )
      return undefined
    if (!safeFileNameSchema.safeParse(sourceFileName.value).success)
      return undefined
    const isSafeAppVersion =
      typeof appVersion.value === 'string' &&
      appVersion.value.length >= 1 &&
      appVersion.value.length <= 100 &&
      Array.from(appVersion.value).every((character) => {
        const codePoint = character.codePointAt(0)!
        return codePoint >= 32 && codePoint !== 127
      })
    if (!isSafeAppVersion) return undefined
    return {
      sourceFileName: sourceFileName.value as string,
      appVersion: appVersion.value as string,
    }
  } catch {
    return undefined
  }
}

/**
 * Dekodiert eine ausgewählte Datei ausschließlich für die Importvorschau.
 * Der Aufrufer entscheidet später bewusst über eine mögliche Speicherung.
 */
export async function prepareImport(
  source: Uint8Array,
  metadata: ImportMetadata,
): Promise<ImportPreview> {
  const copiedMetadata = copyMetadata(metadata)
  if (!copiedMetadata) return { ok: false, code: 'invalid_source' }
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
        return await prepareLegacy(copied, copiedMetadata)
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
