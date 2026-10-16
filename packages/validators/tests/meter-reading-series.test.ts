import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

const seriesCodes = (data: AppDataFile) =>
  validateBillingPeriod(data, 'period-1')
    .issues.filter(({ code }) =>
      code.startsWith('heating.meter_reading_series_'),
    )
    .map(({ code, entity }) => `${code}@${entity?.type}:${entity?.id}`)

/** Fiktiver Hauptzähler mit Ablesungen über zwei Jahre. */
function withMeterReadings(values: [string, number][]): AppDataFile {
  const data = validData()
  data.masterData.meters.push({
    id: 'meter-1',
    propertyId: 'property-1',
    kind: 'heat',
    meterNumber: 'WMZ-1',
  })
  values.forEach(([date, value], index) =>
    data.billingData.meterReadings.push({
      id: `reading-${index + 1}`,
      meterId: 'meter-1',
      date,
      value: { value, unit: 'kWh' },
    }),
  )
  return data
}

/** Vorjahr 100 → 200 und Abrechnungsjahr ab 200 an derselben Wohnung. */
function withOccupancyReadings(endValue: number): AppDataFile {
  const data = validData()
  data.billingData.billingPeriods.push({
    id: 'period-0',
    propertyId: 'property-1',
    year: 2024,
    periodStart: '2024-01-01',
    periodEnd: '2024-12-31',
    status: 'FINALIZED',
  })
  data.billingData.occupancyPeriods.push({
    id: 'occupancy-0',
    billingPeriodId: 'period-0',
    unitId: 'unit-1',
    tenancyId: 'tenancy-1',
    kind: 'tenant',
    heatMeterReading: { meterNumber: 'HKV-1', startValue: 100, endValue: 200 },
  })
  data.billingData.occupancyPeriods[0]!.heatMeterReading = {
    meterNumber: 'HKV-1',
    startValue: 200,
    endValue,
  }
  return data
}

describe('Zählerstandsreihen (PR-31)', () => {
  it('meldet eine verschobene Stelle am Hauptzähler', () => {
    expect(
      seriesCodes(
        withMeterReadings([
          ['2024-12-31', 1_200.5],
          ['2025-12-31', 13_050],
          ['2026-01-31', 1_400.2],
        ]),
      ),
    ).toEqual(['heating.meter_reading_series_digit_drop@Meter:meter-1'])
  })

  it('meldet nichts bei plausibler Reihe', () => {
    expect(
      seriesCodes(
        withMeterReadings([
          ['2024-12-31', 1_000],
          ['2025-12-31', 2_000],
          ['2026-01-31', 2_170],
        ]),
      ),
    ).toEqual([])
    expect(seriesCodes(withOccupancyReadings(400))).toEqual([])
  })

  it('verknüpft Stände der Nutzungen über die Jahre derselben Wohnung', () => {
    // 100 → 200 → 20: Endstand vermutlich ohne letzte Stelle erfasst.
    expect(seriesCodes(withOccupancyReadings(20))).toEqual([
      'heating.meter_reading_series_digit_drop@OccupancyPeriod:occupancy-1',
    ])
  })
})
