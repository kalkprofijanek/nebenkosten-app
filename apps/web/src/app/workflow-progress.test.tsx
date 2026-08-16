import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { appRoutes } from './navigation'
import { workflowProgress } from './workflow-progress'

function progressFixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      ownerCompanies: [
        {
          id: 'company-1',
          organizationId: 'org-1',
          name: 'Fiktiv',
          additionalNameLines: [],
        },
      ],
      properties: [{ id: 'property-1', ownerCompanyId: 'company-1' }],
    },
    billingData: {
      ...empty.billingData,
      billingPeriods: [
        {
          id: 'period-1',
          propertyId: 'property-1',
          year: 2026,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          status: 'DRAFT',
        },
      ],
    },
  }
}

describe('workflowProgress', () => {
  it('führt für jede Route nach der Übersicht genau einen Status', () => {
    const progress = workflowProgress(progressFixture(), {
      ownerCompanyId: 'company-1',
      propertyId: 'property-1',
      billingPeriodId: 'period-1',
    })

    expect(progress.steps.map(({ path }) => path)).toEqual(
      appRoutes.slice(1).map(({ path }) => path),
    )
    expect(progress.total).toBe(appRoutes.length - 1)
    expect(progress.completed).toBe(3)
  })

  it('bewertet spätere Schritte unabhängig statt als falsche lineare Kette', () => {
    const empty = createEmptyAppDataFile()
    const progress = workflowProgress(empty, {
      ownerCompanyId: null,
      propertyId: null,
      billingPeriodId: null,
    })

    expect(progress.steps).toHaveLength(appRoutes.length - 1)
    expect(progress.steps.every(({ status }) => status === 'open')).toBe(true)
  })
})
