/**
 * Gradtagszahlen nach VDI 2067 (Promille-Tabelle, ADR-0007).
 *
 * Verwendung:
 * - Aufteilung des Verbrauchs bei Nutzerwechsel ohne Zwischenablesung
 *   (§ 9b Abs. 2 HeizKV: verbrauchsabhängige Kosten nach Gradtagszahlen),
 * - Hochrechnung eines Teilzeitraums auf ein Jahr (Vergleich mit dem
 *   Durchschnittsnutzer, ADR-0004).
 *
 * Monatsanteile in Promille des Jahres; Juni bis August zusammen 40 ‰, die
 * Tabellen weisen diese drei Monate unterschiedlich aus und werden deshalb
 * als ein Block behandelt. Innerhalb eines Monats bzw. des Sommerblocks wird
 * gleichmäßig je Kalendertag verteilt (Februar im Schaltjahr: 29 Tage).
 */

/** Promille je Monat (Index 0 = Januar); Juni–August als Block. */
export const DEGREE_DAY_PERMILLE: readonly number[] = [
  170, 150, 130, 80, 40, 0, 0, 0, 30, 80, 120, 160,
]
/** Juni bis August zusammen. */
export const SUMMER_DEGREE_DAY_PERMILLE = 40

const DAY_MS = 86_400_000

function parseIsoDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match) throw new RangeError(`Ungültiges Datum: ${value}`)
  const time = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  )
  const check = new Date(time)
  if (
    check.getUTCFullYear() !== Number(match[1]) ||
    check.getUTCMonth() !== Number(match[2]) - 1 ||
    check.getUTCDate() !== Number(match[3])
  )
    throw new RangeError(`Ungültiges Datum: ${value}`)
  return time
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Promille eines einzelnen Kalendertags. */
function dayPermille(time: number): number {
  const date = new Date(time)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  if (month >= 5 && month <= 7)
    return (
      SUMMER_DEGREE_DAY_PERMILLE /
      (daysInMonth(year, 5) + daysInMonth(year, 6) + daysInMonth(year, 7))
    )
  return DEGREE_DAY_PERMILLE[month]! / daysInMonth(year, month)
}

/**
 * Gradtagsanteil des Zeitraums `from` bis `to` (beide Tage einschließlich)
 * in Promille. Ein ganzes Kalenderjahr ergibt 1.000 ‰; ein Zeitraum über
 * mehrere Jahre entsprechend mehr.
 */
export function degreeDayPermille(from: string, to: string): number {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (end < start)
    throw new RangeError(`Zeitraum endet vor seinem Beginn: ${from} bis ${to}`)
  let sum = 0
  for (let time = start; time <= end; time += DAY_MS) sum += dayPermille(time)
  return sum
}

export interface DegreeDayPeriod {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface DegreeDayShare {
  id: string
  /** Gradtagsanteil des Zeitraums in Promille, drei Nachkommastellen. */
  permille: number
  /** Anteil am Verbrauch, drei Nachkommastellen; Summe = Gesamtverbrauch. */
  value: number
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

/**
 * Teilt einen Verbrauch (z. B. HKV-Einheiten einer Wohnung ohne
 * Zwischenablesung) nach Gradtagszahlen auf die Zeiträume auf. Die Werte
 * werden auf drei Nachkommastellen gerundet; die Rundungsdifferenz trägt der
 * Zeitraum mit dem größten Anteil, sodass die Summe genau dem Verbrauch
 * entspricht.
 */
export function splitByDegreeDays(
  total: number,
  periods: readonly DegreeDayPeriod[],
): DegreeDayShare[] {
  if (!Number.isFinite(total) || total < 0)
    throw new RangeError('Der Verbrauch muss eine nicht negative Zahl sein.')
  if (periods.length === 0)
    throw new RangeError('Mindestens ein Zeitraum ist erforderlich.')
  const permilles = periods.map(({ from, to }) => degreeDayPermille(from, to))
  const sum = permilles.reduce((left, right) => left + right, 0)
  const shares = periods.map(({ id }, index) => ({
    id,
    permille: round3(permilles[index]!),
    value: round3((total * permilles[index]!) / sum),
  }))
  const difference = round3(
    total - shares.reduce((left, { value }) => left + value, 0),
  )
  if (difference !== 0) {
    const largest = permilles.indexOf(Math.max(...permilles))
    shares[largest]!.value = round3(shares[largest]!.value + difference)
  }
  return shares
}
