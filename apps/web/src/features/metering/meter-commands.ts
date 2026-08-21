import {
  appDataFileSchema,
  meterBillingStatusSchema,
  meterReadingSchema,
  meterSchema,
  uuidSchema,
  type AppDataFile,
  type Meter,
  type MeterBillingStatus,
  type MeterReading,
} from '@nebenkosten/schema'

export interface MeterCommandDependencies {
  readonly createId: () => string
}

export type MeterInput = Omit<Meter, 'id' | 'legacyUnmapped'>
export type MeterReadingInput = Omit<MeterReading, 'id' | 'legacyUnmapped'>
export type MeterBillingStatusInput = Omit<
  MeterBillingStatus,
  'id' | 'legacyUnmapped'
>

export class MeterCommandError extends Error {
  override readonly name = 'MeterCommandError'
}

const meterInputSchema = meterSchema.omit({ id: true, legacyUnmapped: true })
const readingInputSchema = meterReadingSchema.omit({
  id: true,
  legacyUnmapped: true,
})
const statusInputSchema = meterBillingStatusSchema.omit({
  id: true,
  legacyUnmapped: true,
})

function withoutUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUndefinedDeep(item)) as T
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, field]) =>
        field === undefined ? [] : [[key, withoutUndefinedDeep(field)]],
      ),
    ) as T
  }
  return value
}

function parsedFile(file: AppDataFile): AppDataFile {
  const result = appDataFileSchema.safeParse(withoutUndefinedDeep(file))
  if (!result.success)
    throw new MeterCommandError('Der Datenbestand ist ungültig.')
  return result.data
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new MeterCommandError(`${label} enthält ungültige Felder.`)
  return result.data as T
}

function entityIds(file: AppDataFile): Set<string> {
  const ids = new Set<string>()
  for (const container of [file.masterData, file.billingData]) {
    for (const entities of Object.values(container)) {
      for (const entity of entities) {
        if ('id' in entity && typeof entity.id === 'string') ids.add(entity.id)
      }
    }
  }
  return ids
}

function newId(
  file: AppDataFile,
  dependencies: MeterCommandDependencies,
): string {
  const id = dependencies.createId()
  if (!uuidSchema.safeParse(id).success || entityIds(file).has(id))
    throw new MeterCommandError('Die erzeugte ID ist ungültig oder belegt.')
  return id
}

function requireMeter(file: AppDataFile, meterId: string): Meter {
  const meter = file.masterData.meters.find(({ id }) => id === meterId)
  if (!meter) throw new MeterCommandError('Zähler wurde nicht gefunden.')
  return meter
}

function validateText(value: string | null | undefined, label: string) {
  if (value != null && (value.trim().length === 0 || value.length > 500))
    throw new MeterCommandError(`${label} ist ungültig.`)
}

function validateMeterReferences(file: AppDataFile, meter: MeterInput) {
  if (!file.masterData.properties.some(({ id }) => id === meter.propertyId))
    throw new MeterCommandError('Das Objekt des Zählers existiert nicht.')
  for (const [value, label] of [
    [meter.address, 'Zähleradresse'],
    [meter.meterNumber, 'Zählernummer'],
    [meter.maloId, 'Marktlokations-ID'],
    [meter.provider, 'Versorger'],
    [meter.contractOrAccountNumber, 'Vertragsnummer'],
    [meter.note, 'Zählernotiz'],
    [meter.additionalNote, 'Zusatznotiz'],
  ] as const)
    validateText(value, label)
  if (meter.energySourceRef) {
    const building = file.masterData.buildings.find(
      ({ id }) => id === meter.energySourceRef?.heatingCircuitBuildingId,
    )
    const circuits = file.billingData.heatingCircuits.filter(
      ({ buildingId }) => buildingId === building?.id,
    )
    const sourceExists = file.billingData.energySources.some(
      ({ heatingCircuitId, key }) =>
        circuits.some(({ id }) => id === heatingCircuitId) &&
        key === meter.energySourceRef?.energySourceKey,
    )
    if (!building || building.propertyId !== meter.propertyId || !sourceExists)
      throw new MeterCommandError(
        'Die Energiequellen-Zuordnung gehört nicht zum Objekt.',
      )
  }
}

function validateReadingReferences(
  file: AppDataFile,
  reading: MeterReadingInput,
) {
  const meter = requireMeter(file, reading.meterId)
  if (reading.value.value < 0)
    throw new MeterCommandError('Der Zählerstand darf nicht negativ sein.')
  if (reading.billingPeriodId) {
    const period = file.billingData.billingPeriods.find(
      ({ id }) => id === reading.billingPeriodId,
    )
    if (!period || period.propertyId !== meter.propertyId)
      throw new MeterCommandError(
        'Zähler und Abrechnungsjahr gehören nicht zum selben Objekt.',
      )
    if (
      reading.date &&
      (reading.date < period.periodStart || reading.date > period.periodEnd)
    )
      throw new MeterCommandError(
        'Das Ablesedatum liegt außerhalb des Abrechnungszeitraums.',
      )
  }
  validateText(reading.note, 'Ablesenotiz')
}

function validateStatusReferences(
  file: AppDataFile,
  status: MeterBillingStatusInput,
) {
  const meter = requireMeter(file, status.meterId)
  if (status.billingPeriodId) {
    const period = file.billingData.billingPeriods.find(
      ({ id }) => id === status.billingPeriodId,
    )
    if (
      !period ||
      period.propertyId !== meter.propertyId ||
      period.year !== status.year
    )
      throw new MeterCommandError(
        'Zählerstatus und Abrechnungsjahr gehören nicht zum selben Objekt und Jahr.',
      )
  }
  validateText(status.note, 'Statusnotiz')
  validateText(status.estimateReason, 'Schätzgrund')
}

export function addMeter(
  currentFile: AppDataFile,
  rawInput: unknown,
  dependencies: MeterCommandDependencies = {
    createId: () => crypto.randomUUID(),
  },
): AppDataFile {
  const file = parsedFile(currentFile)
  const input = parse<MeterInput>(meterInputSchema, rawInput, 'Der Zähler')
  validateMeterReferences(file, input)
  const meter = meterSchema.parse({ ...input, id: newId(file, dependencies) })
  return parsedFile({
    ...file,
    masterData: {
      ...file.masterData,
      meters: [...file.masterData.meters, meter],
    },
  })
}

export function updateMeter(
  currentFile: AppDataFile,
  meterId: string,
  rawInput: unknown,
): AppDataFile {
  const file = parsedFile(currentFile)
  const current = requireMeter(file, meterId)
  const input = parse<MeterInput>(meterInputSchema, rawInput, 'Der Zähler')
  validateMeterReferences(file, input)
  if (
    current.propertyId !== input.propertyId &&
    (file.billingData.meterReadings.some(
      ({ meterId: reference }) => reference === meterId,
    ) ||
      file.billingData.meterBillingStatuses.some(
        ({ meterId: reference }) => reference === meterId,
      ))
  )
    throw new MeterCommandError(
      'Ein Zähler mit Jahresdaten kann nicht in ein anderes Objekt verschoben werden.',
    )
  const replacement = meterSchema.parse({ ...input, id: current.id })
  return parsedFile({
    ...file,
    masterData: {
      ...file.masterData,
      meters: file.masterData.meters.map((meter) =>
        meter.id === meterId ? replacement : meter,
      ),
    },
  })
}

export function deleteMeter(
  currentFile: AppDataFile,
  meterId: string,
): AppDataFile {
  const file = parsedFile(currentFile)
  requireMeter(file, meterId)
  if (
    file.billingData.meterReadings.some(
      ({ meterId: reference }) => reference === meterId,
    )
  )
    throw new MeterCommandError(
      'Der Zähler kann mit vorhandenen Ablesungen nicht gelöscht werden.',
    )
  if (
    file.billingData.meterBillingStatuses.some(
      ({ meterId: reference }) => reference === meterId,
    ) ||
    file.billingData.fuelDeliveries.some(
      ({ meterId: reference }) => reference === meterId,
    ) ||
    file.billingData.costEntries.some(
      ({ meterId: reference }) => reference === meterId,
    )
  )
    throw new MeterCommandError(
      'Der Zähler kann mit vorhandenen Jahres- oder Buchungsdaten nicht gelöscht werden.',
    )
  return parsedFile({
    ...file,
    masterData: {
      ...file.masterData,
      meters: file.masterData.meters.filter(({ id }) => id !== meterId),
    },
  })
}

export function addMeterReading(
  currentFile: AppDataFile,
  rawInput: unknown,
  dependencies: MeterCommandDependencies = {
    createId: () => crypto.randomUUID(),
  },
): AppDataFile {
  const file = parsedFile(currentFile)
  const input = parse<MeterReadingInput>(
    readingInputSchema,
    rawInput,
    'Die Ablesung',
  )
  validateReadingReferences(file, input)
  const reading = meterReadingSchema.parse({
    ...input,
    id: newId(file, dependencies),
  })
  return parsedFile({
    ...file,
    billingData: {
      ...file.billingData,
      meterReadings: [...file.billingData.meterReadings, reading],
    },
  })
}

export function updateMeterReading(
  currentFile: AppDataFile,
  readingId: string,
  rawInput: unknown,
): AppDataFile {
  const file = parsedFile(currentFile)
  if (!file.billingData.meterReadings.some(({ id }) => id === readingId))
    throw new MeterCommandError('Ablesung wurde nicht gefunden.')
  const input = parse<MeterReadingInput>(
    readingInputSchema,
    rawInput,
    'Die Ablesung',
  )
  validateReadingReferences(file, input)
  const replacement = meterReadingSchema.parse({ ...input, id: readingId })
  return parsedFile({
    ...file,
    billingData: {
      ...file.billingData,
      meterReadings: file.billingData.meterReadings.map((reading) =>
        reading.id === readingId ? replacement : reading,
      ),
    },
  })
}

export function deleteMeterReading(
  currentFile: AppDataFile,
  readingId: string,
): AppDataFile {
  const file = parsedFile(currentFile)
  if (!file.billingData.meterReadings.some(({ id }) => id === readingId))
    throw new MeterCommandError('Ablesung wurde nicht gefunden.')
  return parsedFile({
    ...file,
    billingData: {
      ...file.billingData,
      meterReadings: file.billingData.meterReadings.filter(
        ({ id }) => id !== readingId,
      ),
    },
  })
}

export function upsertMeterBillingStatus(
  currentFile: AppDataFile,
  rawInput: unknown,
  dependencies: MeterCommandDependencies = {
    createId: () => crypto.randomUUID(),
  },
): AppDataFile {
  const file = parsedFile(currentFile)
  const input = parse<MeterBillingStatusInput>(
    statusInputSchema,
    rawInput,
    'Der Zählerstatus',
  )
  validateStatusReferences(file, input)
  const current = file.billingData.meterBillingStatuses.find(
    ({ meterId, year }) => meterId === input.meterId && year === input.year,
  )
  const status = meterBillingStatusSchema.parse({
    ...input,
    id: current?.id ?? newId(file, dependencies),
  })
  return parsedFile({
    ...file,
    billingData: {
      ...file.billingData,
      meterBillingStatuses: current
        ? file.billingData.meterBillingStatuses.map((candidate) =>
            candidate.id === current.id ? status : candidate,
          )
        : [...file.billingData.meterBillingStatuses, status],
    },
  })
}

export function deleteMeterBillingStatus(
  currentFile: AppDataFile,
  statusId: string,
): AppDataFile {
  const file = parsedFile(currentFile)
  if (!file.billingData.meterBillingStatuses.some(({ id }) => id === statusId))
    throw new MeterCommandError('Zählerstatus wurde nicht gefunden.')
  return parsedFile({
    ...file,
    billingData: {
      ...file.billingData,
      meterBillingStatuses: file.billingData.meterBillingStatuses.filter(
        ({ id }) => id !== statusId,
      ),
    },
  })
}
