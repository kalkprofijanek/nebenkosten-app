import { describe, expect, it } from 'vitest'
import { locateCsvError, readCsvHeader } from './csv-columns'

describe('readCsvHeader', () => {
  it('liest die erste nicht leere Zeile ohne BOM und mit Anführungszeichen', () => {
    expect(
      readCsvHeader('\uFEFF\n"Zähler;Nr";Datum;"Stand ""kum."""\nA;B;C'),
    ).toEqual(['Zähler;Nr', 'Datum', 'Stand "kum."'])
    expect(readCsvHeader('  \n')).toEqual([])
  })
})

describe('locateCsvError', () => {
  const columns = {
    meterNumber: 'Nr',
    date: 'Datum',
    value: 'Stand',
    unit: 'Einheit',
  }

  it('nennt die erste fehlerhafte Datenzeile', () => {
    expect(
      locateCsvError(
        'Nr;Datum;Stand;Einheit\nA;31.01.2026;1;kWh\n\nB;31.01.2026;x;kWh',
        columns,
      ),
    ).toBe('Datenzeile 2: Zählerstand ist keine Zahl.')
  })

  it('liefert null, wenn keine einzelne Zeile den Fehler erklärt', () => {
    expect(
      locateCsvError('Nr;Datum;Stand;Einheit\nA;31.01.2026;1;kWh', columns),
    ).toBeNull()
  })
})
