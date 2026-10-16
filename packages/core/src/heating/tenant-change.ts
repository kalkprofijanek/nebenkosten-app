/**
 * Nutzerwechsel innerhalb eines Abrechnungszeitraums und Zwischenablesung
 * (§ 9b HeizKV, ADR-0009).
 *
 * § 9b Abs. 1: Bei jedem Nutzerwechsel ist eine Zwischenablesung der
 * betroffenen Räume vorzunehmen. Nur wenn sie nicht möglich ist oder keine
 * hinreichend genaue Ermittlung zulässt, wird nach Gradtagszahlen oder
 * zeitanteilig aufgeteilt (Abs. 3). Ein Wechsel zwischen Leerstand und
 * Mieter ist ebenfalls ein Nutzerwechsel (den Leerstand trägt der
 * Vermieter).
 */
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'

export interface TenantChange {
  unitId: string
  /** Erster Tag der neuen Nutzung. */
  date: string
  previousOccupancyId: string
  nextOccupancyId: string
  /**
   * Ablesestand zum Wechsel erfasst: Endstand der vorigen oder Anfangsstand
   * der neuen Nutzung mit Datum am Wechseltag oder dem Tag davor.
   */
  hasInterimReading: boolean
}

function previousDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function readAt(date: string | null | undefined, value: unknown, day: string) {
  return (
    typeof value === 'number' && (date === day || date === previousDay(day))
  )
}

/** Nutzerwechsel je Wohnung im Abrechnungszeitraum, nach Datum geordnet. */
export function tenantChanges(
  data: Readonly<AppDataFile>,
  period: Readonly<BillingPeriod>,
): TenantChange[] {
  const byUnit = new Map<string, OccupancyPeriod[]>()
  for (const occupancy of data.billingData.occupancyPeriods) {
    if (occupancy.billingPeriodId !== period.id) continue
    const list = byUnit.get(occupancy.unitId) ?? []
    list.push(occupancy)
    byUnit.set(occupancy.unitId, list)
  }
  const changes: TenantChange[] = []
  for (const [unitId, occupancies] of byUnit) {
    const sorted = [...occupancies].sort((left, right) =>
      (left.from ?? period.periodStart).localeCompare(
        right.from ?? period.periodStart,
      ),
    )
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1]!
      const next = sorted[index]!
      const date = next.from ?? period.periodStart
      if (date <= period.periodStart || date > period.periodEnd) continue
      changes.push({
        unitId,
        date,
        previousOccupancyId: previous.id,
        nextOccupancyId: next.id,
        hasInterimReading:
          readAt(
            previous.heatMeterReading?.endDate,
            previous.heatMeterReading?.endValue,
            date,
          ) ||
          readAt(
            next.heatMeterReading?.startDate,
            next.heatMeterReading?.startValue,
            date,
          ),
      })
    }
  }
  return changes.sort((left, right) => left.date.localeCompare(right.date))
}
