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
