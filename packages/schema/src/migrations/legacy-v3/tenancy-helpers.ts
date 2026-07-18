import type { V3Nutzer } from '../..'
import type { PropertyContext } from './shared'
import type { MigrationState } from './state'

export function buildingForUser(
  state: MigrationState,
  property: PropertyContext,
  reference: unknown,
): string | undefined {
  if (typeof reference !== 'string') return undefined
  return state.buildings.find(
    (building) =>
      building.propertyId === property.propertyId &&
      building.mandateRefPrefixes.some(
        (prefix) => reference === prefix || reference.startsWith(`${prefix}_`),
      ),
  )?.id
}

export function isVacancy(user: V3Nutzer): boolean {
  return (
    Boolean(user.leerstand) ||
    String(user.aktiv ?? '')
      .toLocaleLowerCase('de-DE')
      .includes('leerstand') ||
    String(user.mandatsref ?? '')
      .toLocaleLowerCase('de-DE')
      .includes('leerstand')
  )
}
