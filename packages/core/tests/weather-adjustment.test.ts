import { describe, expect, it } from 'vitest'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
  Property,
} from '@nebenkosten/schema'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import {
  checkClimateFactor,
  postalCodeFromAddress,
  previousPeriodClimateFactor,
  weatherAdjustPreviousPeriod,
} from '../src'

/** Fiktive Klimafaktoren; keine Werte einer echten DWD-Liste. */
const period = (patch: Partial<BillingPeriod> = {}): BillingPeriod => ({
  id: 'p-2025',
  propertyId: 'property',
  year: 2025,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  status: 'DRAFT',
  climateFactor: {
    postalCode: '12345',
    factor: 1.1,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    source: 'DWD, Klimafaktoren',
  },
  ...patch,
})

const property: Property = {
  id: 'property',
  ownerCompanyId: 'owner',
  address: { street: 'Test', postalCodeAndCity: '12345 Test' },
} as Property

describe('Postleitzahl aus der Objektanschrift', () => {
  it('nimmt die erste fünfstellige Zahl', () => {
    expect(postalCodeFromAddress('12345 Musterstadt')).toBe('12345')
    expect(postalCodeFromAddress('D-01067 Musterstadt')).toBe('01067')
    expect(postalCodeFromAddress('Musterstadt 123456')).toBeNull()
    expect(postalCodeFromAddress('')).toBeNull()
    expect(postalCodeFromAddress(null)).toBeNull()
  })
})

describe('Klimafaktor zum Abrechnungsjahr', () => {
  it('passt bei gleichem Zeitraum und gleicher Postleitzahl', () => {
    expect(checkClimateFactor(period(), property)).toEqual({
      status: 'matching',
      expectedPostalCode: '12345',
      factor: 1.1,
    })
  })

  it('meldet fehlenden Faktor, anderen Zeitraum und andere Postleitzahl', () => {
    expect(
      checkClimateFactor(period({ climateFactor: null }), property),
    ).toEqual({ status: 'missing', expectedPostalCode: '12345' })
    expect(
      checkClimateFactor(
        period({
          climateFactor: {
            ...period().climateFactor!,
            periodStart: '2024-12-01',
            periodEnd: '2025-11-30',
          },
        }),
        property,
      ).status,
    ).toBe('period_mismatch')
    expect(
      checkClimateFactor(
        period({
          climateFactor: { ...period().climateFactor!, postalCode: '54321' },
        }),
        property,
      ),
    ).toEqual({ status: 'postal_code_mismatch', expectedPostalCode: '12345' })
  })

  it('prüft die Postleitzahl nicht, wenn das Objekt keine hat', () => {
    expect(checkClimateFactor(period(), undefined)).toEqual({
      status: 'matching',
      expectedPostalCode: null,
      factor: 1.1,
    })
  })
})

describe('Klimafaktor des Vorjahres', () => {
  const occupancy = (
    patch: Partial<OccupancyPeriod> = {},
  ): OccupancyPeriod => ({
    id: 'occ',
    billingPeriodId: 'p-2025',
    unitId: 'unit',
    kind: 'tenant',
    ...patch,
  })

  function data(withPreviousPeriod: boolean): AppDataFile {
    const file = createEmptyAppDataFile()
    file.billingData.billingPeriods.push(period())
    if (withPreviousPeriod) {
      file.billingData.billingPeriods.push(
        period({
          id: 'p-2024',
          year: 2024,
          periodStart: '2024-01-01',
          periodEnd: '2024-12-31',
          climateFactor: {
            postalCode: '12345',
            factor: 0.95,
            periodStart: '2024-01-01',
            periodEnd: '2024-12-31',
            source: 'DWD, Klimafaktoren',
          },
        }),
      )
      file.billingData.occupancyPeriods.push(
        occupancy({ id: 'occ-2024', billingPeriodId: 'p-2024' }),
      )
    }
    return file
  }

  it('nimmt den Faktor des Vorjahres im System', () => {
    expect(previousPeriodClimateFactor(data(true), period(), occupancy())).toBe(
      0.95,
    )
  })

  it('nimmt sonst den Faktor des gespeicherten Vorjahresverbrauchs', () => {
    const stored = occupancy({
      previousConsumption: { year: 2024, value: 500, climateFactor: 0.9 },
    })
    expect(previousPeriodClimateFactor(data(false), period(), stored)).toBe(0.9)
    expect(
      previousPeriodClimateFactor(
        data(false),
        period(),
        occupancy({ previousConsumption: { year: 2023, value: 500 } }),
      ),
    ).toBeNull()
    expect(
      previousPeriodClimateFactor(data(false), period(), occupancy()),
    ).toBeNull()
  })

  it('liefert null, wenn das Vorjahr im System keinen Faktor hat', () => {
    const file = data(true)
    file.billingData.billingPeriods[1]!.climateFactor = null
    expect(previousPeriodClimateFactor(file, period(), occupancy())).toBeNull()
  })
})

describe('Witterungsbereinigter Vorperiodenvergleich', () => {
  it('multipliziert beide Perioden mit ihrem Klimafaktor', () => {
    // Handrechnung: 1.000 × 0,9 = 900; 950 × 1,1 = 1.045; +16,1 %
    expect(
      weatherAdjustPreviousPeriod(
        { value: 950, climateFactor: 1.1 },
        { value: 1_000, climateFactor: 0.9 },
      ),
    ).toEqual({
      previous: { value: 1_000, climateFactor: 0.9, adjusted: 900 },
      current: { value: 950, climateFactor: 1.1, adjusted: 1_045 },
      changePercent: 16.1,
    })
  })

  it('nennt keine Veränderung ohne Vorjahresverbrauch', () => {
    expect(
      weatherAdjustPreviousPeriod(
        { value: 950, climateFactor: 1.1 },
        { value: 0, climateFactor: 0.9 },
      ).changePercent,
    ).toBeNull()
  })

  it('lehnt ungültige Werte ab', () => {
    expect(() =>
      weatherAdjustPreviousPeriod(
        { value: 950, climateFactor: 0 },
        { value: 1_000, climateFactor: 0.9 },
      ),
    ).toThrow(RangeError)
    expect(() =>
      weatherAdjustPreviousPeriod(
        { value: 950, climateFactor: 1 },
        { value: -1, climateFactor: 0.9 },
      ),
    ).toThrow(RangeError)
    expect(() =>
      weatherAdjustPreviousPeriod(
        { value: Number.NaN, climateFactor: 1 },
        { value: 1, climateFactor: 0.9 },
      ),
    ).toThrow(RangeError)
  })
})
