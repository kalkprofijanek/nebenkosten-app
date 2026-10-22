import { describe, expect, it } from 'vitest'

import { propertySchema, remoteReadingSchema } from '../src'

const property = { id: 'property-1', ownerCompanyId: 'owner-1' }

describe('Fernablesbarkeit am Objekt (ADR-0014)', () => {
  it('ist optional und additiv', () => {
    expect(propertySchema.safeParse(property).success).toBe(true)
    expect(
      propertySchema.safeParse({
        ...property,
        remoteReading: { since: '2026-11-15' },
      }).success,
    ).toBe(true)
    expect(
      propertySchema.safeParse({ ...property, remoteReading: null }).success,
    ).toBe(true)
  })

  it('verlangt ein ISO-Datum und eine nicht leere Begründung', () => {
    expect(remoteReadingSchema.safeParse({ since: '15.11.2026' }).success).toBe(
      false,
    )
    expect(
      remoteReadingSchema.safeParse({ exemptionReason: '   ' }).success,
    ).toBe(false)
    expect(
      remoteReadingSchema.safeParse({ exemptionReason: 'Gutachten' }).success,
    ).toBe(true)
    expect(remoteReadingSchema.safeParse({ unknown: true }).success).toBe(false)
  })
})
