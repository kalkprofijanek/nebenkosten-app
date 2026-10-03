import { describe, expect, it } from 'vitest'
import { resolveShippingAddress } from '../src/shipping-address'

const property = {
  address: {
    street: 'Am Objekthof 1',
    postalCodeAndCity: '12345 Beispielstadt',
  },
}
const billingPeriod = { periodStart: '2026-01-01', periodEnd: '2026-12-31' }
const occupancy = {
  kind: 'tenant' as const,
  from: '2026-01-01',
  to: null,
  legacyUnmapped: [
    { path: ['strasse'], value: 'Am Nebenhof' },
    { path: ['hausnummer'], value: '8' },
  ],
}

describe('Versandanschrift', () => {
  it('verwendet eine ausdrücklich erfasste Anschrift zuerst', () => {
    expect(
      resolveShippingAddress({
        tenancy: {
          shippingAddressStreet: ' Neuer Ring 5 ',
          shippingAddressPostalCodeAndCity: '54321 Anderswo',
        },
        occupancy,
        property,
        billingPeriod,
      }),
    ).toEqual({
      street: 'Neuer Ring 5',
      postalCodeAndCity: '54321 Anderswo',
      source: 'tenancy',
    })
  })

  it('nimmt für Bewohner die Hausanschrift der Wohnung', () => {
    expect(
      resolveShippingAddress({
        tenancy: {},
        occupancy,
        property,
        billingPeriod,
      }),
    ).toEqual({
      street: 'Am Nebenhof 8',
      postalCodeAndCity: '12345 Beispielstadt',
      source: 'unit',
      movedOut: false,
    })
  })

  it('fällt ohne Hausanschrift auf die Objektanschrift zurück', () => {
    expect(
      resolveShippingAddress({
        tenancy: { shippingAddressStreet: '  ' },
        occupancy: { ...occupancy, to: '2026-12-31', legacyUnmapped: [] },
        property,
        billingPeriod,
      }),
    ).toEqual({
      street: 'Am Objekthof 1',
      postalCodeAndCity: '12345 Beispielstadt',
      source: 'property',
      movedOut: false,
    })
  })

  it('behält nach einem Auszug ohne neue Anschrift die bisherige', () => {
    expect(
      resolveShippingAddress({
        tenancy: {},
        occupancy: { ...occupancy, to: '2026-06-30' },
        property,
        billingPeriod,
      }),
    ).toEqual({
      street: 'Am Nebenhof 8',
      postalCodeAndCity: '12345 Beispielstadt',
      source: 'unit',
      movedOut: true,
    })
  })

  it('liefert für Leerstand oder ohne Ort keine Anschrift', () => {
    const base = { tenancy: {}, property, billingPeriod }
    expect(
      resolveShippingAddress({
        ...base,
        occupancy: { ...occupancy, kind: 'vacancy' },
      }),
    ).toBeNull()
    expect(
      resolveShippingAddress({
        ...base,
        occupancy,
        property: { address: { street: 'Am Objekthof 1' } },
      }),
    ).toBeNull()
  })
})
