import {
  appDataFileSchema,
  bankBookingSchema,
  type AppDataFile,
  type BankBooking,
} from '@nebenkosten/schema'

export class BankBookingCommandError extends Error {
  override readonly name = 'BankBookingCommandError'
}

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
  const replacement = parsedBooking({
    ...current,
    ...input,
    reviewed: false,
  })
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
