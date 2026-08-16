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

  it('bildet den Anzeigenamen aus Vor- und Nachname, wenn name fehlt', () => {
    expect(userDisplayName({ vorname: 'Erika', nachname: 'Beispiel' })).toBe(
      'Erika Beispiel',
    )
    expect(
      userDisplayName({ name: '  Familie Beispiel  ', vorname: 'Ignoriert' }),
    ).toBe('Familie Beispiel')
  })
})
