/**
 * Aufteilung des Jahresverbrauchs einer Wohnung mit mehreren Nutzungen nach
 * Gradtagszahlen (VDI 2067, ADR-0007; PR-27 Teil B Punkt 1).
 *
 * Nach ADR-0009 ist das nur der Ausweg nach § 9b Abs. 3 HeizKV, wenn eine
 * Zwischenablesung nicht möglich war; der Grund ist Pflicht und wird der
 * Erläuterung vorangestellt. Das Ergebnis ist keine Schätzung nach § 9a,
 * `consumptionUnitsEstimated` bleibt deshalb ungesetzt.
 */
import { splitByDegreeDays } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'

/** Längenbegrenzung des Grundes, damit die Erläuterung lesbar bleibt. */
export const MAX_DEGREE_DAY_REASON_LENGTH = 300

export interface DegreeDaySplitShare {
  readonly occupancy: OccupancyPeriod
  readonly from: string
  readonly to: string
  /** Gradtagsanteil des Zeitraums in Promille (drei Nachkommastellen). */
  readonly permille: number
  /** Anteil am Gesamtverbrauch (drei Nachkommastellen). */
  readonly value: number
}

export type DegreeDaySplitPlan =
  | {
      readonly ok: true
      readonly total: number
      /** Summe der Promille aller Zeiträume (ganzes Jahr ≈ 1.000 ‰). */
      readonly permilleTotal: number
      readonly shares: readonly DegreeDaySplitShare[]
    }
  | { readonly ok: false; readonly problem: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function germanDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

const number = (value: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(value)

/** Alle Nutzungen (Mieter und Leerstand) einer Wohnung im Jahr, nach Beginn. */
export function unitOccupancies(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  unitId: string,
): OccupancyPeriod[] {
  return data.billingData.occupancyPeriods
    .filter(
      (occupancy) =>
        occupancy.billingPeriodId === period.id && occupancy.unitId === unitId,
    )
    .sort((left, right) =>
      (left.from ?? period.periodStart).localeCompare(
        right.from ?? period.periodStart,
      ),
    )
}

/** Fehlertext, wenn die Zeiträume das Jahr nicht lückenlos abdecken. */
function coverageProblem(
  ranges: readonly { from: string; to: string }[],
  period: Readonly<BillingPeriod>,
): string | null {
  const prefix =
    'Die Nutzungszeiträume decken das Abrechnungsjahr nicht lückenlos ab'
  let expected = period.periodStart
  for (const { from, to } of ranges) {
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from)
      return `${prefix}: ungültiger Zeitraum ${from} bis ${to}.`
    if (from > expected)
      return `${prefix}: Lücke vom ${germanDate(expected)} bis ${germanDate(shiftDay(from, -1))}. Bitte unter „Nutzer“ einen Leerstand ergänzen oder die Daten korrigieren.`
    if (from < expected)
      return `${prefix}: Zeiträume überschneiden sich am ${germanDate(from)}.`
    expected = shiftDay(to, 1)
  }
  if (expected <= period.periodEnd)
    return `${prefix}: Lücke vom ${germanDate(expected)} bis ${germanDate(period.periodEnd)}. Bitte unter „Nutzer“ einen Leerstand ergänzen oder die Daten korrigieren.`
  return null
}

export function degreeDaySplitPlan(
  data: Readonly<AppDataFile>,
  billingPeriodId: string,
  unitId: string,
  total: number,
): DegreeDaySplitPlan {
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    return { ok: false, problem: 'Abrechnungsjahr wurde nicht gefunden.' }
  const occupancies = unitOccupancies(data, period, unitId)
  if (occupancies.length < 2)
    return {
      ok: false,
      problem:
        'Die Wohnung hat in diesem Jahr nur eine Nutzung; eine Aufteilung ist nicht nötig.',
    }
  if (!Number.isFinite(total) || total < 0)
    return {
      ok: false,
      problem: 'Gesamtverbrauch: Bitte eine Zahl ab 0 eingeben.',
    }
  const ranges = occupancies.map((occupancy) => ({
    id: occupancy.id,
    from: occupancy.from ?? period.periodStart,
    to: occupancy.to ?? period.periodEnd,
  }))
  const problem = coverageProblem(ranges, period)
  if (problem) return { ok: false, problem }
  const split = splitByDegreeDays(total, ranges)
  const shares = split.map((share, index) => ({
    occupancy: occupancies[index]!,
    from: ranges[index]!.from,
    to: ranges[index]!.to,
    permille: share.permille,
    value: share.value,
  }))
  return {
    ok: true,
    total,
    permilleTotal:
      Math.round(
        shares.reduce((sum, { permille }) => sum + permille, 0) * 1_000,
      ) / 1_000,
    shares,
  }
}

/**
 * Erläuterung je Nutzung: Begründung nach § 9b Abs. 3 HeizKV und Rechenweg,
 * z. B. „… 1.000 Einheiten × 450 ‰ ÷ 1.000 ‰ = 450 Einheiten“.
 */
export function degreeDaySplitExplanation(
  reason: string,
  plan: Extract<DegreeDaySplitPlan, { ok: true }>,
  share: DegreeDaySplitShare,
): string {
  const justification = reason.trim().replace(/[.\s]+$/u, '')
  return `Keine Zwischenablesung möglich: ${justification}. Aufteilung nach Gradtagszahlen (§ 9b Abs. 3 HeizKV, VDI 2067), Zeitraum ${germanDate(share.from)} bis ${germanDate(share.to)}: ${number(plan.total)} Einheiten × ${number(share.permille)} ‰ ÷ ${number(plan.permilleTotal)} ‰ = ${number(share.value)} Einheiten.`
}
