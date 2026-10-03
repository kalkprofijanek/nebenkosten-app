import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { migrateV3ToCurrent } from '@nebenkosten/schema'
import { describe, expect, it } from 'vitest'

import { createFictionalV3File } from '../../schema/tests/fixtures'
import { compareAcceptance, type AcceptanceExpectation } from '../src'

describe('PR-12-Abnahmevergleich nach v3-Migration', () => {
  it('vergleicht das migrierte Engine-Ergebnis gegen feste Cent-Erwartungen', () => {
    const migration = migrateV3ToCurrent(createFictionalV3File(), {
      sourceSha256: 'a'.repeat(64),
      sourceFileName: 'fiktive-abnahme.json',
      now: () => new Date('2026-01-15T10:00:00.000Z'),
    })
    expect(migration.ok).toBe(true)
    if (!migration.ok) throw new Error('Fiktive Migration erwartet')
    const period = migration.data.billingData.billingPeriods[0]!
    const actual = calculateBilling(
      createCalculationInput(migration.data, period.id),
    )
    const expectation: AcceptanceExpectation = {
      reference: 'v3-migration-fiktiv',
      totals: {
        recordedCostsCents: 430050,
        heatingTotalCents: 229304,
        co2TenantCents: 1795,
        co2LandlordCents: 34115,
        prepaymentsCents: 216000,
        // CO2-Mieteranteil seit der Vermieterentscheidung nach Heizkreis-
        // Schlüssel (30 % Fläche / 70 % Verbrauch): 2,28 € Flächenanteil
        // entfallen auf den Leerstand statt auf den Mieter.
        vacancyLandlordCents: 64496,
        controlDifferenceCents: 44836,
      },
      occupancies: [
        {
          reference: 'nutzung-1',
          calculationResultId: '656f1493-dda7-8442-8500-dbba1fd32ee4',
          isVacancy: false,
          shareCents: 286604,
          prepaymentCents: 216000,
          balanceCents: 70604,
        },
        {
          reference: 'leerstand-1',
          calculationResultId: '3f2f6736-b37d-8535-b6cf-6690c64dfbc5',
          isVacancy: true,
          shareCents: 59332,
          prepaymentCents: 0,
          balanceCents: 59332,
        },
      ],
    }

    const report = compareAcceptance(expectation, actual)

    expect(report.passed, JSON.stringify(report, null, 2)).toBe(true)
  })
})
