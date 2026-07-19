import {
  appDataFileSchema,
  costCategorySchema,
  costEntrySchema,
  uuidSchema,
  type AppDataFile,
  type CostCategory,
  type CostEntry,
} from '@nebenkosten/schema'

export type IdFactory = () => string

export interface AddCostCategoryInput {
  readonly billingPeriodId: string
  readonly kind: 'operating' | 'water' | 'heating'
  readonly label: string
  readonly statementText?: string
  readonly allocationKey?:
    | 'usable_area'
    | 'heated_area'
    | 'consumption_units'
    | 'residential_units'
    | 'direct'
  readonly scope?:
    | { readonly kind: 'property' }
    | { readonly kind: 'building'; readonly buildingId: string }
    | { readonly kind: 'house'; readonly houseKey: string }
  readonly totalAmountCents?: number
  readonly date?: string
  readonly allocablePercent?: number
  readonly laborSharePercent?: number
}

export interface AddCostEntryInput {
  readonly costCategoryId: string
  readonly date?: string
  readonly description?: string
  readonly amountCents: number
  readonly receiptReference?: string
  readonly allocablePercent?: number
}

const CATEGORY_KEYS = [
  'billingPeriodId',
  'kind',
  'label',
  'statementText',
  'allocationKey',
  'scope',
  'totalAmountCents',
  'date',
  'allocablePercent',
  'laborSharePercent',
] as const
const ENTRY_KEYS = [
  'costCategoryId',
  'date',
  'description',
  'amountCents',
  'receiptReference',
  'allocablePercent',
] as const
const MAX_LABEL_LENGTH = 200
const MAX_TEXT_LENGTH = 2_000

export class CostCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CostCommandError'
  }
}

function recordWithExactKeys(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new CostCommandError(`Ungültige Eingabe für ${label}.`)
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowedKeys.includes(key)))
    throw new CostCommandError(`Ungültige Eingabe für ${label}.`)
  return record
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  maxLength = 128,
): string {
  const value = record[key]
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength
  )
    throw new CostCommandError(`Ungültige Eingabe für ${key}.`)
  return value
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > maxLength)
    throw new CostCommandError(`Ungültige Eingabe für ${key}.`)
  return value
}

function optionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new CostCommandError(`Ungültige Eingabe für ${key}.`)
  return value
}

function optionalInteger(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = optionalFiniteNumber(record, key)
  if (value !== undefined && !Number.isSafeInteger(value))
    throw new CostCommandError(`Ungültige Eingabe für ${key}.`)
  return value
}

function defined<T>(
  key: string,
  value: T | undefined,
): Partial<Record<string, T>> {
  return value === undefined ? {} : { [key]: value }
}

function parseCategoryInput(value: unknown): AddCostCategoryInput {
  const input = recordWithExactKeys(value, CATEGORY_KEYS, 'Kostenart')
  const kind = input.kind
  if (!['operating', 'water', 'heating'].includes(String(kind)))
    throw new CostCommandError('Ungültige Eingabe für Kostenart-Typ.')
  const allocationKey = input.allocationKey
  if (
    allocationKey !== undefined &&
    ![
      'usable_area',
      'heated_area',
      'consumption_units',
      'residential_units',
      'direct',
    ].includes(String(allocationKey))
  )
    throw new CostCommandError('Ungültige Eingabe für Umlageschlüssel.')
  const scope =
    input.scope === undefined
      ? undefined
      : recordWithExactKeys(
          input.scope,
          ['kind', 'buildingId', 'houseKey'],
          'Kostenbereich',
        )
  const totalAmountCents = optionalInteger(input, 'totalAmountCents')
  const allocablePercent = optionalFiniteNumber(input, 'allocablePercent')
  const laborSharePercent = optionalFiniteNumber(input, 'laborSharePercent')
  return {
    billingPeriodId: requiredString(input, 'billingPeriodId'),
    kind: kind as AddCostCategoryInput['kind'],
    label: requiredString(input, 'label', MAX_LABEL_LENGTH),
    ...defined(
      'statementText',
      optionalString(input, 'statementText', MAX_TEXT_LENGTH),
    ),
    ...defined(
      'allocationKey',
      allocationKey as AddCostCategoryInput['allocationKey'],
    ),
    ...defined('scope', scope as unknown as AddCostCategoryInput['scope']),
    ...defined('totalAmountCents', totalAmountCents),
    ...defined('date', optionalString(input, 'date', 10)),
    ...defined('allocablePercent', allocablePercent),
    ...defined('laborSharePercent', laborSharePercent),
  }
}

function parseEntryInput(value: unknown): AddCostEntryInput {
  const input = recordWithExactKeys(value, ENTRY_KEYS, 'Kostenbuchung')
  const amountCents = optionalInteger(input, 'amountCents')
  if (amountCents === undefined)
    throw new CostCommandError('Ungültige Eingabe für amountCents.')
  return {
    costCategoryId: requiredString(input, 'costCategoryId'),
    amountCents,
    ...defined('date', optionalString(input, 'date', 10)),
    ...defined(
      'description',
      optionalString(input, 'description', MAX_TEXT_LENGTH),
    ),
    ...defined(
      'receiptReference',
      optionalString(input, 'receiptReference', MAX_LABEL_LENGTH),
    ),
    ...defined(
      'allocablePercent',
      optionalFiniteNumber(input, 'allocablePercent'),
    ),
  }
}

function entityIds(file: AppDataFile): Set<string> {
  const ids = new Set<string>()
  for (const container of [file.masterData, file.billingData]) {
    for (const collection of Object.values(container)) {
      for (const entity of collection)
        if ('id' in entity && typeof entity.id === 'string') ids.add(entity.id)
    }
  }
  return ids
}

function uniqueId(file: AppDataFile, createId: IdFactory): string {
  const id = createId()
  if (!uuidSchema.safeParse(id).success || entityIds(file).has(id))
    throw new CostCommandError('Erzeugte ID ist ungültig oder belegt.')
  return id
}

function parseEntity<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new CostCommandError(`Ungültige Eingabe für ${label}.`)
  return result.data as T
}

function validatedFile(file: AppDataFile): AppDataFile {
  const result = appDataFileSchema.safeParse(file)
  if (!result.success)
    throw new CostCommandError('Der neue Datenstand verletzt das Dateischema.')
  return result.data
}

export function addCostCategory(
  file: AppDataFile,
  rawInput: unknown,
  createId: IdFactory = () => crypto.randomUUID(),
): AppDataFile {
  const input = parseCategoryInput(rawInput)
  const billingPeriod = file.billingData.billingPeriods.find(
    ({ id }) => id === input.billingPeriodId,
  )
  if (!billingPeriod)
    throw new CostCommandError('Abrechnungsjahr wurde nicht gefunden.')
  if (input.scope?.kind === 'building') {
    const buildingId = input.scope.buildingId
    const building = file.masterData.buildings.find(
      ({ id }) => id === buildingId,
    )
    if (!building || building.propertyId !== billingPeriod.propertyId)
      throw new CostCommandError('Gebäude gehört nicht zum Abrechnungsobjekt.')
  }
  const category = parseEntity<CostCategory>(
    costCategorySchema,
    {
      id: uniqueId(file, createId),
      ...input,
    },
    'Kostenart',
  )
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      costCategories: [...file.billingData.costCategories, category],
    },
  })
}

export function addCostEntry(
  file: AppDataFile,
  rawInput: unknown,
  createId: IdFactory = () => crypto.randomUUID(),
): AppDataFile {
  const input = parseEntryInput(rawInput)
  const category = file.billingData.costCategories.find(
    ({ id }) => id === input.costCategoryId,
  )
  if (!category) throw new CostCommandError('Kostenart wurde nicht gefunden.')
  const billingPeriod = file.billingData.billingPeriods.find(
    ({ id }) => id === category.billingPeriodId,
  )
  if (!billingPeriod)
    throw new CostCommandError('Abrechnungsjahr wurde nicht gefunden.')
  if (
    input.date !== undefined &&
    (input.date < billingPeriod.periodStart ||
      input.date > billingPeriod.periodEnd)
  )
    throw new CostCommandError(
      'Belegdatum liegt außerhalb des Abrechnungszeitraums.',
    )
  const entry = parseEntity<CostEntry>(
    costEntrySchema,
    {
      id: uniqueId(file, createId),
      ...input,
    },
    'Kostenbuchung',
  )
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      costEntries: [...file.billingData.costEntries, entry],
    },
  })
}
