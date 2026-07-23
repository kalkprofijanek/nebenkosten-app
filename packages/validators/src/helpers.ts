import type {
  AppDataFile,
  BillingPeriod,
  CostCategory,
  OccupancyPeriod,
} from '@nebenkosten/schema'

export function blank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0
}

export function validIban(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let remainder = 0
  for (const character of rearranged) {
    const digits = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

export function periodOccupancies(
  data: AppDataFile,
  id: string,
): OccupancyPeriod[] {
  return data.billingData.occupancyPeriods.filter(
    ({ billingPeriodId }) => billingPeriodId === id,
  )
}

export function periodCategories(
  data: AppDataFile,
  id: string,
): CostCategory[] {
  return data.billingData.costCategories.filter(
    ({ billingPeriodId }) => billingPeriodId === id,
  )
}

type CategoryScope = NonNullable<CostCategory['scope']>

function normalizeScopeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('de-DE')
}

export function occupancyMatchesScope(
  data: AppDataFile,
  row: OccupancyPeriod,
  scope: CategoryScope,
): boolean {
  if (scope.kind === 'property') return true
  const unit = data.masterData.units.find(({ id }) => id === row.unitId)
  if (scope.kind === 'building')
    return (
      unit?.buildingId === scope.buildingId ||
      (row.costScope?.kind === 'building' &&
        row.costScope.buildingId === scope.buildingId)
    )
  if (
    row.costScope?.kind === 'house' &&
    normalizeScopeKey(row.costScope.houseKey) ===
      normalizeScopeKey(scope.houseKey)
  )
    return true
  const tenancy = data.masterData.tenancies.find(
    ({ id }) => id === row.tenancyId,
  )
  return normalizeScopeKey(tenancy?.mandateReference).startsWith(
    normalizeScopeKey(scope.houseKey),
  )
}

export function wholeYear(period: BillingPeriod): boolean {
  return (
    period.periodStart === `${period.year}-01-01` &&
    period.periodEnd === `${period.year}-12-31`
  )
}

export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, clone(nested)]),
    ) as T
  }
  return value
}
