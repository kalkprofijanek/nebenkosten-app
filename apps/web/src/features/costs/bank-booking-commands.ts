import {
  appDataFileSchema,
  bankBookingSchema,
  type AppDataFile,
  type BankBooking,
} from '@nebenkosten/schema'

export class BankBookingCommandError extends Error {
  override readonly name = 'BankBookingCommandError'
}

export interface CreateBankBookingInput {
  readonly propertyId: string
  readonly date: string
  readonly amountCents: number
  readonly counterparty?: string
  readonly purpose?: string
  readonly bookingText?: string
  readonly note?: string
  readonly importedAt?: string
}

export interface ImportBankBookingsResult {
  readonly data: AppDataFile
  readonly addedCount: number
  readonly duplicateCount: number
}

type CreateId = () => string

const UPDATE_KEYS = [
  'category',
  'billingYear',
  'costCategoryId',
  'allocablePercent',
  'note',
  'splits',
] as const

function strictRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BankBookingCommandError('Ungültige Eingabe für Bankbuchung.')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !UPDATE_KEYS.includes(key as never))) {
    throw new BankBookingCommandError('Ungültige Eingabe für Bankbuchung.')
  }
  return record
}

function validatedFile(file: AppDataFile): AppDataFile {
  const result = appDataFileSchema.safeParse(file)
  if (!result.success) {
    throw new BankBookingCommandError(
      'Der neue Datenstand verletzt das Dateischema.',
    )
  }
  return result.data
}

function parsedBooking(value: unknown): BankBooking {
  const result = bankBookingSchema.safeParse(value)
  if (!result.success) {
    throw new BankBookingCommandError('Ungültige Eingabe für Bankbuchung.')
  }
  return result.data
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

function validateSplitSum(booking: BankBooking): void {
  if (booking.splits == null || booking.splits.length === 0) return
  const sum = booking.splits.reduce(
    (total, { amountCents }) => total + amountCents,
    0,
  )
  if (sum !== booking.amountCents) {
    throw new BankBookingCommandError(
      'Die Summe der Splits muss dem Buchungsbetrag centgenau entsprechen.',
    )
  }
  if (
    new Set(booking.splits.map(({ id }) => id)).size !== booking.splits.length
  ) {
    throw new BankBookingCommandError('Split-IDs müssen eindeutig sein.')
  }
}

function validateCategoryReferences(file: AppDataFile, booking: BankBooking) {
  const assignments = [
    ...(booking.costCategoryId == null
      ? []
      : [
          {
            costCategoryId: booking.costCategoryId,
            billingYear: booking.billingYear,
          },
        ]),
    ...(booking.splits ?? []).flatMap((split) =>
      split.costCategoryId == null
        ? []
        : [
            {
              costCategoryId: split.costCategoryId,
              billingYear: split.billingYear,
            },
          ],
    ),
  ]
  for (const assignment of assignments) {
    const category = file.billingData.costCategories.find(
      ({ id }) => id === assignment.costCategoryId,
    )
    const period = file.billingData.billingPeriods.find(
      ({ id }) => id === category?.billingPeriodId,
    )
    if (
      category === undefined ||
      period === undefined ||
      period.propertyId !== booking.propertyId ||
      (assignment.billingYear != null && period.year !== assignment.billingYear)
    ) {
      throw new BankBookingCommandError(
        'Die Kostenart-Zuordnung gehört nicht zu Objekt und Abrechnungsjahr.',
      )
    }
  }
}

export function bankBookingDedupeHash(
  input: Pick<
    CreateBankBookingInput,
    'date' | 'amountCents' | 'counterparty' | 'purpose'
  >,
): string {
  const source = JSON.stringify([
    input.date,
    input.amountCents,
    (input.counterparty ?? '').slice(0, 30),
    (input.purpose ?? '').slice(0, 40),
  ])
  let hash = 0xcbf29ce484222325n
  for (const character of source) {
    hash ^= BigInt(character.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `bh${hash.toString(16).padStart(16, '0')}`
}

function bookingHashes(booking: BankBooking): readonly string[] {
  const calculated = bankBookingDedupeHash({
    date: booking.date ?? '',
    amountCents: booking.amountCents,
    counterparty: booking.counterparty ?? undefined,
    purpose: booking.purpose ?? undefined,
  })
  return booking.dedupeHash && booking.dedupeHash !== calculated
    ? [booking.dedupeHash, calculated]
    : [calculated]
}

function createBooking(
  input: CreateBankBookingInput,
  id: string,
  dedupeHash = bankBookingDedupeHash(input),
): BankBooking {
  return parsedBooking({
    id,
    propertyId: input.propertyId,
    dedupeHash,
    date: input.date,
    amountCents: input.amountCents,
    ...(input.counterparty ? { counterparty: input.counterparty } : {}),
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.bookingText ? { bookingText: input.bookingText } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.importedAt ? { importedAt: input.importedAt } : {}),
    category: 'OFFEN',
    reviewed: false,
  })
}

export function addBankBooking(
  file: AppDataFile,
  input: CreateBankBookingInput,
  createId: CreateId = () => crypto.randomUUID(),
): AppDataFile {
  if (!file.masterData.properties.some(({ id }) => id === input.propertyId)) {
    throw new BankBookingCommandError('Objekt wurde nicht gefunden.')
  }
  const dedupeHash = bankBookingDedupeHash(input)
  if (
    file.billingData.bankBookings.some((booking) =>
      bookingHashes(booking).includes(dedupeHash),
    )
  ) {
    throw new BankBookingCommandError('Diese Bankbuchung existiert bereits.')
  }
  const booking = createBooking(input, createId(), dedupeHash)
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      bankBookings: [...file.billingData.bankBookings, booking],
    },
  })
}

export function importBankBookings(
  file: AppDataFile,
  propertyId: string,
  rows: readonly Omit<CreateBankBookingInput, 'propertyId' | 'importedAt'>[],
  dependencies: {
    readonly createId?: CreateId
    readonly importedAt?: string
  } = {},
): ImportBankBookingsResult {
  if (!file.masterData.properties.some(({ id }) => id === propertyId)) {
    throw new BankBookingCommandError('Objekt wurde nicht gefunden.')
  }
  const createId = dependencies.createId ?? (() => crypto.randomUUID())
  const importedAt = dependencies.importedAt ?? new Date().toISOString()
  const knownHashes = new Set(
    file.billingData.bankBookings.flatMap((booking) => bookingHashes(booking)),
  )
  const addedBookings: BankBooking[] = []
  let addedCount = 0
  let duplicateCount = 0
  for (const row of rows) {
    const input = { ...row, propertyId, importedAt }
    const hash = bankBookingDedupeHash(input)
    if (knownHashes.has(hash)) {
      duplicateCount += 1
      continue
    }
    knownHashes.add(hash)
    addedBookings.push(createBooking(input, createId(), hash))
    addedCount += 1
  }
  const data =
    addedBookings.length === 0
      ? file
      : validatedFile({
          ...file,
          billingData: {
            ...file.billingData,
            bankBookings: [...file.billingData.bankBookings, ...addedBookings],
          },
        })
  return { data, addedCount, duplicateCount }
}

export function updateBankBooking(
  file: AppDataFile,
  bookingId: string,
  rawInput: unknown,
): AppDataFile {
  const current = file.billingData.bankBookings.find(
    ({ id }) => id === bookingId,
  )
  if (current === undefined) {
    throw new BankBookingCommandError('Bankbuchung wurde nicht gefunden.')
  }
  if (current.reviewed === true) {
    throw new BankBookingCommandError(
      'Die geprüfte Bankbuchung ist gesperrt und muss zuerst wieder geöffnet werden.',
    )
  }
  const input = strictRecord(rawInput)
  const replacement = parsedBooking(
    withoutUndefined({
      ...current,
      ...input,
      reviewed: false,
    }),
  )
  validateSplitSum(replacement)
  validateCategoryReferences(file, replacement)
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      bankBookings: file.billingData.bankBookings.map((booking) =>
        booking.id === bookingId ? replacement : booking,
      ),
    },
  })
}

export function setBankBookingReviewed(
  file: AppDataFile,
  bookingId: string,
  reviewed: boolean,
): AppDataFile {
  const current = file.billingData.bankBookings.find(
    ({ id }) => id === bookingId,
  )
  if (current === undefined) {
    throw new BankBookingCommandError('Bankbuchung wurde nicht gefunden.')
  }
  if (
    reviewed &&
    (current.category == null || current.category === 'OFFEN') &&
    (current.splits == null || current.splits.length === 0)
  ) {
    throw new BankBookingCommandError(
      'Eine offene, nicht zugeordnete Buchung kann nicht geprüft werden.',
    )
  }
  validateSplitSum(current)
  validateCategoryReferences(file, current)
  return validatedFile({
    ...file,
    billingData: {
      ...file.billingData,
      bankBookings: file.billingData.bankBookings.map((booking) =>
        booking.id === bookingId ? { ...booking, reviewed } : booking,
      ),
    },
  })
}
