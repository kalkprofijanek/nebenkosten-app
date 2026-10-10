/**
 * Import der Klimafaktor-Liste des Deutschen Wetterdienstes (ADR-0005,
 * Abschnitt „Dateiformat der DWD-Liste“): `KF_JJJJMMTT_JJJJMMTT.csv` bzw.
 * `…_k.csv`, Trennzeichen `;`, Kopfzeile `DatAnf;DatEnd;PLZ;KF` (Punkt als
 * Dezimaltrenner) oder `DatAnf;DatEnd;PLZ;KF_k` (Dezimalkomma), danach eine
 * Zeile je Postleitzahl. Postleitzahlen stehen ohne führende Null in der
 * Datei und werden auf fünf Stellen aufgefüllt.
 */
import type { ClimateFactor } from '@nebenkosten/schema'
import { CsvImportError } from './table'

/** Quellenvermerk nach GeoNutzV („Deutscher Wetterdienst“). */
export const DWD_CLIMATE_FACTOR_SOURCE =
  'Deutscher Wetterdienst, Klimafaktoren (Referenz Potsdam)'

export interface DwdClimateFactorList {
  /** Beginn des Zwölfmonatszeitraums (ISO-Datum). */
  readonly periodStart: string
  /** Ende des Zwölfmonatszeitraums (ISO-Datum). */
  readonly periodEnd: string
  /** Faktor je fünfstelliger Postleitzahl. */
  readonly factors: ReadonlyMap<string, number>
}

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 20_000
const HEADERS = {
  KF: /^[+-]?\d+(?:\.\d+)?$/u,
  KF_k: /^[+-]?\d+(?:,\d+)?$/u,
} as const

function dwdDate(value: string, line: number): string {
  const match = /^(\d{4})(\d{2})(\d{2})$/u.exec(value)
  const iso = match ? `${match[1]}-${match[2]}-${match[3]}` : ''
  if (
    !match ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    throw new CsvImportError(
      `DWD-Liste, Zeile ${line}: ungültiges Datum „${value}“ (erwartet JJJJMMTT).`,
    )
  return iso
}

/**
 * Liest die DWD-Klimafaktor-Liste. Fehler (unbekannte Kopfzeile, mehrere
 * Zeiträume, doppelte Postleitzahl, Faktor nicht positiv, unvollständige
 * Zeilen) werden als `CsvImportError` mit Zeilennummer gemeldet.
 */
export function parseDwdClimateFactorCsv(text: string): DwdClimateFactorList {
  if (
    !text.trim() ||
    text.includes('\0') ||
    new TextEncoder().encode(text).length > MAX_BYTES
  )
    throw new CsvImportError(
      'Die DWD-Liste ist leer, ungültig oder größer als 2 MB.',
    )
  const lines = text
    .replace(/^\uFEFF/u, '')
    .split(/\r?\n/u)
    .map((content, index) => ({ content: content.trim(), line: index + 1 }))
    .filter(({ content }) => content !== '')
  const [header, ...rows] = lines
  const headerCells = header!.content.split(';').map((cell) => cell.trim())
  const factorColumn = headerCells[3]
  if (
    headerCells.length !== 4 ||
    headerCells[0] !== 'DatAnf' ||
    headerCells[1] !== 'DatEnd' ||
    headerCells[2] !== 'PLZ' ||
    (factorColumn !== 'KF' && factorColumn !== 'KF_k')
  )
    throw new CsvImportError(
      'Unbekannte Kopfzeile der DWD-Liste (erwartet „DatAnf;DatEnd;PLZ;KF“ oder „DatAnf;DatEnd;PLZ;KF_k“).',
    )
  if (rows.length === 0)
    throw new CsvImportError('Die DWD-Liste enthält keine Datenzeilen.')
  if (rows.length > MAX_ROWS)
    throw new CsvImportError('Die DWD-Liste enthält zu viele Zeilen.')
  const numberPattern = HEADERS[factorColumn]
  let periodStart: string | null = null
  let periodEnd: string | null = null
  const factors = new Map<string, number>()
  for (const { content, line } of rows) {
    const cells = content.split(';').map((cell) => cell.trim())
    if (cells.length !== 4)
      throw new CsvImportError(
        `DWD-Liste, Zeile ${line}: erwartet vier Spalten.`,
      )
    const [startText, endText, postalText, factorText] = cells as [
      string,
      string,
      string,
      string,
    ]
    const start = dwdDate(startText, line)
    const end = dwdDate(endText, line)
    if (periodStart === null || periodEnd === null) {
      if (start >= end)
        throw new CsvImportError(
          `DWD-Liste, Zeile ${line}: Der Zeitraum endet vor seinem Beginn.`,
        )
      periodStart = start
      periodEnd = end
    } else if (start !== periodStart || end !== periodEnd)
      throw new CsvImportError(
        `DWD-Liste, Zeile ${line}: Die Datei enthält mehrere Zeiträume.`,
      )
    if (!/^\d{4,5}$/u.test(postalText))
      throw new CsvImportError(
        `DWD-Liste, Zeile ${line}: ungültige Postleitzahl „${postalText}“.`,
      )
    const postalCode = postalText.padStart(5, '0')
    if (factors.has(postalCode))
      throw new CsvImportError(
        `DWD-Liste, Zeile ${line}: Postleitzahl ${postalCode} ist doppelt enthalten.`,
      )
    if (!numberPattern.test(factorText))
      throw new CsvImportError(
        `DWD-Liste, Zeile ${line}: ungültiger Klimafaktor „${factorText}“.`,
      )
    const factor = Number(factorText.replace(',', '.'))
    if (!Number.isFinite(factor) || factor <= 0)
      throw new CsvImportError(
        `DWD-Liste, Zeile ${line}: Der Klimafaktor muss größer als 0 sein.`,
      )
    factors.set(postalCode, factor)
  }
  return { periodStart: periodStart!, periodEnd: periodEnd!, factors }
}

/**
 * Klimafaktor für eine Postleitzahl aus der eingelesenen DWD-Liste; `null`,
 * wenn die Postleitzahl nicht enthalten ist.
 */
export function climateFactorFromDwdList(
  list: DwdClimateFactorList,
  postalCode: string,
  source: string = DWD_CLIMATE_FACTOR_SOURCE,
): ClimateFactor | null {
  const normalized = postalCode.trim()
  const factor = /^\d{5}$/u.test(normalized)
    ? list.factors.get(normalized)
    : undefined
  if (factor === undefined) return null
  return {
    postalCode: normalized,
    factor,
    periodStart: list.periodStart,
    periodEnd: list.periodEnd,
    source,
  }
}
