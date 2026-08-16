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
        (prefix) =>
          reference === prefix ||
          (reference.startsWith(prefix) &&
            /^[\s_/-]/u.test(reference.slice(prefix.length))),
      ),
  )?.id
}

export function userDisplayName(
  user: Pick<V3Nutzer, 'name' | 'vorname' | 'nachname'>,
): string | null | undefined {
  const explicitName =
    typeof user.name === 'string' ? user.name.trim() : undefined
  if (explicitName) return explicitName

  const composedName = [user.vorname, user.nachname]
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
  if (composedName) return composedName
  return user.name === null ? null : undefined
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
