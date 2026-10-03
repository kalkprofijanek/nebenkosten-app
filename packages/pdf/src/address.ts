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

/**
 * Absender ist die Eigentümergesellschaft: Ihre Anschrift steht im Absender,
 * die Objektanschrift nur ersatzweise. Die Bankverbindung bevorzugt das
 * Objektkonto, weil Nachzahlungen dorthin gehen.
 */
export function buildSenderBlock(
  ownerCompany: OwnerCompany,
  property: Property,
): SenderBlock {
  const address = ownerCompany.address ?? property.address ?? null
  const bankAccount = blank(property.bankAccount?.iban)
    ? (ownerCompany.bankAccount ?? null)
    : property.bankAccount!
  const contact = ownerCompany.contact
  const contactName = [contact?.firstName, contact?.lastName]
    .filter((part): part is string => !blank(part))
    .join(' ')
  return {
    nameLines: [ownerCompany.name, ...ownerCompany.additionalNameLines],
    street: address?.street ?? null,
    postalCodeAndCity: address?.postalCodeAndCity ?? null,
    iban: bankAccount?.iban ?? null,
    bic: blank(bankAccount?.bic) ? null : bankAccount!.bic!,
    accountHolder: blank(bankAccount?.accountHolder)
      ? null
      : bankAccount!.accountHolder!,
    bankName: blank(bankAccount?.bankName) ? null : bankAccount!.bankName!,
    contactLines: [
      contactName ? `Ansprechpartner: ${contactName}` : '',
      contact?.phone ? `Telefon: ${contact.phone}` : '',
      contact?.email ?? '',
    ].filter((line) => !blank(line)),
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

/**
 * `address` is the already resolved shipping address (see
 * `resolveShippingAddress`); without it only the tenancy fields are used.
 */
export function buildRecipientBlock(
  tenancy: Tenancy,
  persons: readonly Person[],
  address?: { street: string; postalCodeAndCity: string } | null,
): RecipientBlock {
  const resolved =
    address !== undefined
      ? address
      : blank(tenancy.shippingAddressStreet) ||
          blank(tenancy.shippingAddressPostalCodeAndCity)
        ? null
        : {
            street: tenancy.shippingAddressStreet!.trim(),
            postalCodeAndCity: tenancy.shippingAddressPostalCodeAndCity!.trim(),
          }
  if (!resolved) throw new MissingShippingAddressError(tenancy.id)
  const nameLines =
    persons.length > 0
      ? [persons.map(personDisplayName).join(' und ')]
      : ['Unbekannt']
  return {
    salutationLine: buildSalutationLine(persons),
    nameLines,
    street: resolved.street,
    postalCodeAndCity: resolved.postalCodeAndCity,
  }
}
