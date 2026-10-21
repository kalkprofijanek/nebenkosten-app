/** Kalenderhilfen (UTC, ISO-Datum `YYYY-MM-DD`) für die Monatsinformation. */

const DAY_MS = 86_400_000

export interface CalendarMonth {
  /** `YYYY-MM`. */
  key: string
  year: number
  /** 1–12. */
  month: number
  /** Erster Kalendertag. */
  from: string
  /** Letzter Kalendertag. */
  to: string
  days: number
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0')
}

function isoFromTime(time: number): string {
  const date = new Date(time)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function timeOf(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
}

/** Monat aus Jahr und Monatszahl (Überlauf erlaubt, z. B. Monat 0 = Dezember Vorjahr). */
export function calendarMonth(year: number, month: number): CalendarMonth {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const y = first.getUTCFullYear()
  const m = first.getUTCMonth() + 1
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    key: `${pad(y, 4)}-${pad(m)}`,
    year: y,
    month: m,
    from: `${pad(y, 4)}-${pad(m)}-01`,
    to: `${pad(y, 4)}-${pad(m)}-${pad(days)}`,
    days,
  }
}

/** Liest `YYYY-MM`; ungültiges Format oder Monat → RangeError. */
export function parseMonth(value: string): CalendarMonth {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(value)
  if (!match)
    throw new RangeError(`Ungültiger Monat (erwartet YYYY-MM): ${value}`)
  return calendarMonth(Number(match[1]), Number(match[2]))
}

/** Monat um `offset` Monate verschoben. */
export function shiftMonth(
  month: CalendarMonth,
  offset: number,
): CalendarMonth {
  return calendarMonth(month.year, month.month + offset)
}

export function addDays(date: string, days: number): string {
  return isoFromTime(timeOf(date) + days * DAY_MS)
}

/** Tage von `from` nach `to` (vorzeichenbehaftet). */
export function daysBetween(from: string, to: string): number {
  return Math.round((timeOf(to) - timeOf(from)) / DAY_MS)
}

/** Kalendertage einschließlich beider Grenzen. */
export function inclusiveDays(from: string, to: string): number {
  return daysBetween(from, to) + 1
}

export interface DateInterval {
  from: string
  to: string
}

/** Schnittmenge zweier Zeiträume oder `null`. */
export function intersect(
  left: DateInterval,
  right: DateInterval,
): DateInterval | null {
  const from = left.from > right.from ? left.from : right.from
  const to = left.to < right.to ? left.to : right.to
  return from <= to ? { from, to } : null
}
