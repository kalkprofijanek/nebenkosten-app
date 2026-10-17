import {
  METER_SERVICE_HEADERS,
  parseMeterServiceRows,
} from '@nebenkosten/import-export'
import type { AppDataFile } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  createMeteredFixture,
  meteringId as id,
} from '../metering/metered-fixture'
import {
  importMeterReadings,
  MeterReadingImportError,
} from './meter-reading-import'

const PERIOD = id(10)
const columns = {
  meterNumber: 'Zaehlernummer',
  date: 'Ablesedatum',
  value: 'Zaehlerstand',
  unit: 'Einheit',
} as const

/** Fiktiver Bestand: Wärmemengenzähler mit Ablesungen 2026, Stromzähler ohne. */
function file(status: 'DRAFT' | 'FINALIZED' = 'DRAFT'): AppDataFile {
  const source = createMeteredFixture()
  return {
    ...source,
    masterData: {
      ...source.masterData,
      meters: [
        ...source.masterData.meters,
        {
          id: id(40),
          propertyId: id(3),
          kind: 'general',
          meterNumber: 'TEST-STROM-1',
        },
      ],
    },
    billingData: {
      ...source.billingData,
      billingPeriods: source.billingData.billingPeriods.map((period) => ({
        ...period,
        status,
      })),
    },
  }
}

function ids(): () => string {
  let n = 0
  return () => `98000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

function rows(...lines: string[]) {
  const parsed = parseMeterServiceRows(
    [METER_SERVICE_HEADERS.join(';'), ...lines].join('\n'),
    columns,
  )
  expect(parsed.issues).toEqual([])
  return parsed.rows
}

function issuesOf(run: () => unknown) {
  try {
    run()
  } catch (caught) {
    expect(caught).toBeInstanceOf(MeterReadingImportError)
    return (caught as MeterReadingImportError).issues
  }
  throw new Error('Import hätte scheitern müssen.')
}

describe('Zählerstände aus CSV übernehmen', () => {
  it('legt Ablesungen als „importiert“ an und setzt Stichtagsgrenzen', () => {
    const source = file()
    const result = importMeterReadings(
      source,
      PERIOD,
      rows(
        'TEST-STROM-1;31.12.2025;100;kWh',
        ' test-strom-1 ;30.06.2026;350,5;kWh',
        'TEST-STROM-1;31.12.2026;600;kWh',
      ),
      ids(),
    )
    const imported = result.file.billingData.meterReadings.filter(
      ({ meterId }) => meterId === id(40),
    )
    expect(imported).toEqual([
      {
        id: '98000000-0000-4000-8000-000000000001',
        meterId: id(40),
        billingPeriodId: PERIOD,
        date: '2025-12-31',
        boundary: 'end_of_day',
        value: { value: 100, unit: 'kWh' },
        source: 'imported',
      },
      {
        id: '98000000-0000-4000-8000-000000000002',
        meterId: id(40),
        billingPeriodId: PERIOD,
        date: '2026-06-30',
        value: { value: 350.5, unit: 'kWh' },
        source: 'imported',
      },
      {
        id: '98000000-0000-4000-8000-000000000003',
        meterId: id(40),
        billingPeriodId: PERIOD,
        date: '2026-12-31',
        boundary: 'end_of_day',
        value: { value: 600, unit: 'kWh' },
        source: 'imported',
      },
    ])
    expect(result.plan).toEqual([
      {
        line: 2,
        meterId: id(40),
        meterNumber: 'TEST-STROM-1',
        date: '2025-12-31',
        value: 100,
        unit: 'kWh',
        boundary: 'end_of_day',
      },
      {
        line: 3,
        meterId: id(40),
        meterNumber: 'TEST-STROM-1',
        date: '2026-06-30',
        value: 350.5,
        unit: 'kWh',
      },
      {
        line: 4,
        meterId: id(40),
        meterNumber: 'TEST-STROM-1',
        date: '2026-12-31',
        value: 600,
        unit: 'kWh',
        boundary: 'end_of_day',
      },
    ])
    expect(result.warnings).toEqual([])
    expect(source.billingData.meterReadings).toHaveLength(3)
  })

  it('setzt Jahresbeginn und Folgetag nach Jahresende als Tagesbeginn', () => {
    const result = importMeterReadings(
      file(),
      PERIOD,
      rows('TEST-STROM-1;01.01.2026;5;kWh', 'TEST-STROM-1;01.01.2027;10;kWh'),
      ids(),
    )
    expect(result.plan.map(({ boundary }) => boundary)).toEqual([
      'start_of_day',
      'start_of_day',
    ])
  })

  it('meldet jede fehlerhafte Zeile und übernimmt nichts', () => {
    const source = createMeteredFixture()
    const withTwin: AppDataFile = {
      ...file(),
      masterData: {
        ...file().masterData,
        meters: [
          ...file().masterData.meters,
          {
            id: id(41),
            propertyId: id(3),
            kind: 'general',
            meterNumber: 'TEST-DOPPELT',
          },
          {
            id: id(42),
            propertyId: id(3),
            kind: 'general',
            meterNumber: 'test-doppelt',
          },
        ],
      },
    }
    const issues = issuesOf(() =>
      importMeterReadings(
        withTwin,
        PERIOD,
        rows(
          'TEST-UNBEKANNT;30.06.2026;1;kWh',
          'TEST-DOPPELT;30.06.2026;1;kWh',
          'TEST-STROM-1;15.03.2025;1;kWh',
          'TEST-WMZ-1;30.06.2026;1500;kWh',
          'TEST-STROM-1;30.06.2026;5;kWh',
          'TEST-STROM-1;30.06.2026;6;kWh',
          'TEST-WMZ-1;30.09.2026;20;einheiten',
          'TEST-STROM-1;30.09.2026;7;m3',
        ),
        ids(),
      ),
    )
    expect(issues).toEqual([
      {
        line: 2,
        message:
          'Zähler „TEST-UNBEKANNT“ ist nicht angelegt; bitte zuerst unter Heizung › Zähler anlegen.',
      },
      {
        line: 3,
        message:
          'Zählernummer „TEST-DOPPELT“ ist mehrfach angelegt; bitte Zählernummern eindeutig machen.',
      },
      {
        line: 4,
        message: 'Das Ablesedatum liegt außerhalb des Abrechnungszeitraums.',
      },
      {
        line: 5,
        message:
          'Für Zähler „TEST-WMZ-1“ gibt es am 30.06.2026 bereits eine Ablesung; sie wird nicht überschrieben.',
      },
      {
        line: 7,
        message:
          'Zähler „TEST-STROM-1“ steht für den 30.06.2026 mehrfach in der Datei (zuerst Zeile 6).',
      },
      {
        line: 8,
        message: 'Wohnungswärmezähler „TEST-WMZ-1“ werden in kWh abgelesen.',
      },
      {
        line: 9,
        message:
          'Einheit m3 passt nicht zu den übrigen Ablesungen von „TEST-STROM-1“ (kWh).',
      },
    ])
    expect(source.billingData.meterReadings).toHaveLength(3)
  })

  it('zeigt Hinweise der Plausibilitätsprüfung (PR-31), ohne Werte zu ändern', () => {
    const result = importMeterReadings(
      file(),
      PERIOD,
      rows(
        'TEST-STROM-1;31.12.2025;500;kWh',
        'TEST-STROM-1;31.12.2026;400;kWh',
      ),
      ids(),
    )
    expect(result.warnings.map(({ code }) => code)).toContain(
      'heating.meter_reading_series_decreasing',
    )
    expect(
      result.warnings.every(({ severity }) => severity === 'warning'),
    ).toBe(true)
    expect(
      result.file.billingData.meterReadings
        .filter(({ meterId }) => meterId === id(40))
        .map(({ value }) => value.value),
    ).toEqual([500, 400])
  })

  it('lehnt leere Listen, unbekannte Jahre und freigegebene Jahre ab', () => {
    expect(issuesOf(() => importMeterReadings(file(), PERIOD, []))).toEqual([
      { line: 1, message: 'Die Datei enthält keine Zählerstände.' },
    ])
    expect(
      issuesOf(() =>
        importMeterReadings(
          file(),
          'unbekannt',
          rows('TEST-STROM-1;30.06.2026;1;kWh'),
        ),
      ),
    ).toEqual([{ line: 1, message: 'Abrechnungsjahr wurde nicht gefunden.' }])
    expect(() =>
      importMeterReadings(
        file('FINALIZED'),
        PERIOD,
        rows('TEST-STROM-1;30.06.2026;1;kWh'),
        ids(),
      ),
    ).toThrow()
  })

  it('fasst mehrere Fehler in der Meldung zusammen', () => {
    expect(() =>
      importMeterReadings(
        file(),
        PERIOD,
        rows('TEST-X;30.06.2026;1;kWh', 'TEST-Y;30.06.2026;1;kWh'),
      ),
    ).toThrow('2 Zeilen der Zählerstandsliste müssen korrigiert werden.')
  })
})
