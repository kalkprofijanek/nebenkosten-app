import { describe, expect, it } from 'vitest'
import type { BillingPeriod, OccupancyPeriod } from '@nebenkosten/schema'
import { createEmptyAppDataFile } from '@nebenkosten/schema'
import { tenantChanges } from '../src'

const period: BillingPeriod = {
  id: 'p',
  propertyId: 'property',
  year: 2025,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  status: 'DRAFT',
}

const occupancy = (patch: Partial<OccupancyPeriod>): OccupancyPeriod => ({
  id: 'o',
  billingPeriodId: 'p',
  unitId: 'u1',
  kind: 'tenant',
  ...patch,
})

function data(occupancies: OccupancyPeriod[]) {
  const file = createEmptyAppDataFile()
  file.billingData.occupancyPeriods.push(...occupancies)
  return file
}

describe('Nutzerwechsel und Zwischenablesung (§ 9b HeizKV)', () => {
  it('erkennt den Wechsel und eine fehlende Ablesung', () => {
    expect(
      tenantChanges(
        data([
          occupancy({ id: 'neu', from: '2025-04-01' }),
          occupancy({ id: 'alt', to: '2025-03-31' }),
          occupancy({ id: 'andere', unitId: 'u2' }),
        ]),
        period,
      ),
    ).toEqual([
      {
        unitId: 'u1',
        date: '2025-04-01',
        previousOccupancyId: 'alt',
        nextOccupancyId: 'neu',
        hasInterimReading: false,
      },
    ])
  })

  it('zählt Leerstand als Nutzerwechsel und ordnet nach Datum', () => {
    const changes = tenantChanges(
      data([
        occupancy({ id: 'a', unitId: 'u2', to: '2025-08-31' }),
        occupancy({
          id: 'b',
          unitId: 'u2',
          kind: 'vacancy',
          from: '2025-09-01',
          to: '2025-09-30',
        }),
        occupancy({ id: 'c', unitId: 'u2', from: '2025-10-01' }),
        occupancy({ id: 'd', to: '2025-02-28' }),
        occupancy({ id: 'e', from: '2025-03-01' }),
      ]),
      period,
    )
    expect(changes.map(({ date }) => date)).toEqual([
      '2025-03-01',
      '2025-09-01',
      '2025-10-01',
    ])
  })

  it('erkennt die Ablesung am Auszugs- oder Einzugstag', () => {
    const reading = (endDate: string) =>
      tenantChanges(
        data([
          occupancy({
            id: 'alt',
            to: '2025-03-31',
            heatMeterReading: { endValue: 400, endDate },
          }),
          occupancy({ id: 'neu', from: '2025-04-01' }),
        ]),
        period,
      )[0]!.hasInterimReading
    expect(reading('2025-03-31')).toBe(true)
    expect(reading('2025-04-01')).toBe(true)
    expect(reading('2025-03-15')).toBe(false)
    expect(
      tenantChanges(
        data([
          occupancy({ id: 'alt', to: '2025-03-31' }),
          occupancy({
            id: 'neu',
            from: '2025-04-01',
            heatMeterReading: { startValue: 400, startDate: '2025-04-01' },
          }),
        ]),
        period,
      )[0]!.hasInterimReading,
    ).toBe(true)
  })

  it('meldet keinen Wechsel bei nur einer Nutzung oder Beginn am Periodenstart', () => {
    expect(tenantChanges(data([occupancy({})]), period)).toEqual([])
    expect(
      tenantChanges(
        data([occupancy({ id: 'x' }), occupancy({ id: 'y' })]),
        period,
      ),
    ).toEqual([])
  })
})
