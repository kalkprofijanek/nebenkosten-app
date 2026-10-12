import { describe, expect, it } from 'vitest'

import {
  CURRENT_SCHEMA_VERSION,
  fuelDeliverySchema,
  fuelDeliveryTaxesAndLeviesSchema,
} from '../src'

/** Fiktive Lieferung; keine Werte einer echten Rechnung. */
const delivery = {
  id: 'delivery_1',
  energySourceId: 'source_1',
  billingPeriodId: 'bp_1',
  date: '2025-03-01',
  quantity: { value: 1000, unit: 'l' },
  amountCents: 119_000,
}

describe('Steuern und Abgaben an der Brennstofflieferung (ADR-0011)', () => {
  it('ist optional und abwärtskompatibel (Schema v5)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5)
    expect(fuelDeliverySchema.safeParse(delivery).success).toBe(true)
    expect(
      fuelDeliverySchema.safeParse({ ...delivery, taxesAndLevies: null })
        .success,
    ).toBe(true)
  })

  it('übernimmt alle Felder in Cent', () => {
    const taxesAndLevies = {
      vatCents: 19_000,
      vatRatePercent: 19,
      energyTaxCents: 6_135,
      co2LevyCents: 15_900,
      otherLeviesCents: 120,
      otherLeviesLabel: 'Fiktive Umlage',
    }
    expect(
      fuelDeliverySchema.parse({ ...delivery, taxesAndLevies }).taxesAndLevies,
    ).toEqual(taxesAndLevies)
    expect(fuelDeliveryTaxesAndLeviesSchema.parse({})).toEqual({})
  })

  it('lehnt negative, gebrochene und unbekannte Werte ab', () => {
    for (const taxesAndLevies of [
      { vatCents: -1 },
      { energyTaxCents: 1.5 },
      { vatRatePercent: 101 },
      { co2LevyCents: '100' },
      { unknown: 1 },
    ])
      expect(
        fuelDeliverySchema.safeParse({ ...delivery, taxesAndLevies }).success,
      ).toBe(false)
  })
})
