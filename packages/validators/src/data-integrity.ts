import type {
  AppDataFile,
  BillingPeriod,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

/**
 * Das Schema prüft jede Entität für sich, aber weder eindeutige IDs noch
 * Verweise zwischen Entitäten (E-51-4: Prüfhinweis statt Schemaänderung).
 * Spätere Verarbeitung nimmt bei doppelten IDs stillschweigend den ersten
 * Treffer; das kann nach einem fremden Import oder einer Legacy-Migration
 * Daten verschiedener Einheiten vermischen.
 */
export function dataIntegrityIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  for (const [section, collections] of [
    ['masterData', data.masterData],
    ['billingData', data.billingData],
  ] as const) {
    for (const [name, value] of Object.entries(collections)) {
      if (!Array.isArray(value)) continue
      const seen = new Set<string>()
      const reported = new Set<string>()
      for (const item of value as readonly unknown[]) {
        if (typeof item !== 'object' || item === null || !('id' in item))
          continue
        const id = String(item.id)
        if (seen.has(id) && !reported.has(id)) {
          reported.add(id)
          add(
            issue(
              'error',
              'schema.duplicate_id',
              'schema',
              'Doppelte ID im Datenbestand',
              {
                detail: `Die ID kommt in ${section}.${name} mehrfach vor. Bitte den Import prüfen; Berechnung und PDF würden nur den ersten Eintrag verwenden.`,
                path: [section, name],
                entity: { type: name, id },
              },
            ),
          )
        }
        seen.add(id)
      }
    }
  }

  const units = new Map(data.masterData.units.map((unit) => [unit.id, unit]))
  const tenancies = new Map(
    data.masterData.tenancies.map((tenancy) => [tenancy.id, tenancy]),
  )
  for (const occupancy of data.billingData.occupancyPeriods) {
    if (occupancy.billingPeriodId !== period.id) continue
    const entity = { type: 'OccupancyPeriod', id: occupancy.id }
    const unit = units.get(occupancy.unitId)
    const tenancy =
      occupancy.tenancyId == null
        ? undefined
        : tenancies.get(occupancy.tenancyId)
    const mismatch = !unit
      ? 'Die Belegung verweist auf eine nicht vorhandene Einheit.'
      : unit.propertyId !== period.propertyId
        ? 'Die Belegung verweist auf eine Einheit eines anderen Objekts.'
        : occupancy.tenancyId != null && !tenancy
          ? 'Die Belegung verweist auf ein nicht vorhandenes Mietverhältnis.'
          : tenancy && tenancy.unitId !== occupancy.unitId
            ? 'Belegung und Mietverhältnis gehören zu verschiedenen Einheiten.'
            : null
    if (mismatch)
      add(
        issue(
          'error',
          'schema.reference_mismatch',
          'schema',
          'Widersprüchlicher Verweis',
          { detail: mismatch, entity },
        ),
      )
  }
}
