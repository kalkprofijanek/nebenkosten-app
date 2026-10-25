import {
  appDataFileSchema,
  createEmptyAppDataFile,
  meterReadingSchema,
  type AppDataFile,
  type Meter,
  type MeterReading,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  parseMeterServiceCsv,
  planMonthlyMeterReadings,
  type MeterServiceReading,
} from '../src'

// Ausschließlich fiktive Zählernummern und Stände.
const P1 = 'prop-1'
const P2 = 'prop-2'

function meter(
  id: string,
  kind: Meter['kind'],
  meterNumber: string | null,
  propertyId = P1,
): Meter {
  return { id, propertyId, kind, meterNumber }
}

function existing(
  id: string,
  meterId: string,
  date: string | null,
  value: number,
  unit: 'kWh' | 'm3' = 'kWh',
): MeterReading {
  return { id, meterId, date, value: { value, unit }, source: 'manual' }
}

function dataWith(meters: Meter[], readings: MeterReading[] = []): AppDataFile {
  const data = createEmptyAppDataFile()
  data.masterData.meters = meters
  data.billingData.meterReadings = readings
  return data
}

function row(
  meterNumber: string,
  date: string,
  value: number,
  unit: MeterServiceReading['unit'] = 'kWh',
): MeterServiceReading {
  return { meterNumber, date, value, unit }
}

function ids() {
  let n = 0
  return () => `new-${++n}`
}

const METERS = [
  meter('m-heat', 'unit_heat', 'WMZ-001'),
  meter('m-water', 'unit_hot_water', 'WW 002'),
]

describe('planMonthlyMeterReadings', () => {
  it('ordnet kWh- und m³-Stände über die normalisierte Zählernummer zu', () => {
    const plan = planMonthlyMeterReadings(dataWith(METERS), {
      propertyId: P1,
      rows: [
        row(' wmz-001 ', '2026-01-31', 1234.5, 'kWh'),
        row('ww002', '2026-01-31', 12.5, 'm3'),
      ],
      createId: ids(),
    })
    expect(plan.problems).toEqual([])
    expect(plan.skippedDuplicates).toEqual([])
    expect(plan.readings).toEqual([
      {
        id: 'new-1',
        meterId: 'm-heat',
        date: '2026-01-31',
        value: { value: 1234.5, unit: 'kWh' },
        source: 'imported',
        boundary: 'end_of_day',
      },
      {
        id: 'new-2',
        meterId: 'm-water',
        date: '2026-01-31',
        value: { value: 12.5, unit: 'm3' },
        source: 'imported',
        boundary: 'end_of_day',
      },
    ])
  })

  it('erzeugt schemagültige Ablesungen und verändert die Eingabe nicht', () => {
    const data = dataWith(METERS, [existing('r-1', 'm-heat', '2025-12-31', 1)])
    const before = structuredClone(data)
    const plan = planMonthlyMeterReadings(data, {
      propertyId: P1,
      rows: [row('WMZ-001', '2026-01-31', 2)],
      createId: ids(),
      importedAt: '2026-02-01T08:00:00.000Z',
    })
    expect(plan.importedAt).toBe('2026-02-01T08:00:00.000Z')
    expect(plan.readings).toHaveLength(1)
    for (const reading of plan.readings)
      expect(meterReadingSchema.safeParse(reading).success).toBe(true)
    expect(data).toEqual(before)
    const merged = structuredClone(data)
    merged.billingData.meterReadings.push(...plan.readings)
    expect(appDataFileSchema.safeParse(merged).success).toBe(true)
    expect(plan.readings[0]).not.toHaveProperty('billingPeriodId')
  })

  it('verarbeitet das Ergebnis von parseMeterServiceCsv direkt', () => {
    const rows = parseMeterServiceCsv(
      [
        'Zählernummer;Ablesedatum;Zählerstand;Einheit',
        'WMZ-001;31.01.2026;1.234,5;kWh',
        'WW 002;2026-01-31;12,5;m3',
      ].join('\n'),
      {
        meterNumber: 'Zählernummer',
        date: 'Ablesedatum',
        value: 'Zählerstand',
        unit: 'Einheit',
      },
    )
    const plan = planMonthlyMeterReadings(dataWith(METERS), {
      propertyId: P1,
      rows,
      createId: ids(),
    })
    expect(plan.problems).toEqual([])
    expect(plan.readings.map((r) => r.value)).toEqual([
      { value: 1234.5, unit: 'kWh' },
      { value: 12.5, unit: 'm3' },
    ])
  })

  it('meldet unbekannte Zählernummern, auch bei Zählern fremder Objekte oder Arten', () => {
    const plan = planMonthlyMeterReadings(
      dataWith([
        ...METERS,
        meter('m-other', 'unit_heat', 'WMZ-999', P2),
        meter('m-general', 'general', 'STROM-1'),
        meter('m-central', 'heat', 'HEAT-1'),
        meter('m-nonumber', 'unit_heat', null),
      ]),
      {
        propertyId: P1,
        rows: [
          row('WMZ-999', '2026-01-31', 1),
          row('STROM-1', '2026-01-31', 1),
          row('HEAT-1', '2026-01-31', 1),
          row('UNBEKANNT', '2026-01-31', 1),
          row('WMZ-001', '2026-01-31', 5),
        ],
        createId: ids(),
      },
    )
    expect(plan.problems.map((p) => [p.row, p.code])).toEqual([
      [1, 'unknown_meter'],
      [2, 'unknown_meter'],
      [3, 'unknown_meter'],
      [4, 'unknown_meter'],
    ])
    expect(plan.problems[0]!.detail).toContain('WMZ-999')
    expect(plan.readings.map((r) => r.meterId)).toEqual(['m-heat'])
  })

  it('meldet mehrdeutige Zählernummern', () => {
    const plan = planMonthlyMeterReadings(
      dataWith([...METERS, meter('m-heat-dup', 'unit_heat', ' wmz-0 01 ')]),
      {
        propertyId: P1,
        rows: [row('WMZ-001', '2026-01-31', 5)],
        createId: ids(),
      },
    )
    expect(plan.readings).toEqual([])
    expect(plan.problems).toEqual([
      expect.objectContaining({ row: 1, code: 'ambiguous_meter' }),
    ])
  })

  it('meldet unpassende Einheiten', () => {
    const plan = planMonthlyMeterReadings(dataWith(METERS), {
      propertyId: P1,
      rows: [
        row('WMZ-001', '2026-01-31', 5, 'm3'),
        row('WW 002', '2026-01-31', 5, 'kWh'),
        row('WMZ-001', '2026-01-31', 5, 'einheiten'),
      ],
      createId: ids(),
    })
    expect(plan.readings).toEqual([])
    expect(plan.problems.map((p) => p.code)).toEqual([
      'unit_mismatch',
      'unit_mismatch',
      'unit_mismatch',
    ])
  })

  it('überspringt vorhandene gleiche Stände und meldet abweichende', () => {
    const plan = planMonthlyMeterReadings(
      dataWith(METERS, [
        existing('r-1', 'm-heat', '2026-01-31', 100),
        existing('r-2', 'm-water', '2026-01-31', 7, 'm3'),
      ]),
      {
        propertyId: P1,
        rows: [
          row('WMZ-001', '2026-01-31', 100),
          row('WW 002', '2026-01-31', 8, 'm3'),
        ],
        createId: ids(),
      },
    )
    expect(plan.readings).toEqual([])
    expect(plan.skippedDuplicates).toEqual([
      {
        row: 1,
        meterId: 'm-heat',
        date: '2026-01-31',
        duplicateOf: 'existing',
      },
    ])
    expect(plan.problems).toEqual([
      expect.objectContaining({ row: 2, code: 'conflicting_reading' }),
    ])
    expect(plan.problems[0]!.detail).not.toContain('8')
  })

  it('behandelt Dubletten innerhalb der CSV', () => {
    const plan = planMonthlyMeterReadings(dataWith(METERS), {
      propertyId: P1,
      rows: [
        row('WMZ-001', '2026-01-31', 100),
        row('wmz-001', '2026-01-31', 100),
        row('WW 002', '2026-01-31', 5, 'm3'),
        row('WW 002', '2026-01-31', 6, 'm3'),
      ],
      createId: ids(),
    })
    expect(plan.readings).toEqual([
      expect.objectContaining({ id: 'new-1', meterId: 'm-heat' }),
    ])
    expect(plan.skippedDuplicates).toEqual([
      { row: 2, meterId: 'm-heat', date: '2026-01-31', duplicateOf: 'file' },
    ])
    expect(plan.problems.map((p) => [p.row, p.code])).toEqual([
      [3, 'conflicting_reading'],
      [4, 'conflicting_reading'],
    ])
  })

  it('meldet fallende Stände gegenüber vorhandenen und importierten Ständen', () => {
    const plan = planMonthlyMeterReadings(
      dataWith(METERS, [
        existing('r-1', 'm-heat', '2025-12-31', 100),
        existing('r-2', 'm-heat', '2026-06-30', 500),
        existing('r-3', 'm-heat', null, 1000),
        existing('r-4', 'm-water', '2025-12-31', 10, 'm3'),
      ]),
      {
        propertyId: P1,
        rows: [
          row('WMZ-001', '2026-02-28', 90), // fällt gegenüber Januar (CSV)
          row('WMZ-001', '2026-01-31', 120),
          row('WMZ-001', '2026-03-31', 130),
          row('WW 002', '2026-01-31', 9, 'm3'), // fällt gegenüber Bestand
          row('WMZ-001', '2025-11-30', 1), // vor allen Ständen: zulässig
        ],
        createId: ids(),
      },
    )
    expect(plan.problems.map((p) => [p.row, p.code])).toEqual([
      [1, 'decreasing_reading'],
      [4, 'decreasing_reading'],
    ])
    expect(plan.readings.map((r) => [r.date, r.value.value])).toEqual([
      ['2026-01-31', 120],
      ['2026-03-31', 130],
      ['2025-11-30', 1],
    ])
    expect(plan.readings.map((r) => r.id)).toEqual(['new-1', 'new-2', 'new-3'])
  })

  it('meldet Stände über einem späteren vorhandenen Stand', () => {
    const plan = planMonthlyMeterReadings(
      dataWith(METERS, [existing('r-1', 'm-heat', '2026-03-31', 200)]),
      {
        propertyId: P1,
        rows: [
          row('WMZ-001', '2026-01-31', 150),
          row('WMZ-001', '2026-02-28', 250),
        ],
        createId: ids(),
      },
    )
    expect(plan.problems).toEqual([
      expect.objectContaining({ row: 2, code: 'decreasing_reading' }),
    ])
    expect(plan.problems[0]!.detail).toContain('2026-03-31')
    expect(plan.readings.map((r) => r.date)).toEqual(['2026-01-31'])
  })

  it('meldet ungültige erzeugte Ablesungen (z. B. leere ID)', () => {
    const plan = planMonthlyMeterReadings(dataWith(METERS), {
      propertyId: P1,
      rows: [row('WMZ-001', '2026-01-31', 1)],
      createId: () => '',
    })
    expect(plan.readings).toEqual([])
    expect(plan.problems).toEqual([
      expect.objectContaining({ row: 1, code: 'invalid_reading' }),
    ])
  })

  it('liefert ohne Zeilen einen leeren Plan', () => {
    expect(
      planMonthlyMeterReadings(dataWith(METERS), {
        propertyId: P1,
        rows: [],
        createId: ids(),
      }),
    ).toEqual({
      readings: [],
      skippedDuplicates: [],
      problems: [],
      importedAt: null,
    })
  })
})
