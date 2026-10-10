import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
  type CostCategory,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  CostCommandError,
  copyCostCategoriesFromPreviousYear,
  previousYearCostCategories,
} from './commands'

const IDS = {
  organization: '51000000-0000-4000-8000-000000000001',
  ownerCompany: '51000000-0000-4000-8000-000000000002',
  property: '51000000-0000-4000-8000-000000000003',
  otherProperty: '51000000-0000-4000-8000-000000000004',
  building: '51000000-0000-4000-8000-000000000005',
  period2024: '51000000-0000-4000-8000-000000000006',
  period2025: '51000000-0000-4000-8000-000000000007',
  period2026: '51000000-0000-4000-8000-000000000008',
  otherPeriod: '51000000-0000-4000-8000-000000000009',
} as const

const NEW_IDS = [
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000003',
]

function idFactory() {
  let index = 0
  return () => NEW_IDS[index++]!
}

function category(
  id: string,
  billingPeriodId: string,
  overrides: Partial<CostCategory> = {},
): CostCategory {
  return {
    id,
    billingPeriodId,
    kind: 'operating',
    label: 'Gebäudeversicherung',
    allocationKey: 'usable_area',
    ...overrides,
  }
}

function fileWith(categories: CostCategory[]): AppDataFile {
  const empty = createEmptyAppDataFile()
  const period = (
    id: string,
    year: number,
    propertyId: string = IDS.property,
  ) => ({
    id,
    propertyId,
    year,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    status: 'DRAFT' as const,
  })
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
        { id: IDS.property, ownerCompanyId: IDS.ownerCompany },
        { id: IDS.otherProperty, ownerCompanyId: IDS.ownerCompany },
      ],
      buildings: [
        {
          id: IDS.building,
          propertyId: IDS.property,
          name: 'Haus A',
          mandateRefPrefixes: [],
        },
      ],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        period(IDS.period2024, 2024),
        period(IDS.period2025, 2025),
        period(IDS.period2026, 2026),
        period(IDS.otherPeriod, 2025, IDS.otherProperty),
      ],
      costCategories: categories,
    },
  })
}

describe('Kostenarten aus dem Vorjahr übernehmen', () => {
  it('übernimmt Regeln ohne Beträge aus dem jüngsten früheren Jahr', () => {
    const file = fileWith([
      category('53000000-0000-4000-8000-000000000001', IDS.period2024, {
        label: 'Alt',
      }),
      category('53000000-0000-4000-8000-000000000002', IDS.period2025, {
        standardKey: 'versicherung',
        statementText: 'Gebäudeversicherung',
        betrkvCategory: '§2 Nr. 13',
        scope: { kind: 'building', buildingId: IDS.building },
        totalAmountCents: 123_400,
        date: '2025-03-15',
        allocablePercent: 90,
        laborSharePercent: 0,
        hideWhenZero: true,
        meteringFee: false,
      }),
      category('53000000-0000-4000-8000-000000000003', IDS.otherPeriod, {
        label: 'Fremdes Objekt',
      }),
    ])

    const result = copyCostCategoriesFromPreviousYear(
      file,
      IDS.period2026,
      idFactory(),
    )

    expect(result.sourceYear).toBe(2025)
    expect(result.copiedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    const copied = result.data.billingData.costCategories.filter(
      ({ billingPeriodId }) => billingPeriodId === IDS.period2026,
    )
    expect(copied).toEqual([
      {
        id: NEW_IDS[0],
        billingPeriodId: IDS.period2026,
        standardKey: 'versicherung',
        kind: 'operating',
        label: 'Gebäudeversicherung',
        statementText: 'Gebäudeversicherung',
        betrkvCategory: '§2 Nr. 13',
        allocationKey: 'usable_area',
        scope: { kind: 'building', buildingId: IDS.building },
        allocablePercent: 90,
        laborSharePercent: 0,
        hideWhenZero: true,
        meteringFee: false,
      },
    ])
    expect(file.billingData.costCategories).toHaveLength(3)
  })

  it('legt bereits vorhandene Kostenarten nicht doppelt an', () => {
    const file = fileWith([
      category('53000000-0000-4000-8000-000000000001', IDS.period2025, {
        standardKey: 'versicherung',
      }),
      category('53000000-0000-4000-8000-000000000002', IDS.period2025, {
        label: ' Wasser ',
        kind: 'water',
      }),
      category('53000000-0000-4000-8000-000000000003', IDS.period2025, {
        label: 'Müllabfuhr',
      }),
      category('53000000-0000-4000-8000-000000000004', IDS.period2026, {
        label: 'Versicherung neu',
        standardKey: 'versicherung',
      }),
      category('53000000-0000-4000-8000-000000000005', IDS.period2026, {
        label: 'wasser',
        kind: 'water',
      }),
    ])

    expect(
      previousYearCostCategories(file, IDS.period2026).candidates.map(
        ({ label }) => label,
      ),
    ).toEqual(['Müllabfuhr'])
    const result = copyCostCategoriesFromPreviousYear(
      file,
      IDS.period2026,
      idFactory(),
    )
    expect(result.copiedCount).toBe(1)
    expect(result.skippedCount).toBe(2)
  })

  it('meldet fehlendes Vorjahr und fehlende Kandidaten verständlich', () => {
    const file = fileWith([])
    expect(previousYearCostCategories(file, IDS.period2024)).toEqual({
      sourcePeriod: undefined,
      candidates: [],
      existingCount: 0,
    })
    expect(() =>
      copyCostCategoriesFromPreviousYear(file, IDS.period2024, idFactory()),
    ).toThrow(CostCommandError)
    expect(() =>
      copyCostCategoriesFromPreviousYear(file, IDS.period2026, idFactory()),
    ).toThrow('Im Vorjahr gibt es keine Kostenarten, die noch fehlen.')
    expect(() =>
      copyCostCategoriesFromPreviousYear(file, 'unbekannt', idFactory()),
    ).toThrow('Abrechnungsjahr wurde nicht gefunden.')
  })

  it('verweigert ungültige oder belegte IDs', () => {
    const file = fileWith([
      category('53000000-0000-4000-8000-000000000001', IDS.period2025),
    ])
    expect(() =>
      copyCostCategoriesFromPreviousYear(file, IDS.period2026, () => 'x'),
    ).toThrow(CostCommandError)
  })
})
