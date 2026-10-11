/**
 * Prüfung der Aufteilung bei Nutzerwechsel nach § 9b HeizKV (ADR-0010).
 *
 * - Abs. 1: Zwischenablesung ist Pflicht und hat Vorrang.
 * - Abs. 3: Ist sie nicht möglich, sind die gesamten Kosten nach
 *   Gradtagszahlen oder zeitanteilig aufzuteilen (Warmwasser zeitanteilig).
 *   Ohne `section9bAllocation` rechnet der Kern die Grundkosten nach Tagen,
 *   die Verbrauchseinheiten aber wie erfasst (oft nach Gradtagszahlen
 *   aufgeteilt) – ein gemischter Maßstab.
 */
import { tenantChanges } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

const LABELS: Record<
  NonNullable<OccupancyPeriod['section9bAllocation']>,
  string
> = {
  degree_days: 'nach Gradtagszahlen',
  time: 'zeitanteilig',
}

function germanDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

function allocationLabel(value: OccupancyPeriod['section9bAllocation']) {
  return value == null ? 'nicht festgelegt' : LABELS[value]
}

export function section9bIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  if (
    !data.billingData.heatingCircuits.some(
      ({ billingPeriodId }) => billingPeriodId === period.id,
    )
  )
    return
  const byId = new Map(
    data.billingData.occupancyPeriods.map((item) => [item.id, item] as const),
  )
  for (const change of tenantChanges(data, period)) {
    const previous = byId.get(change.previousOccupancyId)
    const next = byId.get(change.nextOccupancyId)
    if (!previous || !next) continue
    const unit = data.masterData.units.find(({ id }) => id === change.unitId)
    const prefix = `Wohnung ${unit?.label || unit?.location || 'ohne Bezeichnung'}, Nutzerwechsel zum ${germanDate(change.date)}`
    const left = previous.section9bAllocation ?? null
    const right = next.section9bAllocation ?? null
    const entity = { type: 'OccupancyPeriod' as const, id: next.id }
    if (left !== right) {
      add(
        issue(
          'error',
          'heating.section9b_allocation_inconsistent',
          'occupancy',
          'Aufteilung nach § 9b Abs. 3 HeizKV uneinheitlich',
          {
            entity,
            detail: `${prefix}: Vornutzer ${allocationLabel(left)}, Nachnutzer ${allocationLabel(right)}. Vor- und Nachnutzer müssen nach demselben Maßstab aufgeteilt werden; bitte bei beiden Nutzungen „nach Gradtagszahlen“ oder „zeitanteilig“ wählen.`,
          },
        ),
      )
      continue
    }
    if (left === null) {
      if (!change.hasInterimReading)
        add(
          issue(
            'warning',
            'heating.section9b_mixed_basis',
            'occupancy',
            'Gemischter Maßstab bei Nutzerwechsel ohne Zwischenablesung (§ 9b Abs. 3 HeizKV)',
            {
              entity,
              detail: `${prefix}: Es ist keine Zwischenablesung erfasst und keine Aufteilung nach § 9b Abs. 3 HeizKV gewählt. Die Grundkosten werden dann nach Tagen verteilt, die Verbrauchskosten nach den erfassten (ggf. nach Gradtagszahlen aufgeteilten) Einheiten. Ohne Zwischenablesung sind die gesamten Heizkosten einheitlich nach Gradtagszahlen oder zeitanteilig aufzuteilen, Warmwasser zeitanteilig. Bitte die Zwischenablesung erfassen oder die Aufteilung festlegen.`,
            },
          ),
        )
      continue
    }
    if (change.hasInterimReading)
      add(
        issue(
          'info',
          'heating.section9b_with_interim_reading',
          'occupancy',
          'Zwischenablesung vorhanden – Aufteilung nach § 9b Abs. 3 prüfen',
          {
            entity,
            detail: `${prefix}: Es ist ein Ablesestand zum Wechsel erfasst, die Kosten werden aber ${allocationLabel(left)} aufgeteilt. Nach § 9b Abs. 1 und 2 HeizKV hat die Zwischenablesung Vorrang; Abs. 3 gilt nur, wenn sie nicht möglich war oder keine hinreichend genaue Ermittlung zulässt.`,
          },
        ),
      )
  }
}
