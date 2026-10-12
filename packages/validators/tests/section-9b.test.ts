import { describe, expect, it } from 'vitest'
import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

type Allocation = OccupancyPeriod['section9bAllocation']

function withChange(
  previous: Allocation,
  next: Allocation,
  interimReading = false,
): AppDataFile {
  const data = validData()
  data.masterData.heatingSystems.push({
    id: 'system-1',
    propertyId: data.masterData.properties[0]!.id,
  })
  data.billingData.heatingCircuits.push({
    id: 'circuit-1',
    billingPeriodId: 'period-1',
    heatingSystemId: 'system-1',
    buildingId: 'building-1',
    hasCentralHotWater: false,
  })
  const first = data.billingData.occupancyPeriods[0]!
  first.from = null
  first.to = '2025-06-30'
  first.section9bAllocation = previous
  if (interimReading)
    first.heatMeterReading = { endValue: 100, endDate: '2025-06-30' }
  data.billingData.occupancyPeriods.push({
    ...first,
    id: 'occupancy-next',
    from: '2025-07-01',
    to: null,
    heatMeterReading: null,
    section9bAllocation: next,
  })
  return data
}

const codes = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1').issues.filter(({ code }) =>
    code.startsWith('heating.section9b_'),
  )

describe('§ 9b HeizKV: Aufteilung bei Nutzerwechsel', () => {
  it('warnt vor gemischtem Maßstab ohne Zwischenablesung und ohne Festlegung', () => {
    const [warning, ...rest] = codes(withChange(null, null))
    expect(rest).toEqual([])
    expect(warning).toMatchObject({
      severity: 'warning',
      code: 'heating.section9b_mixed_basis',
      entity: { type: 'OccupancyPeriod', id: 'occupancy-next' },
    })
    expect(warning!.title).toContain('§ 9b Abs. 3 HeizKV')
    expect(warning!.detail).toContain('01.07.2025')
  })

  it('meldet einen Fehler bei einseitiger oder unterschiedlicher Festlegung', () => {
    for (const [left, right] of [
      ['degree_days', null],
      [null, 'time'],
      ['degree_days', 'time'],
    ] as const) {
      const issues = codes(withChange(left, right))
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: 'heating.section9b_allocation_inconsistent',
      })
    }
    expect(codes(withChange('degree_days', 'time'))[0]!.detail).toContain(
      'Vornutzer nach Gradtagszahlen, Nachnutzer zeitanteilig',
    )
  })

  it('schweigt bei einheitlicher Festlegung ohne Zwischenablesung', () => {
    expect(codes(withChange('degree_days', 'degree_days'))).toEqual([])
    expect(codes(withChange('time', 'time'))).toEqual([])
  })

  it('weist auf den Vorrang der Zwischenablesung hin', () => {
    const [info, ...rest] = codes(
      withChange('degree_days', 'degree_days', true),
    )
    expect(rest).toEqual([])
    expect(info).toMatchObject({
      severity: 'info',
      code: 'heating.section9b_with_interim_reading',
    })
    expect(info!.detail).toContain('§ 9b Abs. 1 und 2 HeizKV')
  })

  it('schweigt bei erfasster Zwischenablesung ohne Festlegung und ohne Heizkreis', () => {
    expect(codes(withChange(null, null, true))).toEqual([])
    const withoutCircuit = withChange(null, null)
    withoutCircuit.billingData.heatingCircuits = []
    expect(codes(withoutCircuit)).toEqual([])
  })
})
