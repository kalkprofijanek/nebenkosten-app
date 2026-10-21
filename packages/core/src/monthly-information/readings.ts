/**
 * Auswahl des Monatsendstands eines Zählers (ADR-0014 Schritt 2).
 */
import type { MeterReading } from '@nebenkosten/schema'
import { addDays, daysBetween } from './dates'

/**
 * Toleranz in Kalendertagen um den letzten Tag des Monats, innerhalb der
 * eine Ablesung als Monatsendstand gilt. Funkzähler speichern den Stand
 * meist zum Monatsletzten bzw. zum Monatsersten 00:00 Uhr; Auslesesoftware
 * und manuelle Ablesung weichen oft um wenige Tage ab. ±3 Tage halten den
 * Fehler klein (≈ 10 % eines Monats im ungünstigsten Fall) und lassen
 * benachbarte Monatsendstände nie zusammenfallen. Fachliche Festlegung
 * durch den Nutzer steht aus (offener Punkt).
 */
export const MONTH_END_READING_TOLERANCE_DAYS = 3

export type MonthEndReadingSelection =
  | {
      status: 'found'
      reading: MeterReading
      /** Wirksamer Stichtag (Tagesende) der Ablesung. */
      effectiveDate: string
    }
  | { status: 'missing' }
  | { status: 'conflict'; readingIds: string[] }

/**
 * Wirksamer Stichtag als Tagesende: eine Ablesung mit `start_of_day` gibt
 * den Stand am Ende des Vortags wieder. Ohne Tagesgrenze gilt das Datum.
 */
function effectiveEndOfDay(reading: MeterReading): string | null {
  if (!reading.date) return null
  return reading.boundary === 'start_of_day'
    ? addDays(reading.date, -1)
    : reading.date
}

/**
 * Wählt aus den Ablesungen eines Zählers diejenige, deren wirksamer Stichtag
 * dem Monatsletzten `monthEnd` am nächsten liegt (±
 * `MONTH_END_READING_TOLERANCE_DAYS`). Bei gleichem Abstand gilt die
 * Ablesung vor dem Monatsende. Mehrere Ablesungen am selben Stichtag mit
 * unterschiedlichem Stand ergeben `conflict` (kein Raten), gleiche Stände
 * werden als Duplikat behandelt.
 */
export function selectMonthEndReading(
  readings: readonly MeterReading[],
  monthEnd: string,
): MonthEndReadingSelection {
  const candidates = readings.flatMap((reading) => {
    const effectiveDate = effectiveEndOfDay(reading)
    if (!effectiveDate) return []
    const offset = daysBetween(monthEnd, effectiveDate)
    return Math.abs(offset) <= MONTH_END_READING_TOLERANCE_DAYS
      ? [{ reading, effectiveDate, offset }]
      : []
  })
  if (candidates.length === 0) return { status: 'missing' }
  candidates.sort(
    (left, right) =>
      Math.abs(left.offset) - Math.abs(right.offset) ||
      left.offset - right.offset ||
      left.reading.id.localeCompare(right.reading.id),
  )
  const best = candidates[0]!
  const sameDay = candidates.filter(
    ({ effectiveDate }) => effectiveDate === best.effectiveDate,
  )
  if (
    sameDay.some(
      ({ reading }) => reading.value.value !== best.reading.value.value,
    )
  )
    return {
      status: 'conflict',
      readingIds: sameDay.map(({ reading }) => reading.id),
    }
  return {
    status: 'found',
    reading: best.reading,
    effectiveDate: best.effectiveDate,
  }
}
