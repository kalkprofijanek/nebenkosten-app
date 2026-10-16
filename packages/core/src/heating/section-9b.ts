/**
 * Nutzerwechsel ohne Zwischenablesung (§ 9b Abs. 3 HeizKV, ADR-0010).
 *
 * Wortlaut (geprüft am 10.10.2026):
 * - Abs. 1: Bei Nutzerwechsel ist eine Zwischenablesung vorzunehmen.
 * - Abs. 2: Die verbrauchsabhängigen Kosten werden auf Grundlage der
 *   Zwischenablesung, die übrigen Kosten des Wärmeverbrauchs nach
 *   Gradtagszahlen oder zeitanteilig und die übrigen Kosten des
 *   Warmwasserverbrauchs zeitanteilig auf Vor- und Nachnutzer aufgeteilt.
 * - Abs. 3: Ist eine Zwischenablesung nicht möglich, sind die **gesamten**
 *   Kosten nach den Maßstäben des Abs. 2 für die übrigen Kosten aufzuteilen.
 *
 * Bisher wurden ohne Zwischenablesung die Verbrauchseinheiten nach
 * Gradtagszahlen aufgeteilt, die Grundkosten aber nach Kalendertagen
 * (gemischter Maßstab). Mit `OccupancyPeriod.section9bAllocation =
 * 'degree_days'` gilt der Gradtagsanteil auch für die Grundkosten der
 * Heizung und den CO₂-Grundanteil; Warmwasser bleibt zeitanteilig. Bei
 * `'time'` bleibt es für alle Kostenanteile beim Zeitanteil; die
 * Verbrauchseinheiten müssen dann zeitanteilig aufgeteilt sein.
 */
import type { OccupancyPeriod } from '@nebenkosten/schema'
import { calculateOccupancyDays, calculatePeriodDays } from '../periods'
import { degreeDayPermille } from './degree-days'

export type Section9bAllocation = NonNullable<
  OccupancyPeriod['section9bAllocation']
>

export interface Section9bPeriod {
  readonly periodStart: string
  readonly periodEnd: string
}

export interface Section9bShare {
  readonly occupancyId: string
  readonly unitId: string
  readonly allocation: Section9bAllocation
  /** Nutzungszeitraum innerhalb des Abrechnungszeitraums. */
  readonly from: string
  readonly to: string
  readonly days: number
  /** Zeitanteil am Abrechnungszeitraum (Tage ÷ Tage des Zeitraums). */
  readonly timeFactor: number
  /** Gradtagsanteil des eigenen Zeitraums in Promille (VDI 2067). */
  readonly permille: number
  /** Summe der Promille aller nach § 9b Abs. 3 aufgeteilten Nutzungen. */
  readonly groupPermille: number
  /** Summe der Zeitanteile aller nach § 9b Abs. 3 aufgeteilten Nutzungen. */
  readonly groupTimeFactor: number
  /**
   * Faktor für Heizungs-Grundkosten und CO₂-Grundanteil anstelle des
   * Zeitanteils; bei `time` gleich dem Zeitanteil.
   */
  readonly baseTimeFactor: number
  /** Wechseltage (erster Tag der neuen Nutzung), die diese Nutzung betreffen. */
  readonly changeDates: readonly string[]
}

function maxIso(left: string, right: string): string {
  return left > right ? left : right
}

function minIso(left: string, right: string): string {
  return left < right ? left : right
}

/**
 * Anteile nach § 9b Abs. 3 HeizKV je Nutzung mit `section9bAllocation`.
 *
 * Gruppe = alle Nutzungen derselben Wohnung (und desselben Kostenbereichs)
 * mit gesetztem Feld. Bei `degree_days` erhält jede Nutzung
 * Zeitanteil der Gruppe × eigener Gradtagsanteil ÷ Gradtagsanteil der Gruppe.
 * Deckt die Gruppe den ganzen Abrechnungszeitraum ab, ist das genau der
 * Gradtagsanteil am Abrechnungszeitraum (z. B. 450 ‰ ÷ 1.000 ‰). Die Summe
 * der Faktoren der Wohnung bleibt erhalten; nur die Verteilung zwischen Vor-
 * und Nachnutzer ändert sich.
 *
 * Offene Entscheidung: Deckt die Gruppe nur einen Teil des Jahres ab (z. B.
 * ein weiterer Wechsel mit Zwischenablesung), wird der Zeitanteil der Gruppe
 * nach Gradtagszahlen verteilt; die HeizKV regelt diesen Fall nicht
 * ausdrücklich.
 */
export function section9bShares(
  occupancies: readonly Readonly<OccupancyPeriod>[],
  period: Section9bPeriod,
): Map<string, Section9bShare> {
  const periodDays = calculatePeriodDays(period.periodStart, period.periodEnd)
  const groups = new Map<string, Readonly<OccupancyPeriod>[]>()
  for (const occupancy of occupancies) {
    if (occupancy.section9bAllocation == null) continue
    const scope =
      occupancy.costScope?.kind === 'building'
        ? occupancy.costScope.buildingId
        : ''
    const key = `${occupancy.unitId}\u0000${scope}`
    const list = groups.get(key) ?? []
    list.push(occupancy)
    groups.set(key, list)
  }
  const result = new Map<string, Section9bShare>()
  for (const group of groups.values()) {
    const items = group
      .map((occupancy) => {
        const from = maxIso(
          occupancy.from ?? period.periodStart,
          period.periodStart,
        )
        const to = minIso(occupancy.to ?? period.periodEnd, period.periodEnd)
        const days = calculateOccupancyDays(
          period.periodStart,
          period.periodEnd,
          occupancy.from,
          occupancy.to,
        )
        return {
          occupancy,
          from,
          to,
          days,
          timeFactor: days / periodDays,
          permille: days > 0 ? degreeDayPermille(from, to) : 0,
        }
      })
      .sort((left, right) => left.from.localeCompare(right.from))
    const groupPermille = items.reduce((sum, item) => sum + item.permille, 0)
    const groupTimeFactor = items.reduce(
      (sum, item) => sum + item.timeFactor,
      0,
    )
    items.forEach((item, index) => {
      const allocation = item.occupancy.section9bAllocation!
      const changeDates = [
        ...(index > 0 && item.from > period.periodStart ? [item.from] : []),
        ...(index < items.length - 1 ? [items[index + 1]!.from] : []),
      ]
      result.set(item.occupancy.id, {
        occupancyId: item.occupancy.id,
        unitId: item.occupancy.unitId,
        allocation,
        from: item.from,
        to: item.to,
        days: item.days,
        timeFactor: item.timeFactor,
        permille: item.permille,
        groupPermille,
        groupTimeFactor,
        baseTimeFactor:
          allocation === 'degree_days' && groupPermille > 0
            ? (groupTimeFactor * item.permille) / groupPermille
            : item.timeFactor,
        changeDates,
      })
    })
  }
  return result
}

/**
 * Faktor für Heizungs-Grundkosten und CO₂-Grundanteil: Gradtagsanteil nach
 * § 9b Abs. 3, sonst Zeitanteil (Altverhalten).
 */
export function heatingBaseTimeFactor(context: {
  readonly timeFactor: number
  readonly heatingBaseTimeFactor?: number | undefined
}): number {
  return context.heatingBaseTimeFactor ?? context.timeFactor
}

/** Setzt `heatingBaseTimeFactor` für Nutzungen nach § 9b Abs. 3. */
export function withSection9bBaseFactors<
  T extends {
    readonly occupancy: Readonly<OccupancyPeriod>
    heatingBaseTimeFactor?: number | undefined
  },
>(contexts: T[], period: Section9bPeriod): T[] {
  if (!contexts.some(({ occupancy }) => occupancy.section9bAllocation != null))
    return contexts
  const shares = section9bShares(
    contexts.map(({ occupancy }) => occupancy),
    period,
  )
  return contexts.map((context) => {
    const share = shares.get(context.occupancy.id)
    return share === undefined
      ? context
      : { ...context, heatingBaseTimeFactor: share.baseTimeFactor }
  })
}
