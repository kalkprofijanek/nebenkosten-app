/**
 * Hilfen für die Spaltenzuordnung des Zählerstand-Imports. Die eigentliche
 * Prüfung übernimmt `parseMeterServiceCsv`; hier werden nur Überschriften
 * gelesen und naheliegende Spalten vorbelegt.
 */
import {
  parseMeterServiceCsv,
  type MeterServiceColumns,
} from '@nebenkosten/import-export'

export type MeterColumnKey = keyof MeterServiceColumns

export const METER_COLUMN_LABELS: Record<MeterColumnKey, string> = {
  meterNumber: 'Zählernummer',
  date: 'Ablesedatum',
  value: 'Zählerstand',
  unit: 'Einheit',
}

/** Exakte Überschriften (klein geschrieben) je Angabe. */
const EXACT: Record<MeterColumnKey, readonly string[]> = {
  meterNumber: [
    'zählernummer',
    'zaehlernummer',
    'zähler-nr.',
    'zähler-nr',
    'zählernr',
    'gerätenummer',
    'geräte-nr.',
    'seriennummer',
    'zähler',
  ],
  date: ['ablesedatum', 'datum', 'stichtag', 'date'],
  value: ['zählerstand', 'zaehlerstand', 'stand', 'wert', 'value'],
  unit: ['einheit', 'unit', 'einh.'],
}

/**
 * Teilbegriffe; Reihenfolge ist wichtig, damit z. B. „Zählerstand“ nicht als
 * Zählernummer erkannt wird (Stand vor Zähler).
 */
const PARTIAL: readonly (readonly [MeterColumnKey, readonly string[]])[] = [
  ['value', ['stand', 'wert']],
  ['date', ['datum', 'date']],
  ['unit', ['einheit', 'unit']],
  ['meterNumber', ['nummer', 'zähler', 'gerät', 'nr']],
]

const KEYS: readonly MeterColumnKey[] = ['meterNumber', 'date', 'value', 'unit']

/** Überschriften der ersten nicht leeren Zeile (Semikolon, Anführungszeichen). */
export function readCsvHeader(text: string): string[] {
  const source = text.replace(/^\uFEFF/u, '')
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === ';' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      cells.push(cell.trim())
      if (cells.some(Boolean)) return cells
      cells.length = 0
      cell = ''
    } else cell += char
  }
  cells.push(cell.trim())
  return cells.some(Boolean) ? cells : []
}

/** Vorbelegung der vier Spalten; nicht erkannte Angaben bleiben leer. */
export function suggestMeterColumns(
  header: readonly string[],
): MeterServiceColumns {
  const normalized = header.map((name) =>
    name.trim().toLocaleLowerCase('de-DE'),
  )
  const used = new Set<number>()
  const result: Record<MeterColumnKey, string> = {
    meterNumber: '',
    date: '',
    value: '',
    unit: '',
  }
  const take = (key: MeterColumnKey, index: number) => {
    result[key] = header[index]!
    used.add(index)
  }
  for (const key of KEYS)
    for (const alias of EXACT[key]) {
      const index = normalized.indexOf(alias)
      if (index >= 0 && !used.has(index)) {
        take(key, index)
        break
      }
    }
  for (const [key, aliases] of PARTIAL) {
    if (result[key]) continue
    const index = normalized.findIndex(
      (name, position) =>
        !used.has(position) && aliases.some((alias) => name.includes(alias)),
    )
    if (index >= 0) take(key, index)
  }
  return result
}

/**
 * Sucht die erste Datenzeile, an der `parseMeterServiceCsv` scheitert, damit
 * der Fehler mit Zeilennummer gemeldet werden kann. Gezählt werden
 * Datenzeilen ohne Überschrift und ohne Leerzeilen.
 */
export function locateCsvError(
  text: string,
  columns: MeterServiceColumns,
): string | null {
  const [header, ...lines] = text
    .replace(/^\uFEFF/u, '')
    .split(/\r?\n|\r/u)
    .filter((line) => line.trim().length > 0)
  for (const [index, line] of lines.entries()) {
    try {
      parseMeterServiceCsv(`${header}\n${line}`, columns)
    } catch (caught) {
      return `Datenzeile ${index + 1}: ${(caught as Error).message}`
    }
  }
  return null
}
