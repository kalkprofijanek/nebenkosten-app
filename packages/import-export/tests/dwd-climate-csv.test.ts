import { describe, expect, it } from 'vitest'
import { CsvImportError, parseDwdClimateCsv } from '../src/index'

const header = 'DatAnf;DatEnd;PLZ;KF'
const line = '20250101;20251231;12345;1.14'

describe('DWD-Klimafaktor-CSV', () => {
  it('übernimmt Zeitraum, Dezimalpunkt und die Quellenangabe', () => {
    const result = parseDwdClimateCsv(`${header}\n${line}`)
    expect(result.periodStart).toBe('2025-01-01')
    expect(result.periodEnd).toBe('2025-12-31')
    expect(result.source).toBe('Deutscher Wetterdienst')
    expect([...result.factors]).toEqual([['12345', 1.14]])
  })

  it('liest die KF_k-Variante mit Dezimalkomma und ergänzt führende Nullen', () => {
    const result = parseDwdClimateCsv(
      '\uFEFFDatAnf;DatEnd;PLZ;KF_k\r\n20240201;20250131;1234;0,91\r\n',
    )
    expect([...result.factors]).toEqual([['01234', 0.91]])
    expect(result.periodStart).toBe('2024-02-01')
  })

  it('verarbeitet eine landesweite Liste statt der 1000-Zeilen-Grenze für Kostenimporte', () => {
    const rows = Array.from(
      { length: 8234 },
      (_, index) => `20250101;20251231;${String(index).padStart(5, '0')};1.01`,
    )
    expect(
      parseDwdClimateCsv(`${header}\n${rows.join('\n')}`).factors.size,
    ).toBe(8234)
  })

  it.each([
    ['unbekannte Kopfzeile', `Start;Ende;PLZ;KF\n${line}`],
    ['abweichende Reihenfolge', `PLZ;DatAnf;DatEnd;KF\n${line}`],
    ['mehrere Zeiträume', `${header}\n${line}\n20240101;20241231;54321;1.1`],
    ['doppelte PLZ', `${header}\n${line}\n20250101;20251231;12345;1.2`],
    [
      'doppelte ergänzte PLZ',
      `${header}\n20250101;20251231;1234;1.1\n20250101;20251231;01234;1.2`,
    ],
    ['ungültiges Datum', `${header}\n20250229;20251231;12345;1.1`],
    ['falsches Datumsformat', `${header}\n2025-01-01;20251231;12345;1.1`],
    ['umgekehrter Zeitraum', `${header}\n20251231;20250101;12345;1.1`],
    ['ungültige PLZ', `${header}\n20250101;20251231;123456;1.1`],
    ['nichtnumerische PLZ', `${header}\n20250101;20251231;ABCDE;1.1`],
    ['fehlender Faktor', `${header}\n20250101;20251231;12345;`],
    ['Faktor null', `${header}\n20250101;20251231;12345;0`],
    ['negativer Faktor', `${header}\n20250101;20251231;12345;-1`],
    [
      'nicht endlicher Faktor',
      `${header}\n20250101;20251231;12345;${'9'.repeat(310)}`,
    ],
    ['falsches Dezimalzeichen', `${header}\n20250101;20251231;12345;1,1`],
    ['Spalten fehlen', `${header}\n20250101;20251231;12345`],
  ])('weist %s zurück', (_reason, csv) => {
    expect(() => parseDwdClimateCsv(csv)).toThrow(CsvImportError)
  })

  it('begrenzt auch DWD-Listen auf 10000 Datenzeilen', () => {
    expect(() =>
      parseDwdClimateCsv(`${header}\n${`${line}\n`.repeat(10001)}`),
    ).toThrow('zu viele Zeilen')
  })
})
