import type {
  BillingPeriod,
  OccupancyPeriod,
  Prepayment,
} from '@nebenkosten/schema'
import {
  calculateMonthlyOccupancyFactor,
  calculateOccupancyDays,
  calculatePeriodDays,
} from '../periods'
import { roundCentsHalfAwayFromZero } from '../rounding'

export function calculatePrepaymentCents(
  prepayment: Prepayment | undefined,
  occupancy: OccupancyPeriod,
  billingPeriod: BillingPeriod,
): number {
  if (!prepayment || prepayment.mode === 'none_agreed') return 0
  if (prepayment.occupancyPeriodId !== occupancy.id) {
    throw new Error(
      `Vorauszahlung "${prepayment.id}" gehört nicht zum Nutzungszeitraum "${occupancy.id}"`,
    )
  }

  if (prepayment.mode === 'monthly') {
    const factor = calculateMonthlyOccupancyFactor(
      billingPeriod.periodStart,
      billingPeriod.periodEnd,
      occupancy.from,
      occupancy.to,
    )
    return roundCentsHalfAwayFromZero(prepayment.monthlyAmountCents * factor)
  }

  const periodDays = calculatePeriodDays(
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
  )
  const occupiedDays = calculateOccupancyDays(
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
    occupancy.from,
    occupancy.to,
  )
  if (occupiedDays >= periodDays) return prepayment.annualAmountCents
  return roundCentsHalfAwayFromZero(
    prepayment.annualAmountCents * (occupiedDays / periodDays),
  )
}
