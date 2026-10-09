import { describe, expect, it } from 'vitest'

import {
  appDataFileSchema,
  heatMeterReadingSchema,
  migrateV3ToCurrent,
  occupancyPeriodSchema,
} from '../src'
import type { MigrationResult } from '../src'
import { createFictionalV3File } from './fixtures'

const OPTIONS = {
  sourceSha256: 'e'.repeat(64),
  sourceFileName: 'fiktive-zaehlerstaende.json',
  now: () => new Date('2026-10-04T08:00:00.000Z'),
}

type UnknownRecord = Record<string, unknown>

function firstPeriod(input: UnknownRecord) {
  const company = (input.firmen as UnknownRecord[])[0]!
  const object = (company.objekte as UnknownRecord[])[0]!
  return (object.abrechnungen as UnknownRecord[])[0]!
}

function expectSuccess(result: MigrationResult) {
  expect(result.ok, JSON.stringify(result, null, 2)).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result
}

describe('Zählerstände je Belegung (heatMeterReading)', () => {
  it('ist optional und abwärtskompatibel', () => {
    const base = {
      id: 'occ_1',
      billingPeriodId: 'bp_1',
      unitId: 'unit_1',
      kind: 'tenant' as const,
    }
    expect(occupancyPeriodSchema.safeParse(base).success).toBe(true)
    expect(
      occupancyPeriodSchema.safeParse({ ...base, heatMeterReading: null })
        .success,
    ).toBe(true)
    expect(
      occupancyPeriodSchema.safeParse({
        ...base,
        heatMeterReading: {
          meterNumber: 'HZ-0001',
          startValue: 100.5,
          startDate: '2025-01-01',
          endValue: 250,
          endDate: '2025-12-31',
        },
      }).success,
    ).toBe(true)
  })

  it('lehnt unbekannte Felder und ungültige Datumswerte ab', () => {
    expect(
      heatMeterReadingSchema.safeParse({ meterNumber: 'X', foo: 1 }).success,
    ).toBe(false)
    expect(
      heatMeterReadingSchema.safeParse({ startDate: '31.12.2025' }).success,
    ).toBe(false)
    expect(
      heatMeterReadingSchema.safeParse({ endValue: Number.NaN }).success,
    ).toBe(false)
  })

  it('übernimmt wmz_* aus dem Legacy-Nutzer ohne Unbekannt-Meldung', () => {
    const input = createFictionalV3File() as UnknownRecord
    const users = firstPeriod(input).nutzer as UnknownRecord[]
    Object.assign(users[0]!, {
      wmz_nr: 'HZ-4711',
      wmz_stand_alt: '1.234,5',
      wmz_datum_alt: '2025-01-01',
      wmz_stand_neu: 1300,
      wmz_datum_neu: '2025-12-31',
    })

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const withReading = result.data.billingData.occupancyPeriods.filter(
      ({ heatMeterReading }) => heatMeterReading != null,
    )
    expect(withReading).toHaveLength(1)
    expect(withReading[0]!.heatMeterReading).toEqual({
      meterNumber: 'HZ-4711',
      startValue: 1234.5,
      startDate: '2025-01-01',
      endValue: 1300,
      endDate: '2025-12-31',
    })
    expect(
      result.report.unmappedFields.filter((field) => field.includes('wmz_')),
    ).toEqual([])
    expect(JSON.stringify(withReading[0]!.legacyUnmapped ?? [])).not.toContain(
      'wmz_',
    )
    expect(appDataFileSchema.safeParse(result.data).success).toBe(true)
  })

  it('übernimmt den Vorjahresverbrauch (vorjahr_*) ohne Unbekannt-Meldung', () => {
    const input = createFictionalV3File() as UnknownRecord
    const users = firstPeriod(input).nutzer as UnknownRecord[]
    Object.assign(users[0]!, {
      vorjahr_verbrauch: '4.245,8',
      vorjahr_jahr: 2024,
      vorjahr_quelle: 'Heizkostenabrechnung 2024 des Voreigentümers',
    })
    Object.assign(users[1]!, { vorjahr_verbrauch: 10 })

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const withPrevious = result.data.billingData.occupancyPeriods.filter(
      ({ previousConsumption }) => previousConsumption != null,
    )
    expect(withPrevious).toHaveLength(1)
    expect(withPrevious[0]!.previousConsumption).toEqual({
      year: 2024,
      value: 4245.8,
      source: 'Heizkostenabrechnung 2024 des Voreigentümers',
    })
    expect(
      result.report.unmappedFields.filter((field) =>
        field.includes('vorjahr_'),
      ),
    ).toEqual([])
    expect(appDataFileSchema.safeParse(result.data).success).toBe(true)
  })

  it('übernimmt numerische Zählernummern als Text und meldet ungültige Werte', () => {
    const input = createFictionalV3File() as UnknownRecord
    const users = firstPeriod(input).nutzer as UnknownRecord[]
    Object.assign(users[0]!, {
      wmz_nr: 815,
      wmz_stand_alt: 'kaputt',
      wmz_datum_neu: '31.12.2025',
    })

    const result = expectSuccess(migrateV3ToCurrent(input, OPTIONS))
    const reading = result.data.billingData.occupancyPeriods.find(
      ({ heatMeterReading }) => heatMeterReading != null,
    )!.heatMeterReading
    expect(reading).toEqual({ meterNumber: '815' })
    const codes = result.report.issues.map(({ code }) => code)
    expect(codes).toContain('migration.invalid_number')
    expect(codes).toContain('migration.invalid_date')
  })

  it('setzt ohne wmz_* kein heatMeterReading', () => {
    const result = expectSuccess(
      migrateV3ToCurrent(createFictionalV3File(), OPTIONS),
    )
    expect(
      result.data.billingData.occupancyPeriods.every(
        ({ heatMeterReading }) => heatMeterReading === undefined,
      ),
    ).toBe(true)
  })
})
