import { CsvImportError, csvDate, csvTable, decimalText } from './table'

export interface MeterServiceColumns {
  readonly meterNumber: string
  readonly date: string
  readonly value: string
  readonly unit: string
}
export interface MeterServiceReading {
  readonly meterNumber: string
  readonly date: string
  readonly value: number
  readonly unit: 'kWh' | 'm3' | 'einheiten'
}

/** Herstellerspezifische CSV-Spalten explizit zuordnen; keine automatische Speicherung. */
export function parseMeterServiceCsv(
  text: string,
  columns: MeterServiceColumns,
): MeterServiceReading[] {
  const [header, ...rows] = csvTable(text)
  const names = Object.values(columns)
  if (
    new Set(names).size !== 4 ||
    names.some((name) => !header!.includes(name))
  )
    throw new CsvImportError(
      'Messdienst-CSV benötigt vier eindeutig zugeordnete Spalten.',
    )
  return rows.map((row) => {
    const get = (key: keyof MeterServiceColumns) =>
      row[header!.indexOf(columns[key])]!
    const meterNumber = get('meterNumber')
    if (!meterNumber) throw new CsvImportError('Zählernummer fehlt in CSV.')
    const value = Number(decimalText(get('value')))
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
      throw new CsvImportError('Ungültiger Zählerstand in CSV.')
    const unit = get('unit')
    if (unit !== 'kWh' && unit !== 'm3' && unit !== 'einheiten')
      throw new CsvImportError('Unbekannte Einheit in Messdienst-CSV.')
    return { meterNumber, date: csvDate(get('date')), value, unit }
  })
}
