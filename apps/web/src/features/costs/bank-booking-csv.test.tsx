import { describe, expect, it } from 'vitest'

import { decodeBankBookingCsv, parseBankBookingCsv } from './bank-booking-csv'

describe('Bankbuchungs-CSV', () => {
  it('liest den Legacy-Spaltenvertrag mit deutscher Zahl und Kopfzeilen-Vorspann', () => {
    const csv = [
      'Kontoauszug;Beispielkonto',
      'Exportiert;17.08.2026',
      'Buchungstag;Betrag;Begünstigter;Verwendungszweck;Buchungstext',
      '15.04.2026;-1.234,56;Fiktiver Versorger;Rechnung 42;Lastschrift',
    ].join('\r\n')

    expect(parseBankBookingCsv(csv)).toEqual([
      {
        date: '2026-04-15',
        amountCents: -123_456,
        counterparty: 'Fiktiver Versorger',
        purpose: 'Rechnung 42',
        bookingText: 'Lastschrift',
      },
    ])
  })

  it('beherrscht Komma-CSV, Anführungszeichen und englische Spalten', () => {
    const csv = [
      'Date,Amount,Payee,Purpose,Type',
      '2026-05-02,"-12.34","Firma, fiktiv","Text mit ""Zitat""",Transfer',
    ].join('\n')

    expect(parseBankBookingCsv(csv)[0]).toMatchObject({
      date: '2026-05-02',
      amountCents: -1234,
      counterparty: 'Firma, fiktiv',
      purpose: 'Text mit "Zitat"',
    })
  })

  it('dekodiert UTF-8 und Windows-1252 lokal und weist ungültige Dateien ab', () => {
    const utf8 = new TextEncoder().encode(
      'Datum;Betrag;Zweck\n01.01.2026;-1,00;Gebühr',
    )
    expect(decodeBankBookingCsv(utf8)).toContain('Gebühr')

    const windows1252 = Uint8Array.from([
      ...new TextEncoder().encode('Datum;Betrag;Zweck\n01.01.2026;-1,00;Geb'),
      0xfc,
      ...new TextEncoder().encode('hr'),
    ])
    expect(decodeBankBookingCsv(windows1252)).toContain('Gebühr')
    expect(() => parseBankBookingCsv('Name;Zweck\nA;B')).toThrow(/Betrag/)
  })

  it('begrenzt den Import auf 20.000 Buchungszeilen', () => {
    const csv = [
      'Datum;Betrag',
      ...Array.from(
        { length: 20_001 },
        (_, index) => `01.01.2026;-${index + 1},00`,
      ),
    ].join('\n')

    expect(() => parseBankBookingCsv(csv)).toThrow(/zu viele Zeilen/)
  })

  it('normalisiert kurze deutsche Jahreszahlen und optionale Pluszeichen', () => {
    expect(parseBankBookingCsv('Datum;Betrag\n1.2.26;+12,30')).toEqual([
      { date: '2026-02-01', amountCents: 1230 },
    ])
  })

  it('weist leere, übergroße und binär wirkende Dateien ab', () => {
    expect(() => decodeBankBookingCsv(new Uint8Array())).toThrow(/leer/)
    expect(() =>
      decodeBankBookingCsv(new Uint8Array(5 * 1024 * 1024 + 1)),
    ).toThrow(/größer als 5 MB/)
    expect(() => parseBankBookingCsv('Datum;Betrag\n\0;-1,00')).toThrow(
      /ungültig/,
    )
  })

  it('weist beschädigte Anführungszeichen und überlange Zellen ab', () => {
    expect(() =>
      parseBankBookingCsv('Datum;Betrag\n"01.01.2026;-1,00'),
    ).toThrow(/offenes Anführungszeichen/)
    expect(() =>
      parseBankBookingCsv(
        `Datum;Betrag;Zweck\n01.01.2026;-1,00;${'x'.repeat(10_001)}`,
      ),
    ).toThrow(/Zelle ist zu lang/)
  })

  it('weist unmögliche Daten, ungültige Beträge und leere Exporte ab', () => {
    expect(() => parseBankBookingCsv('Datum;Betrag\nkein-datum;-1,00')).toThrow(
      /Ungültiges Datum/,
    )
    expect(() => parseBankBookingCsv('Datum;Betrag\n31.02.2026;-1,00')).toThrow(
      /Ungültiges Datum/,
    )
    expect(() => parseBankBookingCsv('Datum;Betrag\n01.01.2026;1.234')).toThrow(
      /Ungültiger Betrag/,
    )
    expect(() => parseBankBookingCsv('Datum;Betrag')).toThrow(/keine Buchungen/)
  })

  it('weist Beträge außerhalb des sicheren Zahlenbereichs ab', () => {
    expect(() =>
      parseBankBookingCsv('Datum;Betrag\n01.01.2026;900719925474099100000,00'),
    ).toThrow(/zu groß/)
  })

  it('liest einen Betrag mit mehrfachen Tausenderpunkten', () => {
    expect(parseBankBookingCsv('Datum;Betrag\n01.01.2026;1.234.567')).toEqual([
      { date: '2026-01-01', amountCents: 123_456_700 },
    ])
  })
})
