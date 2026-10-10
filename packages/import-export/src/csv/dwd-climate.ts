import { CsvImportError, csvDate, csvTable } from './table'

export interface DwdClimateFactors {
  readonly periodStart: string
  readonly periodEnd: string
  readonly factors: Map<string, number>
  readonly source: 'Deutscher Wetterdienst'
}

function dwdDate(value: string): string {
  if (!/^\d{8}$/u.test(value))
    throw new CsvImportError('DWD-Datum muss JJJJMMTT entsprechen.')
  return csvDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`)
}

/** DWD-CSV gemäß ADR-0005; keine Zuordnung oder Speicherung im Datenbestand. */
export function parseDwdClimateCsv(text: string): DwdClimateFactors {
  const [header, ...rows] = csvTable(text, 10000)
  const signature = header!.join(';')
  if (
    signature !== 'DatAnf;DatEnd;PLZ;KF' &&
    signature !== 'DatAnf;DatEnd;PLZ;KF_k'
  )
    throw new CsvImportError('Unbekannte Kopfzeile der DWD-Klimafaktor-CSV.')
  const comma = header![3] === 'KF_k'
  const factors = new Map<string, number>()
  const periodStart = dwdDate(rows[0]![0]!)
  const periodEnd = dwdDate(rows[0]![1]!)
  if (periodEnd < periodStart)
    throw new CsvImportError('DWD-Zeitraum endet vor seinem Beginn.')
  for (const [start, end, postalCode, rawFactor] of rows) {
    if (dwdDate(start!) !== periodStart || dwdDate(end!) !== periodEnd)
      throw new CsvImportError('DWD-Datei enthält mehrere Zeiträume.')
    if (!/^\d{1,5}$/u.test(postalCode!))
      throw new CsvImportError('Ungültige Postleitzahl in DWD-Datei.')
    const code = postalCode!.padStart(5, '0')
    if (factors.has(code))
      throw new CsvImportError('Doppelte Postleitzahl in DWD-Datei.')
    if (!(comma ? /^\d+(?:,\d+)?$/u : /^\d+(?:\.\d+)?$/u).test(rawFactor!))
      throw new CsvImportError('Ungültiger Klimafaktor in DWD-Datei.')
    const factor = Number(rawFactor!.replace(',', '.'))
    if (!Number.isFinite(factor) || factor <= 0)
      throw new CsvImportError('DWD-Klimafaktor muss positiv und endlich sein.')
    factors.set(code, factor)
  }
  return { periodStart, periodEnd, factors, source: 'Deutscher Wetterdienst' }
}
