import { createEmptyAppDataFile, type Meter } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import {
  METER_SERVICE_HEADERS,
  parseMeterServiceCsv,
  parseMeterServiceRows,
  parseTenantListCsv,
  planMonthlyMeterReadings,
  TENANT_LIST_HEADERS,
} from '../src'
import { csvCents, csvTableWithLines, decimalText } from '../src/csv/table'

// PR-51: ausschließlich fiktive Zählernummern und Werte.
const columns = {
  meterNumber: 'Zaehlernummer',
  date: 'Ablesedatum',
  value: 'Zaehlerstand',
  unit: 'Einheit',
} as const

const meterCsv = (...rows: string[]) =>
  [METER_SERVICE_HEADERS.join(';'), ...rows].join('\n')
const tenantCsv = (...rows: string[]) =>
  [TENANT_LIST_HEADERS.join(';'), ...rows].join('\n')

describe('Dezimaltrennzeichen (E-51-1)', () => {
  it('liest mit Komma (Vorgabe) deutsche Tausenderpunkte', () => {
    expect(decimalText('12.345')).toBe('12345')
    expect(decimalText('1.234,5')).toBe('1234.5')
  })

  it('liest mit Punkt Dezimalstellen statt Tausender', () => {
    expect(decimalText('12.345', 'dot')).toBe('12.345')
    expect(decimalText('1,234.5', 'dot')).toBe('1234.5')
    expect(() => decimalText('12,345,6', 'dot')).toThrow()
    expect(() => decimalText('1.234,5', 'dot')).toThrow()
  })

  it('wendet die Wahl beim Messdienst-Import an', () => {
    const text = meterCsv('TEST-W-1;31.12.2025;12.345;m3')
    expect(parseMeterServiceCsv(text, columns)[0]!.value).toBe(12345)
    expect(
      parseMeterServiceCsv(text, { ...columns, decimalSeparator: 'dot' })[0]!
        .value,
    ).toBe(12.345)
  })
})

describe('Zahlen und Zeilen', () => {
  it('liefert für -0 Cent den Wert 0 ohne Vorzeichen', () => {
    expect(Object.is(csvCents('-0'), 0)).toBe(true)
    expect(csvCents('-1,50')).toBe(-150)
  })

  it('zählt Leerzeilen und mehrzeilige Zellen bei den Zeilennummern mit', () => {
    const { lines } = csvTableWithLines('a;b\n\n1;2\r\n"x\ny";3\n\n\n4;5')
    expect(lines).toEqual([1, 3, 4, 8])
  })

  it('meldet Fehler im Messdienst-Import mit der Zeile der Datei', () => {
    const result = parseMeterServiceRows(
      meterCsv('', 'TEST-1;31.12.2025;1,0;kWh', '', 'TEST-2;kein Datum;1;kWh'),
      columns,
    )
    expect(result.rows[0]!.line).toBe(3)
    expect(result.issues).toEqual([
      { line: 5, message: expect.stringContaining('Ablesedatum') },
    ])
  })

  it('meldet Fehler in der Mieterliste mit der Zeile der Datei', () => {
    const result = parseTenantListCsv(
      tenantCsv('', '', 'Haus A;WE 1;;60;;Test;;;;0x1F;;;'),
    )
    expect(result.issues).toEqual([
      { line: 4, message: expect.stringContaining('Personen') },
    ])
  })
})

describe('Personenzahl (E-51-2)', () => {
  it.each(['0x1F', '1e3', '2,5', '2.5', '-0', '-1', '21', ' 3a'])(
    'lehnt %j ab',
    (value) => {
      const result = parseTenantListCsv(
        tenantCsv(`Haus A;WE 1;;60;;Test;;;;${value};;;`),
      )
      expect(result.issues[0]?.message).toMatch(/ganze Zahl von 0 bis 20/u)
    },
  )

  it.each([
    ['0', 0],
    ['3', 3],
    ['20', 20],
  ])('übernimmt %j', (value, expected) => {
    const result = parseTenantListCsv(
      tenantCsv(`Haus A;WE 1;;60;;Test;;;;${value};;;ja`),
    )
    expect(result.issues).toEqual([])
    expect(result.rows[0]).toMatchObject({ tenant: { persons: expected } })
  })
})

describe('Gültigkeit des Zählers bei Monatsständen', () => {
  const meter: Meter = {
    id: 'meter-1',
    propertyId: 'prop-1',
    kind: 'unit_heat',
    meterNumber: 'TEST-WMZ-1',
    validFrom: '2025-03-01',
    validTo: '2025-10-31',
  }
  const data = createEmptyAppDataFile()
  data.masterData.meters = [meter]
  const plan = (date: string) =>
    planMonthlyMeterReadings(data, {
      propertyId: 'prop-1',
      rows: [{ meterNumber: 'TEST-WMZ-1', date, value: 10, unit: 'kWh' }],
      createId: () => 'id-1',
    })

  it.each(['2025-02-28', '2025-11-01'])(
    'meldet eine Ablesung am %s außerhalb der Einbauzeit',
    (date) => {
      expect(plan(date).problems).toEqual([
        expect.objectContaining({ code: 'outside_meter_validity', row: 1 }),
      ])
    },
  )

  it('übernimmt Ablesungen innerhalb der Einbauzeit', () => {
    expect(plan('2025-03-01').problems).toEqual([])
    expect(plan('2025-10-31').problems).toEqual([])
  })
})
