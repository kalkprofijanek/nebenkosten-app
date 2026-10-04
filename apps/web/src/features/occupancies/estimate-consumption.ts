import { calculateOccupancyDays } from '@nebenkosten/core'
import type { AppDataFile } from '@nebenkosten/schema'

export interface ConsumptionEstimate {
  readonly value: number
  readonly reason: string
  readonly comparableCount: number
}

/** Schätzung oder der konkrete Grund, warum keine Schätzung möglich ist. */
export type ConsumptionEstimateResult =
  | { readonly ok: true; readonly estimate: ConsumptionEstimate }
  | { readonly ok: false; readonly problem: string }

const decimal = (value: number, digits: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(
    value,
  )

/**
 * Estimates heating consumption units for an occupancy from comparable
 * occupancies of the same building/heating circuit (§ 9a HeizKV): measured
 * units per m² heated area and day, scaled to this occupancy's area and days.
 * Estimated, vacant or unmeasured occupancies are not used as comparables.
 */
export function estimateConsumptionUnits(
  data: AppDataFile,
  occupancyId: string,
): ConsumptionEstimate | null {
  const result = explainConsumptionEstimate(data, occupancyId)
  return result.ok ? result.estimate : null
}

/** Wie {@link estimateConsumptionUnits}, nennt aber den Hinderungsgrund. */
export function explainConsumptionEstimate(
  data: AppDataFile,
  occupancyId: string,
): ConsumptionEstimateResult {
  const fail = (problem: string) => ({ ok: false, problem }) as const
  const occupancy = data.billingData.occupancyPeriods.find(
    ({ id }) => id === occupancyId,
  )
  if (!occupancy) return fail('Nutzerzeitraum nicht gefunden.')
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === occupancy.billingPeriodId,
  )
  const units = new Map(data.masterData.units.map((unit) => [unit.id, unit]))
  const unit = units.get(occupancy.unitId)
  if (!period || !unit) return fail('Wohnung oder Abrechnungsjahr fehlt.')
  if (!unit.buildingId)
    return fail('Wohnung ist keinem Gebäude (Heizkreis) zugeordnet.')
  const area = (unitId: string) => units.get(unitId)?.heatedAreaSqm?.value ?? 0
  const days = (from?: string | null, to?: string | null) => {
    try {
      return calculateOccupancyDays(
        period.periodStart,
        period.periodEnd,
        from,
        to,
      )
    } catch {
      return 0
    }
  }
  const ownArea = area(unit.id)
  const ownDays = days(occupancy.from, occupancy.to)
  if (ownArea <= 0)
    return fail('Für die Wohnung ist keine beheizte Fläche (m²) erfasst.')
  if (ownDays <= 0) return fail('Der Nutzerzeitraum hat keine Tage im Jahr.')

  const comparables = data.billingData.occupancyPeriods.filter(
    (item) =>
      item.id !== occupancy.id &&
      item.billingPeriodId === occupancy.billingPeriodId &&
      item.kind === 'tenant' &&
      !item.consumptionUnitsEstimated &&
      (item.consumptionUnits?.value ?? 0) > 0 &&
      units.get(item.unitId)?.buildingId === unit.buildingId &&
      area(item.unitId) > 0,
  )
  let unitsSum = 0
  let areaDays = 0
  for (const item of comparables) {
    const itemDays = days(item.from, item.to)
    if (itemDays <= 0) continue
    unitsSum += item.consumptionUnits!.value
    areaDays += area(item.unitId) * itemDays
  }
  if (areaDays <= 0)
    return fail(
      'Keine gemessenen Vergleichsnutzungen mit Fläche im selben Gebäude.',
    )

  const perSqmDay = unitsSum / areaDays
  const value = Math.round(perSqmDay * ownArea * ownDays * 10) / 10
  const building =
    data.masterData.buildings.find(({ id }) => id === unit.buildingId)?.name ??
    'Heizkreis'
  return {
    ok: true,
    estimate: {
      value,
      comparableCount: comparables.length,
      reason: `Schätzung nach § 9a HeizKV: mittlerer Verbrauch ${building} ${decimal(
        perSqmDay * 365,
        2,
      )} Einheiten je m² und Jahr aus ${comparables.length} gemessenen Nutzungen × ${decimal(
        ownArea,
        2,
      )} m² × ${ownDays} Tage`,
    },
  }
}
