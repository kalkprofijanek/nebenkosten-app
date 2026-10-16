/**
 * Plausibilität von Zählerstandsreihen (PR-31). Handschriftliche Ablesebögen
 * enthalten typische Fehler: weggelassene Nachkommastelle (Faktor 10),
 * vertauschte Spalten, stehende Zähler und rückläufige Reihen. Die Fehler sind
 * nur im Vergleich mehrerer Ablesungen eines Zählers erkennbar.
 *
 * Die Prüfung ändert nichts: Jeder Befund nennt die alternative Lesung und
 * den daraus folgenden Verbrauch; die Entscheidung trifft der Vermieter.
 *
 * Ein Stand gilt am Ende seines Ablesetags; der Verbrauch zwischen zwei
 * Ablesungen am Tag a und b umfasst die Tage a + 1 bis b (Gradtage nach
 * VDI 2067, ADR-0007).
 *
 * Offene Entscheidung: Die Toleranz für den Gradtagsanteil (Vorgabe ± 20
 * Prozentpunkte) ist eine Prüfschwelle der App ohne Rechtsgrundlage.
 */
import { degreeDayPermille } from './degree-days'

export interface MeterReadingPoint {
  readonly id: string
  /** ISO-Datum der Ablesung (`YYYY-MM-DD`). */
  readonly date: string
  readonly value: number
}

export type MeterReadingFindingKind =
  | 'decreasing'
  | 'stalled'
  | 'digit_drop'
  | 'swapped_columns'
  | 'implausible_share'

export interface MeterReadingFinding {
  readonly kind: MeterReadingFindingKind
  /** Betroffene Ablesungen in zeitlicher Reihenfolge. */
  readonly readingIds: readonly string[]
  /** Vorgeschlagene Werte je betroffener Ablesung (gleiche Reihenfolge). */
  readonly alternativeValues: readonly number[] | null
  /** Verbrauch erste → letzte Ablesung, wie erfasst. */
  readonly consumption: number
  /** Verbrauch erste → letzte Ablesung mit der alternativen Lesung. */
  readonly alternativeConsumption: number | null
  /** Nur `implausible_share`: Anteil am Gesamtverbrauch, gemessen. */
  readonly actualShare?: number
  /** Nur `implausible_share`: Anteil nach Gradtagszahlen. */
  readonly expectedShare?: number
}

export interface MeterReadingSeriesOptions {
  /** Erlaubte Abweichung des Teilverbrauchs vom Gradtagsanteil (0–1). */
  readonly shareTolerance?: number
  /** Mindestzahl aufeinanderfolgender Perioden ohne Änderung. */
  readonly stalledPeriods?: number
}

const DAY_MS = 86_400_000

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10)
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

function monotonic(values: readonly number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value >= values[index - 1]!,
  )
}

/**
 * Befunde je Zählerstandsreihe. Reihenfolge der Prüfung je Störung:
 * Faktor 10 vor vertauschten Spalten vor „rückläufig“, damit der Befund die
 * wahrscheinlichste Erklärung nennt.
 */
export function assessMeterReadingSeries(
  readings: readonly MeterReadingPoint[],
  options: MeterReadingSeriesOptions = {},
): MeterReadingFinding[] {
  const tolerance = options.shareTolerance ?? 0.2
  const stalledPeriods = options.stalledPeriods ?? 2
  const series = [...readings].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
  if (series.length < 2) return []
  const values = series.map(({ value }) => value)
  const consumption = round(values.at(-1)! - values[0]!)
  const findings: MeterReadingFinding[] = []
  const withValues = (replacement: Map<number, number>) => {
    const next = values.map((value, index) => replacement.get(index) ?? value)
    return { next, total: round(next.at(-1)! - next[0]!) }
  }

  const explained = new Set<number>()
  for (let index = 1; index < values.length; index += 1) {
    if (values[index]! >= values[index - 1]!) continue
    if (explained.has(index)) continue
    // Faktor 10: der fallende oder der vorherige Wert – nur, wenn beide
    // Werte tatsächlich um rund eine Zehnerpotenz auseinanderliegen.
    const magnitude =
      values[index]! > 0 && values[index - 1]! / values[index]! >= 5
    const candidates: [number, number][] = magnitude
      ? [
          [index, values[index]! * 10],
          [index - 1, values[index - 1]! / 10],
        ]
      : []
    // Erklären beide Lesungen die Reihe, ist die mit dem kleineren
    // Gesamtverbrauch wahrscheinlicher: ein Stellenfehler bläht ihn auf.
    const drop = candidates
      .filter(([at, value]) =>
        monotonic(withValues(new Map([[at, value]])).next),
      )
      .sort(
        ([leftAt, left], [rightAt, right]) =>
          withValues(new Map([[leftAt, left]])).total -
          withValues(new Map([[rightAt, right]])).total,
      )[0]
    if (drop) {
      const [at, value] = drop
      const { total } = withValues(new Map([[at, value]]))
      findings.push({
        kind: 'digit_drop',
        readingIds: [series[at]!.id],
        alternativeValues: [round(value)],
        consumption,
        alternativeConsumption: total,
      })
      explained.add(at).add(at + 1)
      continue
    }
    // Vertauschte Spalten: Nachbarwerte tauschen. Bei nur zwei Ablesungen
    // erklärt ein Tausch jede Abnahme; es braucht eine stützende Ablesung.
    const swap = new Map([
      [index - 1, values[index]!],
      [index, values[index - 1]!],
    ])
    if (values.length >= 3 && monotonic(withValues(swap).next)) {
      findings.push({
        kind: 'swapped_columns',
        readingIds: [series[index - 1]!.id, series[index]!.id],
        alternativeValues: [values[index]!, values[index - 1]!],
        consumption,
        alternativeConsumption: withValues(swap).total,
      })
      explained.add(index).add(index + 1)
      continue
    }
    findings.push({
      kind: 'decreasing',
      readingIds: [series[index - 1]!.id, series[index]!.id],
      alternativeValues: null,
      consumption,
      alternativeConsumption: null,
    })
  }

  // Stehender Zähler: mindestens `stalledPeriods` Perioden ohne Änderung.
  let start = 0
  for (let index = 1; index <= values.length; index += 1) {
    if (index < values.length && values[index] === values[index - 1]) continue
    if (index - 1 - start >= stalledPeriods)
      findings.push({
        kind: 'stalled',
        readingIds: series.slice(start, index).map(({ id }) => id),
        alternativeValues: null,
        consumption,
        alternativeConsumption: null,
      })
    start = index
  }

  // Gradtagsanteil der Teilperioden (nur bei steigender Reihe sinnvoll).
  if (findings.length === 0 && values.length >= 3 && consumption > 0) {
    const first = series[0]!.date
    const last = series.at(-1)!.date
    const totalPermille = degreeDayPermille(nextDay(first), last)
    if (totalPermille > 0)
      for (let index = 1; index < series.length; index += 1) {
        const expectedShare = round(
          degreeDayPermille(
            nextDay(series[index - 1]!.date),
            series[index]!.date,
          ) / totalPermille,
        )
        const actualShare = round(
          (values[index]! - values[index - 1]!) / consumption,
        )
        if (Math.abs(actualShare - expectedShare) <= tolerance) continue
        findings.push({
          kind: 'implausible_share',
          readingIds: [series[index - 1]!.id, series[index]!.id],
          alternativeValues: null,
          consumption,
          alternativeConsumption: null,
          actualShare,
          expectedShare,
        })
      }
  }
  return findings
}
