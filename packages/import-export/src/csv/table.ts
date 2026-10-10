export class CsvImportError extends Error {
  override readonly name = 'CsvImportError'
}

export function csvTable(text: string, maxDataRows = 1000): string[][] {
  if (
    !text.trim() ||
    new TextEncoder().encode(text).length > 5 * 1024 * 1024 ||
    text.includes('\0')
  )
    throw new CsvImportError('CSV ist leer, ungültig oder größer als 5 MB.')
  const rows: string[][] = []
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
    if (row.some(Boolean)) rows.push(row)
    row = []
    if (rows.length > maxDataRows + 1)
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
    } else {
      if (closed && char.trim())
        throw new CsvImportError('Ungültige Anführungszeichen in CSV.')
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
  return rows
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

export function decimalText(value: string): string {
  if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/u.test(value))
    throw new CsvImportError('Ungültiger Betrag oder Zählerstand in CSV.')
  return value.replace(/\./gu, '').replace(',', '.')
}

export function csvCents(value: string): number {
  const decimal = decimalText(value)
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/u.exec(decimal)
  if (!match) throw new CsvImportError('Ungültiger Betrag in CSV.')
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents))
    throw new CsvImportError('Betrag in CSV ist zu groß.')
  return match[1] === '-' ? -cents : cents
}
