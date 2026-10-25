import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, costCategorySchema } from '../src'

/** Fiktive Kostenart; keine Werte einer echten Wasserrechnung. */
const category = {
  id: 'category_1',
  billingPeriodId: 'bp_1',
  kind: 'water',
  label: 'Wasser und Abwasser',
  allocationKey: 'water_consumption',
}

describe('Verbrauch laut Hauptwasserzähler (ADR-0013, E-45-3)', () => {
  it('ist optional und abwärtskompatibel (Schema v5)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5)
    expect(costCategorySchema.safeParse(category).success).toBe(true)
    expect(
      costCategorySchema.safeParse({ ...category, mainWaterMeterM3: 412.5 })
        .success,
    ).toBe(true)
  })

  it('weist null, negative und nicht endliche Werte zurück', () => {
    for (const mainWaterMeterM3 of [0, -1, Number.POSITIVE_INFINITY, '100'])
      expect(
        costCategorySchema.safeParse({ ...category, mainWaterMeterM3 }).success,
      ).toBe(false)
  })
})
