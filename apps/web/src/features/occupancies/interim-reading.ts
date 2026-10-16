/**
 * Hinweis „Zwischenablesung veranlassen“ bei der Erfassung eines
 * Nutzerwechsels (§ 9b Abs. 1 HeizKV, ADR-0009, PR-29 Teil B).
 *
 * Der Hinweis ist nicht blockierend. Er erscheint, sobald ein Auszug innerhalb
 * des Abrechnungszeitraums oder ein Einzug nach Periodenbeginn eingetragen
 * wird, das Jahr einen Heizkreis hat und zum Wechsel noch kein Ablesestand
 * erfasst ist. Als Ablesestand gilt wie in `tenantChanges` (Core) ein
 * Endstand der vorigen oder ein Anfangsstand der neuen Nutzung mit Datum am
 * Wechseltag oder dem Tag davor. Anders als `tenantChanges` braucht der
 * Hinweis keine zweite erfasste Nutzung: Beim Eintragen des Auszugs steht der
 * Nachmieter meist noch nicht fest.
 */
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'

export interface InterimReadingDraft {
  /** Bestehende Nutzung; leer beim Anlegen. */
  readonly occupancyId?: string
  readonly unitId: string
  readonly from?: string
  readonly to?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function germanDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

/** Stand mit Datum am Wechseltag (erster Tag der neuen Nutzung) oder davor. */
function readAt(
  date: string | null | undefined,
  value: number | null | undefined,
  changeDay: string,
): boolean {
  return (
    typeof value === 'number' &&
    (date === changeDay || date === shiftDay(changeDay, -1))
  )
}

function endReadAt(occupancy: OccupancyPeriod | undefined, changeDay: string) {
  return readAt(
    occupancy?.heatMeterReading?.endDate,
    occupancy?.heatMeterReading?.endValue,
    changeDay,
  )
}

function startReadAt(
  occupancy: OccupancyPeriod | undefined,
  changeDay: string,
) {
  return readAt(
    occupancy?.heatMeterReading?.startDate,
    occupancy?.heatMeterReading?.startValue,
    changeDay,
  )
}

export function interimReadingText(readingDate: string): string {
  return `Zwischenablesung zum ${germanDate(readingDate)} veranlassen (§ 9b Abs. 1 HeizKV): Messdienst beauftragen bzw. Stände selbst ablesen und unter ‚Verbrauch‘ erfassen. Eine Aufteilung nach Gradtagen ist nur zulässig, wenn die Ablesung nicht möglich war.`
}

/**
 * Hinweistexte für die eingegebenen Daten (höchstens einer für den Einzug und
 * einer für den Auszug); leer, wenn kein Hinweis nötig ist.
 */
export function interimReadingHints(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
  draft: InterimReadingDraft,
): string[] {
  if (
    !data.billingData.heatingCircuits.some(
      ({ billingPeriodId }) => billingPeriodId === period.id,
    )
  )
    return []
  const own = data.billingData.occupancyPeriods.find(
    ({ id }) => id === draft.occupancyId,
  )
  const neighbours = data.billingData.occupancyPeriods.filter(
    (occupancy) =>
      occupancy.billingPeriodId === period.id &&
      occupancy.unitId === draft.unitId &&
      occupancy.id !== draft.occupancyId,
  )
  const hints: string[] = []
  const from = draft.from && ISO_DATE.test(draft.from) ? draft.from : undefined
  const to = draft.to && ISO_DATE.test(draft.to) ? draft.to : undefined
  if (from && from > period.periodStart && from <= period.periodEnd) {
    const previous = neighbours.find(
      (occupancy) => (occupancy.to ?? period.periodEnd) === shiftDay(from, -1),
    )
    if (!startReadAt(own, from) && !endReadAt(previous, from))
      hints.push(interimReadingText(from))
  }
  if (to && to >= period.periodStart && to < period.periodEnd) {
    const changeDay = shiftDay(to, 1)
    const next = neighbours.find(
      (occupancy) => (occupancy.from ?? period.periodStart) === changeDay,
    )
    if (!endReadAt(own, changeDay) && !startReadAt(next, changeDay))
      hints.push(interimReadingText(to))
  }
  return hints
}
