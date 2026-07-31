import type { CalculationOutput } from '@nebenkosten/core'
import { describe, expect, it } from 'vitest'

import {
  AcceptanceInputError,
  compareAcceptance,
  type AcceptanceExpectation,
} from '../src'

function calculationOutput(): CalculationOutput {
  const operatingElectricity = {
    sourceBudgetCents: 0,
    intendedCents: 0,
    movedCents: 0,
    uncoveredCents: 0,
    sources: [],
  }
  return {
    snapshotFormatVersion: 3,
    periodDays: 365,
    totals: {
      recordedCostsCents: 120_000,
      tenantTotalCents: 80_000,
      landlordTotalCents: 40_000,
      unallocatedCents: 0,
      prepaymentsCents: 70_000,
      controlDifferenceCents: 0,
      directCostsCents: 0,
      internalCostsCents: 0,
    },
    heating: {
      totalCents: 60_000,
      baseCostsCents: 18_000,
      consumptionCostsCents: 42_000,
      fuelConsumptionCents: 61_000,
      unallocatedLandlordCents: 0,
      perCircuit: [],
      operatingElectricity,
      trace: {
        traceFormatVersion: 1,
        operatingElectricity,
        circuits: [],
      },
    },
    co2: {
      totalCostCents: 3_000,
      tenantCents: 1_800,
      landlordCents: 1_200,
    },
    vacancyLandlordCents: 8_000,
    tenants: [
      tenant('occupancy-sensitive-a', false, 45_000, 5_000),
      tenant('occupancy-sensitive-vacancy', true, 0, 8_000),
    ],
    warnings: [],
  }
}

function tenant(
  id: string,
  isVacancy: boolean,
  prepaymentCents: number,
  balanceCents: number,
): CalculationOutput['tenants'][number] {
  return {
    id,
    isVacancy,
    shareCents: prepaymentCents + balanceCents,
    prepaymentCents,
    balanceCents,
    status: 'gruen',
    costBreakdown: {
      operatingByCategory: [],
      heatingBaseCents: 0,
      heatingConsumptionCents: 0,
      hotWaterCents: 0,
      heatingCo2Cents: 0,
    },
  }
}

function expectation(): AcceptanceExpectation {
  return {
    reference: 'jahr-standard',
    totals: {
      recordedCostsCents: 120_000,
      heatingTotalCents: 60_000,
      co2TenantCents: 1_800,
      co2LandlordCents: 1_200,
      prepaymentsCents: 70_000,
      vacancyLandlordCents: 8_000,
      controlDifferenceCents: 0,
    },
    occupancies: [
      {
        reference: 'nutzung-01',
        calculationResultId: 'occupancy-sensitive-a',
        isVacancy: false,
        shareCents: 50_000,
        prepaymentCents: 45_000,
        balanceCents: 5_000,
      },
      {
        reference: 'leerstand-01',
        calculationResultId: 'occupancy-sensitive-vacancy',
        isVacancy: true,
        shareCents: 8_000,
        prepaymentCents: 0,
        balanceCents: 8_000,
      },
    ],
  }
}

describe('compareAcceptance', () => {
  it('bestätigt einen vollständig identischen Abnahmestand', () => {
    const report = compareAcceptance(expectation(), calculationOutput())

    expect(report.passed).toBe(true)
    expect(report.reference).toBe('jahr-standard')
    expect(report.comparisons).toHaveLength(13)
    expect(report.comparisons.every(({ passed }) => passed)).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('erlaubt beim Saldo genau einen Cent, aber nicht zwei Cent', () => {
    const withinTolerance = expectation()
    withinTolerance.occupancies[0]!.balanceCents -= 1
    const accepted = compareAcceptance(withinTolerance, calculationOutput())

    expect(
      accepted.comparisons.find(
        ({ metric, reference }) =>
          metric === 'balance_cents' && reference === 'nutzung-01',
      ),
    ).toMatchObject({
      differenceCents: 1,
      toleranceCents: 1,
      passed: true,
    })
    expect(accepted.passed).toBe(true)

    const outsideTolerance = expectation()
    outsideTolerance.occupancies[0]!.balanceCents -= 2
    const rejected = compareAcceptance(outsideTolerance, calculationOutput())

    expect(
      rejected.comparisons.find(
        ({ metric, reference }) =>
          metric === 'balance_cents' && reference === 'nutzung-01',
      ),
    ).toMatchObject({
      differenceCents: 2,
      toleranceCents: 1,
      passed: false,
    })
    expect(rejected.passed).toBe(false)
  })

  it('verlangt für alle übrigen Geldwerte exakte Gleichheit', () => {
    const expected = expectation()
    expected.totals.heatingTotalCents -= 1

    const report = compareAcceptance(expected, calculationOutput())

    expect(
      report.comparisons.find(({ metric }) => metric === 'heating_total_cents'),
    ).toMatchObject({
      differenceCents: 1,
      toleranceCents: 0,
      passed: false,
    })
    expect(report.passed).toBe(false)
  })

  it('meldet fehlende, zusätzliche und falsch klassifizierte Nutzungen ohne interne IDs', () => {
    const expected = expectation()
    expected.occupancies[0]!.isVacancy = true
    expected.occupancies.push({
      reference: 'nutzung-fehlt',
      calculationResultId: 'person-name-must-not-leak',
      isVacancy: false,
      shareCents: 0,
      prepaymentCents: 0,
      balanceCents: 0,
    })
    const actual = calculationOutput()
    actual.tenants.push(
      tenant('unexpected-person-name-must-not-leak', false, 0, 0),
    )

    const report = compareAcceptance(expected, actual)
    const serialized = JSON.stringify(report)

    expect(report.passed).toBe(false)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        { code: 'occupancy_kind_mismatch', reference: 'nutzung-01' },
        { code: 'missing_occupancy', reference: 'nutzung-fehlt' },
        { code: 'unexpected_occupancy', count: 1 },
      ]),
    )
    expect(serialized).not.toContain('person-name-must-not-leak')
    expect(serialized).not.toContain('occupancy-sensitive')
  })

  it('weist ungültige und mehrdeutige Erwartungen redigiert zurück', () => {
    const invalid = expectation()
    invalid.occupancies.push({ ...invalid.occupancies[0]! })

    expect(() => compareAcceptance(invalid, calculationOutput())).toThrow(
      AcceptanceInputError,
    )
    try {
      compareAcceptance(
        { ...expectation(), reference: '../privater-pfad' },
        calculationOutput(),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(AcceptanceInputError)
      expect((error as Error).message).toBe(
        'Der lokale Abnahmevergleich ist ungültig.',
      )
      expect(JSON.stringify(error)).not.toContain('privater-pfad')
    }
  })

  it('blockiert doppelte Engine-Zeilen ohne deren Kennung auszugeben', () => {
    const actual = calculationOutput()
    actual.tenants.push({ ...actual.tenants[0]! })

    const report = compareAcceptance(expectation(), actual)

    expect(report.passed).toBe(false)
    expect(report.issues).toContainEqual({
      code: 'duplicate_actual_occupancy',
      count: 1,
    })
    expect(JSON.stringify(report)).not.toContain('occupancy-sensitive')
  })

  it('mutiert weder Erwartung noch Berechnungsergebnis', () => {
    const expected = expectation()
    const actual = calculationOutput()
    const beforeExpected = structuredClone(expected)
    const beforeActual = structuredClone(actual)

    compareAcceptance(expected, actual)

    expect(expected).toEqual(beforeExpected)
    expect(actual).toEqual(beforeActual)
  })
})
