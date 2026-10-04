/**
 * Zählerstände je Belegung (`OccupancyPeriod.heatMeterReading`) für die
 * Einzelabrechnung („Ihre Verbrauchserfassung“) und die interne
 * Gesamtabrechnung (Tabelle aller Zählerstände je Heizkreis).
 */
import type { Content, TableCell } from 'pdfmake/interfaces'
import type { CalculationOutput } from '@nebenkosten/core'
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
    .replace(/[  ]/gu, ' ')
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

/** Stand neu − Stand alt, falls beide Stände vorliegen. */
export function readingDifference(
  reading: HeatMeterReading | null | undefined,
): number | null {
  if (
    typeof reading?.startValue !== 'number' ||
    typeof reading.endValue !== 'number'
  )
    return null
  return Math.round((reading.endValue - reading.startValue) * 1000) / 1000
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
      .map((occupancy): TableCell[] => {
        const unit = units.find(({ id }) => id === occupancy.unitId)
        const reading = occupancy.heatMeterReading ?? {}
        const difference = readingDifference(reading)
        const consumption = occupancy.consumptionUnits?.value
        const deviates =
          difference !== null &&
          (consumption == null || Math.abs(difference - consumption) > 0.5)
        return [
          unit?.label ?? '–',
          reading.meterNumber?.trim() || '–',
          readingWithDate(reading.startValue, reading.startDate),
          readingWithDate(reading.endValue, reading.endDate),
          {
            text: difference === null ? '–' : formatMeterValue(difference),
            alignment: 'right',
            noWrap: true,
          },
          {
            text: `${consumption == null ? '–' : formatNumber(consumption)}${
              occupancy.consumptionUnitsEstimated ? ' (geschätzt)' : ''
            }${deviates ? ' !' : ''}`,
            alignment: 'right',
            noWrap: true,
          },
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
