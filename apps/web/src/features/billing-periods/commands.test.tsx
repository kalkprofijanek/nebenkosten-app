import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { createBillingPeriod } from './commands'

const PROPERTY_ID = '20000000-0000-4000-8000-000000000001'
const OWNER_ID = '20000000-0000-4000-8000-000000000002'
const PERIOD_ID = '20000000-0000-4000-8000-000000000003'

function fileWithProperty(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      ownerCompanies: [
        {
          id: OWNER_ID,
          organizationId: '20000000-0000-4000-8000-000000000004',
          name: 'Beispiel GmbH',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: PROPERTY_ID, ownerCompanyId: OWNER_ID }],
    },
  }
}

describe('createBillingPeriod', () => {
  it('legt ein vollständiges Kalenderjahr als Entwurf an', () => {
    const source = fileWithProperty()

    const result = createBillingPeriod(
      source,
      { propertyId: PROPERTY_ID, year: 2028 },
      { createId: () => PERIOD_ID },
    )

    expect(result.billingData.billingPeriods).toEqual([
      {
        id: PERIOD_ID,
        propertyId: PROPERTY_ID,
        year: 2028,
        periodStart: '2028-01-01',
        periodEnd: '2028-12-31',
        status: 'DRAFT',
      },
    ])
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
  })

  it('verändert den Bestand nicht und teilt alle fremden Strukturen', () => {
    const source = fileWithProperty()
    const snapshot = structuredClone(source)

    const result = createBillingPeriod(
      source,
      { propertyId: PROPERTY_ID, year: 2027 },
      { createId: () => PERIOD_ID },
    )

    expect(source).toEqual(snapshot)
    expect(result.masterData).toBe(source.masterData)
    expect(result.billingData.costEntries).toBe(source.billingData.costEntries)
  })

  it('weist eine unbekannte Liegenschaft ab', () => {
    expect(() =>
      createBillingPeriod(
        createEmptyAppDataFile(),
        { propertyId: PROPERTY_ID, year: 2027 },
        { createId: () => PERIOD_ID },
      ),
    ).toThrowError('Liegenschaft')
  })

  it.each([1899, 2201, 2027.5, Number.NaN])(
    'weist das ungültige Abrechnungsjahr %s ab',
    (year) => {
      expect(() =>
        createBillingPeriod(
          fileWithProperty(),
          { propertyId: PROPERTY_ID, year },
          { createId: () => PERIOD_ID },
        ),
      ).toThrowError('Abrechnungsjahr')
    },
  )

  it('verhindert ein zweites Abrechnungsjahr für Objekt und Jahr', () => {
    const once = createBillingPeriod(
      fileWithProperty(),
      { propertyId: PROPERTY_ID, year: 2027 },
      { createId: () => PERIOD_ID },
    )

    expect(() =>
      createBillingPeriod(
        once,
        { propertyId: PROPERTY_ID, year: 2027 },
        {
          createId: () => '20000000-0000-4000-8000-000000000005',
        },
      ),
    ).toThrowError('bereits vorhanden')
  })

  it('weist eine ungültige oder bereits verwendete neue UUID ab', () => {
    expect(() =>
      createBillingPeriod(
        fileWithProperty(),
        { propertyId: PROPERTY_ID, year: 2027 },
        { createId: () => 'ungueltig' },
      ),
    ).toThrowError('gültige UUID')

    expect(() =>
      createBillingPeriod(
        fileWithProperty(),
        { propertyId: PROPERTY_ID, year: 2027 },
        { createId: () => PROPERTY_ID },
      ),
    ).toThrowError('bereits verwendet')
  })
})
