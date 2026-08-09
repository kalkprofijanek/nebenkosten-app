import { createEmptyAppDataFile, type AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { buildWorkspaceContext } from './workspace-context'

function contextFixture(): AppDataFile {
  const empty = createEmptyAppDataFile()
  return {
    ...empty,
    masterData: {
      ...empty.masterData,
      organizations: [{ id: 'org-1', name: 'Fiktive Verwaltung' }],
      ownerCompanies: [
        {
          id: 'company-1',
          organizationId: 'org-1',
          name: 'Beispiel Eigentum',
          additionalNameLines: [],
        },
      ],
      properties: [
        {
          id: 'property-1',
          ownerCompanyId: 'company-1',
          internalNumber: 'OBJ-17',
        },
      ],
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
          status: 'IN_REVIEW',
        },
      ],
    },
  }
}

describe('buildWorkspaceContext', () => {
  it('liefert lesbare Bezeichnungen für die aktive Auswahl', () => {
    const context = buildWorkspaceContext(contextFixture(), {
      ownerCompanyId: 'company-1',
      propertyId: 'property-1',
      billingPeriodId: 'period-1',
    })

    expect(context.companyLabel).toBe('Beispiel Eigentum')
    expect(context.propertyLabel).toBe('OBJ-17')
    expect(context.billingPeriodLabel).toBe('2026')
    expect(context.statusLabel).toBe('Prüfung offen')
  })

  it('filtert Objekt und Zeitraum entlang der aktiven Hierarchie', () => {
    const context = buildWorkspaceContext(contextFixture(), {
      ownerCompanyId: 'company-1',
      propertyId: 'property-1',
      billingPeriodId: 'period-1',
    })

    expect(context.companies).toEqual([
      { id: 'company-1', label: 'Beispiel Eigentum' },
    ])
    expect(context.properties).toEqual([{ id: 'property-1', label: 'OBJ-17' }])
    expect(context.billingPeriods).toEqual([{ id: 'period-1', label: '2026' }])
  })
})
