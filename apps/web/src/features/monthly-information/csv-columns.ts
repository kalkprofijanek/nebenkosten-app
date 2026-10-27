/**
 * Hilfen für die Spaltenzuordnung des Monatsstand-Imports. Die Prüfung
 * übernimmt `parseMeterServiceCsv`, den Spaltenvorschlag
 * `suggestMeterServiceColumns` (beide `@nebenkosten/import-export`); hier
 * wird nur die Kopfzeile gelesen – auch wenn Datenzeilen fehlerhaft sind,
 * damit `locateCsvError` sie anschließend mit Zeilennummer melden kann.
 */
import {
  parseMeterServiceCsv,
  type MeterServiceColumns,
} from '@nebenkosten/import-export'

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
