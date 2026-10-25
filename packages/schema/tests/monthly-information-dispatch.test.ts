import { describe, expect, it } from 'vitest'

import {
  appDataFileSchema,
  createEmptyAppDataFile,
  monthlyInformationDeliverySchema,
  monthlyInformationDispatchSchema,
} from '../src'

const ID = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('Versandweg der Monatsinformation (ADR-0014, Schritt 3)', () => {
  it('verlangt für E-Mail das Datum der Zustimmung', () => {
    expect(
      monthlyInformationDeliverySchema.safeParse({ channel: 'letter' }).success,
    ).toBe(true)
    expect(
      monthlyInformationDeliverySchema.safeParse({ channel: 'email' }).success,
    ).toBe(false)
    expect(
      monthlyInformationDeliverySchema.safeParse({
        channel: 'email',
        emailConsentDate: '2026-10-01',
      }).success,
    ).toBe(true)
  })
})

describe('Versandprotokoll der Monatsinformation', () => {
  const dispatch = {
    id: ID(1),
    propertyId: ID(2),
    month: '2026-10',
    dispatchedOn: '2026-11-05',
    entries: [
      { tenancyId: ID(3), channel: 'email', status: 'sent' },
      {
        tenancyId: ID(4),
        channel: 'letter',
        status: 'not_sent',
        note: 'Wohnung leer, Mieter verzogen',
      },
    ],
  }

  it('nimmt Monat, Versanddatum und Einträge je Mietverhältnis auf', () => {
    expect(monthlyInformationDispatchSchema.safeParse(dispatch).success).toBe(
      true,
    )
    expect(
      monthlyInformationDispatchSchema.safeParse({
        ...dispatch,
        month: '2026-13',
      }).success,
    ).toBe(false)
    expect(
      monthlyInformationDispatchSchema.safeParse({
        ...dispatch,
        entries: [{ tenancyId: ID(3), channel: 'fax', status: 'sent' }],
      }).success,
    ).toBe(false)
  })

  it('ist in der Datei optional (additiv)', () => {
    const empty = createEmptyAppDataFile()
    expect(appDataFileSchema.safeParse(empty).success).toBe(true)
    expect(
      appDataFileSchema.safeParse({
        ...empty,
        billingData: {
          ...empty.billingData,
          monthlyInformationDispatches: [dispatch],
        },
      }).success,
    ).toBe(true)
  })
})
