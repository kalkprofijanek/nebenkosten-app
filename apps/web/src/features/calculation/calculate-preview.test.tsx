import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { createBillingPeriod } from '../billing-periods/commands'
import { createCompany, createPropertyStructure } from '../master-data/commands'
import { calculatePreview, runCalculation } from './calculate-preview'

function calculableData() {
  let data = createCompany(
    createEmptyAppDataFile(),
    { organizationName: 'Testverwaltung', ownerCompanyName: 'Testfirma' },
    {
      createId: (() => {
        const ids = [
          '40000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000002',
        ]
        return () => ids.shift()!
      })(),
    },
  )
  data = createPropertyStructure(
    data,
    {
      ownerCompanyId: '40000000-0000-4000-8000-000000000002',
      buildingName: 'Haus A',
      unitLabel: 'Wohnung 1',
    },
    {
      createId: (() => {
        const ids = [
          '40000000-0000-4000-8000-000000000003',
          '40000000-0000-4000-8000-000000000004',
          '40000000-0000-4000-8000-000000000005',
        ]
        return () => ids.shift()!
      })(),
    },
  )
  return createBillingPeriod(
    data,
    {
      propertyId: '40000000-0000-4000-8000-000000000003',
      year: 2026,
    },
    { createId: () => '40000000-0000-4000-8000-000000000006' },
  )
}

describe('calculatePreview', () => {
  it('delegates to the core engine without changing application data', () => {
    const data = createEmptyAppDataFile()
    const original = structuredClone(data)

    expect(() => calculatePreview(data, 'missing')).toThrow(
      'Abrechnungsperiode "missing" nicht gefunden',
    )
    expect(data).toEqual(original)
  })

  it('speichert einen Berechnungslauf mit Ergebnis-Snapshot ohne Statuswechsel', () => {
    const data = calculableData()
    const result = runCalculation(
      data,
      '40000000-0000-4000-8000-000000000006',
      {
        createId: (() => {
          const ids = [
            '40000000-0000-4000-8000-000000000007',
            '40000000-0000-4000-8000-000000000008',
          ]
          return () => ids.shift()!
        })(),
        now: () => new Date('2026-07-19T12:00:00.000Z'),
      },
    )

    expect(result.billingData.billingPeriods[0]?.status).toBe('DRAFT')
    expect(result.billingData.calculationRuns).toEqual([
      expect.objectContaining({
        id: '40000000-0000-4000-8000-000000000007',
        startedAt: '2026-07-19T12:00:00.000Z',
        appVersion: '1.0.0',
      }),
    ])
    expect(result.billingData.calculationResults).toEqual([
      expect.objectContaining({
        id: '40000000-0000-4000-8000-000000000008',
        calculationRunId: '40000000-0000-4000-8000-000000000007',
        snapshotFormatVersion: 3,
        resultSnapshot: expect.objectContaining({ snapshotFormatVersion: 3 }),
      }),
    ])
  })
})
