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
  readonly iban?: string
  readonly bic?: string
  readonly accountHolder?: string
  readonly bankName?: string
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
      : { street, postalCodeAndCity }

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
      : { iban, bic, accountHolder, bankName }

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
          ? {
              ...item,
              name: ownerCompanyName,
              additionalNameLines: [...additionalNameLines],
              address,
              bankAccount,
            }
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
