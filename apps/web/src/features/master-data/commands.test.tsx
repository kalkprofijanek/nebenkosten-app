import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  createCompany,
  createPropertyStructure,
  MasterDataCommandError,
} from './commands'

const IDS = {
  organization: '10000000-0000-4000-8000-000000000001',
  ownerCompany: '10000000-0000-4000-8000-000000000002',
  property: '10000000-0000-4000-8000-000000000003',
  building: '10000000-0000-4000-8000-000000000004',
  unit: '10000000-0000-4000-8000-000000000005',
} as const

function ids(...values: readonly string[]) {
  let index = 0
  return () => values[index++] ?? '10000000-0000-4000-8000-000000000099'
}

function fileWithCompany(): AppDataFile {
  return createCompany(
    createEmptyAppDataFile(),
    {
      organizationName: 'Hausverwaltung Beispiel',
      ownerCompanyName: 'Beispiel Wohnen GmbH',
    },
    { createId: ids(IDS.organization, IDS.ownerCompany) },
  )
}

describe('createCompany', () => {
  it('legt Mandant und Eigentümergesellschaft mit stabiler Referenz an', () => {
    const source = createEmptyAppDataFile()

    const result = createCompany(
      source,
      {
        organizationName: '  Hausverwaltung Beispiel  ',
        ownerCompanyName: '  Beispiel Wohnen GmbH  ',
        additionalNameLines: [' Verwaltung Süd ', ' ', 'Niederlassung'],
      },
      { createId: ids(IDS.organization, IDS.ownerCompany) },
    )

    expect(result.masterData.organizations).toEqual([
      { id: IDS.organization, name: 'Hausverwaltung Beispiel' },
    ])
    expect(result.masterData.ownerCompanies).toEqual([
      {
        id: IDS.ownerCompany,
        organizationId: IDS.organization,
        name: 'Beispiel Wohnen GmbH',
        additionalNameLines: ['Verwaltung Süd', 'Niederlassung'],
      },
    ])
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
  })

  it('verändert weder Eingabe noch bestehende Daten oder fremde Arrays', () => {
    const source = createEmptyAppDataFile()
    const sourceSnapshot = structuredClone(source)

    const result = createCompany(
      source,
      {
        organizationName: 'Mandant',
        ownerCompanyName: 'Eigentümerin',
      },
      { createId: ids(IDS.organization, IDS.ownerCompany) },
    )

    expect(source).toEqual(sourceSnapshot)
    expect(result).not.toBe(source)
    expect(result.billingData).toBe(source.billingData)
    expect(result.masterData.properties).toBe(source.masterData.properties)
  })

  it.each([
    {
      input: { organizationName: ' ', ownerCompanyName: 'Firma' },
      message: 'Mandantenname',
    },
    {
      input: { organizationName: 'Mandant', ownerCompanyName: '\n' },
      message: 'Firmenname',
    },
    {
      input: {
        organizationName: 'Mandant',
        ownerCompanyName: 'Firma',
        additionalNameLines: ['1', '2', '3', '4'],
      },
      message: 'höchstens drei',
    },
  ])('weist ungültige Eingaben ab: $message', ({ input, message }) => {
    expect(() =>
      createCompany(createEmptyAppDataFile(), input, {
        createId: ids(IDS.organization, IDS.ownerCompany),
      }),
    ).toThrowError(message)
  })

  it('weist ungültige oder bereits verwendete neue IDs ab', () => {
    expect(() =>
      createCompany(
        createEmptyAppDataFile(),
        { organizationName: 'Mandant', ownerCompanyName: 'Firma' },
        { createId: ids('keine-uuid', IDS.ownerCompany) },
      ),
    ).toThrowError('gültige UUID')

    expect(() =>
      createCompany(
        createEmptyAppDataFile(),
        { organizationName: 'Mandant', ownerCompanyName: 'Firma' },
        { createId: ids(IDS.organization, IDS.organization) },
      ),
    ).toThrowError('bereits verwendet')
  })
})

describe('createPropertyStructure', () => {
  it('legt Objekt, Gebäude und erste Einheit mit korrekten Referenzen an', () => {
    const source = fileWithCompany()

    const result = createPropertyStructure(
      source,
      {
        ownerCompanyId: IDS.ownerCompany,
        internalNumber: '  OBJ-17 ',
        street: ' Fiktive Straße ',
        postalCodeAndCity: ' 12345 Beispielstadt ',
        buildingName: ' Haus A ',
        buildingShortName: ' A ',
        unitLabel: ' Wohnung 1 ',
        usableAreaSqm: 72.5,
        heatedAreaSqm: 68,
      },
      { createId: ids(IDS.property, IDS.building, IDS.unit) },
    )

    expect(result.masterData.properties.at(-1)).toEqual({
      id: IDS.property,
      ownerCompanyId: IDS.ownerCompany,
      internalNumber: 'OBJ-17',
      address: {
        street: 'Fiktive Straße',
        postalCodeAndCity: '12345 Beispielstadt',
      },
    })
    expect(result.masterData.buildings.at(-1)).toEqual({
      id: IDS.building,
      propertyId: IDS.property,
      name: 'Haus A',
      shortName: 'A',
      mandateRefPrefixes: [],
    })
    expect(result.masterData.units.at(-1)).toEqual({
      id: IDS.unit,
      propertyId: IDS.property,
      buildingId: IDS.building,
      label: 'Wohnung 1',
      usableAreaSqm: { value: 72.5, unit: 'm2' },
      heatedAreaSqm: { value: 68, unit: 'm2' },
    })
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
  })

  it('bewahrt den übrigen Bestand unverändert und strukturell geteilt', () => {
    const source = fileWithCompany()
    const sourceSnapshot = structuredClone(source)

    const result = createPropertyStructure(
      source,
      {
        ownerCompanyId: IDS.ownerCompany,
        buildingName: 'Haupthaus',
        unitLabel: 'Einheit 1',
      },
      { createId: ids(IDS.property, IDS.building, IDS.unit) },
    )

    expect(source).toEqual(sourceSnapshot)
    expect(result.billingData).toBe(source.billingData)
    expect(result.masterData.organizations).toBe(
      source.masterData.organizations,
    )
    expect(result.masterData.ownerCompanies).toBe(
      source.masterData.ownerCompanies,
    )
  })

  it('weist unbekannte Eigentümergesellschaften ab', () => {
    expect(() =>
      createPropertyStructure(
        createEmptyAppDataFile(),
        {
          ownerCompanyId: IDS.ownerCompany,
          buildingName: 'Haus',
          unitLabel: 'Einheit',
        },
        { createId: ids(IDS.property, IDS.building, IDS.unit) },
      ),
    ).toThrowError('Eigentümergesellschaft')
  })

  it.each([
    ['Gebäudename', { buildingName: ' ', unitLabel: 'Einheit' }],
    ['Einheitenbezeichnung', { buildingName: 'Haus', unitLabel: '' }],
    [
      'Nutzfläche',
      { buildingName: 'Haus', unitLabel: 'Einheit', usableAreaSqm: -1 },
    ],
  ])('weist einen leeren %s ab', (message, incompleteInput) => {
    expect(() =>
      createPropertyStructure(
        fileWithCompany(),
        { ownerCompanyId: IDS.ownerCompany, ...incompleteInput },
        { createId: ids(IDS.property, IDS.building, IDS.unit) },
      ),
    ).toThrowError(message)
  })

  it('weist kollidierende UUIDs atomar ab', () => {
    const source = fileWithCompany()

    expect(() =>
      createPropertyStructure(
        source,
        {
          ownerCompanyId: IDS.ownerCompany,
          buildingName: 'Haus',
          unitLabel: 'Einheit',
        },
        { createId: ids(IDS.property, IDS.property, IDS.unit) },
      ),
    ).toThrowError(MasterDataCommandError)
    expect(source.masterData.properties).toHaveLength(0)
  })
})
