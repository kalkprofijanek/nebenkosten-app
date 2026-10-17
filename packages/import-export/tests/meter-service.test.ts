import { describe, expect, it } from 'vitest'
import {
  CsvImportError,
  METER_SERVICE_HEADERS,
  METER_SERVICE_TEMPLATE,
  parseMeterServiceRows,
  readMeterServiceHeader,
  suggestMeterServiceColumns,
} from '../src'

const columns = {
  meterNumber: 'Zaehlernummer',
  date: 'Ablesedatum',
  value: 'Zaehlerstand',
  unit: 'Einheit',
} as const

function csv(...rows: string[]) {
  return [METER_SERVICE_HEADERS.join(';'), ...rows].join('\n')
}

describe('Zählerstände aus Ablesebogen/Messdienst (CSV)', () => {
  it('liest die eigene Vorlage mit der vorgeschlagenen Zuordnung', () => {
    const header = readMeterServiceHeader(METER_SERVICE_TEMPLATE)
    expect(header).toEqual([...METER_SERVICE_HEADERS])
    expect(suggestMeterServiceColumns(header)).toEqual(columns)
    const result = parseMeterServiceRows(METER_SERVICE_TEMPLATE, columns)
    expect(result.issues).toEqual([])
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows[0]).toMatchObject({ line: 2 })
  })

  it('liefert Zeilennummern, Stände, Datum und Einheit', () => {
    expect(
      parseMeterServiceRows(
        csv('TEST-1;31.12.2025;1.234,5;kWh', ' TEST-2 ;2026-01-31;0;m3'),
        columns,
      ),
    ).toEqual({
      rows: [
        {
          line: 2,
          meterNumber: 'TEST-1',
          date: '2025-12-31',
          value: 1234.5,
          unit: 'kWh',
        },
        {
          line: 3,
          meterNumber: 'TEST-2',
          date: '2026-01-31',
          value: 0,
          unit: 'm3',
        },
      ],
      issues: [],
    })
  })

  it('sammelt Fehler je Zeile statt beim ersten abzubrechen', () => {
    const result = parseMeterServiceRows(
      csv(
        ';31.12.2025;1;kWh',
        'TEST-1;31.02.2025;1;kWh',
        'TEST-1;31.12.2025;-1;kWh',
        'TEST-1;31.12.2025;abc;kWh',
        'TEST-1;31.12.2025;1;MWh',
        'TEST-1;31.12.2025;9999999999999999999999;kWh',
        'TEST-1;31.12.2025;5;einheiten',
      ),
      columns,
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.line).toBe(8)
    expect(result.issues).toEqual([
      { line: 2, message: 'Zählernummer fehlt.' },
      {
        line: 3,
        message: 'Ablesedatum ist ungültig (TT.MM.JJJJ erwartet).',
      },
      { line: 4, message: 'Zählerstand darf nicht negativ sein.' },
      { line: 5, message: 'Zählerstand ist keine Zahl.' },
      {
        line: 6,
        message: 'Einheit „MWh“ ist unbekannt (kWh, m3 oder einheiten).',
      },
      { line: 7, message: 'Zählerstand ist zu groß.' },
    ])
  })

  it('bricht nur bei fehlender oder doppelter Spaltenzuordnung ganz ab', () => {
    expect(() =>
      parseMeterServiceRows(csv('TEST;31.12.2025;1;kWh'), {
        ...columns,
        unit: 'Zaehlerstand',
      }),
    ).toThrow(CsvImportError)
    expect(() =>
      parseMeterServiceRows(csv('TEST;31.12.2025;1;kWh'), {
        ...columns,
        date: 'Datum',
      }),
    ).toThrow('„Datum“ fehlt')
  })

  it('schlägt Spalten nur bei eindeutigem Treffer vor', () => {
    expect(
      suggestMeterServiceColumns([
        'Gerätenummer',
        'Ablesedatum',
        'Zählerstand',
        'Einheit',
        'Bemerkung',
      ]),
    ).toEqual({
      meterNumber: 'Gerätenummer',
      date: 'Ablesedatum',
      value: 'Zählerstand',
      unit: 'Einheit',
    })
    expect(
      suggestMeterServiceColumns([
        'Zählernummer',
        'Stichtag Datum',
        'Ablesedatum',
        'Wert',
      ]),
    ).toEqual({ meterNumber: 'Zählernummer', value: 'Wert' })
    expect(suggestMeterServiceColumns(['A', 'B'])).toEqual({})
  })

  it('liest die Kopfzeile auch fremder Messdienst-Dateien', () => {
    expect(
      readMeterServiceHeader(
        '\uFEFFNr;Datum;Stand;Einh.\r\nX;31.12.2025;1;kWh',
      ),
    ).toEqual(['Nr', 'Datum', 'Stand', 'Einh.'])
    expect(() => readMeterServiceHeader('Nr;Datum')).toThrow(CsvImportError)
  })

  it('enthält in der Vorlage nur fiktive Testnummern', () => {
    expect(METER_SERVICE_TEMPLATE).toMatch(/^Zaehlernummer;/u)
    for (const line of METER_SERVICE_TEMPLATE.trim().split('\r\n').slice(1))
      expect(line).toMatch(/^TEST-/u)
  })
})
