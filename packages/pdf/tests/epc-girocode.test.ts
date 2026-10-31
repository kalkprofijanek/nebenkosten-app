import { describe, expect, it } from 'vitest'
import { buildEpcPayload } from '../src/epc-girocode'

// Prüf-IBAN aus der Fixture (öffentliches Beispiel, kein echtes Konto).
const IBAN_COMPACT = ['DE89', '370400440532013000'].join('')
const IBAN = ['DE89', ' 3704 0044 0532 0130 00'].join('')

describe('buildEpcPayload (EPC069-12, Version 002)', () => {
  it('erzeugt die Zeilen in der vorgeschriebenen Reihenfolge', () => {
    const payload = buildEpcPayload({
      name: 'Muster Verwaltung GmbH',
      iban: IBAN,
      bic: 'COBADEFFXXX',
      amountCents: 12_345,
      remittance: 'NK 2025 WE 1',
    })
    expect(payload?.split('\n')).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      'COBADEFFXXX',
      'Muster Verwaltung GmbH',
      IBAN_COMPACT,
      'EUR123.45',
      '',
      '',
      'NK 2025 WE 1',
    ])
  })

  it('lässt die BIC weg und formatiert Cent-Beträge ohne Rundung', () => {
    const lines = buildEpcPayload({
      name: 'A',
      iban: IBAN,
      bic: null,
      amountCents: 5,
      remittance: 'x',
    })?.split('\n')
    expect(lines?.[4]).toBe('')
    expect(lines?.[7]).toBe('EUR0.05')
  })

  it('kürzt Name und Verwendungszweck auf die zulässige Länge und entfernt Zeilenumbrüche', () => {
    const lines = buildEpcPayload({
      name: `Ä${'b'.repeat(80)}\nc`,
      iban: IBAN,
      bic: '  ',
      amountCents: 100,
      remittance: `NK\n2025 ${'z'.repeat(200)}`,
    })?.split('\n')
    expect(lines).toHaveLength(11)
    expect(lines?.[5]).toHaveLength(70)
    expect(lines?.[5]?.startsWith('Äbbb')).toBe(true)
    expect(lines?.[10]).toHaveLength(140)
    expect(lines?.[10]?.startsWith('NK 2025 zz')).toBe(true)
  })

  it('entfernt Steuerzeichen aus Name und Verwendungszweck', () => {
    const lines = buildEpcPayload({
      name: 'Bei\u0000spiel\u0007 GmbH',
      iban: IBAN,
      bic: null,
      amountCents: 100,
      remittance: 'NK\u00852025\u001bWE 1',
    })?.split('\n')
    expect(lines).toHaveLength(11)
    expect(lines?.[5]).toBe('Beispiel GmbH')
    expect(lines?.[10]).toBe('NK 2025WE 1')
  })

  it.each([
    ['ungültige Prüfziffer', { iban: 'DE00 3704 0044 0532 0130 00' }],
    ['fehlender Name', { name: '   ' }],
    ['Guthaben', { amountCents: -100 }],
    ['ausgeglichen', { amountCents: 0 }],
    ['Betrag über Höchstwert', { amountCents: 100_000_000_000 }],
    ['Bruchteil eines Cents', { amountCents: 10.5 }],
    ['ungültige BIC', { bic: 'XYZ' }],
  ])('liefert null bei %s', (_label, patch) => {
    expect(
      buildEpcPayload({
        name: 'A',
        iban: IBAN,
        bic: null,
        amountCents: 100,
        remittance: 'x',
        ...patch,
      }),
    ).toBeNull()
  })
})
