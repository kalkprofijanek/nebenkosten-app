import {
  CORE_SNAPSHOT_FORMAT_VERSION,
  type CalculationOutput,
} from '@nebenkosten/core'
import { latestCalculationRun } from '@nebenkosten/validators'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import type {
  CombinedCostStatementContext,
  TenantStatementContext,
} from '@nebenkosten/pdf'

export class IncompatibleCalculationSnapshotError extends Error {
  constructor() {
    super(
      'Dieser Berechnungsstand ist zu alt für die PDF-Ausgabe. Öffne unter „Freigabe“ zuerst kontrolliert die Prüfung, berechne das Abrechnungsjahr neu und gib es anschließend erneut für PDF frei.',
    )
    this.name = 'IncompatibleCalculationSnapshotError'
  }
}

export interface CalculationSnapshot {
  readonly calculationRunId: string
  readonly output: CalculationOutput
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCompatibleCalculationOutput(
  value: unknown,
): value is CalculationOutput {
  if (
    !isRecord(value) ||
    value.snapshotFormatVersion !== CORE_SNAPSHOT_FORMAT_VERSION ||
    !isRecord(value.totals) ||
    !isRecord(value.heating) ||
    !isRecord(value.co2) ||
    !Array.isArray(value.tenants) ||
    !Array.isArray(value.warnings)
  )
    return false

  const trace = value.heating.trace
  if (
    !isFiniteNumber(value.totals.controlDifferenceCents) ||
    !isRecord(trace) ||
    !Array.isArray(trace.circuits) ||
    !trace.circuits.every(
      (circuit) =>
        isRecord(circuit) &&
        typeof circuit.buildingId === 'string' &&
        isRecord(circuit.split) &&
        isFiniteNumber(circuit.split.consumptionSharePercent) &&
        isRecord(circuit.co2) &&
        isFiniteNumber(circuit.co2.tenantPercent) &&
        isFiniteNumber(circuit.co2.intensityKgPerSqmYear),
    )
  )
    return false

  return value.tenants.every((tenant) => {
    if (
      !isRecord(tenant) ||
      typeof tenant.id !== 'string' ||
      !isFiniteNumber(tenant.shareCents) ||
      !isFiniteNumber(tenant.prepaymentCents) ||
      !isFiniteNumber(tenant.balanceCents) ||
      !isRecord(tenant.costBreakdown) ||
      !Array.isArray(tenant.costBreakdown.operatingByCategory) ||
      !isFiniteNumber(tenant.costBreakdown.heatingBaseCents) ||
      !isFiniteNumber(tenant.costBreakdown.heatingConsumptionCents) ||
      !isFiniteNumber(tenant.costBreakdown.hotWaterCents) ||
      !isFiniteNumber(tenant.costBreakdown.heatingCo2Cents)
    )
      return false

    return tenant.costBreakdown.operatingByCategory.every(
      (item) =>
        isRecord(item) &&
        typeof item.costCategoryId === 'string' &&
        isFiniteNumber(item.amountCents),
    )
  })
}

/** Letzter, für den PDF-Vertrag kompatibler Berechnungsstand. */
export function latestCalculationSnapshot(
  data: AppDataFile,
  billingPeriodId: string,
): CalculationSnapshot | undefined {
  const latestRun = latestCalculationRun(
    data.billingData.calculationRuns,
    billingPeriodId,
  )
  if (!latestRun) return undefined
  const result = data.billingData.calculationResults.find(
    (item) => item.calculationRunId === latestRun.id,
  )
  if (!result) return undefined
  if (
    result.snapshotFormatVersion !== CORE_SNAPSHOT_FORMAT_VERSION ||
    !isCompatibleCalculationOutput(result.resultSnapshot)
  )
    throw new IncompatibleCalculationSnapshotError()
  return {
    calculationRunId: latestRun.id,
    output: result.resultSnapshot,
  }
}

export function tenantOccupancies(
  data: AppDataFile,
  billingPeriodId: string,
): OccupancyPeriod[] {
  return data.billingData.occupancyPeriods.filter(
    (occupancy) =>
      occupancy.billingPeriodId === billingPeriodId &&
      occupancy.kind === 'tenant',
  )
}

export function buildTenantStatementContext(
  data: AppDataFile,
  billingPeriod: BillingPeriod,
  calculation: CalculationOutput,
  occupancyPeriod: OccupancyPeriod,
): TenantStatementContext {
  const tenancy = data.masterData.tenancies.find(
    ({ id }) => id === occupancyPeriod.tenancyId,
  )
  if (!tenancy) {
    throw new Error(
      `Kein Mietverhältnis für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  }
  const unit = data.masterData.units.find(
    ({ id }) => id === occupancyPeriod.unitId,
  )
  if (!unit) {
    throw new Error(
      `Keine Einheit für Nutzungszeitraum "${occupancyPeriod.id}" gefunden.`,
    )
  }
  const property = data.masterData.properties.find(
    ({ id }) => id === unit.propertyId,
  )
  if (!property) {
    throw new Error(`Kein Objekt für Einheit "${unit.id}" gefunden.`)
  }
  const ownerCompany = data.masterData.ownerCompanies.find(
    ({ id }) => id === property.ownerCompanyId,
  )
  if (!ownerCompany) {
    throw new Error(
      `Keine Eigentümergesellschaft für Objekt "${property.id}" gefunden.`,
    )
  }
  const persons = data.masterData.persons.filter((person) =>
    tenancy.personIds.includes(person.id),
  )
  return {
    appData: data,
    billingPeriod,
    calculation,
    occupancyPeriod,
    tenancy,
    unit,
    property,
    ownerCompany,
    persons,
    costCategories: data.billingData.costCategories.filter(
      (category) => category.billingPeriodId === billingPeriod.id,
    ),
    generatedAt: new Date(),
  }
}

export function buildCombinedCostStatementContext(
  data: AppDataFile,
  billingPeriod: BillingPeriod,
  calculation: CalculationOutput,
): CombinedCostStatementContext {
  const property = data.masterData.properties.find(
    ({ id }) => id === billingPeriod.propertyId,
  )
  if (!property) {
    throw new Error(
      `Kein Objekt für Abrechnungsjahr "${billingPeriod.id}" gefunden.`,
    )
  }
  const ownerCompany = data.masterData.ownerCompanies.find(
    ({ id }) => id === property.ownerCompanyId,
  )
  if (!ownerCompany) {
    throw new Error(
      `Keine Eigentümergesellschaft für Objekt "${property.id}" gefunden.`,
    )
  }
  return {
    appData: data,
    billingPeriod,
    calculation,
    property,
    ownerCompany,
    costCategories: data.billingData.costCategories.filter(
      (category) => category.billingPeriodId === billingPeriod.id,
    ),
    occupancyPeriods: data.billingData.occupancyPeriods.filter(
      (occupancy) => occupancy.billingPeriodId === billingPeriod.id,
    ),
    tenancies: data.masterData.tenancies,
    units: data.masterData.units,
    generatedAt: new Date(),
  }
}
