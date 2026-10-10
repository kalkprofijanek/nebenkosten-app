import { describe, expect, it } from 'vitest'
import type { AppDataFile, OccupancyPeriod } from '@nebenkosten/schema'
import { METER_READING_TOLERANCE, validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

function withReading(patch: Partial<OccupancyPeriod>, index = 0): AppDataFile {
  const data = validData()
  data.billingData.occupancyPeriods[index] = {
    ...data.billingData.occupancyPeriods[index]!,
    ...patch,
  }
  return data
}

const find = (data: AppDataFile, code: string) =>
  validateBillingPeriod(data, 'period-1').issues.filter(
    (issue) => issue.code === code,
  )

describe('Zählerstände je Belegung', () => {
  it('akzeptiert Zählerdifferenz innerhalb der Toleranz', () => {
    expect(METER_READING_TOLERANCE).toBe(0.5)
    const data = withReading({
      consumptionUnits: { value: 120, unit: 'einheiten' },
      heatMeterReading: {
        meterNumber: 'HZ-1',
        startValue: 1000,
        startDate: '2025-01-01',
        endValue: 1120.4,
        endDate: '2025-12-31',
      },
    })
    expect(find(data, 'heating.meter_reading_mismatch')).toEqual([])
    expect(find(data, 'heating.meter_reading_incomplete')).toEqual([])
  })

  it('warnt bei abweichender Zählerdifferenz mit Wohnungsangabe', () => {
    const data = withReading({
      consumptionUnits: { value: 120, unit: 'einheiten' },
      heatMeterReading: { startValue: 1000, endValue: 1130 },
    })
    const [warning] = find(data, 'heating.meter_reading_mismatch')
    expect(warning).toMatchObject({
      severity: 'warning',
      area: 'occupancy',
      entity: {
        type: 'OccupancyPeriod',
        id: data.billingData.occupancyPeriods[0]!.id,
      },
    })
    expect(warning!.detail).toMatch(/^Wohnung /)
    expect(warning!.detail).toContain('Stand neu − Stand alt = 130')
    expect(warning!.detail).toContain('120 Verbrauchseinheiten')
  })

  it('warnt, wenn Zählerstände vorliegen, aber keine Verbrauchseinheiten', () => {
    const data = withReading({
      consumptionUnits: undefined,
      heatMeterReading: { startValue: 5, endValue: 7.25 },
    })
    const [warning] = find(data, 'heating.meter_reading_mismatch')
    expect(warning!.detail).toContain('keine Verbrauchseinheiten')
  })

  it('warnt nicht bei begründeter Schätzung, wohl aber ohne Schätzgrund', () => {
    const estimated = {
      consumptionUnits: { value: 480, unit: 'einheiten' as const },
      consumptionUnitsEstimated: true,
      heatMeterReading: { startValue: 1000, endValue: 1000 },
    }
    expect(
      find(
        withReading({
          ...estimated,
          consumptionUnitsEstimateReason: 'Zähler defekt, § 9a HeizKV',
        }),
        'heating.meter_reading_mismatch',
      ),
    ).toEqual([])
    for (const reason of [undefined, '  '])
      expect(
        find(
          withReading({
            ...estimated,
            consumptionUnitsEstimateReason: reason,
          }),
          'heating.meter_reading_mismatch',
        ),
      ).toHaveLength(1)
  })

  it('meldet eine Zählernummer ohne beide Stände als Hinweis', () => {
    const onlyStart = withReading({
      heatMeterReading: { meterNumber: ' HZ-7 ', startValue: 1 },
    })
    expect(
      find(onlyStart, 'heating.meter_reading_incomplete')[0],
    ).toMatchObject({ severity: 'info' })
    expect(
      find(onlyStart, 'heating.meter_reading_incomplete')[0]!.detail,
    ).toContain('Zähler HZ-7 fehlt der neue Zählerstand')
    const onlyEnd = withReading({
      heatMeterReading: { meterNumber: 'HZ-7', endValue: 2 },
    })
    expect(
      find(onlyEnd, 'heating.meter_reading_incomplete')[0]!.detail,
    ).toContain('fehlt der alte Zählerstand')
    const none = withReading({ heatMeterReading: { meterNumber: 'HZ-7' } })
    expect(find(none, 'heating.meter_reading_incomplete')[0]!.detail).toContain(
      'der alte und der neue',
    )
  })

  it('ignoriert Leerstände, fehlende Ablesung und Einträge ohne Zählernummer', () => {
    expect(
      find(
        withReading({ heatMeterReading: null }),
        'heating.meter_reading_incomplete',
      ),
    ).toEqual([])
    expect(
      find(
        withReading({ heatMeterReading: { startValue: 3 } }),
        'heating.meter_reading_incomplete',
      ),
    ).toEqual([])
    const vacancy = withReading({
      kind: 'vacancy',
      tenancyId: null,
      heatMeterReading: { startValue: 0, endValue: 999 },
    })
    expect(find(vacancy, 'heating.meter_reading_mismatch')).toEqual([])
  })
})

describe('Zwischengespeicherte Freigabeprüfung', () => {
  it('liefert je Datenobjekt dasselbe Ergebnis und wendet Bestätigungen günstig an', async () => {
    const { validateBillingPeriodCached, withConfirmedWarnings } =
      await import('../src/index')
    const data = withReading({
      consumptionUnits: { value: 1, unit: 'einheiten' },
      heatMeterReading: { startValue: 0, endValue: 10 },
    })
    const first = validateBillingPeriodCached(data, 'period-1')
    const again = validateBillingPeriodCached(data, 'period-1')
    expect(again.issues).toBe(first.issues)
    const warningKeys = first.issues
      .filter(({ severity }) => severity === 'warning')
      .map(({ key }) => key)
    expect(warningKeys.length).toBeGreaterThan(0)
    const confirmed = validateBillingPeriodCached(data, 'period-1', {
      confirmedWarningKeys: warningKeys,
    })
    expect(confirmed.unconfirmedWarningKeys).toEqual([])
    expect(confirmed.canBecomeReady).toBe(first.errorCount === 0)
    expect(withConfirmedWarnings(first).unconfirmedWarningKeys).toEqual(
      warningKeys,
    )
    expect(
      validateBillingPeriodCached(data, 'period-1', {}).unconfirmedWarningKeys,
    ).toEqual(validateBillingPeriod(data, 'period-1').unconfirmedWarningKeys)
    expect(validateBillingPeriodCached(null, 'period-1').errorCount).toBe(1)
  })
})

describe('Zählertausch (ADR-0008)', () => {
  const replaced = {
    meterNumber: 'HZ-1',
    startValue: 1000,
    startDate: '2025-01-01',
    endValue: 30,
    endDate: '2025-12-31',
    replacements: [
      {
        date: '2025-06-15',
        removedEndValue: 1090,
        installedMeterNumber: 'HZ-2',
        installedStartValue: 0,
      },
    ],
  }

  it('rechnet den Verbrauch über den Tausch hinweg (90 + 30 = 120)', () => {
    const data = withReading({
      consumptionUnits: { value: 120, unit: 'einheiten' },
      heatMeterReading: replaced,
    })
    expect(find(data, 'heating.meter_reading_mismatch')).toEqual([])
    expect(find(data, 'heating.meter_replacement_invalid')).toEqual([])
  })

  it('nennt den Tausch bei Abweichung', () => {
    const [warning] = find(
      withReading({
        consumptionUnits: { value: 100, unit: 'einheiten' },
        heatMeterReading: replaced,
      }),
      'heating.meter_reading_mismatch',
    )
    expect(warning!.detail).toContain(
      'Verbrauch laut Zählerständen einschließlich Zählertausch = 120',
    )
  })

  it('warnt bei Tauschtag außerhalb der Ablesedaten oder falscher Reihenfolge', () => {
    const [outside] = find(
      withReading({
        consumptionUnits: { value: 120, unit: 'einheiten' },
        heatMeterReading: {
          ...replaced,
          replacements: [{ ...replaced.replacements[0]!, date: '2026-02-01' }],
        },
      }),
      'heating.meter_replacement_invalid',
    )
    expect(outside).toMatchObject({ severity: 'warning', area: 'occupancy' })
    expect(outside!.detail).toContain('außerhalb')
    const [order] = find(
      withReading({
        consumptionUnits: { value: 120, unit: 'einheiten' },
        heatMeterReading: {
          ...replaced,
          replacements: [
            { ...replaced.replacements[0]!, date: '2025-09-01' },
            { ...replaced.replacements[0]!, date: '2025-03-01' },
          ],
        },
      }),
      'heating.meter_replacement_invalid',
    )
    expect(order!.detail).toContain('nicht zeitlich geordnet')
  })
})

describe('Zwischenablesung bei Nutzerwechsel (§ 9b Abs. 1 HeizKV)', () => {
  function withChange(endDate?: string): AppDataFile {
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
    if (endDate) first.heatMeterReading = { endValue: 100, endDate }
    data.billingData.occupancyPeriods.push({
      ...first,
      id: 'occupancy-next',
      from: '2025-07-01',
      to: null,
      heatMeterReading: null,
    })
    return data
  }

  it('weist auf die fehlende Zwischenablesung hin (nur Hinweis)', () => {
    const [info] = find(withChange(), 'heating.interim_reading_missing')
    expect(info).toMatchObject({
      severity: 'info',
      entity: { type: 'OccupancyPeriod', id: 'occupancy-next' },
    })
    expect(info!.detail).toContain('01.07.2025')
    expect(info!.detail).toContain('§ 9b Abs. 1 HeizKV')
  })

  it('schweigt bei erfasster Ablesung und ohne Heizkreis', () => {
    expect(
      find(withChange('2025-06-30'), 'heating.interim_reading_missing'),
    ).toEqual([])
    const withoutCircuit = withChange()
    withoutCircuit.billingData.heatingCircuits = []
    expect(find(withoutCircuit, 'heating.interim_reading_missing')).toEqual([])
  })
})
