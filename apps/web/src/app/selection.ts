import type { AppDataFile } from '@nebenkosten/schema'

export interface SelectionContext {
  readonly ownerCompanyId: string | null
  readonly propertyId: string | null
  readonly billingPeriodId: string | null
}

export const emptySelection: SelectionContext = {
  ownerCompanyId: null,
  propertyId: null,
  billingPeriodId: null,
}

function existingOrFirst(
  current: string | null,
  candidates: readonly string[],
): string | null {
  return current !== null && candidates.includes(current)
    ? current
    : (candidates[0] ?? null)
}

export function normalizeSelection(
  data: AppDataFile,
  selection: SelectionContext,
): SelectionContext {
  const companyIds = data.masterData.ownerCompanies.map(({ id }) => id)
  const ownerCompanyId = existingOrFirst(selection.ownerCompanyId, companyIds)
  const propertyIds = data.masterData.properties
    .filter((property) => property.ownerCompanyId === ownerCompanyId)
    .map(({ id }) => id)
  const propertyId = existingOrFirst(selection.propertyId, propertyIds)
  const billingPeriodIds = data.billingData.billingPeriods
    .filter((period) => period.propertyId === propertyId)
    .map(({ id }) => id)
  const billingPeriodId = existingOrFirst(
    selection.billingPeriodId,
    billingPeriodIds,
  )

  return { ownerCompanyId, propertyId, billingPeriodId }
}
