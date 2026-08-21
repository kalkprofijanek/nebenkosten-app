import {
  appDataFileSchema,
  energySourceSchema,
  fuelDeliverySchema,
  fuelStockSchema,
  heatingCircuitSchema,
  heatingSystemSchema,
  uuidSchema,
  type AppDataFile,
  type EnergySource,
  type FuelDelivery,
  type FuelStock,
  type HeatingCircuit,
  type HeatingSystem,
  type Quantity,
} from '@nebenkosten/schema'

export interface HeatingCommandDependencies {
  createId: () => string
}

export type AddHeatingSystemInput = Omit<HeatingSystem, 'id' | 'legacyUnmapped'>
export type AddHeatingCircuitInput = Omit<
  HeatingCircuit,
  'id' | 'legacyUnmapped'
>
export type AddEnergySourceInput = Omit<EnergySource, 'id' | 'legacyUnmapped'>
export type AddFuelStockInput = Omit<FuelStock, 'id' | 'legacyUnmapped'>
export type AddFuelDeliveryInput = Omit<FuelDelivery, 'id' | 'legacyUnmapped'>

type IssueCode =
  | 'duplicate'
  | 'invalid-data'
  | 'invalid-id'
  | 'invalid-reference'
  | 'invalid-value'

export class HeatingCommandError extends Error {
  constructor(
    readonly code: IssueCode,
    message: string,
  ) {
    super(message)
    this.name = 'HeatingCommandError'
  }
}

const heatingSystemInputSchema = heatingSystemSchema.omit({
  id: true,
  legacyUnmapped: true,
})
const heatingCircuitInputSchema = heatingCircuitSchema.omit({
  id: true,
  legacyUnmapped: true,
})
const energySourceInputSchema = energySourceSchema.omit({
  id: true,
  legacyUnmapped: true,
})
const fuelStockInputSchema = fuelStockSchema.omit({
  id: true,
  legacyUnmapped: true,
})
const fuelDeliveryInputSchema = fuelDeliverySchema.omit({
  id: true,
  legacyUnmapped: true,
})

interface SafeParser<T> {
  safeParse: (
    input: unknown,
  ) => { success: true; data: T } | { success: false; error: unknown }
}

function parse<T>(parser: SafeParser<T>, input: unknown, label: string): T {
  const result = parser.safeParse(input)
  if (!result.success) {
    throw new HeatingCommandError(
      'invalid-data',
      `${label} enthält ungültige oder unbekannte Felder.`,
    )
  }
  return result.data
}

function parseFile(file: AppDataFile): AppDataFile {
  return parse(appDataFileSchema, file, 'Der aktuelle Datenbestand')
}

function createId(dependencies: HeatingCommandDependencies): string {
  const result = uuidSchema.safeParse(dependencies.createId())
  if (!result.success) {
    throw new HeatingCommandError(
      'invalid-id',
      'Neue Datensätze benötigen eine gültige UUID.',
    )
  }
  return result.data
}

function assertText(
  value: null | string | undefined,
  label: string,
  maximumLength: number,
): void {
  if (value === null || value === undefined) return
  if (value.trim().length === 0 || value.length > maximumLength) {
    throw new HeatingCommandError(
      'invalid-value',
      `${label} muss zwischen 1 und ${maximumLength} Zeichen lang sein.`,
    )
  }
}

function assertNonNegativeQuantity(
  quantity: null | Quantity | undefined,
  label: string,
): void {
  if (quantity !== null && quantity !== undefined && quantity.value < 0) {
    throw new HeatingCommandError(
      'invalid-value',
      `${label} darf nicht negativ sein.`,
    )
  }
}

function assertMatchingUnits(
  quantities: (null | Quantity | undefined)[],
): void {
  const units = new Set(
    quantities.flatMap((quantity) => (quantity ? [quantity.unit] : [])),
  )
  if (units.size > 1) {
    throw new HeatingCommandError(
      'invalid-value',
      'Alle Brennstoffmengen einer Energiequelle benötigen dieselbe Mengeneinheit.',
    )
  }
}

function assertUniqueId(file: AppDataFile, id: string): void {
  const entityArrays = [
    ...Object.values(file.masterData),
    ...Object.values(file.billingData),
  ].filter(Array.isArray)
  if (
    entityArrays.some((entities) =>
      entities.some(
        (entity) =>
          typeof entity === 'object' &&
          entity !== null &&
          'id' in entity &&
          entity.id === id,
      ),
    )
  ) {
    throw new HeatingCommandError(
      'duplicate',
      'Die erzeugte UUID wird bereits verwendet.',
    )
  }
}

function newId(
  file: AppDataFile,
  dependencies: HeatingCommandDependencies,
): string {
  const id = createId(dependencies)
  assertUniqueId(file, id)
  return id
}

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

function validateResult(file: AppDataFile): AppDataFile {
  return parse(
    appDataFileSchema,
    withoutUndefinedDeep(file),
    'Der aktualisierte Datenbestand',
  )
}

function sourceContext(file: AppDataFile, energySourceId: string) {
  const source = file.billingData.energySources.find(
    (candidate) => candidate.id === energySourceId,
  )
  const circuit = source
    ? file.billingData.heatingCircuits.find(
        (candidate) => candidate.id === source.heatingCircuitId,
      )
    : undefined
  if (!source || !circuit) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Die referenzierte Energiequelle oder ihr Heizkreis existiert nicht.',
    )
  }
  return { circuit, source }
}

function assertSourcePeriod(
  file: AppDataFile,
  energySourceId: string,
  billingPeriodId: string,
) {
  const context = sourceContext(file, energySourceId)
  const period = file.billingData.billingPeriods.find(
    (candidate) => candidate.id === billingPeriodId,
  )
  if (!period || context.circuit.billingPeriodId !== period.id) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Energiequelle und Abrechnungsjahr passen nicht zusammen.',
    )
  }
  return { ...context, period }
}

function quantitiesForSource(
  file: AppDataFile,
  energySourceId: string,
): (null | Quantity | undefined)[] {
  const stocks = file.billingData.fuelStocks.filter(
    (stock) => stock.energySourceId === energySourceId,
  )
  const deliveries = file.billingData.fuelDeliveries.filter(
    (delivery) => delivery.energySourceId === energySourceId,
  )
  return [
    ...stocks.flatMap((stock) => [
      stock.openingQuantity,
      stock.remainingQuantity,
    ]),
    ...deliveries.map((delivery) => delivery.quantity),
  ]
}

export function addHeatingSystem(
  currentFile: AppDataFile,
  unknownInput: AddHeatingSystemInput,
  dependencies: HeatingCommandDependencies,
): AppDataFile {
  const file = parseFile(currentFile)
  const input = parse(heatingSystemInputSchema, unknownInput, 'Das Heizsystem')
  assertText(input.name, 'Der Name des Heizsystems', 200)
  if (
    !file.masterData.properties.some(
      (property) => property.id === input.propertyId,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Die gewählte Liegenschaft existiert nicht.',
    )
  }
  const entity = heatingSystemSchema.parse({
    ...input,
    id: newId(file, dependencies),
  })
  return validateResult({
    ...file,
    masterData: {
      ...file.masterData,
      heatingSystems: [...file.masterData.heatingSystems, entity],
    },
  })
}

export function addHeatingCircuit(
  currentFile: AppDataFile,
  unknownInput: AddHeatingCircuitInput,
  dependencies: HeatingCommandDependencies,
): AppDataFile {
  const file = parseFile(currentFile)
  const input = parse(heatingCircuitInputSchema, unknownInput, 'Der Heizkreis')
  const period = file.billingData.billingPeriods.find(
    (candidate) => candidate.id === input.billingPeriodId,
  )
  const system = file.masterData.heatingSystems.find(
    (candidate) => candidate.id === input.heatingSystemId,
  )
  const building = file.masterData.buildings.find(
    (candidate) => candidate.id === input.buildingId,
  )
  if (!period || !system || !building) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Abrechnungsjahr, Heizsystem oder Gebäude existiert nicht.',
    )
  }
  if (
    period.propertyId !== system.propertyId ||
    building.propertyId !== system.propertyId
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Abrechnungsjahr, Heizsystem und Gebäude müssen zur gleichen Liegenschaft gehören.',
    )
  }
  if (
    file.billingData.heatingCircuits.some(
      (circuit) =>
        circuit.billingPeriodId === input.billingPeriodId &&
        circuit.buildingId === input.buildingId,
    )
  ) {
    throw new HeatingCommandError(
      'duplicate',
      'Für dieses Gebäude existiert im Abrechnungsjahr bereits ein Heizkreis.',
    )
  }
  if (
    input.hasCentralHotWater &&
    (input.hotWaterSharePercent === null ||
      input.hotWaterSharePercent === undefined ||
      input.hotWaterSharePercent < 18 ||
      input.hotWaterSharePercent > 70)
  ) {
    throw new HeatingCommandError(
      'invalid-value',
      'Der Warmwasseranteil muss zwischen 18 und 70 Prozent liegen.',
    )
  }
  if (!input.hasCentralHotWater && input.hotWaterSharePercent != null) {
    throw new HeatingCommandError(
      'invalid-value',
      'Ein Warmwasseranteil ist nur bei zentraler Warmwasserbereitung zulässig.',
    )
  }
  const consumption = input.overrides?.consumptionSharePercent
  const base = input.overrides?.baseSharePercent
  if (
    consumption != null &&
    base != null &&
    Math.abs(consumption + base - 100) > Number.EPSILON
  ) {
    throw new HeatingCommandError(
      'invalid-value',
      'Verbrauchs- und Grundkostenanteil müssen zusammen 100 Prozent ergeben.',
    )
  }
  const entity = heatingCircuitSchema.parse({
    ...input,
    id: newId(file, dependencies),
  })
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      heatingCircuits: [...file.billingData.heatingCircuits, entity],
    },
  })
}

export function addEnergySource(
  currentFile: AppDataFile,
  unknownInput: AddEnergySourceInput,
  dependencies: HeatingCommandDependencies,
): AppDataFile {
  const file = parseFile(currentFile)
  const input = parse(
    energySourceInputSchema,
    unknownInput,
    'Die Energiequelle',
  )
  assertText(input.key, 'Der Schlüssel der Energiequelle', 100)
  assertText(input.name, 'Der Name der Energiequelle', 200)
  assertText(input.sourceType, 'Der Energieträger', 100)
  if (
    !file.billingData.heatingCircuits.some(
      (circuit) => circuit.id === input.heatingCircuitId,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Der referenzierte Heizkreis existiert nicht.',
    )
  }
  const normalizedKey = input.key.toLocaleLowerCase('de-DE')
  if (
    file.billingData.energySources.some(
      (source) =>
        source.heatingCircuitId === input.heatingCircuitId &&
        source.key.toLocaleLowerCase('de-DE') === normalizedKey,
    )
  ) {
    throw new HeatingCommandError(
      'duplicate',
      'Der Schlüssel wird in diesem Heizkreis bereits verwendet.',
    )
  }
  const entity = energySourceSchema.parse({
    ...input,
    id: newId(file, dependencies),
  })
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      energySources: [...file.billingData.energySources, entity],
    },
  })
}

export function addFuelStock(
  currentFile: AppDataFile,
  unknownInput: AddFuelStockInput,
  dependencies: HeatingCommandDependencies,
): AppDataFile {
  const file = parseFile(currentFile)
  const input = parse(
    fuelStockInputSchema,
    unknownInput,
    'Der Brennstoffbestand',
  )
  assertSourcePeriod(file, input.energySourceId, input.billingPeriodId)
  if (
    file.billingData.fuelStocks.some(
      (stock) =>
        stock.energySourceId === input.energySourceId &&
        stock.billingPeriodId === input.billingPeriodId,
    )
  ) {
    throw new HeatingCommandError(
      'duplicate',
      'Für diese Energiequelle ist bereits ein Brennstoffbestand erfasst.',
    )
  }
  assertNonNegativeQuantity(input.openingQuantity, 'Der Anfangsbestand')
  assertNonNegativeQuantity(input.remainingQuantity, 'Der Restbestand')
  if (
    (input.openingValueCents ?? 0) < 0 ||
    (input.openingPricePerUnitCents ?? 0) < 0
  ) {
    throw new HeatingCommandError(
      'invalid-value',
      'Bestandswert und Preis dürfen nicht negativ sein.',
    )
  }
  assertMatchingUnits([
    ...quantitiesForSource(file, input.energySourceId),
    input.openingQuantity,
    input.remainingQuantity,
  ])
  const entity = fuelStockSchema.parse({
    ...input,
    id: newId(file, dependencies),
  })
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      fuelStocks: [...file.billingData.fuelStocks, entity],
    },
  })
}

function assertDeliveryReferences(
  file: AppDataFile,
  input: AddFuelDeliveryInput,
  propertyId: string,
): void {
  if (input.bookingLink && input.externalPayment) {
    throw new HeatingCommandError(
      'invalid-value',
      'Buchungsverknüpfung und externe Zahlung dürfen nicht gleichzeitig gesetzt sein.',
    )
  }
  if (input.meterId) {
    const meter = file.masterData.meters.find(
      (candidate) => candidate.id === input.meterId,
    )
    if (!meter || meter.propertyId !== propertyId) {
      throw new HeatingCommandError(
        'invalid-reference',
        'Der gewählte Zähler gehört nicht zur Liegenschaft.',
      )
    }
  }
  if (input.bookingLink) {
    const booking = file.billingData.bankBookings.find(
      (candidate) => candidate.id === input.bookingLink?.bankBookingId,
    )
    const splitExists =
      input.bookingLink.splitId == null ||
      booking?.splits?.some(
        (split) => split.id === input.bookingLink?.splitId,
      ) === true
    if (!booking || booking.propertyId !== propertyId || !splitExists) {
      throw new HeatingCommandError(
        'invalid-reference',
        'Die gewählte Kontobuchung oder Aufteilung ist ungültig.',
      )
    }
  }
  if (
    input.convertedFromCostCategoryId &&
    !file.billingData.costCategories.some(
      (category) =>
        category.id === input.convertedFromCostCategoryId &&
        category.billingPeriodId === input.billingPeriodId,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Die referenzierte Kostenart gehört nicht zum Abrechnungsjahr.',
    )
  }
}

export function addFuelDelivery(
  currentFile: AppDataFile,
  unknownInput: AddFuelDeliveryInput,
  dependencies: HeatingCommandDependencies,
): AppDataFile {
  const file = parseFile(currentFile)
  const input = parse(
    fuelDeliveryInputSchema,
    unknownInput,
    'Die Brennstofflieferung',
  )
  const { period } = assertSourcePeriod(
    file,
    input.energySourceId,
    input.billingPeriodId,
  )
  if (
    input.date &&
    (input.date < period.periodStart || input.date > period.periodEnd)
  ) {
    throw new HeatingCommandError(
      'invalid-value',
      'Das Lieferdatum liegt außerhalb des Abrechnungszeitraums.',
    )
  }
  assertNonNegativeQuantity(input.quantity, 'Die Liefermenge')
  assertMatchingUnits([
    ...quantitiesForSource(file, input.energySourceId),
    input.quantity,
  ])
  assertText(input.quantityStatus, 'Der Mengenstatus', 100)
  assertText(input.quantityNote, 'Der Mengenhinweis', 500)
  assertText(input.description, 'Die Beschreibung', 500)
  assertText(input.receiptReference, 'Die Belegreferenz', 255)
  assertDeliveryReferences(file, input, period.propertyId)
  const entity = fuelDeliverySchema.parse({
    ...input,
    id: newId(file, dependencies),
  })
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      fuelDeliveries: [...file.billingData.fuelDeliveries, entity],
    },
  })
}

function requireEntity<T extends { readonly id: string }>(
  entities: readonly T[],
  entityId: string,
  label: string,
): T {
  const entity = entities.find(({ id }) => id === entityId)
  if (!entity) {
    throw new HeatingCommandError(
      'invalid-reference',
      `${label} wurde nicht gefunden.`,
    )
  }
  return entity
}

export function updateHeatingSystem(
  currentFile: AppDataFile,
  heatingSystemId: string,
  input: AddHeatingSystemInput,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.masterData.heatingSystems, heatingSystemId, 'Heizsystem')
  const withoutCurrent = {
    ...file,
    masterData: {
      ...file.masterData,
      heatingSystems: file.masterData.heatingSystems.filter(
        ({ id }) => id !== heatingSystemId,
      ),
    },
  }
  const validated = addHeatingSystem(withoutCurrent, input, {
    createId: () => heatingSystemId,
  })
  const replacement = validated.masterData.heatingSystems.at(-1)!
  return validateResult({
    ...validated,
    masterData: {
      ...validated.masterData,
      heatingSystems: file.masterData.heatingSystems.map((entity) =>
        entity.id === heatingSystemId ? replacement : entity,
      ),
    },
  })
}

export function updateHeatingCircuit(
  currentFile: AppDataFile,
  heatingCircuitId: string,
  input: AddHeatingCircuitInput,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.billingData.heatingCircuits, heatingCircuitId, 'Heizkreis')
  const withoutCurrent = {
    ...file,
    billingData: {
      ...file.billingData,
      heatingCircuits: file.billingData.heatingCircuits.filter(
        ({ id }) => id !== heatingCircuitId,
      ),
    },
  }
  const validated = addHeatingCircuit(withoutCurrent, input, {
    createId: () => heatingCircuitId,
  })
  const replacement = validated.billingData.heatingCircuits.at(-1)!
  return validateResult({
    ...validated,
    billingData: {
      ...validated.billingData,
      heatingCircuits: file.billingData.heatingCircuits.map((entity) =>
        entity.id === heatingCircuitId ? replacement : entity,
      ),
    },
  })
}

export function updateEnergySource(
  currentFile: AppDataFile,
  energySourceId: string,
  input: AddEnergySourceInput,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.billingData.energySources, energySourceId, 'Energiequelle')
  const withoutCurrent = {
    ...file,
    billingData: {
      ...file.billingData,
      energySources: file.billingData.energySources.filter(
        ({ id }) => id !== energySourceId,
      ),
    },
  }
  const validated = addEnergySource(withoutCurrent, input, {
    createId: () => energySourceId,
  })
  const replacement = validated.billingData.energySources.at(-1)!
  return validateResult({
    ...validated,
    billingData: {
      ...validated.billingData,
      energySources: file.billingData.energySources.map((entity) =>
        entity.id === energySourceId ? replacement : entity,
      ),
    },
  })
}

export function updateFuelStock(
  currentFile: AppDataFile,
  fuelStockId: string,
  input: AddFuelStockInput,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.billingData.fuelStocks, fuelStockId, 'Brennstoffbestand')
  const withoutCurrent = {
    ...file,
    billingData: {
      ...file.billingData,
      fuelStocks: file.billingData.fuelStocks.filter(
        ({ id }) => id !== fuelStockId,
      ),
    },
  }
  const validated = addFuelStock(withoutCurrent, input, {
    createId: () => fuelStockId,
  })
  const replacement = validated.billingData.fuelStocks.at(-1)!
  return validateResult({
    ...validated,
    billingData: {
      ...validated.billingData,
      fuelStocks: file.billingData.fuelStocks.map((entity) =>
        entity.id === fuelStockId ? replacement : entity,
      ),
    },
  })
}

export function updateFuelDelivery(
  currentFile: AppDataFile,
  fuelDeliveryId: string,
  input: AddFuelDeliveryInput,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(
    file.billingData.fuelDeliveries,
    fuelDeliveryId,
    'Brennstofflieferung',
  )
  const withoutCurrent = {
    ...file,
    billingData: {
      ...file.billingData,
      fuelDeliveries: file.billingData.fuelDeliveries.filter(
        ({ id }) => id !== fuelDeliveryId,
      ),
    },
  }
  const validated = addFuelDelivery(withoutCurrent, input, {
    createId: () => fuelDeliveryId,
  })
  const replacement = validated.billingData.fuelDeliveries.at(-1)!
  return validateResult({
    ...validated,
    billingData: {
      ...validated.billingData,
      fuelDeliveries: file.billingData.fuelDeliveries.map((entity) =>
        entity.id === fuelDeliveryId ? replacement : entity,
      ),
    },
  })
}

export function deleteFuelDelivery(
  currentFile: AppDataFile,
  fuelDeliveryId: string,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(
    file.billingData.fuelDeliveries,
    fuelDeliveryId,
    'Brennstofflieferung',
  )
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      fuelDeliveries: file.billingData.fuelDeliveries.filter(
        ({ id }) => id !== fuelDeliveryId,
      ),
    },
  })
}

export function deleteFuelStock(
  currentFile: AppDataFile,
  fuelStockId: string,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.billingData.fuelStocks, fuelStockId, 'Brennstoffbestand')
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      fuelStocks: file.billingData.fuelStocks.filter(
        ({ id }) => id !== fuelStockId,
      ),
    },
  })
}

export function deleteEnergySource(
  currentFile: AppDataFile,
  energySourceId: string,
): AppDataFile {
  const file = parseFile(currentFile)
  const source = requireEntity(
    file.billingData.energySources,
    energySourceId,
    'Energiequelle',
  )
  if (
    file.billingData.fuelStocks.some(
      ({ energySourceId: reference }) => reference === energySourceId,
    ) ||
    file.billingData.fuelDeliveries.some(
      ({ energySourceId: reference }) => reference === energySourceId,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Die Energiequelle kann mit vorhandenen Brennstoffdaten nicht gelöscht werden.',
    )
  }
  const circuit = requireEntity(
    file.billingData.heatingCircuits,
    source.heatingCircuitId,
    'Heizkreis',
  )
  if (
    file.masterData.meters.some(
      ({ energySourceRef }) =>
        energySourceRef?.heatingCircuitBuildingId === circuit.buildingId &&
        energySourceRef.energySourceKey === source.key,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Die Energiequelle kann mit verknüpften Zählern nicht gelöscht werden.',
    )
  }
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      energySources: file.billingData.energySources.filter(
        ({ id }) => id !== energySourceId,
      ),
    },
  })
}

export function deleteHeatingCircuit(
  currentFile: AppDataFile,
  heatingCircuitId: string,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.billingData.heatingCircuits, heatingCircuitId, 'Heizkreis')
  if (
    file.billingData.energySources.some(
      ({ heatingCircuitId: reference }) => reference === heatingCircuitId,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Der Heizkreis kann mit vorhandener Energiequelle nicht gelöscht werden.',
    )
  }
  return validateResult({
    ...file,
    billingData: {
      ...file.billingData,
      heatingCircuits: file.billingData.heatingCircuits.filter(
        ({ id }) => id !== heatingCircuitId,
      ),
    },
  })
}

export function deleteHeatingSystem(
  currentFile: AppDataFile,
  heatingSystemId: string,
): AppDataFile {
  const file = parseFile(currentFile)
  requireEntity(file.masterData.heatingSystems, heatingSystemId, 'Heizsystem')
  if (
    file.billingData.heatingCircuits.some(
      ({ heatingSystemId: reference }) => reference === heatingSystemId,
    )
  ) {
    throw new HeatingCommandError(
      'invalid-reference',
      'Das Heizsystem kann mit vorhandenem Heizkreis nicht gelöscht werden.',
    )
  }
  return validateResult({
    ...file,
    masterData: {
      ...file.masterData,
      heatingSystems: file.masterData.heatingSystems.filter(
        ({ id }) => id !== heatingSystemId,
      ),
    },
  })
}
