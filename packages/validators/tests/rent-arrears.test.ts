import { describe, expect, it } from 'vitest'
import type { AppDataFile } from '@nebenkosten/schema'
import { validateBillingPeriod } from '../src/index'
import { validData } from './fixture'

/** 100 € Kaltmiete + 20 € Vorauszahlung = 1.440 € Soll im Jahr 2025. */
function withPayments(...amounts: number[]): AppDataFile {
  const data = validData()
  data.masterData.tenancies[0]!.monthlyRentCents = 10_000
  data.billingData.prepayments[0] = {
    id: 'prepayment-1',
    occupancyPeriodId: 'occupancy-1',
    mode: 'monthly',
    monthlyAmountCents: 2_000,
  }
  data.billingData.bankBookings = amounts.map((amountCents, index) => ({
    id: `booking-${index + 1}`,
    propertyId: 'property-1',
    date: '2025-06-01',
    amountCents,
    category: 'MIETEINGANG',
    tenancyId: 'tenancy-1',
  }))
  return data
}

function arrears(data: AppDataFile) {
  return validateBillingPeriod(data, 'period-1').issues.filter(
    ({ code }) => code === 'rent.arrears',
  )
}

describe('Hinweis auf Mietrückstand laut Mietkonto', () => {
  it('meldet einen Rückstand, die Abrechnung bleibt beim Soll', () => {
    const [issue] = arrears(withPayments(100_000))
    expect(issue).toMatchObject({
      severity: 'warning',
      area: 'prepayments',
      entity: { type: 'OccupancyPeriod', id: 'occupancy-1' },
    })
    expect(issue!.detail).toContain('440,00')
    expect(issue!.detail).toContain('vereinbarten Vorauszahlungen')
  })

  it('schweigt bei vollständiger Zahlung und ohne genutztes Mietkonto', () => {
    expect(arrears(withPayments(144_000))).toEqual([])
    expect(arrears(withPayments())).toEqual([])
    const dangling = withPayments(1)
    dangling.billingData.occupancyPeriods[0]!.tenancyId = 'fehlt'
    expect(arrears(dangling)).toEqual([])
  })
})
