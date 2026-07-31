import type { AllocationKey, LegacyUnmappedEntry } from '../..'
import { MigrationContext } from './context'
import type { MigrationState } from './state'

export interface PropertyContext {
  propertyId: string
  organizationId: string
  heatingSystemId: string
  buildingIds: Map<string, string>
  billingPeriodsByYear: Map<number, string>
}

export function withLegacy<T extends object>(
  value: T,
  legacy: LegacyUnmappedEntry[],
): T & { legacyUnmapped?: LegacyUnmappedEntry[] } {
  return legacy.length > 0 ? { ...value, legacyUnmapped: legacy } : value
}

export function stringOrNullish(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined
}

export function entityIdOrNullish(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  return typeof value === 'string' ? value : undefined
}

export function mapOrganizationName(context: MigrationContext): string {
  const explicit = context.options.organizationName?.trim()
  if (explicit) return explicit
  const fileName = context.options.sourceFileName
    ?.replace(/\.json$/iu, '')
    .trim()
  return fileName || 'Legacy-Import'
}

export function appendAllocationRules(
  state: MigrationState,
  context: MigrationContext,
  organizationId: string,
): void {
  const definitions: [AllocationKey, string][] = [
    ['usable_area', 'Nutzfläche'],
    ['heated_area', 'Beheizte Fläche'],
    ['consumption_units', 'Verbrauchseinheiten'],
    ['residential_units', 'Wohneinheiten'],
    ['direct', 'Direkte Zuordnung'],
  ]
  state.allocationRules = definitions.map(([key, name]) => ({
    id: context.id(['allocation_rules', key]),
    organizationId,
    name,
    key,
  }))
}
