import { isoDateSchema } from '../../primitives'
import type { LegacyUnmappedEntry } from '../../entities/shared'
import { euroToCents, euroToCentsLostPrecision } from '../euro-to-cents'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import { addUnmapped } from './unknown-fields'

function warnInvalid(
  context: MigrationContext,
  path: JsonPath,
  target: LegacyUnmappedEntry[],
  relativePath: JsonPath,
  code: string,
  title: string,
  value: unknown,
): undefined {
  context.issue('warning', code, title, path)
  addUnmapped(context, target, relativePath, path, value)
  return undefined
}

export function numberish(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return null
  let normalized = trimmed.replace(/\s+/gu, '')
  if (normalized.includes(',') && normalized.includes('.'))
    normalized = normalized.replace(/\./gu, '').replace(',', '.')
  else if (normalized.includes(',')) normalized = normalized.replace(',', '.')
  else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/u.test(normalized))
    normalized = normalized.replace(/\./gu, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function optionalNumber(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): number | null | undefined {
  if (value === undefined) return undefined
  const parsed = numberish(value)
  if (parsed !== undefined) return parsed
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_number',
    'Ein Zahlenwert ist ungültig und wurde nicht übernommen',
    value,
  )
}

export function optionalInteger(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): number | null | undefined {
  const parsed = optionalNumber(context, value, path, relativePath, target)
  if (parsed == null || Number.isInteger(parsed)) return parsed
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_integer',
    'Ein ganzzahliger Wert ist ungültig und wurde nicht übernommen',
    value,
  )
}

export function optionalBoolean(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): boolean | null | undefined {
  if (value == null) return value as null | undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLocaleLowerCase('de-DE')
    if (['true', '1', 'ja', 'j', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'nein', 'n', 'no', 'off', ''].includes(normalized))
      return false
  }
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_boolean',
    'Ein Wahrheitswert ist ungültig und wurde nicht übernommen',
    value,
  )
}

export function optionalCaretakerContract(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): boolean | null | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    context.issue(
      'warning',
      'migration.caretaker_contract_details_preserved',
      'Details eines Hauswartvertrags wurden konserviert',
      path,
    )
    addUnmapped(context, target, relativePath, path, value)
    return true
  }
  return optionalBoolean(context, value, path, relativePath, target)
}

export function optionalDate(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): string | null | undefined {
  if (value == null) return value as null | undefined
  if (typeof value === 'string' && value.trim() === '') return null
  if (typeof value === 'string' && isoDateSchema.safeParse(value).success)
    return value
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_date',
    'Ein Datum ist ungültig und wurde nicht übernommen',
    value,
  )
}

export function optionalTimestamp(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): string | null | undefined {
  if (value == null) return value as null | undefined
  if (typeof value === 'string' && value.trim() === '') return null
  const date =
    typeof value === 'number' || typeof value === 'string'
      ? new Date(value)
      : undefined
  if (date && Number.isFinite(date.getTime())) return date.toISOString()
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_timestamp',
    'Ein Zeitstempel ist ungültig und wurde nicht übernommen',
    value,
  )
}

export function optionalCents(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): number | null | undefined {
  const parsed = optionalNumber(context, value, path, relativePath, target)
  if (parsed == null) return parsed
  try {
    const cents = euroToCents(parsed)
    if (euroToCentsLostPrecision(parsed))
      context.issue(
        'warning',
        'migration.euro_cents_rounding',
        'Ein Eurobetrag wurde auf ganze Cent gerundet',
        path,
      )
    return cents
  } catch {
    return warnInvalid(
      context,
      path,
      target,
      relativePath,
      'migration.amount_out_of_range',
      'Ein Geldbetrag liegt außerhalb des unterstützten Bereichs',
      value,
    )
  }
}

export function optionalPercent(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): number | null | undefined {
  const parsed = optionalNumber(context, value, path, relativePath, target)
  if (parsed == null || (parsed >= 0 && parsed <= 100)) return parsed
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_percent',
    'Ein Prozentwert liegt außerhalb des gültigen Bereichs',
    value,
  )
}

export function optionalNonNegative(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  relativePath: JsonPath,
  target: LegacyUnmappedEntry[],
): number | null | undefined {
  const parsed = optionalNumber(context, value, path, relativePath, target)
  if (parsed == null || parsed >= 0) return parsed
  return warnInvalid(
    context,
    path,
    target,
    relativePath,
    'migration.invalid_nonnegative_number',
    'Ein negativer Wert wurde für dieses Feld nicht übernommen',
    value,
  )
}
