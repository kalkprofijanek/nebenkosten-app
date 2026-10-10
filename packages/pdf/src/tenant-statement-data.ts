import {
  calculateOccupancyDays,
  type TenantAllocationBasis,
  type TenantCalculationResult,
} from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import type { ConsumptionCaptureMode } from './legal-texts'

/** Nutzungszeitraum des Mieters, auf den Abrechnungszeitraum begrenzt. */
export function occupancyRange(context: TenantStatementContext) {
  const { billingPeriod, occupancyPeriod } = context
  const from =
    occupancyPeriod.from && occupancyPeriod.from > billingPeriod.periodStart
      ? occupancyPeriod.from
      : billingPeriod.periodStart
  const to =
    occupancyPeriod.to && occupancyPeriod.to < billingPeriod.periodEnd
      ? occupancyPeriod.to
      : billingPeriod.periodEnd
  return {
    from,
    to,
    partial:
      from !== billingPeriod.periodStart || to !== billingPeriod.periodEnd,
  }
}

export function resolvedBuildingId(context: TenantStatementContext) {
  const { occupancyPeriod, unit } = context
  return occupancyPeriod.costScope?.kind === 'building'
    ? occupancyPeriod.costScope.buildingId
    : unit.buildingId
}

export function circuitTraceFor(context: TenantStatementContext) {
  const { calculation } = context
  const buildingId = resolvedBuildingId(context)
  return calculation.heating.trace.circuits.find(
    (circuit) => circuit.buildingId === buildingId,
  )
}

export function tenantResult(
  context: TenantStatementContext,
): TenantCalculationResult {
  const { calculation, occupancyPeriod } = context
  const tenant = calculation.tenants.find(({ id }) => id === occupancyPeriod.id)
  if (!tenant) {
    throw new Error(
      `Kein Berechnungsergebnis für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  }
  return tenant
}

export interface TenantFacts {
  readonly days: number
  readonly periodDays: number
  readonly partial: boolean
  readonly basis: TenantAllocationBasis
}

export function consumptionUnitFor(
  basis: TenantAllocationBasis,
  mode: ConsumptionCaptureMode,
): 'kWh' | 'Einheiten' {
  return mode === 'heat_meter' || basis.consumptionUnit === 'kWh'
    ? 'kWh'
    : 'Einheiten'
}

/**
 * Nutzungstage und eigene Bezugsgrößen; ältere Rechenstände ohne Trace
 * werden aus Einheit und Nutzungszeitraum abgeleitet.
 */
export function tenantFacts(
  context: TenantStatementContext,
  tenant: TenantCalculationResult,
): TenantFacts {
  const { billingPeriod, occupancyPeriod, unit, calculation } = context
  const periodDays = calculation.periodDays
  const days =
    tenant.days ??
    calculateOccupancyDays(
      billingPeriod.periodStart,
      billingPeriod.periodEnd,
      occupancyPeriod.from,
      occupancyPeriod.to,
    )
  const usable = unit.usableAreaSqm?.value ?? 0
  const basis: TenantAllocationBasis = tenant.ownBasis ?? {
    buildingId: resolvedBuildingId(context) ?? null,
    usableAreaSqm: usable,
    heatedAreaSqm: unit.heatedAreaSqm?.value || usable,
    persons: occupancyPeriod.persons?.value ?? 0,
    consumption: occupancyPeriod.consumptionUnits?.value ?? 0,
    consumptionUnit: 'Einheiten',
  }
  return { days, periodDays, partial: days !== periodDays, basis }
}

export function heatingTotalCents(tenant: TenantCalculationResult): number {
  const { costBreakdown } = tenant
  return (
    costBreakdown.heatingBaseCents +
    costBreakdown.heatingConsumptionCents +
    costBreakdown.hotWaterCents
  )
}
