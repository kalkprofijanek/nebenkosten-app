import type { AppDataFile } from '@nebenkosten/schema'
import {
  assertValidResult,
  assertValidSource,
  defaultCommandDependencies,
  requiredText,
  reserveNewIds,
  type CommandDependencies,
} from '../master-data/command-support'

export class BillingPeriodCommandError extends Error {
  override readonly name = 'BillingPeriodCommandError'
}

export interface CreateBillingPeriodInput {
  readonly propertyId: string
  readonly year: number
}

export interface UpdateBillingPeriodInput {
  readonly year: number
  readonly periodStart: string
  readonly periodEnd: string
}

function normalizePropertyId(value: unknown): string {
  try {
    return requiredText(value, 'Liegenschaft')
  } catch (error) {
    throw new BillingPeriodCommandError(
      error instanceof Error ? error.message : 'Liegenschaft ist ungültig.',
    )
  }
}

function validateYear(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1900 ||
    value > 2200
  ) {
    throw new BillingPeriodCommandError(
      'Das Abrechnungsjahr muss eine ganze Zahl zwischen 1900 und 2200 sein.',
    )
  }
  return value
}

export function createBillingPeriod(
  data: AppDataFile,
  input: CreateBillingPeriodInput,
  dependencies: CommandDependencies = defaultCommandDependencies(),
): AppDataFile {
  assertValidSource(data, BillingPeriodCommandError)
  const propertyId = normalizePropertyId(input.propertyId)
  const year = validateYear(input.year)

  if (!data.masterData.properties.some((item) => item.id === propertyId)) {
    throw new BillingPeriodCommandError(
      'Die ausgewählte Liegenschaft ist nicht vorhanden.',
    )
  }
  if (
    data.billingData.billingPeriods.some(
      (period) => period.propertyId === propertyId && period.year === year,
    )
  ) {
    throw new BillingPeriodCommandError(
      `Das Abrechnungsjahr ${year} ist für diese Liegenschaft bereits vorhanden.`,
    )
  }

  const [id] = reserveNewIds(
    data,
    1,
    dependencies.createId,
    BillingPeriodCommandError,
  )
  const yearText = String(year).padStart(4, '0')
  const result: AppDataFile = {
    ...data,
    billingData: {
      ...data.billingData,
      billingPeriods: [
        ...data.billingData.billingPeriods,
        {
          id: id!,
          propertyId,
          year,
          periodStart: `${yearText}-01-01`,
          periodEnd: `${yearText}-12-31`,
          status: 'DRAFT',
        },
      ],
    },
  }
  return assertValidResult(result, BillingPeriodCommandError)
}

export function updateBillingPeriod(
  data: AppDataFile,
  billingPeriodId: string,
  input: UpdateBillingPeriodInput,
): AppDataFile {
  assertValidSource(data, BillingPeriodCommandError)
  const period = data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (period === undefined) {
    throw new BillingPeriodCommandError(
      'Das ausgewählte Abrechnungsjahr ist nicht vorhanden.',
    )
  }
  const year = validateYear(input.year)
  if (
    typeof input.periodStart !== 'string' ||
    typeof input.periodEnd !== 'string' ||
    input.periodStart > input.periodEnd
  ) {
    throw new BillingPeriodCommandError('Der Abrechnungszeitraum ist ungültig.')
  }
  if (
    data.billingData.billingPeriods.some(
      ({ id, propertyId, year: existingYear }) =>
        id !== billingPeriodId &&
        propertyId === period.propertyId &&
        existingYear === year,
    )
  ) {
    throw new BillingPeriodCommandError(
      `Das Abrechnungsjahr ${year} ist für diese Liegenschaft bereits vorhanden.`,
    )
  }
  const result: AppDataFile = {
    ...data,
    billingData: {
      ...data.billingData,
      billingPeriods: data.billingData.billingPeriods.map((item) =>
        item.id === billingPeriodId
          ? {
              ...item,
              year,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
            }
          : item,
      ),
    },
  }
  return assertValidResult(result, BillingPeriodCommandError)
}

function referencesBillingPeriod(entity: unknown, billingPeriodId: string) {
  return (
    typeof entity === 'object' &&
    entity !== null &&
    'billingPeriodId' in entity &&
    entity.billingPeriodId === billingPeriodId
  )
}

export function deleteBillingPeriod(
  data: AppDataFile,
  billingPeriodId: string,
): AppDataFile {
  assertValidSource(data, BillingPeriodCommandError)
  if (
    !data.billingData.billingPeriods.some(({ id }) => id === billingPeriodId)
  ) {
    throw new BillingPeriodCommandError(
      'Das ausgewählte Abrechnungsjahr ist nicht vorhanden.',
    )
  }
  const hasDependentData = Object.entries(data.billingData).some(
    ([key, entities]) =>
      key !== 'billingPeriods' &&
      entities.some((entity) =>
        referencesBillingPeriod(entity, billingPeriodId),
      ),
  )
  if (hasDependentData) {
    throw new BillingPeriodCommandError(
      'Das Abrechnungsjahr kann nicht gelöscht werden, solange Abrechnungsdaten zugeordnet sind.',
    )
  }
  const result: AppDataFile = {
    ...data,
    billingData: {
      ...data.billingData,
      billingPeriods: data.billingData.billingPeriods.filter(
        ({ id }) => id !== billingPeriodId,
      ),
    },
  }
  return assertValidResult(result, BillingPeriodCommandError)
}
