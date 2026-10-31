import { describe, expect, it } from 'vitest'
import type { Prepayment } from '@nebenkosten/schema'
import { buildTenantStatement } from '../src'
import { prepaymentBreakdown } from '../src/prepayment-breakdown'
import {
  buildFixtureAppData,
  buildFixtureTenantStatementContext,
} from './fixture'

function contextWith(
  prepayment: (occupancyPeriodId: string) => Prepayment,
  occupancy: { from?: string; to?: string | null } = {},
) {
  const appData = buildFixtureAppData()
  const base = buildFixtureTenantStatementContext(appData)
  const occupancyPeriod = { ...base.occupancyPeriod, ...occupancy }
  appData.billingData.occupancyPeriods =
    appData.billingData.occupancyPeriods.map((candidate) =>
      candidate.id === occupancyPeriod.id ? occupancyPeriod : candidate,
    )
  appData.billingData.prepayments = [prepayment(occupancyPeriod.id)]
  return { ...base, appData, occupancyPeriod }
}

describe('prepaymentBreakdown', () => {
  it('zeigt Monate × Monatsbetrag bei ganzjähriger Nutzung', () => {
    const context = contextWith((occupancyPeriodId) => ({
      id: 'pp-1',
      occupancyPeriodId,
      mode: 'monthly',
      monthlyAmountCents: 28_000,
    }))
    expect(prepaymentBreakdown(context, 336_000)).toBe(
      '12 × 280,00 € = 3.360,00 €',
    )
  })

  it('zeigt die Monate der Nutzung bei Auszug im Jahr', () => {
    const context = contextWith(
      (occupancyPeriodId) => ({
        id: 'pp-1',
        occupancyPeriodId,
        mode: 'monthly',
        monthlyAmountCents: 28_000,
      }),
      { to: `${contextYear()}-09-30` },
    )
    expect(prepaymentBreakdown(context, 252_000)).toBe(
      '9 × 280,00 € = 2.520,00 €',
    )
  })

  it('zeigt einen Jahresbetrag anteilig nach Tagen', () => {
    const context = contextWith(
      (occupancyPeriodId) => ({
        id: 'pp-1',
        occupancyPeriodId,
        mode: 'annual',
        annualAmountCents: 365_000,
      }),
      { to: `${contextYear()}-01-10` },
    )
    // Das Fixture-Jahr kann ein Schaltjahr sein (366 Tage).
    expect(prepaymentBreakdown(context, 10_000)).toMatch(
      /^3\.650,00 € × 10\/36[56] Tage = 100,00 €$/,
    )
  })

  it('entfällt ohne vereinbarte Vorauszahlung', () => {
    const context = contextWith((occupancyPeriodId) => ({
      id: 'pp-1',
      occupancyPeriodId,
      mode: 'none_agreed',
    }))
    expect(prepaymentBreakdown(context, 0)).toBeUndefined()
  })

  it('steht in der Zusammenfassung der Einzelabrechnung', () => {
    const context = contextWith((occupancyPeriodId) => ({
      id: 'pp-1',
      occupancyPeriodId,
      mode: 'monthly',
      monthlyAmountCents: 28_000,
    }))
    const doc = buildTenantStatement(context)
    expect(JSON.stringify(doc.content)).toContain('12 × 280,00 €')
  })
})

function contextYear(): number {
  return buildFixtureAppData().billingData.billingPeriods[0]!.year
}
