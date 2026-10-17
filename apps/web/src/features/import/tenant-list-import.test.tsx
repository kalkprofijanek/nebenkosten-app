import {
  parseTenantListCsv,
  TENANT_LIST_HEADERS,
  TENANT_LIST_TEMPLATE,
} from '@nebenkosten/import-export'
import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { importTenantList, TenantListImportError } from './tenant-list-import'

const IDS = {
  organization: '10000000-0000-4000-8000-000000000001',
  ownerCompany: '10000000-0000-4000-8000-000000000002',
  property: '10000000-0000-4000-8000-000000000003',
  building: '10000000-0000-4000-8000-000000000004',
  unit: '10000000-0000-4000-8000-000000000005',
  period: '10000000-0000-4000-8000-000000000006',
} as const

function file(status: 'DRAFT' | 'FINALIZED' = 'DRAFT'): AppDataFile {
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
      properties: [{ id: IDS.property, ownerCompanyId: IDS.ownerCompany }],
      buildings: [
        {
          id: IDS.building,
          propertyId: IDS.property,
          name: 'Haus A',
          shortName: 'A',
          mandateRefPrefixes: [],
        },
      ],
      units: [
        {
          id: IDS.unit,
          propertyId: IDS.property,
          buildingId: IDS.building,
          label: 'EG links',
          usableAreaSqm: { value: 65.5, unit: 'm2' },
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: IDS.period,
          propertyId: IDS.property,
          year: 2025,
          periodStart: '2025-01-01',
          periodEnd: '2025-12-31',
          status,
        },
      ],
    },
  })
}

function ids(): () => string {
  let n = 0
  return () => `30000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

function rows(...lines: string[]) {
  const parsed = parseTenantListCsv(
    [TENANT_LIST_HEADERS.join(';'), ...lines].join('\n'),
  )
  expect(parsed.issues).toEqual([])
  return parsed.rows
}

describe('Mieterliste übernehmen', () => {
  it('ordnet vorhandene Wohnungen zu, legt fehlende an und erzeugt Belegungen', () => {
    const source = file()
    const { file: result, plan } = importTenantList(
      source,
      IDS.period,
      rows(
        'A;eg links;;65,5;;Erika Muster;;;30.06.2025;2;180,00;;',
        'Haus A;EG links;;;;Max Beispiel;;01.07.2025;;;;2.160;',
        'Haus A;OG rechts;1. OG rechts;72;70;;;;;;;;',
      ),
      ids(),
    )
    expect(source.masterData.units).toHaveLength(1)
    expect(result.masterData.units).toHaveLength(2)
    const created = result.masterData.units[1]!
    expect(created).toMatchObject({
      label: 'OG rechts',
      buildingId: IDS.building,
      location: '1. OG rechts',
      usableAreaSqm: { value: 72, unit: 'm2' },
      heatedAreaSqm: { value: 70, unit: 'm2' },
    })
    const occupancies = result.billingData.occupancyPeriods
    expect(occupancies.map((o) => [o.unitId, o.kind, o.from, o.to])).toEqual([
      [IDS.unit, 'tenant', undefined, '2025-06-30'],
      [IDS.unit, 'tenant', '2025-07-01', undefined],
      [created.id, 'vacancy', undefined, undefined],
    ])
    expect(result.billingData.prepayments.map((p) => p.mode)).toEqual([
      'monthly',
      'annual',
    ])
    expect(result.masterData.persons.map((p) => p.displayName)).toEqual([
      'Erika Muster',
      'Max Beispiel',
    ])
    expect(plan.map((p) => [p.line, p.newUnit, p.displayName])).toEqual([
      [2, false, 'Erika Muster'],
      [3, false, 'Max Beispiel'],
      [4, true, undefined],
    ])
  })

  it('legt eine neue Wohnung bei mehreren Zeilen nur einmal an', () => {
    const { file: result } = importTenantList(
      file(),
      IDS.period,
      rows(
        ';DG;;48;;Erika Muster;;;30.06.2025;;100;;',
        ';DG;;;;;;01.07.2025;;;;;',
      ),
      ids(),
    )
    expect(
      result.masterData.units.filter((u) => u.label === 'DG'),
    ).toHaveLength(1)
    expect(result.billingData.occupancyPeriods).toHaveLength(2)
  })

  it('übernimmt nichts und meldet jede fehlerhafte Zeile', () => {
    const source = file()
    let error: unknown
    try {
      importTenantList(
        source,
        IDS.period,
        rows(
          'Haus B;EG links;;;;Erika Muster;;;;;180;;',
          ';EG links;;70;;Erika Muster;;;;;180;;',
          ';OG;;;;Erika Muster;;;;;180;;',
          ';OG;;;;Max Beispiel;;01.06.2025;;;180;;',
          ';Keller;;;;Erika Muster;;01.01.2026;;;180;;',
        ),
        ids(),
      )
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(TenantListImportError)
    const issues = (error as TenantListImportError).issues
    expect(issues.map((i) => i.line)).toEqual([2, 3, 5, 6])
    expect(issues[0]!.message).toContain('Haus B')
    expect(issues[1]!.message).toContain('Fläche')
    expect(issues[2]!.message).toContain('überschneidet')
    expect(issues[3]!.message).toContain('außerhalb')
    expect((error as Error).message).toContain('4 Zeilen')
    expect(source.masterData.units).toHaveLength(1)
  })

  it('meldet Gebäudeabweichung, mehrdeutige Wohnungen und Einzelfehler', () => {
    const source = file()
    source.masterData.buildings.push({
      id: '10000000-0000-4000-8000-000000000099',
      propertyId: IDS.property,
      name: 'Haus B',
      mandateRefPrefixes: [],
    })
    expect(() =>
      importTenantList(
        source,
        IDS.period,
        rows('Haus B;EG links;;;;;;;;;;;'),
        ids(),
      ),
    ).toThrow('Zeile 2: Wohnung „EG links“ gehört zu einem anderen Gebäude.')
    source.masterData.units.push({
      id: '10000000-0000-4000-8000-000000000098',
      propertyId: IDS.property,
      label: 'EG Links ',
    })
    expect(() =>
      importTenantList(source, IDS.period, rows(';EG links;;;;;;;;;;;'), ids()),
    ).toThrow('mehrfach')
  })

  it('verweigert leere Listen, unbekannte und gesperrte Abrechnungsjahre', () => {
    expect(() => importTenantList(file(), IDS.period, [], ids())).toThrow(
      'keine Zeilen',
    )
    expect(() =>
      importTenantList(file(), 'unbekannt', rows(';DG;;;;;;;;;;;'), ids()),
    ).toThrow('nicht gefunden')
    expect(() =>
      importTenantList(
        file('FINALIZED'),
        IDS.period,
        rows(';DG;;;;;;;;;;;'),
        ids(),
      ),
    ).toThrow('gesperrt')
  })

  it('übernimmt die mitgelieferte Vorlage in ein Objekt ohne Wohnungen', () => {
    const source = file()
    source.masterData.units = []
    const parsed = parseTenantListCsv(TENANT_LIST_TEMPLATE)
    const { file: result, plan } = importTenantList(
      source,
      IDS.period,
      parsed.rows,
      ids(),
    )
    expect(result.masterData.units).toHaveLength(3)
    expect(result.billingData.occupancyPeriods).toHaveLength(4)
    expect(plan.filter((p) => p.newUnit)).toHaveLength(4)
  })
})
