import type {
  OwnerCompany,
  Person,
  Property,
  Tenancy,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { buildRecipientBlock, buildSenderBlock } from '../src/address'
import { MissingShippingAddressError } from '../src/contracts'

const ownerCompany: OwnerCompany = {
  id: 'owner-1',
  organizationId: 'org-1',
  name: 'Mustermann Immobilien GmbH',
  additionalNameLines: ['Verwaltung'],
  address: {
    street: 'Verwalterstraße',
    postalCodeAndCity: '00000 Musterstadt',
  },
  bankAccount: {
    iban: ['DE89', '370400440532013000'].join(''),
    bic: 'COBADEFFXXX',
  },
}

const property: Property = {
  id: 'property-1',
  ownerCompanyId: 'owner-1',
  address: { street: 'Objektweg', postalCodeAndCity: '11111 Beispielstadt' },
}

const tenancy: Tenancy = {
  id: 'tenancy-1',
  unitId: 'unit-1',
  personIds: ['p-1'],
  shippingAddressStreet: 'Musterweg',
  shippingAddressPostalCodeAndCity: '22222 Testort',
}

const person: Person = {
  id: 'p-1',
  organizationId: 'org-1',
  salutation: 'Frau',
  firstName: 'Anna',
  lastName: 'Müller',
}

describe('buildSenderBlock', () => {
  it('nutzt die Anschrift der Eigentümergesellschaft als Absender', () => {
    const sender = buildSenderBlock(ownerCompany, property)
    expect(sender.street).toBe('Verwalterstraße')
    expect(sender.nameLines).toEqual([
      'Mustermann Immobilien GmbH',
      'Verwaltung',
    ])
    expect(sender.iban).toBe(['DE89', '370400440532013000'].join(''))
  })

  it('fällt auf die Objektadresse zurück, wenn die Gesellschaft keine Anschrift hat', () => {
    const sender = buildSenderBlock(
      { ...ownerCompany, address: null },
      property,
    )
    expect(sender.street).toBe('Objektweg')
  })

  it('bevorzugt das Objektkonto und übernimmt Kontoinhaber und Ansprechpartner', () => {
    const sender = buildSenderBlock(
      {
        ...ownerCompany,
        contact: {
          firstName: 'Tina',
          lastName: 'Beispiel',
          email: ['info', 'example.org'].join('@'),
        },
      },
      {
        ...property,
        bankAccount: {
          iban: ['DE02', '120300000000202051'].join(''),
          accountHolder: 'Objektkonto',
        },
      },
    )
    expect(sender.iban).toBe(['DE02', '120300000000202051'].join(''))
    expect(sender.accountHolder).toBe('Objektkonto')
    expect(sender.contactLines).toEqual([
      'Ansprechpartner: Tina Beispiel',
      ['info', 'example.org'].join('@'),
    ])
  })
})

describe('buildRecipientBlock', () => {
  it('baut den Empfängerblock aus der Versandadresse und den Personen', () => {
    const recipient = buildRecipientBlock(tenancy, [person])
    expect(recipient.street).toBe('Musterweg')
    expect(recipient.postalCodeAndCity).toBe('22222 Testort')
    expect(recipient.salutationLine).toBe('Sehr geehrte Frau Anna Müller')
    expect(recipient.nameLines).toEqual(['Anna Müller'])
  })

  it('wirft MissingShippingAddressError ohne Versandadresse', () => {
    const withoutAddress: Tenancy = {
      ...tenancy,
      shippingAddressStreet: null,
    }
    expect(() => buildRecipientBlock(withoutAddress, [person])).toThrow(
      MissingShippingAddressError,
    )
  })

  it('verbindet mehrere Personen mit "und" und nutzt eine neutrale Anrede', () => {
    const secondPerson: Person = {
      ...person,
      id: 'p-2',
      firstName: 'Max',
      lastName: 'Müller',
    }
    const recipient = buildRecipientBlock(tenancy, [person, secondPerson])
    expect(recipient.nameLines).toEqual(['Anna Müller und Max Müller'])
    expect(recipient.salutationLine).toBe('Sehr geehrte Damen und Herren')
  })

  it('nutzt eine feste Anrede für Familie/Firma auch bei nur einer Person', () => {
    const family: Person = {
      ...person,
      salutation: 'Familie',
      displayName: 'Müller',
    }
    expect(buildRecipientBlock(tenancy, [family]).salutationLine).toBe(
      'Sehr geehrte Familie Müller',
    )
    const company: Person = {
      ...person,
      salutation: 'Firma',
      displayName: 'Beispiel GmbH',
    }
    expect(buildRecipientBlock(tenancy, [company]).salutationLine).toBe(
      'Sehr geehrte Damen und Herren Beispiel GmbH',
    )
  })

  it('fällt ohne Anrede auf eine neutrale Zeile zurück und markiert fehlende Personen als "Unbekannt"', () => {
    const withoutSalutation: Person = { ...person, salutation: undefined }
    expect(
      buildRecipientBlock(tenancy, [withoutSalutation]).salutationLine,
    ).toBe('Sehr geehrte Damen und Herren')
    expect(buildRecipientBlock(tenancy, []).nameLines).toEqual(['Unbekannt'])
  })
})
