import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { emptySelection, normalizeSelection } from './selection'

describe('normalizeSelection', () => {
  it('keeps an empty context for an empty workspace', () => {
    expect(
      normalizeSelection(createEmptyAppDataFile(), emptySelection),
    ).toEqual(emptySelection)
  })

  it('selects the first valid hierarchy and removes stale child ids', () => {
    const data = createEmptyAppDataFile()
    data.masterData.organizations.push({ id: 'org-1', name: 'Fiktiv' })
    data.masterData.ownerCompanies.push({
      id: 'company-1',
      organizationId: 'org-1',
      name: 'Fiktiv',
      additionalNameLines: [],
    })
    data.masterData.properties.push({
      id: 'property-1',
      ownerCompanyId: 'company-1',
    })
    data.billingData.billingPeriods.push({
      id: 'period-1',
      propertyId: 'property-1',
      year: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      status: 'DRAFT',
    })

    expect(
      normalizeSelection(data, {
        ownerCompanyId: 'missing',
        propertyId: 'stale',
        billingPeriodId: 'stale',
      }),
    ).toEqual({
      ownerCompanyId: 'company-1',
      propertyId: 'property-1',
      billingPeriodId: 'period-1',
    })
  })
})
