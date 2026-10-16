/**
 * Zählerstände je Belegung (`OccupancyPeriod.heatMeterReading`) für die
 * Einzelabrechnung („Ihre Verbrauchserfassung“) und die interne
 * Gesamtabrechnung (Tabelle aller Zählerstände je Heizkreis).
 */
import type { Content, TableCell } from 'pdfmake/interfaces'
import {
  meterReadingConsumption,
  meterReadingTotal,
  type CalculationOutput,
  type MeterReadingSegment,
} from '@nebenkosten/core'
import type {
  AppDataFile,
  HeatMeterReading,
  OccupancyPeriod,
  Unit,
} from '@nebenkosten/schema'
import { formatIsoDate, formatNumber } from './format'
import { buildingName } from './heating-summary'

/** Zählerstand im deutschen Format (bis zu drei Nachkommastellen). */
export function formatMeterValue(value: number): string {
  return value
    .toLocaleString('de-DE', { maximumFractionDigits: 3 })
    .replace(
      new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'gu'),
      ' ',
    )
}

/** „Wert (Datum)“ bzw. „–“ ohne Wert. */
export function readingWithDate(
  value: number | null | undefined,
  date: string | null | undefined,
): string {
  if (value == null) return date ? `– (${formatIsoDate(date)})` : '–'
  return date
    ? `${formatMeterValue(value)} (${formatIsoDate(date)})`
    : formatMeterValue(value)
}

/** Verbrauch laut Zählerständen, falls ableitbar (sonst `null`). */
export function readingDifference(
  reading: HeatMeterReading | null | undefined,
): number | null {
  // Einschließlich Zählertausch (ADR-0008); Regel im Core.
  return meterReadingTotal(reading)
}

/** Liegt irgendeine Angabe zur Ablesung vor? */
export function hasReading(
  reading: HeatMeterReading | null | undefined,
): reading is HeatMeterReading {
  return Boolean(
    reading &&
    (reading.meterNumber?.trim() ||
      typeof reading.startValue === 'number' ||
      typeof reading.endValue === 'number'),
  )
}

/** Tabellenkopf und Zeile „Zähler-Nr. | Stand alt | Stand neu | Verbrauch“. */
export function readingCells(
  reading: HeatMeterReading,
  unit: string,
): TableCell[] {
  const difference = readingDifference(reading)
  return [
    reading.meterNumber?.trim() || '–',
    { text: readingWithDate(reading.startValue, reading.startDate) },
    { text: readingWithDate(reading.endValue, reading.endDate) },
    {
      text:
        difference === null ? '–' : `${formatMeterValue(difference)} ${unit}`,
      alignment: 'right',
      noWrap: true,
    },
  ]
}

/** Hinweis statt Verbrauch, wenn die Tauschangaben widersprüchlich sind. */
export const REPLACEMENT_INVALID_HINT = 'Zählertausch prüfen'

/** Liegt mindestens ein Geräte- bzw. Zählertausch vor (ADR-0008)? */
export function hasReplacement(
  reading: HeatMeterReading | null | undefined,
): boolean {
  return (reading?.replacements?.length ?? 0) > 0
}

/** Zellen je Abschnitt: Nummer, Stand alt/neu mit Datum, Verbrauch. */
function segmentCells(
  segment: MeterReadingSegment,
  consumptionText: string,
): TableCell[] {
  return [
    segment.meterNumber ?? '–',
    { text: readingWithDate(segment.startValue, segment.from) },
    { text: readingWithDate(segment.endValue, segment.to) },
    { text: consumptionText, alignment: 'right', noWrap: true },
  ]
}

/**
 * Zeilen „Zähler-Nr. | Stand alt | Stand neu | Verbrauch“ der
 * Einzelabrechnung. Ohne Tausch genau eine Zeile (`readingCells`), bei
 * Tausch eine Zeile je Abschnitt und die Summenzeile „Verbrauch gesamt“;
 * bei widersprüchlichen Tauschangaben ein Hinweis statt des Verbrauchs.
 */
export function readingRows(
  reading: HeatMeterReading,
  unit: string,
): TableCell[][] {
  if (!hasReplacement(reading)) return [readingCells(reading, unit)]
  const result = meterReadingConsumption(reading)
  if (result.status !== 'complete') {
    const cells = readingCells(reading, unit)
    if (result.status === 'invalid')
      cells[3] = {
        text: REPLACEMENT_INVALID_HINT,
        alignment: 'right',
        noWrap: true,
      }
    return [cells]
  }
  return [
    ...result.segments.map((segment) =>
      segmentCells(segment, `${formatMeterValue(segment.consumption)} ${unit}`),
    ),
    [
      { text: 'Verbrauch gesamt', colSpan: 3, bold: true },
      {},
      {},
      {
        text: `${formatMeterValue(result.total)} ${unit}`,
        alignment: 'right',
        noWrap: true,
        bold: true,
      },
    ],
  ]
}

function occupancyBuildingId(
  appData: AppDataFile,
  calculation: CalculationOutput,
  occupancy: OccupancyPeriod,
): string | null {
  const traced = calculation.tenants.find(({ id }) => id === occupancy.id)
    ?.ownBasis?.buildingId
  if (traced !== undefined) return traced
  if (occupancy.costScope?.kind === 'building')
    return occupancy.costScope.buildingId
  return (
    appData.masterData.units.find(({ id }) => id === occupancy.unitId)
      ?.buildingId ?? null
  )
}

/**
 * Interne Gesamtabrechnung: alle Zählerstände und Verbrauchswerte je
 * Heizkreis. Ohne erfasste Zählerstände im Abrechnungsjahr entfällt die
 * Tabelle.
 */
export function circuitMeterReadingTables(
  appData: AppDataFile,
  calculation: CalculationOutput,
  occupancies: readonly OccupancyPeriod[],
  units: readonly Unit[],
): Content[] {
  const tenants = occupancies.filter(({ kind }) => kind === 'tenant')
  if (!tenants.some(({ heatMeterReading }) => hasReading(heatMeterReading)))
    return []
  const content: Content[] = [
    {
      text: 'Zählerstände je Heizkreis (Verbrauchserfassung)',
      style: 'th',
      margin: [0, 8, 0, 4],
    },
  ]
  for (const circuit of calculation.heating.trace.circuits) {
    const rows = tenants
      .filter(
        (occupancy) =>
          occupancyBuildingId(appData, calculation, occupancy) ===
          circuit.buildingId,
      )
      .flatMap((occupancy): TableCell[][] => {
        const unit = units.find(({ id }) => id === occupancy.unitId)
        const reading = occupancy.heatMeterReading ?? {}
        const result = meterReadingConsumption(reading)
        const difference = result.status === 'complete' ? result.total : null
        const consumption = occupancy.consumptionUnits?.value
        const deviates =
          difference !== null &&
          (consumption == null || Math.abs(difference - consumption) > 0.5)
        const consumptionCell: TableCell = {
          text: `${consumption == null ? '–' : formatNumber(consumption)}${
            occupancy.consumptionUnitsEstimated ? ' (geschätzt)' : ''
          }${deviates ? ' !' : ''}`,
          alignment: 'right',
          noWrap: true,
        }
        const differenceCell: TableCell = {
          text:
            difference === null
              ? hasReplacement(reading) && result.status === 'invalid'
                ? REPLACEMENT_INVALID_HINT
                : '–'
              : formatMeterValue(difference),
          alignment: 'right',
          noWrap: true,
        }
        if (!hasReplacement(reading) || result.status !== 'complete')
          return [
            [
              unit?.label ?? '–',
              reading.meterNumber?.trim() || '–',
              readingWithDate(reading.startValue, reading.startDate),
              readingWithDate(reading.endValue, reading.endDate),
              differenceCell,
              consumptionCell,
            ],
          ]
        return [
          ...result.segments.map((segment, index): TableCell[] => [
            index === 0 ? (unit?.label ?? '–') : '',
            ...segmentCells(segment, formatMeterValue(segment.consumption)),
            '',
          ]),
          [
            '',
            { text: 'Verbrauch gesamt', colSpan: 3, bold: true },
            {},
            {},
            { ...differenceCell, bold: true },
            consumptionCell,
          ],
        ]
      })
    if (rows.length === 0) continue
    content.push(
      {
        text: `Heizkreis ${buildingName(appData, circuit.buildingId)}`,
        bold: true,
        fontSize: 8,
        margin: [0, 2, 0, 2],
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', '*', 'auto', 'auto'],
          body: [
            [
              { text: 'Nutzungseinheit', style: 'th' },
              { text: 'Zähler-Nr.', style: 'th' },
              { text: 'Stand alt (Datum)', style: 'th' },
              { text: 'Stand neu (Datum)', style: 'th' },
              { text: 'Differenz', style: 'th', alignment: 'right' },
              { text: 'Verbrauchseinheiten', style: 'th', alignment: 'right' },
            ],
            ...rows,
          ],
        },
        layout: 'lightHorizontalLines',
        fontSize: 7.5,
        margin: [0, 0, 0, 6],
      },
    )
  }
  content.push({
    text: '„!“ = Zählerdifferenz weicht um mehr als 0,5 von den abgerechneten Verbrauchseinheiten ab.',
    fontSize: 7,
    color: '#5a6a78',
    margin: [0, 0, 0, 8],
  })
  return content
}
