import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  addTenantOccupancy,
  addVacancyOccupancy,
  deleteOccupancy,
  setOccupancyPrepayment,
  updateTenantOccupancy,
  updateVacancyOccupancy,
} from './commands'

const TEST_USER_EMAIL = ['nutzer', 'example.invalid'].join('@')

const IDS = {
  organization: '10000000-0000-4000-8000-000000000001',
  ownerCompany: '10000000-0000-4000-8000-000000000002',
  property: '10000000-0000-4000-8000-000000000003',
  unit: '10000000-0000-4000-8000-000000000004',
  billingPeriod: '10000000-0000-4000-8000-000000000005',
  person: '20000000-0000-4000-8000-000000000001',
  tenancy: '20000000-0000-4000-8000-000000000002',
  occupancy: '20000000-0000-4000-8000-000000000003',
  prepayment: '20000000-0000-4000-8000-000000000004',
} as const

function validFile(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return appDataFileSchema.parse({
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: IDS.organization, name: 'Beispielverwaltung' }],
      ownerCompanies: [
        {
          id: IDS.ownerCompany,
          organizationId: IDS.organization,
          name: 'Beispielbestand',
          additionalNameLines: [],
        },
      ],
      properties: [
        {
          id: IDS.property,
          ownerCompanyId: IDS.ownerCompany,
        },
      ],
      units: [
        {
          id: IDS.unit,
          propertyId: IDS.property,
          label: 'Wohnung 1',
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: IDS.billingPeriod,
          propertyId: IDS.property,
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
    },
  })
}

function sequentialIds(...ids: string[]): () => string {
  let index = 0
  return () => ids[index++] ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff'
}

describe('Nutzer-Commands', () => {
  it('legt Nutzer, Mietverhältnis, Zeitraum und monatliche Vorauszahlung atomar an', () => {
    const original = validFile()

    const result = addTenantOccupancy(
      original,
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: {
          displayName: 'Erika Beispiel',
        },
        occupancy: {
          from: '2026-01-01',
          to: '2026-06-30',
          persons: 2,
        },
        prepayment: { mode: 'monthly', monthlyAmountCents: 18_500 },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    expect(original.masterData.persons).toEqual([])
    expect(original.billingData.occupancyPeriods).toEqual([])
    expect(result.masterData.persons).toEqual([
      expect.objectContaining({
        id: IDS.person,
        organizationId: IDS.organization,
        displayName: 'Erika Beispiel',
      }),
    ])
    expect(result.masterData.tenancies).toEqual([
      expect.objectContaining({
        id: IDS.tenancy,
        unitId: IDS.unit,
        personIds: [IDS.person],
      }),
    ])
    expect(result.billingData.occupancyPeriods).toEqual([
      expect.objectContaining({
        id: IDS.occupancy,
        tenancyId: IDS.tenancy,
        kind: 'tenant',
      }),
    ])
    expect(result.billingData.prepayments).toEqual([
      {
        id: IDS.prepayment,
        occupancyPeriodId: IDS.occupancy,
        mode: 'monthly',
        monthlyAmountCents: 18_500,
      },
    ])
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
  })

  it('erlaubt einen lückenlosen Nutzerwechsel ohne Überschneidung', () => {
    const first = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Erster Beispielnutzer' },
        occupancy: { from: '2026-01-01', to: '2026-06-30' },
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    const changed = addTenantOccupancy(
      first,
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Zweiter Beispielnutzer' },
        occupancy: { from: '2026-07-01', to: '2026-12-31' },
        prepayment: { mode: 'annual', annualAmountCents: 120_000 },
      },
      sequentialIds(
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002',
        '30000000-0000-4000-8000-000000000003',
        '30000000-0000-4000-8000-000000000004',
      ),
    )

    expect(changed.billingData.occupancyPeriods).toHaveLength(2)
    expect(changed.billingData.prepayments[1]).toEqual(
      expect.objectContaining({
        mode: 'annual',
        annualAmountCents: 120_000,
      }),
    )
  })

  it('legt einen expliziten Leerstandszeitraum ohne Person oder Vorauszahlung an', () => {
    const result = addVacancyOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        from: '2026-01-01',
        to: '2026-03-31',
        note: 'Fiktiver Leerstand',
      },
      () => IDS.occupancy,
    )

    expect(result.masterData.persons).toEqual([])
    expect(result.masterData.tenancies).toEqual([])
    expect(result.billingData.prepayments).toEqual([])
    expect(result.billingData.occupancyPeriods).toEqual([
      {
        id: IDS.occupancy,
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        tenancyId: null,
        kind: 'vacancy',
        from: '2026-01-01',
        to: '2026-03-31',
        note: 'Fiktiver Leerstand',
      },
    ])
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
  })

  it('wendet Zeitraum-, Referenz- und Überlappungsregeln auch auf Leerstand an', () => {
    const occupied = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Fiktive Person' },
        occupancy: { from: '2026-04-01', to: '2026-12-31' },
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    expect(() =>
      addVacancyOccupancy(occupied, {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        from: '2026-03-31',
        to: '2026-04-30',
      }),
    ).toThrow(/überschneidet/i)
    expect(() =>
      addVacancyOccupancy(validFile(), {
        billingPeriodId: 'unbekannt',
        unitId: IDS.unit,
      }),
    ).toThrow(/Abrechnungsjahr/i)
    expect(
      addVacancyOccupancy(validFile(), {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        from: '2025-12-31',
      }).billingData.occupancyPeriods[0],
    ).toMatchObject({ from: '2025-12-31' })

    expect(() =>
      addVacancyOccupancy(validFile(), {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        from: '2025-01-01',
        to: '2025-12-31',
      }),
    ).toThrow(/Abrechnungszeitraum/i)
  })

  it('ersetzt eine Vorauszahlung immutable und behält deren ID', () => {
    const withTenant = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Erika Beispiel' },
        occupancy: {},
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    const result = setOccupancyPrepayment(withTenant, {
      occupancyPeriodId: IDS.occupancy,
      mode: 'monthly',
      monthlyAmountCents: 20_000,
    })

    expect(withTenant.billingData.prepayments[0]?.mode).toBe('none_agreed')
    expect(result.billingData.prepayments).toEqual([
      {
        id: IDS.prepayment,
        occupancyPeriodId: IDS.occupancy,
        mode: 'monthly',
        monthlyAmountCents: 20_000,
      },
    ])
  })

  it.each([
    {
      name: 'unbekannte Eingabefelder',
      input: {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Erika', admin: true },
        occupancy: {},
        prepayment: { mode: 'none_agreed' },
      },
    },
    {
      name: 'Centbruchteile',
      input: {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Erika' },
        occupancy: {},
        prepayment: { mode: 'monthly', monthlyAmountCents: 10.5 },
      },
    },
    {
      name: 'leere Namen',
      input: {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: '   ' },
        occupancy: {},
        prepayment: { mode: 'none_agreed' },
      },
    },
  ])('weist $name strikt zurück', ({ input }) => {
    expect(() =>
      addTenantOccupancy(
        validFile(),
        input,
        sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
      ),
    ).toThrow(/Eingabe/i)
  })

  it('weist fehlende Referenzen zurück', () => {
    expect(() =>
      addTenantOccupancy(
        validFile(),
        {
          billingPeriodId: IDS.billingPeriod,
          unitId: '99999999-9999-4999-8999-999999999999',
          person: { displayName: 'Erika' },
          occupancy: {},
          prepayment: { mode: 'none_agreed' },
        },
        sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
      ),
    ).toThrow(/Nutzungseinheit/i)
  })

  it('weist Überschneidungen und Zeiträume ohne Anteil am Abrechnungsjahr zurück', () => {
    const first = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Erster Nutzer' },
        occupancy: { from: '2026-01-01', to: '2026-06-30' },
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    expect(() =>
      addTenantOccupancy(
        first,
        {
          billingPeriodId: IDS.billingPeriod,
          unitId: IDS.unit,
          person: { displayName: 'Überlappender Nutzer' },
          occupancy: { from: '2026-06-30', to: '2026-12-31' },
          prepayment: { mode: 'none_agreed' },
        },
        sequentialIds(
          '40000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000002',
          '40000000-0000-4000-8000-000000000003',
          '40000000-0000-4000-8000-000000000004',
        ),
      ),
    ).toThrow(/überschneidet/i)

    const spanning = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Außerhalb' },
        occupancy: { from: '2025-12-31', to: '2026-12-31' },
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )
    expect(spanning.billingData.occupancyPeriods[0]).toMatchObject({
      from: '2025-12-31',
      to: '2026-12-31',
    })

    expect(() =>
      addTenantOccupancy(
        validFile(),
        {
          billingPeriodId: IDS.billingPeriod,
          unitId: IDS.unit,
          person: { displayName: 'Vollständig außerhalb' },
          occupancy: { from: '2027-01-01', to: '2027-12-31' },
          prepayment: { mode: 'none_agreed' },
        },
        sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
      ),
    ).toThrow(/Abrechnungszeitraum/i)
  })

  it('bearbeitet Nutzer, Versandanschrift, Zeitraum und Vorauszahlung atomar', () => {
    const source = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Alter Anzeigename' },
        occupancy: { from: '2026-01-01', persons: 1 },
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    const result = updateTenantOccupancy(source, {
      occupancyPeriodId: IDS.occupancy,
      displayName: 'Neuer Anzeigename',
      from: '2026-02-01',
      to: '2026-12-31',
      persons: 2,
      shippingAddressStreet: 'Fiktive Straße',
      shippingAddressPostalCodeAndCity: 'Beispielort',
      firstName: 'Fiktiver',
      lastName: 'Nutzer',
      email: TEST_USER_EMAIL,
      mandateReference: 'TEST-MANDAT',
      monthlyRentCents: 80_000,
      consumptionUnits: 145.5,
      consumptionUnitsEstimated: true,
      consumptionUnitsEstimateReason: 'Fiktive Schätzung',
      coldWater: 20,
      warmWater: 10,
      applySection12Reduction: true,
      dispatchDate: '2026-12-01',
      note: 'Fiktive Nutzernotiz',
      prepayment: { mode: 'monthly', monthlyAmountCents: 21_000 },
    })

    expect(source.masterData.persons[0]?.displayName).toBe('Alter Anzeigename')
    expect(result.masterData.persons[0]?.displayName).toBe('Neuer Anzeigename')
    expect(result.masterData.persons[0]).toMatchObject({
      firstName: 'Fiktiver',
      lastName: 'Nutzer',
      email: TEST_USER_EMAIL,
    })
    expect(result.masterData.tenancies[0]).toMatchObject({
      shippingAddressStreet: 'Fiktive Straße',
      mandateReference: 'TEST-MANDAT',
      monthlyRentCents: 80_000,
    })
    expect(result.billingData.occupancyPeriods[0]).toMatchObject({
      from: '2026-02-01',
      persons: { value: 2, unit: 'personen' },
      consumptionUnits: { value: 145.5, unit: 'einheiten' },
      consumptionUnitsEstimated: true,
      coldWater: { value: 20, unit: 'm3' },
      warmWater: { value: 10, unit: 'm3' },
      applySection12Reduction: true,
      dispatchDate: '2026-12-01',
    })
    expect(result.billingData.prepayments[0]).toMatchObject({
      mode: 'monthly',
      monthlyAmountCents: 21_000,
    })
  })

  it('bearbeitet Leerstand und prüft den Zeitraum erneut', () => {
    const source = addVacancyOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        from: '2026-01-01',
        to: '2026-03-31',
      },
      () => IDS.occupancy,
    )

    const result = updateVacancyOccupancy(source, {
      occupancyPeriodId: IDS.occupancy,
      from: '2026-02-01',
      to: '2026-04-30',
      note: 'Geprüfter Leerstand',
    })

    expect(result.billingData.occupancyPeriods[0]).toMatchObject({
      from: '2026-02-01',
      to: '2026-04-30',
      note: 'Geprüfter Leerstand',
    })
  })

  it('löscht Nutzerzeitraum und nur dessen verwaiste Stammdaten', () => {
    const source = addTenantOccupancy(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        unitId: IDS.unit,
        person: { displayName: 'Zu löschender Nutzer' },
        occupancy: {},
        prepayment: { mode: 'none_agreed' },
      },
      sequentialIds(IDS.person, IDS.tenancy, IDS.occupancy, IDS.prepayment),
    )

    const result = deleteOccupancy(source, IDS.occupancy)

    expect(result.billingData.occupancyPeriods).toEqual([])
    expect(result.billingData.prepayments).toEqual([])
    expect(result.masterData.tenancies).toEqual([])
    expect(result.masterData.persons).toEqual([])
  })

  it('weist kollidierende erzeugte IDs und fehlende Vorauszahlungsreferenzen zurück', () => {
    expect(() =>
      addTenantOccupancy(
        validFile(),
        {
          billingPeriodId: IDS.billingPeriod,
          unitId: IDS.unit,
          person: { displayName: 'Erika' },
          occupancy: {},
          prepayment: { mode: 'none_agreed' },
        },
        () => IDS.unit,
      ),
    ).toThrow(/ID/i)

    expect(() =>
      setOccupancyPrepayment(validFile(), {
        occupancyPeriodId: IDS.occupancy,
        mode: 'none_agreed',
      }),
    ).toThrow(/Nutzungszeitraum/i)
  })
})
