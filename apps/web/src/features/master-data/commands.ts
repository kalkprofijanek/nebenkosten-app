import type { AppDataFile } from '@nebenkosten/schema'
import {
  assertValidResult,
  assertValidSource,
  defaultCommandDependencies,
  optionalText,
  requiredText,
  reserveNewIds,
  type CommandDependencies,
} from './command-support'

export class MasterDataCommandError extends Error {
  override readonly name = 'MasterDataCommandError'
}

export interface CreateCompanyInput {
  readonly organizationName: string
  readonly ownerCompanyName: string
  readonly additionalNameLines?: readonly string[]
}

export interface CreatePropertyStructureInput {
  readonly ownerCompanyId: string
  readonly internalNumber?: string
  readonly street?: string
  readonly postalCodeAndCity?: string
  readonly buildingName: string
  readonly buildingShortName?: string
  readonly unitLabel: string
  readonly usableAreaSqm?: number
  readonly heatedAreaSqm?: number
}

export interface UpdateCompanyInput {
  readonly organizationName: string
  readonly ownerCompanyName: string
  readonly additionalNameLines?: readonly string[]
  readonly street?: string
  readonly postalCodeAndCity?: string
  readonly postBox?: string
  readonly contactSalutation?: 'Herr' | 'Frau' | 'Familie' | 'Firma'
  readonly contactFirstName?: string
  readonly contactLastName?: string
  readonly contactPhone?: string
  readonly contactMobile?: string
  readonly contactFax?: string
  readonly contactEmail?: string
  readonly iban?: string
  readonly bic?: string
  readonly accountHolder?: string
  readonly bankName?: string
}

export interface UpdatePropertyInput {
  readonly internalNumber?: string
  readonly externalNumber?: string
  readonly street?: string
  readonly postalCodeAndCity?: string
  readonly iban?: string
  readonly bic?: string
  readonly accountHolder?: string
  readonly bankName?: string
}

export interface AddBuildingInput {
  readonly propertyId: string
  readonly name: string
  readonly shortName?: string
}

export interface UpdateBuildingInput {
  readonly name: string
  readonly shortName?: string
  readonly defaultEnergySourceType?: string
  readonly mandateRefPrefixes?: readonly string[]
}

export interface AddUnitInput {
  readonly propertyId: string
  readonly buildingId?: string
  readonly label: string
  readonly location?: string
  readonly usableAreaSqm?: number
  readonly heatedAreaSqm?: number
  readonly roomCount?: number
}

export interface UpdateUnitInput {
  readonly buildingId?: string | null
  readonly label: string
  readonly location?: string
  readonly usableAreaSqm?: number
  readonly heatedAreaSqm?: number
  readonly roomCount?: number
}

function normalizeRequired(value: unknown, label: string): string {
  try {
    return requiredText(value, label)
  } catch (error) {
    throw new MasterDataCommandError(
      error instanceof Error ? error.message : `${label} ist ungültig.`,
    )
  }
}

function normalizeOptional(value: unknown, label: string): string | undefined {
  try {
    return optionalText(value, label)
  } catch (error) {
    throw new MasterDataCommandError(
      error instanceof Error ? error.message : `${label} ist ungültig.`,
    )
  }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

function normalizedNameLines(value: unknown): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new MasterDataCommandError(
      'Zusätzliche Namenszeilen müssen als Liste angegeben werden.',
    )
  }
  const normalized = value.flatMap((line) => {
    const text = normalizeOptional(line, 'Zusätzliche Namenszeile')
    return text === undefined ? [] : [text]
  })
  if (normalized.length > 3) {
    throw new MasterDataCommandError(
      'Es sind höchstens drei zusätzliche Namenszeilen erlaubt.',
    )
  }
  return normalized
}

function normalizeOptionalArea(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MasterDataCommandError(`${label} muss größer als 0 sein.`)
  }
  return value
}

export function createCompany(
  data: AppDataFile,
  input: CreateCompanyInput,
  dependencies: CommandDependencies = defaultCommandDependencies(),
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  const organizationName = normalizeRequired(
    input.organizationName,
    'Mandantenname',
  )
  const ownerCompanyName = normalizeRequired(
    input.ownerCompanyName,
    'Firmenname',
  )
  const additionalNameLines = normalizedNameLines(input.additionalNameLines)
  const [organizationId, ownerCompanyId] = reserveNewIds(
    data,
    2,
    dependencies.createId,
    MasterDataCommandError,
  )

  const result: AppDataFile = {
    ...data,
    masterData: {
      ...data.masterData,
      organizations: [
        ...data.masterData.organizations,
        { id: organizationId!, name: organizationName },
      ],
      ownerCompanies: [
        ...data.masterData.ownerCompanies,
        {
          id: ownerCompanyId!,
          organizationId: organizationId!,
          name: ownerCompanyName,
          additionalNameLines: [...additionalNameLines],
        },
      ],
    },
  }
  return assertValidResult(result, MasterDataCommandError)
}

export function createPropertyStructure(
  data: AppDataFile,
  input: CreatePropertyStructureInput,
  dependencies: CommandDependencies = defaultCommandDependencies(),
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  const ownerCompanyId = normalizeRequired(
    input.ownerCompanyId,
    'Eigentümergesellschaft',
  )
  if (
    !data.masterData.ownerCompanies.some(
      (company) => company.id === ownerCompanyId,
    )
  ) {
    throw new MasterDataCommandError(
      'Die ausgewählte Eigentümergesellschaft ist nicht vorhanden.',
    )
  }

  const buildingName = normalizeRequired(input.buildingName, 'Gebäudename')
  const unitLabel = normalizeRequired(input.unitLabel, 'Einheitenbezeichnung')
  const internalNumber = normalizeOptional(
    input.internalNumber,
    'Interne Objektnummer',
  )
  const street = normalizeOptional(input.street, 'Straße')
  const postalCodeAndCity = normalizeOptional(
    input.postalCodeAndCity,
    'Postleitzahl und Ort',
  )
  const buildingShortName = normalizeOptional(
    input.buildingShortName,
    'Gebäudekürzel',
  )
  const usableAreaSqm = normalizeOptionalArea(input.usableAreaSqm, 'Nutzfläche')
  const heatedAreaSqm = normalizeOptionalArea(
    input.heatedAreaSqm,
    'Beheizte Fläche',
  )
  const [propertyId, buildingId, unitId] = reserveNewIds(
    data,
    3,
    dependencies.createId,
    MasterDataCommandError,
  )
  const address =
    street === undefined && postalCodeAndCity === undefined
      ? undefined
      : withoutUndefined({ street, postalCodeAndCity })

  const result: AppDataFile = {
    ...data,
    masterData: {
      ...data.masterData,
      properties: [
        ...data.masterData.properties,
        {
          id: propertyId!,
          ownerCompanyId,
          ...(internalNumber === undefined ? {} : { internalNumber }),
          ...(address === undefined ? {} : { address }),
        },
      ],
      buildings: [
        ...data.masterData.buildings,
        {
          id: buildingId!,
          propertyId: propertyId!,
          name: buildingName,
          ...(buildingShortName === undefined
            ? {}
            : { shortName: buildingShortName }),
          mandateRefPrefixes: [],
        },
      ],
      units: [
        ...data.masterData.units,
        {
          id: unitId!,
          propertyId: propertyId!,
          buildingId: buildingId!,
          label: unitLabel,
          ...(usableAreaSqm === undefined
            ? {}
            : { usableAreaSqm: { value: usableAreaSqm, unit: 'm2' as const } }),
          ...(heatedAreaSqm === undefined
            ? {}
            : {
                heatedAreaSqm: {
                  value: heatedAreaSqm,
                  unit: 'm2' as const,
                },
              }),
        },
      ],
    },
  }
  return assertValidResult(result, MasterDataCommandError)
}

export function updateCompany(
  data: AppDataFile,
  ownerCompanyId: string,
  input: UpdateCompanyInput,
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  const company = data.masterData.ownerCompanies.find(
    ({ id }) => id === ownerCompanyId,
  )
  if (company === undefined) {
    throw new MasterDataCommandError(
      'Die ausgewählte Firma ist nicht vorhanden.',
    )
  }
  if (
    !data.masterData.organizations.some(
      ({ id }) => id === company.organizationId,
    )
  ) {
    throw new MasterDataCommandError(
      'Der zugehörige Mandant ist nicht vorhanden.',
    )
  }

  const organizationName = normalizeRequired(
    input.organizationName,
    'Mandantenname',
  )
  const ownerCompanyName = normalizeRequired(
    input.ownerCompanyName,
    'Firmenname',
  )
  const additionalNameLines = normalizedNameLines(input.additionalNameLines)
  const street = normalizeOptional(input.street, 'Straße')
  const postalCodeAndCity = normalizeOptional(
    input.postalCodeAndCity,
    'Postleitzahl und Ort',
  )
  const iban = normalizeOptional(input.iban, 'IBAN')
  const bic = normalizeOptional(input.bic, 'BIC')
  const accountHolder = normalizeOptional(input.accountHolder, 'Kontoinhaber')
  const bankName = normalizeOptional(input.bankName, 'Bankname')
  const postBox = normalizeOptional(input.postBox, 'Postfach')
  const contactSalutation = input.contactSalutation
  const contactFirstName = normalizeOptional(input.contactFirstName, 'Vorname')
  const contactLastName = normalizeOptional(input.contactLastName, 'Nachname')
  const contactPhone = normalizeOptional(input.contactPhone, 'Telefon')
  const contactMobile = normalizeOptional(input.contactMobile, 'Mobiltelefon')
  const contactFax = normalizeOptional(input.contactFax, 'Fax')
  const contactEmail = normalizeOptional(input.contactEmail, 'E-Mail')
  const address =
    street === undefined && postalCodeAndCity === undefined
      ? undefined
      : { street, postalCodeAndCity }
  const bankAccount =
    iban === undefined &&
    bic === undefined &&
    accountHolder === undefined &&
    bankName === undefined
      ? undefined
      : withoutUndefined({ iban, bic, accountHolder, bankName })
  const contact =
    contactSalutation === undefined &&
    contactFirstName === undefined &&
    contactLastName === undefined &&
    contactPhone === undefined &&
    contactMobile === undefined &&
    contactFax === undefined &&
    contactEmail === undefined
      ? undefined
      : withoutUndefined({
          salutation: contactSalutation,
          firstName: contactFirstName,
          lastName: contactLastName,
          phone: contactPhone,
          mobile: contactMobile,
          fax: contactFax,
          email: contactEmail,
        })

  const result: AppDataFile = {
    ...data,
    masterData: {
      ...data.masterData,
      organizations: data.masterData.organizations.map((organization) =>
        organization.id === company.organizationId
          ? { ...organization, name: organizationName }
          : organization,
      ),
      ownerCompanies: data.masterData.ownerCompanies.map((item) =>
        item.id === ownerCompanyId
          ? withoutUndefined({
              ...item,
              name: ownerCompanyName,
              additionalNameLines: [...additionalNameLines],
              address,
              postBox,
              contact,
              bankAccount,
            })
          : item,
      ),
    },
  }
  return assertValidResult(result, MasterDataCommandError)
}

export function deleteCompany(
  data: AppDataFile,
  ownerCompanyId: string,
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  const company = data.masterData.ownerCompanies.find(
    ({ id }) => id === ownerCompanyId,
  )
  if (company === undefined) {
    throw new MasterDataCommandError(
      'Die ausgewählte Firma ist nicht vorhanden.',
    )
  }
  if (
    data.masterData.properties.some(
      ({ ownerCompanyId: reference }) => reference === ownerCompanyId,
    )
  ) {
    throw new MasterDataCommandError(
      'Die Firma kann nicht gelöscht werden, solange ihr Objekte zugeordnet sind.',
    )
  }
  const organizationStillUsed = data.masterData.ownerCompanies.some(
    ({ id, organizationId }) =>
      id !== ownerCompanyId && organizationId === company.organizationId,
  )
  const result: AppDataFile = {
    ...data,
    masterData: {
      ...data.masterData,
      ownerCompanies: data.masterData.ownerCompanies.filter(
        ({ id }) => id !== ownerCompanyId,
      ),
      organizations: organizationStillUsed
        ? data.masterData.organizations
        : data.masterData.organizations.filter(
            ({ id }) => id !== company.organizationId,
          ),
    },
  }
  return assertValidResult(result, MasterDataCommandError)
}

function normalizeOptionalRoomCount(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new MasterDataCommandError(
      'Die Raumanzahl muss eine nichtnegative Zahl sein.',
    )
  }
  return value
}

export function updateProperty(
  data: AppDataFile,
  propertyId: string,
  input: UpdatePropertyInput,
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  if (!data.masterData.properties.some(({ id }) => id === propertyId)) {
    throw new MasterDataCommandError(
      'Das ausgewählte Objekt ist nicht vorhanden.',
    )
  }
  const internalNumber = normalizeOptional(
    input.internalNumber,
    'Interne Objektnummer',
  )
  const externalNumber = normalizeOptional(
    input.externalNumber,
    'Externe Objektnummer',
  )
  const street = normalizeOptional(input.street, 'Straße')
  const postalCodeAndCity = normalizeOptional(
    input.postalCodeAndCity,
    'Postleitzahl und Ort',
  )
  const address =
    street === undefined && postalCodeAndCity === undefined
      ? undefined
      : withoutUndefined({ street, postalCodeAndCity })
  const iban = normalizeOptional(input.iban, 'IBAN')
  const bic = normalizeOptional(input.bic, 'BIC')
  const accountHolder = normalizeOptional(input.accountHolder, 'Kontoinhaber')
  const bankName = normalizeOptional(input.bankName, 'Bankname')
  const bankAccount =
    iban === undefined &&
    bic === undefined &&
    accountHolder === undefined &&
    bankName === undefined
      ? undefined
      : withoutUndefined({ iban, bic, accountHolder, bankName })
  const result: AppDataFile = {
    ...data,
    masterData: {
      ...data.masterData,
      properties: data.masterData.properties.map((property) =>
        property.id === propertyId
          ? withoutUndefined({
              ...property,
              internalNumber,
              externalNumber,
              address,
              bankAccount,
            })
          : property,
      ),
    },
  }
  return assertValidResult(result, MasterDataCommandError)
}

export function addBuilding(
  data: AppDataFile,
  input: AddBuildingInput,
  dependencies: CommandDependencies = defaultCommandDependencies(),
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  if (!data.masterData.properties.some(({ id }) => id === input.propertyId)) {
    throw new MasterDataCommandError(
      'Das ausgewählte Objekt ist nicht vorhanden.',
    )
  }
  const name = normalizeRequired(input.name, 'Gebäudename')
  const shortName = normalizeOptional(input.shortName, 'Gebäudekürzel')
  const [id] = reserveNewIds(
    data,
    1,
    dependencies.createId,
    MasterDataCommandError,
  )
  return assertValidResult(
    {
      ...data,
      masterData: {
        ...data.masterData,
        buildings: [
          ...data.masterData.buildings,
          {
            id: id!,
            propertyId: input.propertyId,
            name,
            shortName,
            mandateRefPrefixes: [],
          },
        ],
      },
    },
    MasterDataCommandError,
  )
}

export function updateBuilding(
  data: AppDataFile,
  buildingId: string,
  input: UpdateBuildingInput,
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  if (!data.masterData.buildings.some(({ id }) => id === buildingId)) {
    throw new MasterDataCommandError(
      'Das ausgewählte Gebäude ist nicht vorhanden.',
    )
  }
  const name = normalizeRequired(input.name, 'Gebäudename')
  const shortName = normalizeOptional(input.shortName, 'Gebäudekürzel')
  const defaultEnergySourceType = normalizeOptional(
    input.defaultEnergySourceType,
    'Standardenergieträger',
  )
  const mandateRefPrefixes = (input.mandateRefPrefixes ?? []).map((prefix) =>
    normalizeRequired(prefix, 'Mandatsreferenz-Präfix'),
  )
  return assertValidResult(
    {
      ...data,
      masterData: {
        ...data.masterData,
        buildings: data.masterData.buildings.map((building) =>
          building.id === buildingId
            ? {
                ...building,
                name,
                shortName,
                defaultEnergySourceType,
                mandateRefPrefixes,
              }
            : building,
        ),
      },
    },
    MasterDataCommandError,
  )
}

function unitFields(input: AddUnitInput | UpdateUnitInput) {
  return {
    label: normalizeRequired(input.label, 'Einheitenbezeichnung'),
    location: normalizeOptional(input.location, 'Lage'),
    usableAreaSqm: normalizeOptionalArea(input.usableAreaSqm, 'Nutzfläche'),
    heatedAreaSqm: normalizeOptionalArea(
      input.heatedAreaSqm,
      'Beheizte Fläche',
    ),
    roomCount: normalizeOptionalRoomCount(input.roomCount),
  }
}

function area(value: number | undefined) {
  return value === undefined ? undefined : { value, unit: 'm2' as const }
}

export function addUnit(
  data: AppDataFile,
  input: AddUnitInput,
  dependencies: CommandDependencies = defaultCommandDependencies(),
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  if (!data.masterData.properties.some(({ id }) => id === input.propertyId)) {
    throw new MasterDataCommandError(
      'Das ausgewählte Objekt ist nicht vorhanden.',
    )
  }
  if (
    input.buildingId !== undefined &&
    !data.masterData.buildings.some(
      ({ id, propertyId }) =>
        id === input.buildingId && propertyId === input.propertyId,
    )
  ) {
    throw new MasterDataCommandError(
      'Das ausgewählte Gebäude gehört nicht zu diesem Objekt.',
    )
  }
  const fields = unitFields(input)
  const [id] = reserveNewIds(
    data,
    1,
    dependencies.createId,
    MasterDataCommandError,
  )
  return assertValidResult(
    {
      ...data,
      masterData: {
        ...data.masterData,
        units: [
          ...data.masterData.units,
          {
            id: id!,
            propertyId: input.propertyId,
            buildingId: input.buildingId,
            label: fields.label,
            location: fields.location,
            usableAreaSqm: area(fields.usableAreaSqm),
            heatedAreaSqm: area(fields.heatedAreaSqm),
            roomCount: fields.roomCount,
          },
        ],
      },
    },
    MasterDataCommandError,
  )
}

export function updateUnit(
  data: AppDataFile,
  unitId: string,
  input: UpdateUnitInput,
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  const unit = data.masterData.units.find(({ id }) => id === unitId)
  if (unit === undefined) {
    throw new MasterDataCommandError(
      'Die ausgewählte Einheit ist nicht vorhanden.',
    )
  }
  if (
    input.buildingId !== undefined &&
    input.buildingId !== null &&
    !data.masterData.buildings.some(
      ({ id, propertyId }) =>
        id === input.buildingId && propertyId === unit.propertyId,
    )
  ) {
    throw new MasterDataCommandError(
      'Das ausgewählte Gebäude gehört nicht zu diesem Objekt.',
    )
  }
  const fields = unitFields(input)
  return assertValidResult(
    {
      ...data,
      masterData: {
        ...data.masterData,
        units: data.masterData.units.map((item) =>
          item.id === unitId
            ? {
                ...item,
                buildingId:
                  input.buildingId === undefined
                    ? item.buildingId
                    : input.buildingId,
                label: fields.label,
                location: fields.location,
                usableAreaSqm: area(fields.usableAreaSqm),
                heatedAreaSqm: area(fields.heatedAreaSqm),
                roomCount: fields.roomCount,
              }
            : item,
        ),
      },
    },
    MasterDataCommandError,
  )
}

export function deleteProperty(
  data: AppDataFile,
  propertyId: string,
): AppDataFile {
  assertValidSource(data, MasterDataCommandError)
  if (!data.masterData.properties.some(({ id }) => id === propertyId)) {
    throw new MasterDataCommandError(
      'Das ausgewählte Objekt ist nicht vorhanden.',
    )
  }
  if (
    data.billingData.billingPeriods.some(
      ({ propertyId: reference }) => reference === propertyId,
    )
  ) {
    throw new MasterDataCommandError(
      'Das Objekt kann nicht gelöscht werden, solange Abrechnungsjahre vorhanden sind.',
    )
  }
  const unitIds = new Set(
    data.masterData.units
      .filter(({ propertyId: reference }) => reference === propertyId)
      .map(({ id }) => id),
  )
  if (
    data.masterData.heatingSystems.some(
      ({ propertyId: reference }) => reference === propertyId,
    ) ||
    data.masterData.meters.some(
      ({ propertyId: reference }) => reference === propertyId,
    ) ||
    data.masterData.tenancies.some(({ unitId }) => unitIds.has(unitId))
  ) {
    throw new MasterDataCommandError(
      'Das Objekt kann nicht gelöscht werden, solange abhängige Stammdaten vorhanden sind.',
    )
  }
  return assertValidResult(
    {
      ...data,
      masterData: {
        ...data.masterData,
        properties: data.masterData.properties.filter(
          ({ id }) => id !== propertyId,
        ),
        buildings: data.masterData.buildings.filter(
          ({ propertyId: reference }) => reference !== propertyId,
        ),
        units: data.masterData.units.filter(
          ({ propertyId: reference }) => reference !== propertyId,
        ),
      },
    },
    MasterDataCommandError,
  )
}
