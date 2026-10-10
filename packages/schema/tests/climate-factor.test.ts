import { describe, expect, it } from 'vitest'

import {
  billingPeriodSchema,
  climateFactorSchema,
  previousConsumptionSchema,
} from '../src'

/** Fiktiver Klimafaktor; kein Wert einer echten DWD-Liste. */
const climateFactor = {
  postalCode: '12345',
  factor: 1.08,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  source: 'DWD, Klimafaktoren (Referenz Potsdam)',
}

const period = {
  id: 'bp_1',
  propertyId: 'property_1',
  year: 2025,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  status: 'DRAFT',
}

describe('Klimafaktor (Witterungsbereinigung, § 6a Abs. 3 HeizKV)', () => {
  it('ist am Abrechnungsjahr optional und abwärtskompatibel', () => {
    expect(billingPeriodSchema.safeParse(period).success).toBe(true)
    expect(
      billingPeriodSchema.safeParse({ ...period, climateFactor: null }).success,
    ).toBe(true)
    expect(
      billingPeriodSchema.safeParse({ ...period, climateFactor }).success,
    ).toBe(true)
  })

  it('verlangt fünfstellige Postleitzahl, positiven Faktor und Zeitraum', () => {
    for (const patch of [
      { postalCode: '1234' },
      { postalCode: '12345a' },
      { factor: 0 },
      { factor: Number.POSITIVE_INFINITY },
      { periodEnd: '2025-01-01' },
      { periodStart: '2025-13-01' },
      { source: ' ' },
      { extra: true },
    ])
      expect(
        climateFactorSchema.safeParse({ ...climateFactor, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false)
  })

  it('erlaubt den Klimafaktor am gespeicherten Vorjahresverbrauch', () => {
    expect(
      previousConsumptionSchema.safeParse({ year: 2024, value: 500 }).success,
    ).toBe(true)
    expect(
      previousConsumptionSchema.safeParse({
        year: 2024,
        value: 500,
        climateFactor: 0.97,
      }).success,
    ).toBe(true)
    expect(
      previousConsumptionSchema.safeParse({
        year: 2024,
        value: 500,
        climateFactor: -1,
      }).success,
    ).toBe(false)
  })
})
