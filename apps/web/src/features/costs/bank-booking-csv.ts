const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 20_000
const MAX_CELL_LENGTH = 10_000

export interface ParsedBankBookingRow {
  readonly date: string
  readonly amountCents: number
  readonly counterparty?: string
  readonly purpose?: string
  readonly bookingText?: string
}

export class BankBookingCsvError extends Error {
  override readonly name = 'BankBookingCsvError'
}

export function decodeBankBookingCsv(bytes: Uint8Array): string {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
    throw new BankBookingCsvError(
      'Die CSV-Datei ist leer oder größer als 5 MB.',
    )
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252', { fatal: true }).decode(bytes)
  }
}

function delimiterFor(text: string): ',' | ';' {
  const sample = text.split(/\r?\n/u).slice(0, 10).join('\n')
  const semicolons = [...sample].filter((character) => character === ';').length
  const commas = [...sample].filter((character) => character === ',').length
  return semicolons >= commas ? ';' : ','
}

function csvRows(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const pushCell = () => {
    if (cell.length > MAX_CELL_LENGTH)
      throw new BankBookingCsvError('Eine CSV-Zelle ist zu lang.')
    row.push(cell.trim())
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (row.some((value) => value.length > 0)) rows.push(row)
    row = []
    if (rows.length > MAX_ROWS + 10)
      throw new BankBookingCsvError('Die CSV-Datei enthält zu viele Zeilen.')
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      pushCell()
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      pushRow()
    } else {
      cell += character
    }
  }
  if (quoted)
    throw new BankBookingCsvError(
      'Die CSV-Datei enthält ein offenes Anführungszeichen.',
    )
  if (cell.length > 0 || row.length > 0) pushRow()
  return rows
}

function column(header: readonly string[], aliases: readonly string[]): number {
  const normalized = header.map((value) =>
    value.trim().toLocaleLowerCase('de-DE'),
  )
  for (const alias of aliases) {
    const exact = normalized.indexOf(alias)
    if (exact >= 0) return exact
  }
  for (const alias of aliases) {
    const partial = normalized.findIndex((value) => value.includes(alias))
    if (partial >= 0) return partial
  }
  return -1
}

function isoDate(value: string, rowNumber: number): string {
  const trimmed = value.trim()
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/u.exec(trimmed)
  const normalized = german
    ? `${german[3]!.length === 2 ? `20${german[3]}` : german[3]}-${german[2]!.padStart(2, '0')}-${german[1]!.padStart(2, '0')}`
    : trimmed
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized)
  if (!match)
    throw new BankBookingCsvError(`Ungültiges Datum in CSV-Zeile ${rowNumber}.`)
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )
  if (date.toISOString().slice(0, 10) !== normalized)
    throw new BankBookingCsvError(`Ungültiges Datum in CSV-Zeile ${rowNumber}.`)
  return normalized
}

function euroCents(value: string, rowNumber: number): number {
  let normalized = value.replace(/[\s\u00a0€]/gu, '').trim()
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    const grouping = decimal === ',' ? /\./gu : /,/gu
    normalized = normalized.replace(grouping, '').replace(decimal, '.')
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./gu, '').replace(',', '.')
  } else if ((normalized.match(/\./gu) ?? []).length > 1) {
    normalized = normalized.replace(/\./gu, '')
  }
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/u.exec(normalized)
  if (!match)
    throw new BankBookingCsvError(
      `Ungültiger Betrag in CSV-Zeile ${rowNumber}.`,
    )
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  const signed = match[1] === '-' ? -cents : cents
  if (!Number.isSafeInteger(signed))
    throw new BankBookingCsvError(
      `Betrag in CSV-Zeile ${rowNumber} ist zu groß.`,
    )
  return signed
}

function optionalCell(
  row: readonly string[],
  index: number,
): string | undefined {
  if (index < 0) return undefined
  const value = row[index]?.trim()
  return value ? value : undefined
}

export function parseBankBookingCsv(text: string): ParsedBankBookingRow[] {
  if (text.includes('\0'))
    throw new BankBookingCsvError('Die CSV-Datei ist ungültig.')
  const rows = csvRows(text.replace(/^\uFEFF/u, ''), delimiterFor(text))
  const headerIndex = rows
    .slice(0, 10)
    .findIndex((row) =>
      row.some((value) => /^(betrag|amount)$/iu.test(value.trim())),
    )
  if (headerIndex < 0)
    throw new BankBookingCsvError(
      'Die CSV-Datei benötigt eine Spalte „Betrag“ oder „Amount“.',
    )
  const header = rows[headerIndex]!
  const dateIndex = column(header, ['buchungstag', 'datum', 'date'])
  const amountIndex = column(header, ['betrag', 'amount'])
  if (dateIndex < 0 || amountIndex < 0)
    throw new BankBookingCsvError(
      'Die CSV-Datei benötigt Datum- und Betrag-Spalten.',
    )
  const counterpartyIndex = column(header, [
    'beguenstigter',
    'begünstigter',
    'auftraggeber',
    'zahlungspflichtig',
    'payee',
  ])
  const purposeIndex = column(header, ['verwendungszweck', 'zweck', 'purpose'])
  const bookingTextIndex = column(header, [
    'buchungstext',
    'buchungstyp',
    'type',
  ])

  const bookingRows = rows.slice(headerIndex + 1)
  if (bookingRows.length > MAX_ROWS)
    throw new BankBookingCsvError('Die CSV-Datei enthält zu viele Zeilen.')
  const result = bookingRows.map((row, index) => {
    const rowNumber = headerIndex + index + 2
    return {
      date: isoDate(row[dateIndex] ?? '', rowNumber),
      amountCents: euroCents(row[amountIndex] ?? '', rowNumber),
      ...(optionalCell(row, counterpartyIndex)
        ? { counterparty: optionalCell(row, counterpartyIndex) }
        : {}),
      ...(optionalCell(row, purposeIndex)
        ? { purpose: optionalCell(row, purposeIndex) }
        : {}),
      ...(optionalCell(row, bookingTextIndex)
        ? { bookingText: optionalCell(row, bookingTextIndex) }
        : {}),
    }
  })
  if (result.length === 0)
    throw new BankBookingCsvError('Die CSV-Datei enthält keine Buchungen.')
  return result
}
