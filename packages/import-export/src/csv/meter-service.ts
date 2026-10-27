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

/** Ablesung mit Zeilennummer in der Datei (Kopfzeile = 1). */
export interface MeterServiceRow extends MeterServiceReading {
  readonly line: number
}

export interface MeterServiceIssue {
  readonly line: number
  readonly message: string
}

export interface MeterServiceParseResult {
  readonly rows: MeterServiceRow[]
  readonly issues: MeterServiceIssue[]
}

/** Spalten der Vorlage „Zählerstände“. */
export const METER_SERVICE_HEADERS = [
  'Zaehlernummer',
  'Ablesedatum',
  'Zaehlerstand',
  'Einheit',
] as const

/** Fiktive Beispielzeilen; keine echten Zähler- oder Verbrauchsdaten. */
export const METER_SERVICE_TEMPLATE = [
  METER_SERVICE_HEADERS.join(';'),
  'TEST-STROM-1;31.12.2025;12.345,6;kWh',
  'TEST-STROM-1;31.12.2026;14.020,1;kWh',
  'TEST-WASSER-1;31.12.2026;321,25;m3',
  '',
].join('\r\n')

const COLUMN_KEYS = ['meterNumber', 'date', 'value', 'unit'] as const

/** Bezeichnungen der vier Angaben für die Spaltenzuordnung. */
export const METER_SERVICE_COLUMN_LABELS: Record<
  keyof MeterServiceColumns,
  string
> = {
  meterNumber: 'Zählernummer',
  date: 'Ablesedatum',
  value: 'Zählerstand',
  unit: 'Einheit',
}

/** Exakte Überschriften je Angabe (normalisiert, siehe `normalize`). */
const EXACT_COLUMN_NAMES: Record<keyof MeterServiceColumns, readonly string[]> =
  {
    meterNumber: [
      'zaehlernummer',
      'zaehlernr',
      'geraetenummer',
      'geraetenr',
      'seriennummer',
      'zaehler',
    ],
    date: ['ablesedatum', 'datum', 'stichtag', 'date'],
    value: ['zaehlerstand', 'stand', 'wert', 'value', 'ablesewert', 'messwert'],
    unit: ['einheit', 'einh', 'unit'],
  }

/**
 * Teilbegriffe, falls keine exakte Überschrift passt. Reihenfolge ist
 * wichtig: „Zählerstand“ wird vor der Zählernummer vergeben, damit „zaehler“
 * es nicht als Nummer erkennt.
 */
const PARTIAL_COLUMN_TERMS: readonly (readonly [
  keyof MeterServiceColumns,
  RegExp,
])[] = [
  ['value', /stand|wert/u],
  ['date', /datum|date|stichtag/u],
  ['unit', /einheit|unit/u],
  ['meterNumber', /nummer|zaehler|geraet|nr/u],
]

function normalize(name: string): string {
  return name
    .toLocaleLowerCase('de-DE')
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/ß/gu, 'ss')
    .replace(/[^a-z0-9]/gu, '')
}

/** Kopfzeile einer Ablesebogen-/Messdienst-CSV für die Spaltenzuordnung. */
export function readMeterServiceHeader(text: string): string[] {
  return [...csvTable(text)[0]!]
}

/**
 * Schlägt je Angabe eine Spalte vor – nur bei genau einem Treffer. Zuerst
 * zählen exakte Überschriften, dann Teilbegriffe in noch freien Spalten.
 * Mehrdeutige oder fehlende Spalten bleiben offen und müssen von Hand
 * zugeordnet werden.
 */
export function suggestMeterServiceColumns(
  header: readonly string[],
): Partial<MeterServiceColumns> {
  const names = header.map(normalize)
  const suggestion: Partial<Record<keyof MeterServiceColumns, string>> = {}
  const used = new Set<number>()
  const ambiguous = new Set<keyof MeterServiceColumns>()
  const take = (key: keyof MeterServiceColumns, indexes: number[]) => {
    if (indexes.length === 1) {
      suggestion[key] = header[indexes[0]!]!
      used.add(indexes[0]!)
    } else if (indexes.length > 1) ambiguous.add(key)
  }
  for (const key of COLUMN_KEYS)
    take(
      key,
      names.flatMap((name, index) =>
        EXACT_COLUMN_NAMES[key].includes(name) ? [index] : [],
      ),
    )
  for (const [key, pattern] of PARTIAL_COLUMN_TERMS) {
    if (suggestion[key] !== undefined || ambiguous.has(key)) continue
    take(
      key,
      names.flatMap((name, index) =>
        !used.has(index) && pattern.test(name) ? [index] : [],
      ),
    )
  }
  return suggestion
}

function readRow(
  get: (key: keyof MeterServiceColumns) => string,
): MeterServiceReading {
  const meterNumber = get('meterNumber')
  if (!meterNumber) throw new CsvImportError('Zählernummer fehlt.')
  let date: string
  try {
    date = csvDate(get('date'))
  } catch {
    throw new CsvImportError('Ablesedatum ist ungültig (TT.MM.JJJJ erwartet).')
  }
  let value: number
  try {
    value = Number(decimalText(get('value')))
  } catch {
    throw new CsvImportError('Zählerstand ist keine Zahl.')
  }
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)
    throw new CsvImportError('Zählerstand ist zu groß.')
  if (value < 0)
    throw new CsvImportError('Zählerstand darf nicht negativ sein.')
  const unit = get('unit')
  if (unit !== 'kWh' && unit !== 'm3' && unit !== 'einheiten')
    throw new CsvImportError(
      `Einheit „${unit}“ ist unbekannt (kWh, m3 oder einheiten).`,
    )
  return { meterNumber, date, value, unit }
}

function mappedTable(text: string, columns: MeterServiceColumns) {
  const [header, ...rows] = csvTable(text)
  const names = COLUMN_KEYS.map((key) => columns[key])
  if (new Set(names).size !== 4)
    throw new CsvImportError(
      'Messdienst-CSV benötigt vier eindeutig zugeordnete Spalten.',
    )
  const missing = names.find((name) => !header!.includes(name))
  if (missing !== undefined)
    throw new CsvImportError(
      `Spalten passen nicht: „${missing}“ fehlt in der CSV.`,
    )
  const index = (key: keyof MeterServiceColumns) =>
    header!.indexOf(columns[key])
  return rows.map((row) => (key: keyof MeterServiceColumns) => row[index(key)]!)
}

/**
 * Liest Zählerstände mit expliziter Spaltenzuordnung und sammelt Fehler je
 * Zeile. Nur eine fehlende oder doppelte Zuordnung bricht ganz ab. Keine
 * Speicherung – die Zuordnung zu Zählern erfolgt in der Oberfläche.
 */
export function parseMeterServiceRows(
  text: string,
  columns: MeterServiceColumns,
): MeterServiceParseResult {
  const result: MeterServiceParseResult = { rows: [], issues: [] }
  mappedTable(text, columns).forEach((get, index) => {
    const line = index + 2
    try {
      result.rows.push({ line, ...readRow(get) })
    } catch (caught) {
      result.issues.push({ line, message: (caught as Error).message })
    }
  })
  return result
}

/** Herstellerspezifische CSV-Spalten explizit zuordnen; keine automatische Speicherung. */
export function parseMeterServiceCsv(
  text: string,
  columns: MeterServiceColumns,
): MeterServiceReading[] {
  return mappedTable(text, columns).map(readRow)
}
