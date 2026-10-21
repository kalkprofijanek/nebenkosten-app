import { appDataFileSchema } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  MonthlyInformationCommandError,
  importMonthlyMeterReadings,
} from './commands'
import { HEAT_A, ID, PROPERTY, monthlyFixture } from './test-fixture'

let next = 0
const createId = () => ID(5000 + (next += 1))

describe('importMonthlyMeterReadings', () => {
  it('ergänzt neue Stände schemageprüft und überspringt Dubletten', () => {
    const data = monthlyFixture()
    expect(appDataFileSchema.safeParse(data).success).toBe(true)
    const before = data.billingData.meterReadings.length

    const result = importMonthlyMeterReadings(data, {
      propertyId: PROPERTY,
      createId,
      rows: [
        { meterNumber: 'HZ-1', date: '2026-04-30', value: 11500, unit: 'kWh' },
        {
          meterNumber: 'hz-1',
          date: '2026-03-31',
          value: 10850.4,
          unit: 'kWh',
        },
      ],
    })

    expect(result.plan.readings).toHaveLength(1)
    expect(result.plan.skippedDuplicates).toHaveLength(1)
    expect(result.data.billingData.meterReadings).toHaveLength(before + 1)
    expect(result.data.billingData.meterReadings.at(-1)).toMatchObject({
      meterId: HEAT_A,
      date: '2026-04-30',
      value: { value: 11500, unit: 'kWh' },
      source: 'imported',
    })
    expect(data.billingData.meterReadings).toHaveLength(before)
  })

  it('lehnt die Übernahme bei Problemen ab', () => {
    expect(() =>
      importMonthlyMeterReadings(monthlyFixture(), {
        propertyId: PROPERTY,
        createId,
        rows: [
          {
            meterNumber: 'HZ-1',
            date: '2026-04-30',
            value: 11500,
            unit: 'kWh',
          },
          { meterNumber: 'XX-9', date: '2026-04-30', value: 1, unit: 'kWh' },
        ],
      }),
    ).toThrow(MonthlyInformationCommandError)
  })

  it('lehnt Stände in einem gesperrten Abrechnungsjahr ab', () => {
    const data = monthlyFixture()
    data.billingData.billingPeriods = data.billingData.billingPeriods.map(
      (period) =>
        period.year === 2026 ? { ...period, status: 'FINALIZED' } : period,
    )
    expect(() =>
      importMonthlyMeterReadings(data, {
        propertyId: PROPERTY,
        createId,
        rows: [
          {
            meterNumber: 'HZ-1',
            date: '2026-04-30',
            value: 11500,
            unit: 'kWh',
          },
        ],
      }),
    ).toThrow(/gesperrtes Abrechnungsjahr \(2026\)/)
  })

  it('lehnt eine Übernahme ohne neue Stände ab', () => {
    expect(() =>
      importMonthlyMeterReadings(monthlyFixture(), {
        propertyId: PROPERTY,
        createId,
        rows: [
          {
            meterNumber: 'HZ-1',
            date: '2026-03-31',
            value: 10850.4,
            unit: 'kWh',
          },
        ],
      }),
    ).toThrow('Keine neuen Zählerstände')
  })

  it('verweigert einen Datenstand, der das Schema verletzt', () => {
    const broken = monthlyFixture()
    broken.masterData.units[0]!.label = 5 as never
    expect(() =>
      importMonthlyMeterReadings(broken, {
        propertyId: PROPERTY,
        createId,
        rows: [
          {
            meterNumber: 'HZ-1',
            date: '2026-04-30',
            value: 11500,
            unit: 'kWh',
          },
        ],
      }),
    ).toThrow('Dateischema')
  })

  it('meldet ungültige neue Ablesungen als Problem', () => {
    expect(() =>
      importMonthlyMeterReadings(monthlyFixture(), {
        propertyId: PROPERTY,
        createId: () => 'ungültige ID mit Leerzeichen',
        rows: [
          {
            meterNumber: 'HZ-1',
            date: '2026-04-30',
            value: 11500,
            unit: 'kWh',
          },
        ],
      }),
    ).toThrow(MonthlyInformationCommandError)
  })

  it('verlangt ein vorhandenes Objekt', () => {
    expect(() =>
      importMonthlyMeterReadings(monthlyFixture(), {
        propertyId: ID(999),
        createId,
        rows: [],
      }),
    ).toThrow('Objekt wurde nicht gefunden.')
  })
})
