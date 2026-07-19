import type {
  BillingPeriod,
  OccupancyPeriod,
  Prepayment,
} from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'
import { calculatePrepaymentCents } from '../src/prepayments'

const billingPeriod: BillingPeriod = {
  id: 'billing-period-2025',
  propertyId: 'property-1',
  year: 2025,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  status: 'DRAFT',
}

function occupancy(from?: string, to?: string): OccupancyPeriod {
  return {
    id: 'occupancy-1',
    billingPeriodId: billingPeriod.id,
    unitId: 'unit-1',
    tenancyId: 'tenancy-1',
    kind: 'tenant',
    from,
    to,
  }
}

function prepayment(
  value:
    | { mode: 'monthly'; monthlyAmountCents: number }
    | { mode: 'annual'; annualAmountCents: number }
    | { mode: 'none_agreed' },
): Prepayment {
  return {
    id: 'prepayment-1',
    occupancyPeriodId: 'occupancy-1',
    ...value,
  }
}

describe('Vorauszahlungen', () => {
  it('summiert einen monatlichen Betrag für eine volle Periode', () => {
    expect(
      calculatePrepaymentCents(
        prepayment({ mode: 'monthly', monthlyAmountCents: 5_000 }),
        occupancy(),
        billingPeriod,
      ),
    ).toBe(60_000)
  })

  it('berechnet monatliche Vorauszahlungen für Teilmonate wie die Legacy-App', () => {
    expect(
      calculatePrepaymentCents(
        prepayment({ mode: 'monthly', monthlyAmountCents: 10_001 }),
        occupancy('2025-01-16', '2025-02-14'),
        billingPeriod,
      ),
    ).toBe(10_162)
  })

  it('rechnet eine Jahresvorauszahlung bei Teilbelegung taggenau herunter', () => {
    expect(
      calculatePrepaymentCents(
        prepayment({ mode: 'annual', annualAmountCents: 120_000 }),
        occupancy('2025-01-01', '2025-06-30'),
        billingPeriod,
      ),
    ).toBe(59_507)
  })

  it('belässt eine Jahresvorauszahlung bei voller Belegung unverändert', () => {
    expect(
      calculatePrepaymentCents(
        prepayment({ mode: 'annual', annualAmountCents: 120_001 }),
        occupancy(),
        billingPeriod,
      ),
    ).toBe(120_001)
  })

  it.each([undefined, prepayment({ mode: 'none_agreed' })])(
    'liefert ohne vereinbarte Vorauszahlung null Cent',
    (value) => {
      expect(calculatePrepaymentCents(value, occupancy(), billingPeriod)).toBe(
        0,
      )
    },
  )

  it('liefert bei einer außerhalb liegenden Belegung null Cent', () => {
    expect(
      calculatePrepaymentCents(
        prepayment({ mode: 'annual', annualAmountCents: 120_000 }),
        occupancy('2024-01-01', '2024-12-31'),
        billingPeriod,
      ),
    ).toBe(0)
  })

  it('verändert seine Eingaben nicht', () => {
    const payment = Object.freeze(
      prepayment({ mode: 'monthly', monthlyAmountCents: 5_000 }),
    )
    const occupied = Object.freeze(occupancy())
    const period = Object.freeze({ ...billingPeriod })

    calculatePrepaymentCents(payment, occupied, period)

    expect(payment).toEqual(
      prepayment({ mode: 'monthly', monthlyAmountCents: 5_000 }),
    )
    expect(occupied).toEqual(occupancy())
    expect(period).toEqual(billingPeriod)
  })
})
