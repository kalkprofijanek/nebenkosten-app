import {
  appDataFileSchema,
  allocationScopeSchema,
  occupancyPeriodSchema,
  personSchema,
  prepaymentSchema,
  tenancySchema,
  uuidSchema,
  type AppDataFile,
  type OccupancyPeriod,
  type Person,
  type Prepayment,
  type Tenancy,
} from '@nebenkosten/schema'

export type IdFactory = () => string

export interface AddTenantOccupancyInput {
  readonly billingPeriodId: string
  readonly unitId: string
  readonly person: {
    readonly displayName: string
    readonly firstName?: string
    readonly lastName?: string
    readonly email?: string
  }
  readonly occupancy: {
    readonly from?: string
    readonly to?: string
    readonly persons?: number
  }
  readonly prepayment:
    | { readonly mode: 'monthly'; readonly monthlyAmountCents: number }
    | { readonly mode: 'annual'; readonly annualAmountCents: number }
    | { readonly mode: 'none_agreed' }
}

export interface AddVacancyOccupancyInput {
  readonly billingPeriodId: string
  readonly unitId: string
  readonly from?: string
  readonly to?: string
  readonly note?: string
}

export type SetOccupancyPrepaymentInput = Readonly<
  { occupancyPeriodId: string } & AddTenantOccupancyInput['prepayment']
>

export interface UpdateTenantOccupancyInput {
  readonly occupancyPeriodId: string
  readonly displayName: string
  readonly from?: string
  readonly to?: string
  readonly persons?: number
  readonly shippingAddressStreet?: string
  readonly shippingAddressPostalCodeAndCity?: string
  readonly prepayment: AddTenantOccupancyInput['prepayment']
}

export interface UpdateVacancyOccupancyInput {
  readonly occupancyPeriodId: string
  readonly from?: string
  readonly to?: string
  readonly note?: string
}

const ADD_KEYS = [
  'billingPeriodId',
  'unitId',
  'person',
  'occupancy',
  'prepayment',
] as const
const PERSON_KEYS = ['displayName', 'firstName', 'lastName', 'email'] as const
const OCCUPANCY_KEYS = ['from', 'to', 'persons'] as const
const MAX_NAME_LENGTH = 200
const MAX_EMAIL_LENGTH = 320

export class OccupancyCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OccupancyCommandError'
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
  ) {
    throw new OccupancyCommandError(`Ungültige Eingabe für ${label}.`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowedKeys.includes(key)))
    throw new OccupancyCommandError(`Ungültige Eingabe für ${label}.`)
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
    throw new OccupancyCommandError(`Ungültige Eingabe für ${key}.`)
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
    throw new OccupancyCommandError(`Ungültige Eingabe für ${key}.`)
  return value
}

function defined<T>(
  key: string,
  value: T | undefined,
): Partial<Record<string, T>> {
  return value === undefined ? {} : { [key]: value }
}

function parsePrepaymentInput(
  value: unknown,
): AddTenantOccupancyInput['prepayment'] {
  const base = recordWithExactKeys(
    value,
    ['mode', 'monthlyAmountCents', 'annualAmountCents'],
    'Vorauszahlung',
  )
  if (base.mode === 'none_agreed') {
    if (Object.keys(base).length !== 1)
      throw new OccupancyCommandError('Ungültige Eingabe für Vorauszahlung.')
    return { mode: 'none_agreed' }
  }
  if (
    base.mode === 'monthly' &&
    Object.keys(base).length === 2 &&
    Number.isSafeInteger(base.monthlyAmountCents)
  )
    return {
      mode: 'monthly',
      monthlyAmountCents: base.monthlyAmountCents as number,
    }
  if (
    base.mode === 'annual' &&
    Object.keys(base).length === 2 &&
    Number.isSafeInteger(base.annualAmountCents)
  )
    return {
      mode: 'annual',
      annualAmountCents: base.annualAmountCents as number,
    }
  throw new OccupancyCommandError('Ungültige Eingabe für Vorauszahlung.')
}

function parseAddInput(value: unknown): AddTenantOccupancyInput {
  const input = recordWithExactKeys(value, ADD_KEYS, 'Nutzer')
  const person = recordWithExactKeys(input.person, PERSON_KEYS, 'Person')
  const occupancy = recordWithExactKeys(
    input.occupancy,
    OCCUPANCY_KEYS,
    'Nutzungszeitraum',
  )
  const persons = occupancy.persons
  if (
    persons !== undefined &&
    (typeof persons !== 'number' || !Number.isFinite(persons) || persons < 0)
  )
    throw new OccupancyCommandError('Ungültige Eingabe für Personenzahl.')

  return {
    billingPeriodId: requiredString(input, 'billingPeriodId'),
    unitId: requiredString(input, 'unitId'),
    person: {
      displayName: requiredString(person, 'displayName', MAX_NAME_LENGTH),
      ...defined(
        'firstName',
        optionalString(person, 'firstName', MAX_NAME_LENGTH),
      ),
      ...defined(
        'lastName',
        optionalString(person, 'lastName', MAX_NAME_LENGTH),
      ),
      ...defined('email', optionalString(person, 'email', MAX_EMAIL_LENGTH)),
    },
    occupancy: {
      ...defined('from', optionalString(occupancy, 'from', 10)),
      ...defined('to', optionalString(occupancy, 'to', 10)),
      ...(persons === undefined ? {} : { persons }),
    },
    prepayment: parsePrepaymentInput(input.prepayment),
  }
}

function parseVacancyInput(value: unknown): AddVacancyOccupancyInput {
  const input = recordWithExactKeys(
    value,
    ['billingPeriodId', 'unitId', 'from', 'to', 'note'],
    'Leerstand',
  )
  return {
    billingPeriodId: requiredString(input, 'billingPeriodId'),
    unitId: requiredString(input, 'unitId'),
    ...defined('from', optionalString(input, 'from', 10)),
    ...defined('to', optionalString(input, 'to', 10)),
    ...defined('note', optionalString(input, 'note', 500)),
  }
}

function entityIds(file: AppDataFile): Set<string> {
  const ids = new Set<string>()
  const containers = [file.masterData, file.billingData] as const
  for (const container of containers) {
    for (const collection of Object.values(container)) {
      for (const entity of collection)
        if ('id' in entity && typeof entity.id === 'string') ids.add(entity.id)
    }
  }
  return ids
}

function createUniqueIds(
  file: AppDataFile,
  createId: IdFactory,
  count: number,
): string[] {
  const existing = entityIds(file)
  const created: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = createId()
    if (!uuidSchema.safeParse(id).success || existing.has(id))
      throw new OccupancyCommandError('Erzeugte ID ist ungültig oder belegt.')
    existing.add(id)
    created.push(id)
  }
  return created
}

function assertDateRange(
  from: string | undefined,
  to: string | undefined,
  periodStart: string,
  periodEnd: string,
): { start: string; end: string } {
  const start = from ?? periodStart
  const end = to ?? periodEnd
  if (start < periodStart || end > periodEnd || start > end)
    throw new OccupancyCommandError(
      'Nutzungsdaten liegen außerhalb des Abrechnungszeitraums.',
    )
  return { start, end }
}

function assertNoOverlap(
  periods: readonly OccupancyPeriod[],
  billingPeriodId: string,
  unitId: string,
  range: { start: string; end: string },
  periodStart: string,
  periodEnd: string,
): void {
  const overlaps = periods
    .filter(
      (period) =>
        period.billingPeriodId === billingPeriodId && period.unitId === unitId,
    )
    .some((period) => {
      const existingStart = period.from ?? periodStart
      const existingEnd = period.to ?? periodEnd
      return range.start <= existingEnd && existingStart <= range.end
    })
  if (overlaps)
    throw new OccupancyCommandError(
      'Der Nutzungszeitraum überschneidet einen bestehenden Zeitraum.',
    )
}

function parseEntity<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new OccupancyCommandError(`Ungültige Eingabe für ${label}.`)
  return result.data as T
}

function validatedFile(file: AppDataFile): AppDataFile {
  const result = appDataFileSchema.safeParse(file)
  if (!result.success)
    throw new OccupancyCommandError(
      'Der neue Datenstand verletzt das Dateischema.',
    )
  return result.data
}

export function addTenantOccupancy(
  file: AppDataFile,
  rawInput: unknown,
  createId: IdFactory = () => crypto.randomUUID(),
): AppDataFile {
  const input = parseAddInput(rawInput)
  const billingPeriod = file.billingData.billingPeriods.find(
    ({ id }) => id === input.billingPeriodId,
  )
  if (!billingPeriod)
    throw new OccupancyCommandError('Abrechnungsjahr wurde nicht gefunden.')
  const unit = file.masterData.units.find(({ id }) => id === input.unitId)
  if (!unit)
    throw new OccupancyCommandError('Nutzungseinheit wurde nicht gefunden.')
  if (unit.propertyId !== billingPeriod.propertyId)
    throw new OccupancyCommandError(
      'Nutzungseinheit gehört nicht zum Abrechnungsobjekt.',
    )
  const property = file.masterData.properties.find(
    ({ id }) => id === billingPeriod.propertyId,
  )
  const owner = file.masterData.ownerCompanies.find(
    ({ id }) => id === property?.ownerCompanyId,
  )
  if (!property || !owner)
    throw new OccupancyCommandError('Objektreferenzen sind unvollständig.')

  const range = assertDateRange(
    input.occupancy.from,
    input.occupancy.to,
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
  )
  assertNoOverlap(
    file.billingData.occupancyPeriods,
    billingPeriod.id,
    unit.id,
    range,
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
  )
  const [personId, tenancyId, occupancyId, prepaymentId] = createUniqueIds(
    file,
    createId,
    4,
  ) as [string, string, string, string]

  const person = parseEntity<Person>(
    personSchema,
    {
      id: personId,
      organizationId: owner.organizationId,
      ...input.person,
    },
    'Person',
  )
  const tenancy = parseEntity<Tenancy>(
    tenancySchema,
    {
      id: tenancyId,
      unitId: unit.id,
      personIds: [person.id],
      ...defined('movedIn', input.occupancy.from),
      ...defined('movedOut', input.occupancy.to),
    },
    'Mietverhältnis',
  )
  const occupancy = parseEntity<OccupancyPeriod>(
    occupancyPeriodSchema,
    {
      id: occupancyId,
      billingPeriodId: billingPeriod.id,
      unitId: unit.id,
      tenancyId: tenancy.id,
      kind: 'tenant',
      ...defined('from', input.occupancy.from),
      ...defined('to', input.occupancy.to),
      ...(input.occupancy.persons === undefined
        ? {}
        : {
            persons: {
              value: input.occupancy.persons,
              unit: 'personen',
            },
          }),
    },
    'Nutzungszeitraum',
  )
  const prepayment = parseEntity<Prepayment>(
    prepaymentSchema,
    {
      id: prepaymentId,
      occupancyPeriodId: occupancy.id,
      ...input.prepayment,
    },
    'Vorauszahlung',
  )

  return validatedFile({
    ...file,
    masterData: {
      ...file.masterData,
      persons: [...file.masterData.persons, person],
      tenancies: [...file.masterData.tenancies, tenancy],
    },
    billingData: {
      ...file.billingData,
      occupancyPeriods: [...file.billingData.occupancyPeriods, occupancy],
      prepayments: [...file.billingData.prepayments, prepayment],
    },
  })
}

export function addVacancyOccupancy(
  file: AppDataFile,
  rawInput: unknown,
  createId: IdFactory = () => crypto.randomUUID(),
): AppDataFile {
  const input = parseVacancyInput(rawInput)
  const billingPeriod = file.billingData.billingPeriods.find(
    ({ id }) => id === input.billingPeriodId,
  )
  if (!billingPeriod)
    throw new OccupancyCommandError('Abrechnungsjahr wurde nicht gefunden.')
  const unit = file.masterData.units.find(({ id }) => id === input.unitId)
  if (!unit)
    throw new OccupancyCommandError('Nutzungseinheit wurde nicht gefunden.')
  if (unit.propertyId !== billingPeriod.propertyId)
    throw new OccupancyCommandError(
      'Nutzungseinheit gehört nicht zum Abrechnungsobjekt.',
    )

  const range = assertDateRange(
    input.from,
    input.to,
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
  )
  assertNoOverlap(
    file.billingData.occupancyPeriods,
    billingPeriod.id,
    unit.id,
    range,
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
  )
  const [occupancyId] = createUniqueIds(file, createId, 1)
  const occupancy = parseEntity<OccupancyPeriod>(
    occupancyPeriodSchema,
    {
      id: occupancyId,
      billingPeriodId: billingPeriod.id,
      unitId: unit.id,
      tenancyId: null,
      kind: 'vacancy',
      ...defined('from', input.from),
      ...defined('to', input.to),
      ...defined('note', input.note),
    },
    'Leerstandszeitraum',
  )
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      occupancyPeriods: [...file.billingData.occupancyPeriods, occupancy],
    },
  })
}

export function setOccupancyPrepayment(
  file: AppDataFile,
  rawInput: unknown,
): AppDataFile {
  const record = recordWithExactKeys(
    rawInput,
    ['occupancyPeriodId', 'mode', 'monthlyAmountCents', 'annualAmountCents'],
    'Vorauszahlung',
  )
  const occupancyPeriodId = requiredString(record, 'occupancyPeriodId')
  const occupancy = file.billingData.occupancyPeriods.find(
    ({ id }) => id === occupancyPeriodId,
  )
  if (!occupancy)
    throw new OccupancyCommandError('Nutzungszeitraum wurde nicht gefunden.')
  const current = file.billingData.prepayments.find(
    (item) => item.occupancyPeriodId === occupancyPeriodId,
  )
  if (!current)
    throw new OccupancyCommandError(
      'Vorauszahlung für den Nutzungszeitraum wurde nicht gefunden.',
    )
  const input = parsePrepaymentInput(
    Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== 'occupancyPeriodId'),
    ),
  )
  const replacement = parseEntity<Prepayment>(
    prepaymentSchema,
    {
      id: current.id,
      occupancyPeriodId,
      ...input,
      ...defined('legacyUnmapped', current.legacyUnmapped ?? undefined),
    },
    'Vorauszahlung',
  )
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      prepayments: file.billingData.prepayments.map((item) =>
        item.id === current.id ? replacement : item,
      ),
    },
  })
}

export function updateTenantOccupancy(
  file: AppDataFile,
  rawInput: unknown,
): AppDataFile {
  const input = recordWithExactKeys(
    rawInput,
    [
      'occupancyPeriodId',
      'displayName',
      'firstName',
      'lastName',
      'email',
      'from',
      'to',
      'persons',
      'mandateReference',
      'monthlyRentCents',
      'shippingAddressStreet',
      'shippingAddressPostalCodeAndCity',
      'consumptionUnits',
      'consumptionUnitsEstimated',
      'consumptionUnitsEstimateReason',
      'coldWater',
      'warmWater',
      'applySection12Reduction',
      'costScope',
      'propertyTaxScope',
      'dispatchDate',
      'note',
      'prepayment',
    ],
    'Nutzerbearbeitung',
  )
  const occupancyPeriodId = requiredString(input, 'occupancyPeriodId')
  const displayName = requiredString(input, 'displayName', MAX_NAME_LENGTH)
  const firstName = optionalString(input, 'firstName', MAX_NAME_LENGTH)
  const lastName = optionalString(input, 'lastName', MAX_NAME_LENGTH)
  const email = optionalString(input, 'email', MAX_EMAIL_LENGTH)
  const from = optionalString(input, 'from', 10)
  const to = optionalString(input, 'to', 10)
  const persons = input.persons
  if (
    persons !== undefined &&
    (typeof persons !== 'number' || !Number.isFinite(persons) || persons < 0)
  ) {
    throw new OccupancyCommandError('Ungültige Eingabe für Personenzahl.')
  }
  const optionalNonNegativeNumber = (key: string) => {
    const value = input[key]
    if (value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new OccupancyCommandError(`Ungültige Eingabe für ${key}.`)
    return value
  }
  const monthlyRentCents = optionalNonNegativeNumber('monthlyRentCents')
  if (monthlyRentCents !== undefined && !Number.isSafeInteger(monthlyRentCents))
    throw new OccupancyCommandError('Ungültige Eingabe für monthlyRentCents.')
  const consumptionUnits = optionalNonNegativeNumber('consumptionUnits')
  const coldWater = optionalNonNegativeNumber('coldWater')
  const warmWater = optionalNonNegativeNumber('warmWater')
  const consumptionUnitsEstimated = input.consumptionUnitsEstimated
  const applySection12Reduction = input.applySection12Reduction
  if (
    (consumptionUnitsEstimated !== undefined &&
      typeof consumptionUnitsEstimated !== 'boolean') ||
    (applySection12Reduction !== undefined &&
      typeof applySection12Reduction !== 'boolean')
  )
    throw new OccupancyCommandError('Ungültige boolesche Nutzereingabe.')
  const mandateReference = optionalString(input, 'mandateReference', 500)
  const consumptionUnitsEstimateReason = optionalString(
    input,
    'consumptionUnitsEstimateReason',
    500,
  )
  const dispatchDate = optionalString(input, 'dispatchDate', 10)
  const note = optionalString(input, 'note', 2_000)
  const costScope =
    input.costScope === undefined
      ? undefined
      : parseEntity(allocationScopeSchema, input.costScope, 'Kostenbereich')
  const propertyTaxScope =
    input.propertyTaxScope === undefined
      ? undefined
      : parseEntity(
          allocationScopeSchema,
          input.propertyTaxScope,
          'Grundsteuerbereich',
        )
  const shippingAddressStreet = optionalString(
    input,
    'shippingAddressStreet',
    500,
  )
  const shippingAddressPostalCodeAndCity = optionalString(
    input,
    'shippingAddressPostalCodeAndCity',
    500,
  )
  const prepayment = parsePrepaymentInput(input.prepayment)
  const occupancy = file.billingData.occupancyPeriods.find(
    ({ id }) => id === occupancyPeriodId,
  )
  if (occupancy?.kind !== 'tenant' || occupancy.tenancyId == null) {
    throw new OccupancyCommandError('Nutzerzeitraum wurde nicht gefunden.')
  }
  const tenancy = file.masterData.tenancies.find(
    ({ id }) => id === occupancy.tenancyId,
  )
  const personId = tenancy?.personIds[0]
  if (tenancy === undefined || personId === undefined) {
    throw new OccupancyCommandError('Mietverhältnis wurde nicht gefunden.')
  }
  const period = file.billingData.billingPeriods.find(
    ({ id }) => id === occupancy.billingPeriodId,
  )
  if (period === undefined) {
    throw new OccupancyCommandError('Abrechnungsjahr wurde nicht gefunden.')
  }
  const range = assertDateRange(from, to, period.periodStart, period.periodEnd)
  assertNoOverlap(
    file.billingData.occupancyPeriods.filter(
      ({ id }) => id !== occupancyPeriodId,
    ),
    occupancy.billingPeriodId,
    occupancy.unitId,
    range,
    period.periodStart,
    period.periodEnd,
  )
  const updated = validatedFile({
    ...file,
    masterData: {
      ...file.masterData,
      persons: file.masterData.persons.map((person) =>
        person.id === personId
          ? { ...person, displayName, firstName, lastName, email }
          : person,
      ),
      tenancies: file.masterData.tenancies.map((item) =>
        item.id === tenancy.id
          ? {
              ...item,
              shippingAddressStreet,
              shippingAddressPostalCodeAndCity,
              mandateReference,
              monthlyRentCents,
            }
          : item,
      ),
    },
    billingData: {
      ...file.billingData,
      occupancyPeriods: file.billingData.occupancyPeriods.map((item) =>
        item.id === occupancyPeriodId
          ? {
              ...item,
              from,
              to,
              persons:
                typeof persons === 'number'
                  ? { value: persons, unit: 'personen' as const }
                  : undefined,
              consumptionUnits:
                consumptionUnits === undefined
                  ? undefined
                  : { value: consumptionUnits, unit: 'einheiten' as const },
              consumptionUnitsEstimated,
              consumptionUnitsEstimateReason,
              coldWater:
                coldWater === undefined
                  ? undefined
                  : { value: coldWater, unit: 'm3' as const },
              warmWater:
                warmWater === undefined
                  ? undefined
                  : { value: warmWater, unit: 'm3' as const },
              applySection12Reduction,
              costScope,
              propertyTaxScope,
              dispatchDate,
              note,
            }
          : item,
      ),
    },
  })
  return setOccupancyPrepayment(updated, {
    occupancyPeriodId,
    ...prepayment,
  })
}

export function updateVacancyOccupancy(
  file: AppDataFile,
  rawInput: unknown,
): AppDataFile {
  const input = recordWithExactKeys(
    rawInput,
    ['occupancyPeriodId', 'from', 'to', 'note'],
    'Leerstandsbearbeitung',
  )
  const occupancyPeriodId = requiredString(input, 'occupancyPeriodId')
  const from = optionalString(input, 'from', 10)
  const to = optionalString(input, 'to', 10)
  const note = optionalString(input, 'note', 500)
  const occupancy = file.billingData.occupancyPeriods.find(
    ({ id }) => id === occupancyPeriodId,
  )
  if (occupancy?.kind !== 'vacancy') {
    throw new OccupancyCommandError('Leerstandszeitraum wurde nicht gefunden.')
  }
  const period = file.billingData.billingPeriods.find(
    ({ id }) => id === occupancy.billingPeriodId,
  )
  if (period === undefined) {
    throw new OccupancyCommandError('Abrechnungsjahr wurde nicht gefunden.')
  }
  const range = assertDateRange(from, to, period.periodStart, period.periodEnd)
  assertNoOverlap(
    file.billingData.occupancyPeriods.filter(
      ({ id }) => id !== occupancyPeriodId,
    ),
    occupancy.billingPeriodId,
    occupancy.unitId,
    range,
    period.periodStart,
    period.periodEnd,
  )
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      occupancyPeriods: file.billingData.occupancyPeriods.map((item) =>
        item.id === occupancyPeriodId ? { ...item, from, to, note } : item,
      ),
    },
  })
}

export function deleteOccupancy(
  file: AppDataFile,
  occupancyPeriodId: string,
): AppDataFile {
  const occupancy = file.billingData.occupancyPeriods.find(
    ({ id }) => id === occupancyPeriodId,
  )
  if (occupancy === undefined) {
    throw new OccupancyCommandError('Nutzungszeitraum wurde nicht gefunden.')
  }
  if (
    file.billingData.documents.some(
      ({ occupancyPeriodId: reference }) => reference === occupancyPeriodId,
    )
  ) {
    throw new OccupancyCommandError(
      'Der Nutzungszeitraum kann wegen erzeugter Dokumente nicht gelöscht werden.',
    )
  }
  const tenancyStillUsed =
    occupancy.tenancyId != null &&
    file.billingData.occupancyPeriods.some(
      ({ id, tenancyId }) =>
        id !== occupancyPeriodId && tenancyId === occupancy.tenancyId,
    )
  const tenancy = file.masterData.tenancies.find(
    ({ id }) => id === occupancy.tenancyId,
  )
  const removedPersonIds = tenancyStillUsed
    ? new Set<string>()
    : new Set(tenancy?.personIds ?? [])
  const personStillUsed = (personId: string) =>
    file.masterData.tenancies.some(
      ({ id, personIds }) => id !== tenancy?.id && personIds.includes(personId),
    )
  return validatedFile({
    ...file,
    masterData: {
      ...file.masterData,
      tenancies: tenancyStillUsed
        ? file.masterData.tenancies
        : file.masterData.tenancies.filter(({ id }) => id !== tenancy?.id),
      persons: file.masterData.persons.filter(
        ({ id }) => !removedPersonIds.has(id) || personStillUsed(id),
      ),
    },
    billingData: {
      ...file.billingData,
      occupancyPeriods: file.billingData.occupancyPeriods.filter(
        ({ id }) => id !== occupancyPeriodId,
      ),
      prepayments: file.billingData.prepayments.filter(
        ({ occupancyPeriodId: reference }) => reference !== occupancyPeriodId,
      ),
    },
  })
}
