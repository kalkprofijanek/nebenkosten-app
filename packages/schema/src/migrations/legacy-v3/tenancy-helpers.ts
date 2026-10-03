import type { V3Nutzer } from '../..'
import type { PropertyContext } from './shared'
import type { MigrationState } from './state'

export function buildingForUser(
  state: MigrationState,
  property: PropertyContext,
  reference: unknown,
): string | undefined {
  if (typeof reference !== 'string') return undefined
  const matches = (value: string, prefix: string) =>
    value === prefix ||
    (value.startsWith(prefix) && /^[\s_/-]/u.test(value.slice(prefix.length)))
  const candidates = state.buildings.filter(
    ({ propertyId }) => propertyId === property.propertyId,
  )
  const exact = candidates.find((building) =>
    building.mandateRefPrefixes.some((prefix) => matches(reference, prefix)),
  )
  if (exact) return exact.id
  // Legacy normalises house keys to upper case (`normScopeKey`); accept that
  // spelling only when it identifies exactly one building.
  const upper = reference.toUpperCase()
  const relaxed = candidates.filter((building) =>
    building.mandateRefPrefixes.some((prefix) =>
      matches(upper, prefix.toUpperCase()),
    ),
  )
  return relaxed.length === 1 ? relaxed[0]!.id : undefined
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
