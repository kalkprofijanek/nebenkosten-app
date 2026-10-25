import { describe, expect, it } from 'vitest'

import {
  CURRENT_SCHEMA_VERSION,
  costCategorySchema,
  costEntryInvoiceSchema,
  costEntrySchema,
  meteringFeeKindSchema,
} from '../src'

/** Fiktiver Beleg; keine Werte einer echten Rechnung. */
const entry = {
  id: 'entry_1',
  costCategoryId: 'category_1',
  amountCents: 47_600,
}

const category = {
  id: 'category_1',
  billingPeriodId: 'bp_1',
  kind: 'heating',
  label: 'Erstellung der Heizkostenabrechnung',
  scope: { kind: 'building', buildingId: 'b_1' },
}

describe('Rechnungsangaben am Kostenbeleg (ADR-0015)', () => {
  it('ist optional und abwärtskompatibel (Schema v5)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5)
    expect(costEntrySchema.safeParse(entry).success).toBe(true)
    expect(costEntrySchema.safeParse({ ...entry, invoice: null }).success).toBe(
      true,
    )
    expect(costEntryInvoiceSchema.parse({})).toEqual({})
  })

  it('übernimmt Rechnungsnummer, Datum, Leistungszeitraum, Netto und USt', () => {
    const invoice = {
      invoiceNumber: 'RE-0001',
      invoiceDate: '2026-02-01',
      servicePeriodStart: '2026-01-15',
      servicePeriodEnd: '2026-01-31',
      netCents: 40_000,
      vatCents: 7_600,
      vatRatePercent: 19,
    }
    expect(costEntrySchema.parse({ ...entry, invoice }).invoice).toEqual(
      invoice,
    )
  })

  it('lehnt negative, gebrochene und unbekannte Werte sowie einen verkehrten Zeitraum ab', () => {
    for (const invoice of [
      { netCents: -1 },
      { vatCents: 1.5 },
      { vatRatePercent: 101 },
      { invoiceDate: '20.10.2026' },
      { unknown: 1 },
      { servicePeriodStart: '2026-02-01', servicePeriodEnd: '2026-01-01' },
    ])
      expect(costEntrySchema.safeParse({ ...entry, invoice }).success).toBe(
        false,
      )
  })
})

describe('Art des Entgelts für Verbrauchserfassung und Abrechnung (ADR-0015)', () => {
  it('kennt Abrechnung, Ablesung, Gerätemiete, Eichung und Sonstiges', () => {
    expect(meteringFeeKindSchema.options).toEqual([
      'billing_service',
      'reading',
      'device_rental',
      'calibration',
      'other',
    ])
    for (const meteringFeeKind of meteringFeeKindSchema.options)
      expect(
        costCategorySchema.safeParse({ ...category, meteringFeeKind }).success,
      ).toBe(true)
    expect(costCategorySchema.safeParse(category).success).toBe(true)
    expect(
      costCategorySchema.safeParse({
        ...category,
        meteringFeeKind: 'consulting',
      }).success,
    ).toBe(false)
  })
})
