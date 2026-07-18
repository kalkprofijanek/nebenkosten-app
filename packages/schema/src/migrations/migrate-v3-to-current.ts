import type { LegacyUnmappedEntry } from '../entities/shared'
import { safeFileNameSchema } from '../entities/shared'
import type { ValidationIssue } from '../entities/validation'
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_V3_SCHEMA_VERSION,
  sha256HexSchema,
} from '../primitives'
import {
  appDataFileSchema,
  type AppDataFile,
} from '../versions/current/app-data-file'
import { probeSchemaVersion, v3FileSchema } from '../versions/v3/file'
import { MigrationContext } from './legacy-v3/context'
import { inspectLegacyInput } from './legacy-v3/limits'
import { toAppDataFile } from './legacy-v3/state'
import { transformV3File } from './legacy-v3/transform'
import { optionalTimestamp } from './legacy-v3/values'
import { migrationReportSchema, type MigrationReport } from './report'

export interface MigrationOptions {
  /** SHA-256 der unveränderten Originalbytes als lowercase Hex. */
  sourceSha256: string
  sourceFileName?: string
  /** Anzeigename des impliziten Mandanten; sonst aus Dateiname abgeleitet. */
  organizationName?: string
  appVersion?: string
  /** Zeitquelle für einen deterministischen Lauf. */
  now?: () => Date
}

export type MigrationResult =
  | { ok: true; data: AppDataFile; report: MigrationReport }
  | {
      ok: false
      reason:
        | 'invalid_json_structure'
        | 'unsupported_schema_version'
        | 'newer_schema_version'
        | 'validation_failed'
      issues: ValidationIssue[]
      report?: Partial<MigrationReport>
    }

export type MigrateV3ToCurrent = (
  input: unknown,
  options: MigrationOptions,
) => MigrationResult

function failure(
  reason: Extract<MigrationResult, { ok: false }>['reason'],
  code: string,
  title: string,
): MigrationResult {
  return {
    ok: false,
    reason,
    issues: [{ severity: 'error', code, area: 'schema', title }],
  }
}

function createReport(
  context: MigrationContext,
  state: ReturnType<typeof transformV3File>,
  migratedAt: string,
): MigrationReport {
  return {
    sourceFileName: context.options.sourceFileName,
    sourceSha256: context.options.sourceSha256,
    detectedSchemaVersion: LEGACY_V3_SCHEMA_VERSION,
    targetSchemaVersion: CURRENT_SCHEMA_VERSION,
    counts: {
      ownerCompanies: state.ownerCompanies.length,
      properties: state.properties.length,
      billingPeriods: state.billingPeriods.length,
      occupancyPeriods: state.occupancyPeriods.length,
      costCategories: state.costCategories.length,
      costEntries: state.costEntries.length,
      heatingCircuits: state.heatingCircuits.length,
      energySources: state.energySources.length,
      bankBookings: state.bankBookings.length,
      meters: state.meters.length,
      warnings: context.issues.filter(({ severity }) => severity === 'warning')
        .length,
    },
    issues: context.issues,
    changedFields: context.changedFields,
    droppedFields: context.droppedFields,
    unmappedFields: context.unmappedFields,
    migratedAt,
    appVersion: context.options.appVersion,
  }
}

function probeFailure(input: unknown): MigrationResult | undefined {
  const probe = probeSchemaVersion(input)
  if (probe.kind === 'newer-than-supported')
    return failure(
      'newer_schema_version',
      'schema.newer_version_blocked',
      'Die Datei hat eine neuere Schema-Version',
    )
  if (probe.kind === 'current')
    return failure(
      'unsupported_schema_version',
      'schema.already_current',
      'Die Datei verwendet bereits das aktuelle Schema',
    )
  if (probe.kind !== 'unknown') return undefined
  const version =
    typeof input === 'object' && input !== null && 'version' in input
      ? (input as { version?: unknown }).version
      : undefined
  return typeof version === 'number' && version < LEGACY_V3_SCHEMA_VERSION
    ? failure(
        'unsupported_schema_version',
        'schema.unsupported_legacy_version',
        'Die Legacy-Schema-Version wird nicht unterstützt',
      )
    : failure(
        'invalid_json_structure',
        'schema.invalid_json_structure',
        'Die Datei besitzt keine erkennbare Datenstruktur',
      )
}

const migrateV3ToCurrentUnsafe: MigrateV3ToCurrent = (input, options) => {
  if (!sha256HexSchema.safeParse(options.sourceSha256).success)
    return failure(
      'validation_failed',
      'schema.invalid_source_hash',
      'Der Quelldatei-Hash ist ungültig',
    )
  if (
    options.sourceFileName !== undefined &&
    !safeFileNameSchema.safeParse(options.sourceFileName).success
  )
    return failure(
      'validation_failed',
      'schema.invalid_source_file_name',
      'Der Quelldateiname ist ungültig',
    )
  const inputInspection = inspectLegacyInput(input)
  if (inputInspection === 'limits-exceeded')
    return failure(
      'invalid_json_structure',
      'migration.input_limits_exceeded',
      'Die Legacy-Datei überschreitet die sicheren Importgrenzen',
    )
  if (inputInspection === 'reserved-key')
    return failure(
      'invalid_json_structure',
      'migration.reserved_key_rejected',
      'Die Legacy-Datei enthält einen reservierten Schlüssel',
    )
  if (inputInspection === 'invalid')
    return failure(
      'invalid_json_structure',
      'schema.invalid_json_structure',
      'Die Datei enthält eine nicht unterstützte Datenstruktur',
    )
  let versionFailure: MigrationResult | undefined
  try {
    versionFailure = probeFailure(input)
  } catch {
    return failure(
      'invalid_json_structure',
      'schema.invalid_json_structure',
      'Die Datei enthält eine nicht unterstützte Datenstruktur',
    )
  }
  if (versionFailure) return versionFailure
  let parsed: ReturnType<typeof v3FileSchema.safeParse>
  try {
    parsed = v3FileSchema.safeParse(input)
  } catch {
    return failure(
      'invalid_json_structure',
      'schema.invalid_json_structure',
      'Die Datei enthält eine nicht unterstützte Datenstruktur',
    )
  }
  if (!parsed.success)
    return failure(
      'invalid_json_structure',
      'schema.invalid_json_structure',
      'Die Legacy-Datei ist strukturell ungültig',
    )
  const now = options.now?.() ?? new Date()
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    return failure(
      'validation_failed',
      'schema.invalid_migration_time',
      'Der Migrationszeitpunkt ist ungültig',
    )
  const migratedAt = now.toISOString()
  const context = new MigrationContext(options)
  let state: ReturnType<typeof transformV3File>
  try {
    state = transformV3File(parsed.data, context)
  } catch {
    return failure(
      'validation_failed',
      'schema.migration_failed_safely',
      'Die Legacy-Datei konnte nicht sicher migriert werden',
    )
  }
  const savedAtLegacy: LegacyUnmappedEntry[] = []
  const savedAt = optionalTimestamp(
    context,
    parsed.data.gespeichert,
    ['gespeichert'],
    ['gespeichert'],
    savedAtLegacy,
  )
  if (savedAtLegacy.length > 0 && state.organizations[0]) {
    const organization = state.organizations[0]
    state.organizations = [
      {
        ...organization,
        legacyUnmapped: [
          ...(organization.legacyUnmapped ?? []),
          ...savedAtLegacy,
        ],
      },
      ...state.organizations.slice(1),
    ]
  }
  const initialReport = createReport(context, state, migratedAt)
  if (context.issues.some(({ severity }) => severity === 'error'))
    return {
      ok: false,
      reason: 'validation_failed',
      issues: [
        ...context.issues,
        {
          severity: 'error',
          code: 'schema.target_validation_failed',
          area: 'schema',
          title: 'Die Zieldaten sind wegen fehlender Pflichtwerte ungültig',
        },
      ],
      report: initialReport,
    }
  const data = toAppDataFile(
    state,
    savedAt,
    migratedAt,
    options.sourceSha256,
    options.appVersion,
  )
  const dataResult = appDataFileSchema.safeParse(data)
  const reportResult = migrationReportSchema.safeParse(
    createReport(context, state, migratedAt),
  )
  if (!dataResult.success || !reportResult.success)
    return failure(
      'validation_failed',
      'schema.target_validation_failed',
      'Die migrierten Zieldaten sind strukturell ungültig',
    )
  return { ok: true, data: dataResult.data, report: reportResult.data }
}

export const migrateV3ToCurrent: MigrateV3ToCurrent = (input, options) => {
  try {
    return migrateV3ToCurrentUnsafe(input, options)
  } catch {
    return failure(
      'validation_failed',
      'schema.migration_boundary_failed',
      'Die Migration wurde an der sicheren Systemgrenze abgebrochen',
    )
  }
}
