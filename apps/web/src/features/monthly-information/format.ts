import type {
  MonthlyAverageUserUnavailableReason,
  MonthlyValueUnavailableReason,
} from '@nebenkosten/core'

const kwhFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const m3Format = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const readingFormat = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 3,
})

/** kWh als ganze Zahl, deutsch formatiert. */
export const formatKwh = (value: number) => kwhFormat.format(value)
/** m³ mit zwei Nachkommastellen, deutsch formatiert. */
export const formatM3 = (value: number) => m3Format.format(value)
/** Zählerstand wie erfasst (bis drei Nachkommastellen). */
export const formatReading = (value: number) => readingFormat.format(value)

export function germanDate(iso: string): string {
  return iso.split('-').reverse().join('.')
}

export const VALUE_REASON_LABELS: Record<
  MonthlyValueUnavailableReason,
  string
> = {
  reading_missing: 'Zählerstand zum Monatsende fehlt',
  negative_consumption: 'Endstand kleiner als Anfangsstand',
  reading_conflict: 'widersprüchliche Zählerstände am selben Tag',
  meter_not_assigned: 'kein Zähler zugeordnet',
  no_usage: 'in diesem Monat nicht bewohnt',
  usage_unknown: 'Nutzung im Monat nicht feststellbar',
}

export const AVERAGE_REASON_LABELS: Record<
  MonthlyAverageUserUnavailableReason,
  string
> = {
  no_benchmark: 'keine Vergleichswerte am Heizkreis erfasst',
  area_unknown: 'Wohnfläche nicht erfasst',
  hot_water_energy_unknown:
    'Vergleichswert enthält Warmwasser, Warmwasserenergie unbekannt',
}

/** Kalendermonat `YYYY-MM` mit erstem und letztem Tag. */
export function monthBounds(key: string): { from: string; to: string } {
  const [year, month] = key.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}` }
}

/** Monat um `delta` Monate verschoben, Format `YYYY-MM`. */
export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number) as [number, number]
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Vormonat des lokalen Datums. */
export function previousMonthOf(date: Date): string {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return shiftMonthKey(key, -1)
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u
