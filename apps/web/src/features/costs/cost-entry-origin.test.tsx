import {
  appDataFileSchema,
  createEmptyAppDataFile,
  type AppDataFile,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  CostCommandError,
  addCostCategory,
  addCostEntry,
  updateCostEntry,
} from './commands'

const IDS = {
  organization: '70000000-0000-4000-8000-000000000001',
  ownerCompany: '70000000-0000-4000-8000-000000000002',
  property: '70000000-0000-4000-8000-000000000003',
  billingPeriod: '70000000-0000-4000-8000-000000000004',
  category: '70000000-0000-4000-8000-000000000005',
  entry: '70000000-0000-4000-8000-000000000006',
} as const

/** Fiktives Objekt mit einer Kostenart und einer Kostenposition. */
function file(): AppDataFile {
  const empty = createEmptyAppDataFile()
  const base = appDataFileSchema.parse({
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: IDS.organization, name: 'Fiktiv' }],
      ownerCompanies: [
        {
          id: IDS.ownerCompany,
          organizationId: IDS.organization,
          name: 'Fiktiv GmbH',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: IDS.property, ownerCompanyId: IDS.ownerCompany }],
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
  const withCategory = addCostCategory(
    base,
    {
      billingPeriodId: IDS.billingPeriod,
      kind: 'operating',
      label: 'Allgemeinstrom',
      allocationKey: 'usable_area',
    },
    () => IDS.category,
  )
  return addCostEntry(
    withCategory,
    {
      costCategoryId: IDS.category,
      date: '2026-02-01',
      amountCents: 12_000,
      origin: 'previous_owner',
      amountBasis: 'advance_payments',
    },
    () => IDS.entry,
  )
}

const entry = (data: AppDataFile) => data.billingData.costEntries[0]!

describe('Herkunft und Betragsgrundlage von Kostenbelegen (PR-30)', () => {
  it('speichert die Angaben beim Anlegen', () => {
    expect(entry(file())).toMatchObject({
      origin: 'previous_owner',
      amountBasis: 'advance_payments',
    })
  })

  it('behält die Angaben, wenn die Eingabe sie nicht enthält', () => {
    const updated = updateCostEntry(file(), IDS.entry, {
      costCategoryId: IDS.category,
      date: '2026-02-01',
      amountCents: 13_000,
    })
    expect(entry(updated)).toMatchObject({
      amountCents: 13_000,
      origin: 'previous_owner',
      amountBasis: 'advance_payments',
    })
  })

  it('entfernt die Angaben bei leerer Auswahl, statt null zu speichern', () => {
    const updated = updateCostEntry(file(), IDS.entry, {
      costCategoryId: IDS.category,
      amountCents: 12_000,
      origin: null,
      amountBasis: '',
    })
    expect(entry(updated)).not.toHaveProperty('origin')
    expect(entry(updated)).not.toHaveProperty('amountBasis')
  })

  it('weist unbekannte Werte zurück', () => {
    expect(() =>
      updateCostEntry(file(), IDS.entry, {
        costCategoryId: IDS.category,
        amountCents: 12_000,
        amountBasis: 'pauschal',
      }),
    ).toThrow(CostCommandError)
  })
})
