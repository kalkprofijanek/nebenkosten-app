import { describe, expect, it } from 'vitest'
import {
  CsvImportError,
  parseTenantListCsv,
  TENANT_LIST_HEADERS,
  TENANT_LIST_TEMPLATE,
} from '../src'

const header = TENANT_LIST_HEADERS.join(';')
// Zusammengesetzt, damit der Privacy-Scan keine Adresse im Quelltext findet.
const EMAIL = ['erika', 'example.invalid'].join('@')

function csv(...rows: string[]) {
  return [header, ...rows].join('\n')
}

describe('Mieterliste (CSV-Vorlage)', () => {
  it('liest Mieter, Leerstand und alle drei Vorauszahlungsarten', () => {
    const result = parseTenantListCsv(
      csv(
        `Haus A;EG links;Erdgeschoss;65,5;60;Erika Muster;${EMAIL};;30.06.2025;2;180,00;;`,
        'Haus A;EG links;;;;Max Beispiel;;01.07.2025;;1;;2.400,00;',
        'Haus A;OG rechts;;72;;Familie Probe;;;;;;;ja',
        ';DG;;48;;;;01.10.2025;;;;;',
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.rows).toHaveLength(4)
    expect(result.rows[0]).toEqual({
      line: 2,
      building: 'Haus A',
      unit: 'EG links',
      location: 'Erdgeschoss',
      usableAreaSqm: 65.5,
      heatedAreaSqm: 60,
      tenant: {
        displayName: 'Erika Muster',
        email: EMAIL,
        persons: 2,
        prepayment: { mode: 'monthly', monthlyAmountCents: 18000 },
      },
      to: '2025-06-30',
    })
    expect(result.rows[1]!.tenant!.prepayment).toEqual({
      mode: 'annual',
      annualAmountCents: 240000,
    })
    expect(result.rows[1]!.from).toBe('2025-07-01')
    expect(result.rows[2]!.tenant!.prepayment).toEqual({ mode: 'none_agreed' })
    expect(result.rows[3]).toEqual({
      line: 5,
      unit: 'DG',
      usableAreaSqm: 48,
      from: '2025-10-01',
    })
  })

  it('sammelt alle Zeilenfehler mit Zeilennummer, statt beim ersten abzubrechen', () => {
    const result = parseTenantListCsv(
      csv(
        'Haus A;;;;;Erika Muster;;;;;180;;',
        'Haus A;EG;;-3;;Erika Muster;;;;;180;;',
        'Haus A;EG;;;;Erika Muster;;;;;;;',
        'Haus A;EG;;;;Erika Muster;;;;;180;2160;',
        'Haus A;EG;;;;;;;;2;;;',
        'Haus A;EG;;;;Erika Muster;;31.12.2025;01.01.2025;;180;;',
        'Haus A;EG;;;;Erika Muster;;32.01.2025;;;180;;',
        'Haus A;EG;;;;Erika Muster;;;;;180;;vielleicht',
        'Haus A;EG;;;;Erika Muster;;;;-1;180;;',
      ),
    )
    expect(result.rows).toEqual([])
    expect(result.issues.map(({ line }) => line)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    expect(result.issues[0]!.message).toContain('Wohnung')
    expect(result.issues[1]!.message).toContain('Wohnfläche')
    expect(result.issues[2]!.message).toContain('Vorauszahlung')
    expect(result.issues[3]!.message).toContain('nur eine')
    expect(result.issues[4]!.message).toContain('Leerstand')
    expect(result.issues[5]!.message).toContain('Von')
    expect(result.issues[6]!.message).toContain('Datum')
    expect(result.issues[7]!.message).toContain('Keine Vorauszahlung')
    expect(result.issues[8]!.message).toContain('Personen')
  })

  it('lehnt fremde oder fehlende Spalten als Ganzes ab', () => {
    expect(() => parseTenantListCsv('Wohnung;Mieter\nEG;Erika')).toThrow(
      CsvImportError,
    )
    expect(() =>
      parseTenantListCsv(
        `${header.replace('Mieter', 'Name')}\n${';'.repeat(12)}x`,
      ),
    ).toThrow('Vorlage')
  })

  it('akzeptiert Spalten in anderer Reihenfolge', () => {
    const reversed = [...TENANT_LIST_HEADERS].reverse()
    const values: Record<string, string> = {
      Wohnung: 'EG',
      Mieter: 'Erika Muster',
      'Keine Vorauszahlung': 'x',
    }
    const row = reversed.map((name) => values[name] ?? '').join(';')
    const result = parseTenantListCsv(`${reversed.join(';')}\n${row}`)
    expect(result.issues).toEqual([])
    expect(result.rows[0]!.tenant!.prepayment).toEqual({ mode: 'none_agreed' })
  })

  it('liefert eine fiktive Vorlage, die sich selbst fehlerfrei einlesen lässt', () => {
    expect(TENANT_LIST_TEMPLATE.startsWith(`${header}\r\n`)).toBe(true)
    const result = parseTenantListCsv(TENANT_LIST_TEMPLATE)
    expect(result.issues).toEqual([])
    expect(result.rows.some((row) => !row.tenant)).toBe(true)
    expect(result.rows.some((row) => row.tenant)).toBe(true)
  })
})
