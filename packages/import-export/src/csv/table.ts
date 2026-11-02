export class CsvImportError extends Error {
  override readonly name = 'CsvImportError'
}

/** Dezimaltrennzeichen einer CSV-Zahl (E-51-1). Vorgabe: Komma. */
export type DecimalSeparator = 'comma' | 'dot'

export function csvTable(text: string): string[][] {
  return csvTableWithLines(text).rows
}

/**
 * Wie `csvTable`, zusätzlich mit der physischen Zeilennummer (1-basiert), in
 * der jede Zeile beginnt. Leerzeilen werden übersprungen, zählen aber mit.
 */
export function csvTableWithLines(text: string): {
  readonly rows: string[][]
  readonly lines: number[]
} {
  if (
    !text.trim() ||
    new TextEncoder().encode(text).length > 5 * 1024 * 1024 ||
    text.includes('\0')
  )
    throw new CsvImportError('CSV ist leer, ungültig oder größer als 5 MB.')
  const rows: string[][] = []
  const lines: number[] = []
  let physicalLine = 1
  let rowStart = 1
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closed = false
  const pushCell = () => {
    row.push(cell.trim())
    cell = ''
    closed = false
    if (row.length > 64)
      throw new CsvImportError('CSV enthält zu viele Spalten.')
  }
  const pushRow = () => {
    pushCell()
    if (row.some(Boolean)) {
      rows.push(row)
      lines.push(rowStart)
    }
    row = []
    if (rows.length > 1001)
      throw new CsvImportError('CSV enthält zu viele Zeilen.')
  }
  const source = text.replace(/^\uFEFF/u, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"'
        i++
      } else if (quoted) {
        quoted = false
        closed = true
      } else if (!cell && !closed) quoted = true
      else throw new CsvImportError('Ungültige Anführungszeichen in CSV.')
    } else if (!quoted && char === ';') pushCell()
    else if (!quoted && (char === '\r' || char === '\n')) {
      if (char === '\r' && source[i + 1] === '\n') i++
      pushRow()
      physicalLine++
      rowStart = physicalLine
    } else {
      if (closed && char.trim())
        throw new CsvImportError('Ungültige Anführungszeichen in CSV.')
      // Zeilenumbruch innerhalb einer Zelle in Anführungszeichen.
      if (char === '\n' || (char === '\r' && source[i + 1] !== '\n'))
        physicalLine++
      cell += char
    }
    if (cell.length > 10000) throw new CsvImportError('CSV-Zelle ist zu lang.')
  }
  if (quoted) throw new CsvImportError('Offene Anführungszeichen in CSV.')
  if (cell || row.length || closed) pushRow()
  if (rows.length < 2)
    throw new CsvImportError('CSV enthält keine Datenzeilen.')
  if (
    new Set(rows[0]).size !== rows[0]!.length ||
    rows.some((r) => r.length !== rows[0]!.length)
  )
    throw new CsvImportError('CSV-Spalten sind doppelt oder unvollständig.')
  return { rows, lines }
}

export function csvDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(value)
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    throw new CsvImportError('Ungültiges Datum in CSV.')
  return iso
}

/**
 * Zahl aus einer CSV-Zelle als Text mit Punkt als Dezimaltrennzeichen.
 * `comma` (Vorgabe): `1.234,5`; `dot`: `1,234.5` (E-51-1). Ohne die Wahl
 * würde ein Messdienst-Wert `12.345` (m³) als 12345 gelesen.
 */
export function decimalText(
  value: string,
  separator: DecimalSeparator = 'comma',
): string {
  const pattern =
    separator === 'comma'
      ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/u
      : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/u
  if (!pattern.test(value))
    throw new CsvImportError('Ungültiger Betrag oder Zählerstand in CSV.')
  return separator === 'comma'
    ? value.replace(/\./gu, '').replace(',', '.')
    : value.replace(/,/gu, '')
}

export function csvCents(value: string): number {
  const decimal = decimalText(value)
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/u.exec(decimal)
  if (!match) throw new CsvImportError('Ungültiger Betrag in CSV.')
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents))
    throw new CsvImportError('Betrag in CSV ist zu groß.')
  return match[1] === '-' && cents !== 0 ? -cents : cents
}
