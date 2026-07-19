import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { addCostCategory, addCostEntry } from './commands'

const IDS = {
  organization: '50000000-0000-4000-8000-000000000001',
  ownerCompany: '50000000-0000-4000-8000-000000000002',
  property: '50000000-0000-4000-8000-000000000003',
  building: '50000000-0000-4000-8000-000000000004',
  billingPeriod: '50000000-0000-4000-8000-000000000005',
  category: '60000000-0000-4000-8000-000000000001',
  entry: '60000000-0000-4000-8000-000000000002',
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
      properties: [{ id: IDS.property, ownerCompanyId: IDS.ownerCompany }],
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

describe('Kosten-Commands', () => {
  it('legt eine Kostenart immutable mit injizierter ID an', () => {
    const original = validFile()
    const result = addCostCategory(
      original,
      {
        billingPeriodId: IDS.billingPeriod,
        kind: 'operating',
        label: 'Gebäudeversicherung',
        statementText: 'Gebäudeversicherung',
        allocationKey: 'usable_area',
        scope: { kind: 'building', buildingId: IDS.building },
      },
      () => IDS.category,
    )

    expect(original.billingData.costCategories).toEqual([])
    expect(result.billingData.costCategories).toEqual([
      expect.objectContaining({
        id: IDS.category,
        billingPeriodId: IDS.billingPeriod,
        label: 'Gebäudeversicherung',
      }),
    ])
    expect(appDataFileSchema.safeParse(result).success).toBe(true)
  })

  it('legt eine Kostenbuchung mit ganzzahligem Centbetrag an', () => {
    const withCategory = addCostCategory(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        kind: 'water',
        label: 'Wasserversorgung',
        allocationKey: 'usable_area',
      },
      () => IDS.category,
    )
    const result = addCostEntry(
      withCategory,
      {
        costCategoryId: IDS.category,
        date: '2026-03-15',
        description: 'Jahresrechnung',
        amountCents: 123_456,
        receiptReference: 'BELEG-2026-001',
        allocablePercent: 100,
      },
      () => IDS.entry,
    )

    expect(withCategory.billingData.costEntries).toEqual([])
    expect(result.billingData.costEntries).toEqual([
      {
        id: IDS.entry,
        costCategoryId: IDS.category,
        date: '2026-03-15',
        description: 'Jahresrechnung',
        amountCents: 123_456,
        receiptReference: 'BELEG-2026-001',
        allocablePercent: 100,
      },
    ])
  })

  it.each([
    {
      name: 'leere Kostenart',
      input: {
        billingPeriodId: IDS.billingPeriod,
        kind: 'operating',
        label: '   ',
      },
    },
    {
      name: 'unbekanntes Eingabefeld',
      input: {
        billingPeriodId: IDS.billingPeriod,
        kind: 'operating',
        label: 'Versicherung',
        trusted: true,
      },
    },
    {
      name: 'ungültiger Umlagegrad',
      input: {
        billingPeriodId: IDS.billingPeriod,
        kind: 'operating',
        label: 'Versicherung',
        allocablePercent: 101,
      },
    },
  ])('weist $name strikt zurück', ({ input }) => {
    expect(() =>
      addCostCategory(validFile(), input, () => IDS.category),
    ).toThrow(/Eingabe/i)
  })

  it('weist fehlende Perioden und objektfremde Gebäudebereiche zurück', () => {
    expect(() =>
      addCostCategory(
        validFile(),
        {
          billingPeriodId: '99999999-9999-4999-8999-999999999999',
          kind: 'operating',
          label: 'Versicherung',
        },
        () => IDS.category,
      ),
    ).toThrow(/Abrechnungsjahr/i)
    expect(() =>
      addCostCategory(
        validFile(),
        {
          billingPeriodId: IDS.billingPeriod,
          kind: 'operating',
          label: 'Versicherung',
          scope: {
            kind: 'building',
            buildingId: '99999999-9999-4999-8999-999999999999',
          },
        },
        () => IDS.category,
      ),
    ).toThrow(/Gebäude/i)
  })

  it('weist Kostenbuchungen ohne Kostenart, mit Centbruchteilen oder fremden Feldern zurück', () => {
    expect(() =>
      addCostEntry(
        validFile(),
        { costCategoryId: IDS.category, amountCents: 100 },
        () => IDS.entry,
      ),
    ).toThrow(/Kostenart/i)

    const withCategory = addCostCategory(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        kind: 'operating',
        label: 'Versicherung',
      },
      () => IDS.category,
    )
    expect(() =>
      addCostEntry(
        withCategory,
        { costCategoryId: IDS.category, amountCents: 10.5 },
        () => IDS.entry,
      ),
    ).toThrow(/Eingabe/i)
    expect(() =>
      addCostEntry(
        withCategory,
        {
          costCategoryId: IDS.category,
          amountCents: 100,
          unsafeHtml: '<b>Test</b>',
        },
        () => IDS.entry,
      ),
    ).toThrow(/Eingabe/i)
  })

  it('weist doppelte IDs und Belegdaten außerhalb des Abrechnungsjahres zurück', () => {
    const withCategory = addCostCategory(
      validFile(),
      {
        billingPeriodId: IDS.billingPeriod,
        kind: 'operating',
        label: 'Versicherung',
      },
      () => IDS.category,
    )
    expect(() =>
      addCostEntry(
        withCategory,
        {
          costCategoryId: IDS.category,
          amountCents: 100,
          date: '2027-01-01',
        },
        () => IDS.entry,
      ),
    ).toThrow(/Abrechnungszeitraum/i)
    expect(() =>
      addCostEntry(
        withCategory,
        { costCategoryId: IDS.category, amountCents: 100 },
        () => IDS.category,
      ),
    ).toThrow(/ID/i)
  })
})
