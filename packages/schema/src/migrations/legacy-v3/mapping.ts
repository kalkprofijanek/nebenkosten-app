import type {
  AllocationKey,
  AllocationScope,
  BillingPeriodStatus,
  CostCategoryKind,
  LegacyUnmappedEntry,
} from '../../entities'
import type { Quantity, QuantityUnit } from '../../primitives'
import type { JsonPath } from './context'
import { MigrationContext } from './context'
import { addUnmapped } from './unknown-fields'
import { numberish, optionalNumber } from './values'

export function requiredString(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  title: string,
): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value
  context.issue('error', 'migration.required_value_missing', title, path)
  return undefined
}

export function mapBillingStatus(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  legacy: LegacyUnmappedEntry[],
): BillingPeriodStatus {
  const values: Record<string, BillingPeriodStatus> = {
    Entwurf: 'DRAFT',
    'Prüfung offen': 'IN_REVIEW',
    'PDF bereit': 'READY_FOR_PDF',
    abgeschlossen: 'FINALIZED',
    veraltet: 'SUPERSEDED',
  }
  if (value == null || value === '') return 'DRAFT'
  if (typeof value === 'string' && values[value]) return values[value]!
  context.issue(
    'warning',
    'migration.unknown_billing_status',
    'Ein unbekannter Abrechnungsstatus wurde als Entwurf übernommen',
    path,
  )
  addUnmapped(context, legacy, ['status'], path, value)
  return 'DRAFT'
}

export function mapCostKind(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  legacy: LegacyUnmappedEntry[],
): CostCategoryKind {
  const values: Record<string, CostCategoryKind> = {
    betrieb: 'operating',
    wasser: 'water',
    heizung: 'heating',
  }
  if (typeof value === 'string' && values[value]) return values[value]!
  context.issue(
    'warning',
    'migration.unknown_cost_kind',
    'Ein unbekannter Kostenarttyp wurde als Betriebskosten übernommen',
    path,
  )
  if (value !== undefined) addUnmapped(context, legacy, ['typ'], path, value)
  return 'operating'
}

export function mapAllocationKey(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
  legacy: LegacyUnmappedEntry[],
): AllocationKey | null | undefined {
  if (value == null || value === '') return value === '' ? null : value
  const values: Record<string, AllocationKey> = {
    m2_nf: 'usable_area',
    m2_nf_hzg: 'heated_area',
    einheiten: 'consumption_units',
    we_anzahl: 'residential_units',
    direkt: 'direct',
  }
  if (typeof value === 'string' && values[value]) return values[value]!
  context.issue(
    'warning',
    'migration.unknown_allocation_key',
    'Ein unbekannter Umlageschlüssel wurde nicht übernommen',
    path,
  )
  addUnmapped(context, legacy, ['umlage_nach'], path, value)
  return undefined
}

export function mapScope(
  value: unknown,
  buildingIds: ReadonlyMap<string, string>,
): AllocationScope | null | undefined {
  if (value == null || value === '') return value === '' ? null : value
  if (typeof value !== 'string') return undefined
  if (value === 'property' || value === 'gesamt') return { kind: 'property' }
  const buildingId = buildingIds.get(value)
  if (buildingId) return { kind: 'building', buildingId }
  return { kind: 'house', houseKey: value }
}

export function splitEnergyReference(
  value: unknown,
  buildingIds: ReadonlyMap<string, string>,
): { heatingCircuitBuildingId: string; energySourceKey: string } | undefined {
  if (typeof value !== 'string') return undefined
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) return undefined
  const buildingId = buildingIds.get(value.slice(0, separator))
  if (!buildingId) return undefined
  return {
    heatingCircuitBuildingId: buildingId,
    energySourceKey: value.slice(separator + 1),
  }
}

export function mapQuantityUnit(value: unknown): QuantityUnit | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLocaleLowerCase('de-DE')
  const values: Record<string, QuantityUnit> = {
    l: 'l',
    liter: 'l',
    kg: 'kg',
    kilogramm: 'kg',
    t: 't',
    tonne: 't',
    tonnen: 't',
    kwh: 'kWh',
    'm³': 'm3',
    m3: 'm3',
    'm²': 'm2',
    m2: 'm2',
    einheiten: 'einheiten',
    personen: 'personen',
    stueck: 'stueck',
    stück: 'stueck',
  }
  return values[normalized]
}

export function inferFuelUnit(sourceType: unknown): QuantityUnit | undefined {
  if (typeof sourceType !== 'string') return undefined
  const value = sourceType.toLocaleLowerCase('de-DE')
  if (value.includes('öl') || value.includes('oel')) return 'l'
  if (value.includes('pellet')) return 'kg'
  if (value.includes('gas')) return 'm3'
  if (value.includes('strom') || value.includes('wärme')) return 'kWh'
  return undefined
}

export function quantity(
  context: MigrationContext,
  value: unknown,
  unit: QuantityUnit | undefined,
  path: JsonPath,
  relativePath: JsonPath,
  legacy: LegacyUnmappedEntry[],
): Quantity | null | undefined {
  const parsed = optionalNumber(context, value, path, relativePath, legacy)
  if (parsed == null) return parsed
  if (unit) return { value: parsed, unit }
  context.issue(
    'warning',
    'migration.unknown_quantity_unit',
    'Eine Menge ohne unterstützte Einheit wurde nicht übernommen',
    path,
  )
  addUnmapped(context, legacy, relativePath, path, value)
  return undefined
}

export function requiredYear(
  context: MigrationContext,
  value: unknown,
  path: JsonPath,
): number | undefined {
  const parsed = numberish(value)
  if (
    typeof parsed === 'number' &&
    Number.isInteger(parsed) &&
    parsed >= 1900 &&
    parsed <= 2200
  )
    return parsed
  context.issue(
    'error',
    'migration.required_year_invalid',
    'Das Abrechnungsjahr fehlt oder ist ungültig',
    path,
  )
  return undefined
}
