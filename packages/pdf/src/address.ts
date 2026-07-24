import type {
  OwnerCompany,
  Person,
  Property,
  Tenancy,
} from '@nebenkosten/schema'
import {
  MissingShippingAddressError,
  type RecipientBlock,
  type SenderBlock,
} from './contracts'

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0
}

export function buildSenderBlock(
  ownerCompany: OwnerCompany,
  property: Property,
): SenderBlock {
  const address = property.address ?? ownerCompany.address ?? null
  const bankAccount = property.bankAccount ?? ownerCompany.bankAccount ?? null
  return {
    nameLines: [ownerCompany.name, ...ownerCompany.additionalNameLines],
    street: address?.street ?? null,
    postalCodeAndCity: address?.postalCodeAndCity ?? null,
    iban: bankAccount?.iban ?? null,
    bic: bankAccount?.bic ?? null,
  }
}

function personDisplayName(person: Person): string {
  if (!blank(person.displayName)) return person.displayName!.trim()
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => !blank(part),
  )
  return parts.length > 0 ? parts.join(' ') : 'Unbekannt'
}

const salutationLines: Readonly<Record<string, string>> = {
  Herr: 'Sehr geehrter Herr',
  Frau: 'Sehr geehrte Frau',
  Familie: 'Sehr geehrte Familie',
  Firma: 'Sehr geehrte Damen und Herren',
}

function buildSalutationLine(persons: readonly Person[]): string {
  const first = persons[0]
  if (!first?.salutation) return 'Sehr geehrte Damen und Herren'
  const prefix =
    salutationLines[first.salutation] ?? 'Sehr geehrte Damen und Herren'
  if (first.salutation === 'Familie' || first.salutation === 'Firma') {
    return `${prefix} ${personDisplayName(first)}`
  }
  return persons.length > 1
    ? `Sehr geehrte Damen und Herren`
    : `${prefix} ${personDisplayName(first)}`
}

export function buildRecipientBlock(
  tenancy: Tenancy,
  persons: readonly Person[],
): RecipientBlock {
  if (
    blank(tenancy.shippingAddressStreet) ||
    blank(tenancy.shippingAddressPostalCodeAndCity)
  ) {
    throw new MissingShippingAddressError(tenancy.id)
  }
  const nameLines =
    persons.length > 0
      ? [persons.map(personDisplayName).join(' und ')]
      : ['Unbekannt']
  return {
    salutationLine: buildSalutationLine(persons),
    nameLines,
    street: tenancy.shippingAddressStreet!.trim(),
    postalCodeAndCity: tenancy.shippingAddressPostalCodeAndCity!.trim(),
  }
}
