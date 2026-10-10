import { describe, expect, it } from 'vitest'
import {
  climateFactorFromDwdList,
  CsvImportError,
  DWD_CLIMATE_FACTOR_SOURCE,
  parseDwdClimateFactorCsv,
} from '../src'

// Erfundene Zeilen im Format der DWD-Liste (ADR-0005), keine Originalwerte.
const header = 'DatAnf;DatEnd;PLZ;KF'
const rows = [
  '20250101;20251231;1067;1.05',
  '20250101;20251231;12345;0.92',
  '20250101;20251231;99999;1.2',
]
const csv = [header, ...rows].join('\n') + '\n'

describe('DWD-Klimafaktoren', () => {
  it('liest Zeitraum und Faktoren und füllt Postleitzahlen auf fünf Stellen auf', () => {
    const list = parseDwdClimateFactorCsv(csv)
    expect(list.periodStart).toBe('2025-01-01')
    expect(list.periodEnd).toBe('2025-12-31')
    expect([...list.factors]).toEqual([
      ['01067', 1.05],
      ['12345', 0.92],
      ['99999', 1.2],
    ])
  })

  it('liest die Variante mit Dezimalkomma, BOM und CRLF', () => {
    const text = `\uFEFFDatAnf;DatEnd;PLZ;KF_k\r\n20250101;20251231;1067;1,05\r\n20250101;20251231;12345;0,92\r\n`
    const list = parseDwdClimateFactorCsv(text)
    expect(list.factors.get('01067')).toBe(1.05)
    expect(list.factors.get('12345')).toBe(0.92)
  })

  it('verarbeitet Listen mit mehr als 1.000 Zeilen', () => {
    const many = Array.from(
      { length: 8_300 },
      (_, index) => `20250101;20251231;${10000 + index};1.01`,
    )
    const list = parseDwdClimateFactorCsv([header, ...many].join('\n'))
    expect(list.factors.size).toBe(8_300)
  })

  it.each([
    ['', 'leer'],
    ['DatAnf;DatEnd;PLZ;Faktor\n20250101;20251231;12345;1.0', 'Kopfzeile'],
    ['PLZ;KF\n12345;1.0', 'Kopfzeile'],
    [header, 'keine Datenzeilen'],
    [
      `${header}\n20250101;20251231;12345;1.0\n20250201;20260131;23456;1.0`,
      'mehrere Zeiträume',
    ],
    [
      `${header}\n20250101;20251231;1067;1.0\n20250101;20251231;01067;1.1`,
      'doppelt',
    ],
    [`${header}\n20250101;20251231;12345;0`, 'größer als 0'],
    [`${header}\n20250101;20251231;12345;-0.5`, 'größer als 0'],
    [`${header}\n20250101;20251231;12345;1,05`, 'Klimafaktor'],
    [`${header}\n20250101;20251231;123;1.0`, 'Postleitzahl'],
    [`${header}\n20250101;20251231;12345`, 'vier Spalten'],
    [`${header}\n20250231;20251231;12345;1.0`, 'Datum'],
    [`${header}\n2025-01-01;20251231;12345;1.0`, 'Datum'],
    [`${header}\n20251231;20250101;12345;1.0`, 'endet vor'],
    ['DatAnf;DatEnd;PLZ;KF_k\n20250101;20251231;12345;1.05', 'Klimafaktor'],
  ])('weist ungültige Listen zurück (%#)', (text, message) => {
    expect(() => parseDwdClimateFactorCsv(text)).toThrow(CsvImportError)
    expect(() => parseDwdClimateFactorCsv(text)).toThrow(message)
  })

  it('weist zu große Dateien und zu viele Zeilen zurück', () => {
    expect(() =>
      parseDwdClimateFactorCsv(`${header}\n${'x'.repeat(2 * 1024 * 1024)}`),
    ).toThrow('2 MB')
    const many = Array.from(
      { length: 20_001 },
      (_, index) => `20250101;20251231;${10000 + index};1.01`,
    )
    expect(() =>
      parseDwdClimateFactorCsv([header, ...many].join('\n')),
    ).toThrow('zu viele Zeilen')
  })

  it('liefert den Klimafaktor für eine Postleitzahl', () => {
    const list = parseDwdClimateFactorCsv(csv)
    expect(climateFactorFromDwdList(list, '01067')).toEqual({
      postalCode: '01067',
      factor: 1.05,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      source: DWD_CLIMATE_FACTOR_SOURCE,
    })
    expect(climateFactorFromDwdList(list, ' 12345 ', 'DWD')?.source).toBe('DWD')
    expect(climateFactorFromDwdList(list, '54321')).toBeNull()
    expect(climateFactorFromDwdList(list, '1067')).toBeNull()
  })
})
