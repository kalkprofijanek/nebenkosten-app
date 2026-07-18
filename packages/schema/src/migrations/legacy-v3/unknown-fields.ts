import type { JsonValue, LegacyUnmappedEntry } from '../../entities/shared'
import { legacyUnmappedSchema } from '../../entities/shared'
import type { JsonPath } from './context'
import { MigrationContext } from './context'

type PlainRecord = Record<string, unknown>

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownDataEntries(value: PlainRecord): [string, unknown][] | undefined {
  const result: [string, unknown][] = []
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) return undefined
    result.push([key, descriptor.value])
  }
  return result
}

export function addUnmapped(
  context: MigrationContext,
  target: LegacyUnmappedEntry[],
  relativePath: JsonPath,
  absolutePath: JsonPath,
  value: unknown,
  reportPath: JsonPath = absolutePath,
): void {
  const candidate = [{ path: relativePath, value: value as JsonValue }]
  if (!legacyUnmappedSchema.safeParse(candidate).success) {
    context.issue(
      'error',
      'migration.unmappable_value',
      'Ein Legacy-Wert kann nicht sicher konserviert werden',
      reportPath,
    )
    return
  }
  target.push(candidate[0]!)
  context.unmapped(reportPath)
}

export function preserveUnknownKeys(
  context: MigrationContext,
  source: unknown,
  knownKeys: readonly string[],
  target: LegacyUnmappedEntry[],
  absolutePath: JsonPath,
  relativePrefix: JsonPath = [],
): void {
  if (!isPlainRecord(source)) return
  const entries = ownDataEntries(source)
  if (!entries) {
    context.issue(
      'error',
      'migration.exotic_object',
      'Ein Legacy-Objekt enthält nicht unterstützte Eigenschaften',
      absolutePath,
    )
    return
  }
  const known = new Set(knownKeys)
  for (const [key, value] of entries) {
    if (!known.has(key)) {
      const reportPath: JsonPath = [
        ...absolutePath,
        key === '__proto__' ? '<reserved-key>' : '<unknown-field>',
      ]
      if (key === '__proto__')
        context.drop(
          reportPath,
          'Sicherheitskritischer reservierter Schlüssel wurde nur konserviert',
          value,
        )
      addUnmapped(
        context,
        target,
        [...relativePrefix, key],
        [...absolutePath, key],
        value,
        reportPath,
      )
    }
  }
}
