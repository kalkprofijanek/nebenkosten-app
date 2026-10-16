import { describe, expect, it } from 'vitest'
import {
  buildAiCostEntries,
  parseAiCostCsv,
  parseMeterServiceCsv,
} from '../src'
import type { CostCategory } from '@nebenkosten/schema'

const header =
  'Kostenart;Belegdatum;Leistung von;Leistung bis;Beschreibung;Belegnummer;Betrag brutto EUR;Umlagefaehig Prozent;Lohnanteil EUR;Lieferant;Begruendung;Rueckfrage'
const csv = `${header}\nReinigung;20.01.2025;01.01.2025;31.01.2025;"Treppenhaus; Januar";R-1;95,20;100;80,00;Firma;§ 2 Nr. 9;`
const categories: CostCategory[] = [
  {
    id: 'clean',
    billingPeriodId: 'period',
    kind: 'operating',
    label: 'Reinigung',
    laborSharePercent: (80 / 95.2) * 100,
  },
]
const ids = () => '12345678-1234-4123-8123-123456789012'

describe('KI-Erfassungsliste', () => {
  it('liest das dokumentierte Format einschließlich Zusatzangaben ohne Mutation', () => {
    const rows = parseAiCostCsv(`\uFEFF${csv}\r\n`)
    expect(rows[0]).toMatchObject({
      amountCents: 9520,
      laborAmountCents: 8000,
      serviceFrom: '2025-01-01',
      description: 'Treppenhaus; Januar',
    })
    const entries = buildAiCostEntries(rows, categories, ids)
    expect(entries[0]).toMatchObject({
      costCategoryId: 'clean',
      amountCents: 9520,
      receiptReference: 'R-1',
      allocablePercent: 100,
    })
    expect(entries[0]!.description).toContain('2025-01-01 – 2025-01-31')
    expect(entries[0]!.description).toContain('Firma')
    expect(rows[0]!.description).toBe('Treppenhaus; Januar')
  })
  it.each([
    ['', 'leer'],
    [csv.replace('95,20', '9,999'), 'Betrag'],
    [csv.replace('20.01.2025', '31.02.2025'), 'Datum'],
    [csv.replace('100;80,00', '101;80,00'), 'Prozent'],
    [csv.replace('31.01.2025', '31.12.2024'), 'Leistungszeitraum'],
    [csv + '"', 'Anführungszeichen'],
    [csv.replace('Kostenart;', 'Sonstiges;'), 'Spalten'],
    [csv.replace('95,20', '99999999999999999999'), 'Betrag'],
    [csv.replace('80,00', '96,00'), 'Lohnanteil'],
  ])('weist ungültige CSV zurück', (text, message) => {
    expect(() => parseAiCostCsv(text)).toThrow(message)
  })
  it('blockiert Rückfragen, fehlende oder mehrdeutige Zuordnung und abweichende Lohnanteile', () => {
    const rows = parseAiCostCsv(csv)
    expect(() => buildAiCostEntries(rows, [], ids)).toThrow('Kostenart')
    expect(() =>
      buildAiCostEntries(
        rows,
        [...categories, { ...categories[0]!, id: 'other' }],
        ids,
      ),
    ).toThrow('Kostenart')
    expect(() =>
      buildAiCostEntries(
        rows,
        [{ ...categories[0]!, laborSharePercent: 0 }],
        ids,
      ),
    ).toThrow('Lohnanteil')
    expect(() =>
      buildAiCostEntries(
        [{ ...rows[0]!, question: 'Bitte prüfen' }],
        categories,
        ids,
      ),
    ).toThrow('Rückfrage')
  })
  it('erhält nullfähige Angaben und negative Korrekturen', () => {
    const rows = parseAiCostCsv(
      `${header}\nReinigung;;;;Korrektur;;-0,01;0;;;;`,
    )
    expect(rows[0]!.amountCents).toBe(-1)
    expect(buildAiCostEntries(rows, categories, ids)[0]).toMatchObject({
      amountCents: -1,
      allocablePercent: 0,
    })
  })
  it('liest maskierte Anführungszeichen, umsortierte Spalten und optionale Werte', () => {
    const row = parseAiCostCsv(
      `${header}\nReinigung;;;;"Text ""Zitat""";;0;0;0;;;`,
    )
    expect(row[0]!.description).toBe('Text "Zitat"')
    expect(
      buildAiCostEntries(
        row,
        [{ ...categories[0]!, laborSharePercent: 0 }],
        ids,
      )[0]!.amountCents,
    ).toBe(0)
    const reversed =
      header.split(';').reverse().join(';') +
      '\n' +
      'Reinigung;;;;Test;;0;0;;;;'.split(';').reverse().join(';')
    expect(parseAiCostCsv(reversed)[0]!.amountCents).toBe(0)
  })
  it.each([
    `${header}\n;2025-01-01;;;Test;;1,00;;;;;`,
    `${header}\nReinigung;;2025-01-01;;;;1,00;;;;;`,
    `${header}\nReinigung;;;;Test;;1,00;Infinity;;;;`,
    `${header}\nReinigung;;;;Test;;1,00;;-0,01;;;`,
    `${header}\nReinigung;;;;Test;;1,00;;;;;extra;`,
    `${header}\nReinigung;;;;"Text"x;;1,00;;;;;`,
    `${header}\nReinigung;;;;Text";;1,00;;;;;`,
    `${header}\nReinigung;;;;${'x'.repeat(10001)};;1,00;;;;;`,
    'x'.repeat(5 * 1024 * 1024 + 1),
    'A;A\n1;2',
    'A\n1\0',
    header,
    Array.from({ length: 65 }, (_, i) => String(i)).join(';') +
      '\n' +
      Array(65).fill('1').join(';'),
    `${header}\n${Array(1001).fill('Reinigung;;;;Test;;1,00;;;;;').join('\n')}`,
  ])('begrenzt und validiert Eingaben', (text) => {
    expect(() => parseAiCostCsv(text)).toThrow()
  })
  it('weist doppelt generierte IDs zurück', () => {
    const rows = parseAiCostCsv(csv)
    expect(() =>
      buildAiCostEntries([rows[0]!, rows[0]!], categories, ids),
    ).toThrow('Doppelte ID')
  })
})

describe('Messdienst-Export', () => {
  it('liest explizite Spalten und Einheiten als technische Ablesungen', () => {
    expect(
      parseMeterServiceCsv(
        'Zählernummer;Ablesedatum;Zählerstand;Einheit\nTEST-1;31.01.2026;1.234,5;kWh',
        {
          meterNumber: 'Zählernummer',
          date: 'Ablesedatum',
          value: 'Zählerstand',
          unit: 'Einheit',
        },
      ),
    ).toEqual([
      { meterNumber: 'TEST-1', date: '2026-01-31', value: 1234.5, unit: 'kWh' },
    ])
  })
  it.each(['-1', 'NaN', '1,2,3'])('weist ungültige Stände zurück', (value) => {
    expect(() =>
      parseMeterServiceCsv(`M;D;V;U\nTEST;2026-01-31;${value};kWh`, {
        meterNumber: 'M',
        date: 'D',
        value: 'V',
        unit: 'U',
      }),
    ).toThrow('Zählerstand')
  })
  it('weist unbekannte Einheiten und fehlende Spalten zurück', () => {
    expect(() =>
      parseMeterServiceCsv('M;D;V;U\nTEST;2026-01-31;1;MWh', {
        meterNumber: 'M',
        date: 'D',
        value: 'V',
        unit: 'U',
      }),
    ).toThrow('Einheit')
    expect(() =>
      parseMeterServiceCsv('M;D;V;U\nTEST;2026-01-31;1;kWh', {
        meterNumber: 'X',
        date: 'D',
        value: 'V',
        unit: 'U',
      }),
    ).toThrow('Spalten')
  })
  it('liest Volumen und HKV-Werte, aber keine fehlenden Nummern oder unpräzisen Stände', () => {
    const columns = { meterNumber: 'M', date: 'D', value: 'V', unit: 'U' }
    expect(
      parseMeterServiceCsv(
        'M;D;V;U\nTEST;2026-01-31;0;m3\nTEST-2;2026-01-31;1;einheiten',
        columns,
      ),
    ).toHaveLength(2)
    expect(() =>
      parseMeterServiceCsv('M;D;V;U\n;2026-01-31;1;kWh', columns),
    ).toThrow('Zählernummer')
    expect(() =>
      parseMeterServiceCsv(
        'M;D;V;U\nTEST;2026-01-31;9999999999999999999999;kWh',
        columns,
      ),
    ).toThrow('Zählerstand')
    expect(() =>
      parseMeterServiceCsv('M;D;V;U\nTEST;2026-01-31;1;kWh', {
        ...columns,
        unit: 'V',
      }),
    ).toThrow('Spalten')
  })
})
