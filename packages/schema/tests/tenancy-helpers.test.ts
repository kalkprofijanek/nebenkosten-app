import { describe, expect, it } from 'vitest'

import { createMigrationState } from '../src/migrations/legacy-v3/state'
import {
  buildingForUser,
  userDisplayName,
} from '../src/migrations/legacy-v3/tenancy-helpers'

const property = {
  propertyId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
  heatingSystemId: '10000000-0000-4000-8000-000000000003',
  buildingIds: new Map<string, string>(),
  billingPeriodsByYear: new Map<number, string>(),
}

describe('Legacy-Nutzerzuordnung', () => {
  it.each(['HA-01-A', 'HA_01', 'HA/01', 'HA 01'])(
    'ordnet die Mandatsreferenz %s am sicheren Trenner dem Gebäude zu',
    (reference) => {
      const state = createMigrationState()
      state.buildings = [
        {
          id: '10000000-0000-4000-8000-000000000004',
          propertyId: property.propertyId,
          name: 'Haus A',
          mandateRefPrefixes: ['HA'],
        },
      ]

      expect(buildingForUser(state, property, reference)).toBe(
        state.buildings[0]?.id,
      )
      expect(buildingForUser(state, property, 'HAUS-01')).toBeUndefined()
    },
  )

  it('ordnet Hausschlüssel unabhängig von der Schreibweise eindeutig zu', () => {
    const state = createMigrationState()
    const building = (index: number, prefixes: string[]) => ({
      id: `10000000-0000-4000-8000-00000000001${index}`,
      propertyId: property.propertyId,
      name: `Haus ${index}`,
      mandateRefPrefixes: prefixes,
    })
    state.buildings = [building(1, ['Ha1']), building(2, ['HB2'])]
    expect(buildingForUser(state, property, 'HA1')).toBe(state.buildings[0]?.id)
    expect(buildingForUser(state, property, 'ha1_007')).toBe(
      state.buildings[0]?.id,
    )
    expect(buildingForUser(state, property, 'HA1X_007')).toBeUndefined()

    state.buildings = [building(1, ['HA1']), building(2, ['ha1'])]
    expect(buildingForUser(state, property, 'ha1')).toBe(state.buildings[1]?.id)
    expect(buildingForUser(state, property, 'Ha1')).toBeUndefined()
  })

  it('bildet den Anzeigenamen aus Vor- und Nachname, wenn name fehlt', () => {
    expect(userDisplayName({ vorname: 'Erika', nachname: 'Beispiel' })).toBe(
      'Erika Beispiel',
    )
    expect(
      userDisplayName({ name: '  Familie Beispiel  ', vorname: 'Ignoriert' }),
    ).toBe('Familie Beispiel')
  })
})
