import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { encodeCurrentAppData } from '@nebenkosten/import-export'
import { describe, expect, it } from 'vitest'
import {
  createCompany,
  createPropertyStructure,
  addBuilding,
  addUnit,
  deleteCompany,
  deleteProperty,
  MasterDataCommandError,
  updateBuilding,
  updateCompany,
  updateProperty,
  updateUnit,
} from './commands'

const TEST_CONTACT_EMAIL = ['kontakt', 'example.invalid'].join('@')

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

describe('updateCompany', () => {
  it('aktualisiert Firma, Mandant, Anschrift und Bankdaten unveränderlich', () => {
    const source = fileWithCompany()
    const snapshot = structuredClone(source)

    const result = updateCompany(source, IDS.ownerCompany, {
      organizationName: 'Neue Verwaltung',
      ownerCompanyName: 'Neue Eigentümerin',
      additionalNameLines: ['Abteilung Nord'],
      street: 'Fiktive Straße',
      postalCodeAndCity: 'Beispielort',
      postBox: 'Postfach Test',
      contactSalutation: 'Frau',
      contactFirstName: 'Fiktiva',
      contactLastName: 'Kontakt',
      contactPhone: 'TEST-TELEFON',
      contactEmail: TEST_CONTACT_EMAIL,
      bankName: 'Fiktive Testbank',
    })

    expect(source).toEqual(snapshot)
    expect(result.masterData.organizations[0]?.name).toBe('Neue Verwaltung')
    expect(result.masterData.ownerCompanies[0]).toMatchObject({
      name: 'Neue Eigentümerin',
      additionalNameLines: ['Abteilung Nord'],
      address: { street: 'Fiktive Straße', postalCodeAndCity: 'Beispielort' },
      postBox: 'Postfach Test',
      contact: {
        salutation: 'Frau',
        firstName: 'Fiktiva',
        lastName: 'Kontakt',
        phone: 'TEST-TELEFON',
        email: TEST_CONTACT_EMAIL,
      },
      bankAccount: { bankName: 'Fiktive Testbank' },
    })
  })

  it('weist unbekannte Firmen und leere Pflichtfelder ab', () => {
    expect(() =>
      updateCompany(fileWithCompany(), IDS.property, {
        organizationName: 'Verwaltung',
        ownerCompanyName: 'Firma',
      }),
    ).toThrowError('nicht vorhanden')
    expect(() =>
      updateCompany(fileWithCompany(), IDS.ownerCompany, {
        organizationName: '',
        ownerCompanyName: 'Firma',
      }),
    ).toThrowError('Mandantenname')
  })
})

describe('deleteCompany', () => {
  it('entfernt eine ungenutzte Firma samt ausschließlich zugeordnetem Mandant', () => {
    const result = deleteCompany(fileWithCompany(), IDS.ownerCompany)

    expect(result.masterData.ownerCompanies).toEqual([])
    expect(result.masterData.organizations).toEqual([])
  })

  it('verhindert das Löschen einer Firma mit Objekten', () => {
    const source = createPropertyStructure(
      fileWithCompany(),
      {
        ownerCompanyId: IDS.ownerCompany,
        buildingName: 'Haus',
        unitLabel: 'Einheit',
      },
      { createId: ids(IDS.property, IDS.building, IDS.unit) },
    )

    expect(() => deleteCompany(source, IDS.ownerCompany)).toThrowError(
      'Objekte',
    )
  })
})

describe('property structure maintenance', () => {
  function fileWithPropertyStructure() {
    return createPropertyStructure(
      fileWithCompany(),
      {
        ownerCompanyId: IDS.ownerCompany,
        internalNumber: 'OBJ-ALT',
        buildingName: 'Haus Alt',
        unitLabel: 'Einheit Alt',
        usableAreaSqm: 60,
      },
      { createId: ids(IDS.property, IDS.building, IDS.unit) },
    )
  }

  it('bearbeitet Objekt, Gebäude und Einheit ohne Eingabemutation', () => {
    const source = fileWithPropertyStructure()
    const snapshot = structuredClone(source)
    let result = updateProperty(source, IDS.property, {
      internalNumber: 'OBJ-NEU',
      street: 'Fiktive Straße',
      postalCodeAndCity: 'Beispielort',
      iban: 'TEST-IBAN',
      bic: 'TEST-BIC',
      accountHolder: 'Fiktive Eigentümerin',
      bankName: 'Fiktive Objektbank',
    })
    result = updateBuilding(result, IDS.building, {
      name: 'Haus Neu',
      shortName: 'N',
      defaultEnergySourceType: 'Fernwärme',
      mandateRefPrefixes: ['N'],
    })
    result = updateUnit(result, IDS.unit, {
      label: 'Einheit Neu',
      usableAreaSqm: 75.5,
      heatedAreaSqm: 70,
      roomCount: 3,
    })

    expect(source).toEqual(snapshot)
    expect(result.masterData.properties[0]).toMatchObject({
      internalNumber: 'OBJ-NEU',
      bankAccount: { iban: 'TEST-IBAN', bankName: 'Fiktive Objektbank' },
    })
    expect(result.masterData.buildings[0]).toMatchObject({
      name: 'Haus Neu',
      defaultEnergySourceType: 'Fernwärme',
      mandateRefPrefixes: ['N'],
    })
    expect(result.masterData.units[0]).toMatchObject({
      label: 'Einheit Neu',
      usableAreaSqm: { value: 75.5, unit: 'm2' },
      roomCount: 3,
    })
  })

  it('hält teilweise ausgefüllte Objekt-Bankdaten JSON-sicher', async () => {
    const result = updateProperty(fileWithPropertyStructure(), IDS.property, {
      internalNumber: 'OBJ-NEU',
      street: 'Fiktive Straße',
      postalCodeAndCity: 'Beispielort',
      bankName: 'Fiktive Objektbank',
    })

    await expect(
      encodeCurrentAppData(result, {
        savedAt: new Date('2026-12-31T12:00:00.000Z'),
      }),
    ).resolves.toBeDefined()
    expect(result.masterData.properties[0]?.bankAccount).toEqual({
      bankName: 'Fiktive Objektbank',
    })
  })

  it('fügt weitere Gebäude und Einheiten mit geprüften Referenzen hinzu', () => {
    const source = fileWithPropertyStructure()
    const buildingId = '10000000-0000-4000-8000-000000000006'
    const unitId = '10000000-0000-4000-8000-000000000007'
    const withBuilding = addBuilding(
      source,
      { propertyId: IDS.property, name: 'Haus Zwei' },
      { createId: () => buildingId },
    )
    const result = addUnit(
      withBuilding,
      {
        propertyId: IDS.property,
        buildingId,
        label: 'Einheit Zwei',
        usableAreaSqm: 44,
      },
      { createId: () => unitId },
    )

    expect(result.masterData.buildings).toHaveLength(2)
    expect(result.masterData.units.at(-1)).toMatchObject({
      id: unitId,
      buildingId,
      label: 'Einheit Zwei',
    })
  })

  it('löscht ein ungenutztes Objekt samt seiner Grundstruktur', () => {
    const result = deleteProperty(fileWithPropertyStructure(), IDS.property)

    expect(result.masterData.properties).toEqual([])
    expect(result.masterData.buildings).toEqual([])
    expect(result.masterData.units).toEqual([])
  })

  it('verhindert das Löschen eines Objekts mit Abrechnungsjahren', () => {
    const source = fileWithPropertyStructure()
    const used: AppDataFile = {
      ...source,
      billingData: {
        ...source.billingData,
        billingPeriods: [
          {
            id: '10000000-0000-4000-8000-000000000008',
            propertyId: IDS.property,
            year: 2026,
            periodStart: '2026-01-01',
            periodEnd: '2026-12-31',
            status: 'DRAFT',
          },
        ],
      },
    }

    expect(() => deleteProperty(used, IDS.property)).toThrowError(
      'Abrechnungsjahre',
    )
  })
})
