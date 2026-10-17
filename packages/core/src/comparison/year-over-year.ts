/**
 * Veränderung zum Vorjahr (PR-33): interner Prüfbericht für den Vermieter,
 * der dasselbe Objekt in zwei aufeinanderfolgenden Abrechnungsjahren
 * gegenüberstellt – je Kostenart, je Heizkreis (inkl. Kosten je kWh und
 * witterungsbereinigtem Energieeinsatz) und je Wohnung.
 *
 * Kostenarten werden über die Bezeichnung (ohne Groß-/Kleinschreibung und
 * Leerraum) bzw. die BetrKV-Nummer zugeordnet, weil jedes Jahr eigene IDs hat.
 * Wohnungen werden über die Einheit zugeordnet; ein Nutzerwechsel wird
 * ausgewiesen, weil sich dann Personen und Verhalten ändern.
 *
 * Offene Entscheidung: Die Ausreißergrenzen (± 25 % allgemein, ± 40 %
 * Heizung) sind Prüfschwellen der App ohne Rechtsgrundlage; sie sind
 * einstellbar.
 */
import type { AppDataFile, BillingPeriod } from '@nebenkosten/schema'
import { calculateBilling } from '../calculation/calculate-billing'
import type { CalculationInput, CalculationOutput } from '../contracts'
import { createCalculationInput } from '../input/create-calculation-input'

export interface YearOverYearLimits {
  /** Relative Abweichung für Kostenarten und Wohnungen (0,25 = ± 25 %). */
  readonly general: number
  /** Relative Abweichung für Heizkosten und Kosten je kWh. */
  readonly heating: number
}

export const DEFAULT_YEAR_OVER_YEAR_LIMITS: YearOverYearLimits = {
  general: 0.25,
  heating: 0.4,
}

export interface YearOverYearValue {
  readonly previousCents: number | null
  readonly currentCents: number | null
  readonly changeCents: number | null
  /** Relative Veränderung (0,1 = + 10 %), `null` ohne Vorjahreswert. */
  readonly changeRatio: number | null
  readonly outlier: boolean
}

export interface YearOverYearCostRow extends YearOverYearValue {
  readonly key: string
  readonly label: string
  /** Nur in einem der beiden Jahre vorhanden. */
  readonly presence: 'both' | 'new' | 'dropped'
}

export interface YearOverYearCircuitRow extends YearOverYearValue {
  readonly buildingId: string
  readonly previousEnergyKwh: number | null
  readonly currentEnergyKwh: number | null
  /** Energieeinsatz × Klimafaktor des Jahres (DWD), sonst `null`. */
  readonly previousAdjustedKwh: number | null
  readonly currentAdjustedKwh: number | null
  readonly previousCentsPerKwh: number | null
  readonly currentCentsPerKwh: number | null
  readonly centsPerKwhOutlier: boolean
}

export interface YearOverYearUnitRow extends YearOverYearValue {
  readonly unitId: string
  /** Mieter-Nutzungen beider Jahre gehören nicht zu denselben Mietverhältnissen. */
  readonly tenantChanged: boolean
  readonly previousVacancyDays: number
  readonly currentVacancyDays: number
}

export type YearOverYearReport =
  | { readonly status: 'no_previous_period' }
  | { readonly status: 'previous_not_calculable'; readonly reason: string }
  | {
      readonly status: 'compared'
      readonly previousYear: number
      readonly currentYear: number
      readonly limits: YearOverYearLimits
      readonly total: YearOverYearValue
      readonly costs: readonly YearOverYearCostRow[]
      readonly circuits: readonly YearOverYearCircuitRow[]
      readonly units: readonly YearOverYearUnitRow[]
    }

function value(
  previousCents: number | null,
  currentCents: number | null,
  limit: number,
): YearOverYearValue {
  const changeCents =
    previousCents !== null && currentCents !== null
      ? currentCents - previousCents
      : null
  const changeRatio =
    changeCents !== null && previousCents
      ? Math.round((changeCents / previousCents) * 10_000) / 10_000
      : null
  return {
    previousCents,
    currentCents,
    changeCents,
    changeRatio,
    outlier:
      changeRatio !== null
        ? Math.abs(changeRatio) > limit
        : (previousCents ?? 0) !== (currentCents ?? 0),
  }
}

function normalize(label: string): string {
  return label.toLocaleLowerCase('de-DE').replace(/\s+/gu, ' ').trim()
}

interface Year {
  readonly input: CalculationInput
  readonly output: CalculationOutput
}

function costTotals(year: Year): Map<string, { label: string; cents: number }> {
  const result = new Map<string, { label: string; cents: number }>()
  const add = (key: string, label: string, cents: number) => {
    const entry = result.get(key) ?? { label, cents: 0 }
    entry.cents += cents
    result.set(key, entry)
  }
  for (const position of year.output.operatingPositions ?? []) {
    const key = position.betrkvCategory
      ? `betrkv:${position.betrkvCategory}:${normalize(position.label)}`
      : `label:${normalize(position.label)}`
    add(key, position.label, position.grossCents)
  }
  for (const circuit of year.output.heating.perCircuit)
    add(
      `fuel:${circuit.buildingId}`,
      `Brennstoff/Energie ${buildingName(year, circuit.buildingId)}`,
      circuit.fuelConsumptionCents,
    )
  return result
}

function buildingName(year: Year, buildingId: string): string {
  return (
    year.input.buildings.find(({ id }) => id === buildingId)?.name ?? buildingId
  )
}

function climateFactor(year: Year): number | null {
  return year.input.billingPeriod.climateFactor?.factor ?? null
}

function perUnit(year: Year) {
  const occupancies = new Map(
    year.input.occupancyPeriods.map((occupancy) => [occupancy.id, occupancy]),
  )
  const result = new Map<
    string,
    { cents: number; tenancies: Set<string>; vacancyDays: number }
  >()
  for (const tenant of year.output.tenants) {
    const occupancy = occupancies.get(tenant.id)
    if (!occupancy) continue
    const entry = result.get(occupancy.unitId) ?? {
      cents: 0,
      tenancies: new Set<string>(),
      vacancyDays: 0,
    }
    entry.cents += tenant.shareCents
    if (tenant.isVacancy) entry.vacancyDays += tenant.days ?? 0
    else if (occupancy.tenancyId) entry.tenancies.add(occupancy.tenancyId)
    result.set(occupancy.unitId, entry)
  }
  return result
}

/** Vergleich zweier berechneter Abrechnungsjahre desselben Objekts. */
export function compareYears(
  previous: Year,
  current: Year,
  limits: YearOverYearLimits = DEFAULT_YEAR_OVER_YEAR_LIMITS,
): Extract<YearOverYearReport, { status: 'compared' }> {
  const previousCosts = costTotals(previous)
  const currentCosts = costTotals(current)
  const costs = [...new Set([...previousCosts.keys(), ...currentCosts.keys()])]
    .map((key): YearOverYearCostRow => {
      const before = previousCosts.get(key)
      const now = currentCosts.get(key)
      return {
        key,
        label: (now ?? before)!.label,
        presence: before && now ? 'both' : now ? 'new' : 'dropped',
        ...value(
          before?.cents ?? null,
          now?.cents ?? null,
          key.startsWith('fuel:') ? limits.heating : limits.general,
        ),
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'de'))

  const factorBefore = climateFactor(previous)
  const factorNow = climateFactor(current)
  const buildings = [
    ...new Set(
      [
        ...previous.output.heating.perCircuit,
        ...current.output.heating.perCircuit,
      ].map(({ buildingId }) => buildingId),
    ),
  ]
  const circuits = buildings.map((buildingId): YearOverYearCircuitRow => {
    const before = previous.output.heating.perCircuit.find(
      (circuit) => circuit.buildingId === buildingId,
    )
    const now = current.output.heating.perCircuit.find(
      (circuit) => circuit.buildingId === buildingId,
    )
    const perKwh = (cents?: number, kwh?: number) =>
      cents !== undefined && kwh ? Math.round((cents / kwh) * 100) / 100 : null
    const previousCentsPerKwh = perKwh(
      before?.heatingTotalCents,
      before?.energyKwh,
    )
    const currentCentsPerKwh = perKwh(now?.heatingTotalCents, now?.energyKwh)
    const adjusted = (kwh: number | undefined, factor: number | null) =>
      kwh !== undefined && factor !== null ? Math.round(kwh * factor) : null
    return {
      buildingId,
      ...value(
        before?.heatingTotalCents ?? null,
        now?.heatingTotalCents ?? null,
        limits.heating,
      ),
      previousEnergyKwh: before?.energyKwh ?? null,
      currentEnergyKwh: now?.energyKwh ?? null,
      previousAdjustedKwh: adjusted(before?.energyKwh, factorBefore),
      currentAdjustedKwh: adjusted(now?.energyKwh, factorNow),
      previousCentsPerKwh,
      currentCentsPerKwh,
      centsPerKwhOutlier:
        previousCentsPerKwh !== null && currentCentsPerKwh !== null
          ? Math.abs(currentCentsPerKwh / previousCentsPerKwh - 1) >
            limits.heating
          : false,
    }
  })

  const previousUnits = perUnit(previous)
  const currentUnits = perUnit(current)
  const unitLabel = (unitId: string) => {
    const unit = current.input.units.find(({ id }) => id === unitId)
    return unit?.label || unit?.location || unitId
  }
  const units = [...new Set([...previousUnits.keys(), ...currentUnits.keys()])]
    .map((unitId): YearOverYearUnitRow => {
      const before = previousUnits.get(unitId)
      const now = currentUnits.get(unitId)
      const changed =
        before !== undefined &&
        now !== undefined &&
        ([...now.tenancies].some((id) => !before.tenancies.has(id)) ||
          [...before.tenancies].some((id) => !now.tenancies.has(id)))
      return {
        unitId,
        ...value(before?.cents ?? null, now?.cents ?? null, limits.general),
        tenantChanged: changed,
        previousVacancyDays: before?.vacancyDays ?? 0,
        currentVacancyDays: now?.vacancyDays ?? 0,
      }
    })
    .sort((left, right) =>
      unitLabel(left.unitId).localeCompare(unitLabel(right.unitId), 'de', {
        numeric: true,
      }),
    )

  return {
    status: 'compared',
    previousYear: previous.input.billingPeriod.year,
    currentYear: current.input.billingPeriod.year,
    limits,
    total: value(
      previous.output.totals.recordedCostsCents,
      current.output.totals.recordedCostsCents,
      limits.general,
    ),
    costs,
    circuits,
    units,
  }
}

/** Vergleich mit dem Vorjahr desselben Objekts, sofern es im System liegt. */
export function yearOverYearReport(
  data: AppDataFile,
  period: Readonly<BillingPeriod>,
  limits: YearOverYearLimits = DEFAULT_YEAR_OVER_YEAR_LIMITS,
): YearOverYearReport {
  const previousPeriod = data.billingData.billingPeriods.find(
    (candidate) =>
      candidate.propertyId === period.propertyId &&
      candidate.year === period.year - 1,
  )
  if (!previousPeriod) return { status: 'no_previous_period' }
  const year = (id: string): Year => {
    const input = createCalculationInput(data, id)
    return { input, output: calculateBilling(input) }
  }
  let previous: Year
  try {
    previous = year(previousPeriod.id)
  } catch (error) {
    return {
      status: 'previous_not_calculable',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  return compareYears(previous, year(period.id), limits)
}
