import type { CalculationOutput } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  OccupancyPeriod,
} from '@nebenkosten/schema'
import type {
  CombinedCostStatementContext,
  TenantStatementContext,
} from '@nebenkosten/pdf'

/** Letztes Berechnungsergebnis eines Abrechnungsjahres (Legacy: `this.erg`). */
export function latestCalculationOutput(
  data: AppDataFile,
  billingPeriodId: string,
): CalculationOutput | undefined {
  const runs = data.billingData.calculationRuns.filter(
    (run) => run.billingPeriodId === billingPeriodId,
  )
  const latestRun = runs.at(-1)
  if (!latestRun) return undefined
  const result = data.billingData.calculationResults.find(
    (item) => item.calculationRunId === latestRun.id,
  )
  if (!result) return undefined
  return result.resultSnapshot as CalculationOutput
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
