const DAY_IN_MILLISECONDS = 86_400_000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

function parseIsoDate(value: string, fieldName: string): number {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} muss ein ISO-Datum YYYY-MM-DD sein`)
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${fieldName} ist kein gültiges ISO-Datum`)
  }
  return parsed
}

export function daysInYear(year: number): 365 | 366 {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365
}

export function calculatePeriodDays(from: string, to: string): number {
  const start = parseIsoDate(from, 'Periodenbeginn')
  const end = parseIsoDate(to, 'Periodenende')
  if (end < start) {
    throw new Error('Abrechnungszeitraum endet vor seinem Beginn')
  }
  return Math.round((end - start) / DAY_IN_MILLISECONDS) + 1
}

export function calculateOccupancyDays(
  periodStart: string,
  periodEnd: string,
  occupancyStart?: string | null,
  occupancyEnd?: string | null,
): number {
  const periodStartMs = parseIsoDate(periodStart, 'Periodenbeginn')
  const periodEndMs = parseIsoDate(periodEnd, 'Periodenende')
  if (periodEndMs < periodStartMs) {
    throw new Error('Abrechnungszeitraum endet vor seinem Beginn')
  }

  const start = Math.max(
    periodStartMs,
    occupancyStart
      ? parseIsoDate(occupancyStart, 'Nutzungsbeginn')
      : periodStartMs,
  )
  const end = Math.min(
    periodEndMs,
    occupancyEnd ? parseIsoDate(occupancyEnd, 'Nutzungsende') : periodEndMs,
  )
  if (end < start) return 0
  return Math.round((end - start) / DAY_IN_MILLISECONDS) + 1
}

export function calculateMonthlyOccupancyFactor(
  periodStart: string,
  periodEnd: string,
  occupancyStart?: string | null,
  occupancyEnd?: string | null,
): number {
  const periodStartMs = parseIsoDate(periodStart, 'Periodenbeginn')
  const periodEndMs = parseIsoDate(periodEnd, 'Periodenende')
  if (periodEndMs < periodStartMs) {
    throw new Error('Abrechnungszeitraum endet vor seinem Beginn')
  }

  const start = Math.max(
    periodStartMs,
    occupancyStart
      ? parseIsoDate(occupancyStart, 'Nutzungsbeginn')
      : periodStartMs,
  )
  const end = Math.min(
    periodEndMs,
    occupancyEnd ? parseIsoDate(occupancyEnd, 'Nutzungsende') : periodEndMs,
  )
  if (end < start) return 0

  const startDate = new Date(start)
  const endDate = new Date(end)
  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  let factor = 0

  while (
    year < endDate.getUTCFullYear() ||
    (year === endDate.getUTCFullYear() && month <= endDate.getUTCMonth())
  ) {
    const monthStart = Date.UTC(year, month, 1)
    const nextMonthStart = Date.UTC(year, month + 1, 1)
    const monthEnd = nextMonthStart - DAY_IN_MILLISECONDS
    const overlapStart = Math.max(start, monthStart)
    const overlapEnd = Math.min(end, monthEnd)
    if (overlapEnd >= overlapStart) {
      const occupiedDays =
        Math.round((overlapEnd - overlapStart) / DAY_IN_MILLISECONDS) + 1
      const daysInMonth = Math.round(
        (nextMonthStart - monthStart) / DAY_IN_MILLISECONDS,
      )
      factor += occupiedDays / daysInMonth
    }
    month += 1
    if (month === 12) {
      month = 0
      year += 1
    }
  }

  return factor
}
