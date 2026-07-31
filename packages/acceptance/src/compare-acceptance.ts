import type { CalculationOutput } from '@nebenkosten/core'
import { z } from 'zod'

const referenceSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)

const centsSchema = z.number().int().safe()

const acceptanceOccupancySchema = z.strictObject({
  reference: referenceSchema,
  calculationResultId: z.string().min(1).max(256),
  isVacancy: z.boolean(),
  shareCents: centsSchema,
  prepaymentCents: centsSchema,
  balanceCents: centsSchema,
})

export const acceptanceExpectationSchema = z
  .strictObject({
    reference: referenceSchema,
    totals: z.strictObject({
      recordedCostsCents: centsSchema,
      heatingTotalCents: centsSchema,
      co2TenantCents: centsSchema,
      co2LandlordCents: centsSchema,
      prepaymentsCents: centsSchema,
      vacancyLandlordCents: centsSchema,
      controlDifferenceCents: centsSchema,
    }),
    occupancies: z.array(acceptanceOccupancySchema).max(1_000),
  })
  .superRefine(({ occupancies }, context) => {
    const references = new Set<string>()
    const calculationResultIds = new Set<string>()
    for (const [index, occupancy] of occupancies.entries()) {
      if (references.has(occupancy.reference)) {
        context.addIssue({
          code: 'custom',
          message: 'duplicate_reference',
          path: ['occupancies', index, 'reference'],
        })
      }
      if (calculationResultIds.has(occupancy.calculationResultId)) {
        context.addIssue({
          code: 'custom',
          message: 'duplicate_calculation_result_id',
          path: ['occupancies', index, 'calculationResultId'],
        })
      }
      references.add(occupancy.reference)
      calculationResultIds.add(occupancy.calculationResultId)
    }
  })

export type AcceptanceExpectation = z.infer<typeof acceptanceExpectationSchema>

export type AcceptanceMetric =
  | 'recorded_costs_cents'
  | 'heating_total_cents'
  | 'co2_tenant_cents'
  | 'co2_landlord_cents'
  | 'prepayments_cents'
  | 'vacancy_landlord_cents'
  | 'control_difference_cents'
  | 'share_cents'
  | 'prepayment_cents'
  | 'balance_cents'

export interface AcceptanceComparison {
  readonly metric: AcceptanceMetric
  readonly reference: string
  readonly expectedCents: number
  readonly actualCents: number
  readonly differenceCents: number
  readonly toleranceCents: number
  readonly passed: boolean
}

export type AcceptanceIssue =
  | {
      readonly code: 'missing_occupancy' | 'occupancy_kind_mismatch'
      readonly reference: string
    }
  | {
      readonly code: 'unexpected_occupancy' | 'duplicate_actual_occupancy'
      readonly count: number
    }

export interface AcceptanceReport {
  readonly reference: string
  readonly passed: boolean
  readonly comparisons: readonly AcceptanceComparison[]
  readonly issues: readonly AcceptanceIssue[]
}

export class AcceptanceInputError extends Error {
  constructor() {
    super('Der lokale Abnahmevergleich ist ungültig.')
    this.name = 'AcceptanceInputError'
  }
}

function comparison(
  metric: AcceptanceMetric,
  reference: string,
  expectedCents: number,
  actualCents: number,
  toleranceCents: number,
): AcceptanceComparison {
  const differenceCents = Math.abs(actualCents - expectedCents)
  return {
    metric,
    reference,
    expectedCents,
    actualCents,
    differenceCents,
    toleranceCents,
    passed: differenceCents <= toleranceCents,
  }
}

export function compareAcceptance(
  expectation: unknown,
  actual: Readonly<CalculationOutput>,
): AcceptanceReport {
  const parsed = acceptanceExpectationSchema.safeParse(expectation)
  if (!parsed.success) throw new AcceptanceInputError()

  const expected = parsed.data
  const comparisons: AcceptanceComparison[] = [
    comparison(
      'recorded_costs_cents',
      expected.reference,
      expected.totals.recordedCostsCents,
      actual.totals.recordedCostsCents,
      0,
    ),
    comparison(
      'heating_total_cents',
      expected.reference,
      expected.totals.heatingTotalCents,
      actual.heating.totalCents,
      0,
    ),
    comparison(
      'co2_tenant_cents',
      expected.reference,
      expected.totals.co2TenantCents,
      actual.co2.tenantCents,
      0,
    ),
    comparison(
      'co2_landlord_cents',
      expected.reference,
      expected.totals.co2LandlordCents,
      actual.co2.landlordCents,
      0,
    ),
    comparison(
      'prepayments_cents',
      expected.reference,
      expected.totals.prepaymentsCents,
      actual.totals.prepaymentsCents,
      0,
    ),
    comparison(
      'vacancy_landlord_cents',
      expected.reference,
      expected.totals.vacancyLandlordCents,
      actual.vacancyLandlordCents,
      0,
    ),
    comparison(
      'control_difference_cents',
      expected.reference,
      expected.totals.controlDifferenceCents,
      actual.totals.controlDifferenceCents,
      1,
    ),
  ]
  const issues: AcceptanceIssue[] = []
  const expectedIds = new Set(
    expected.occupancies.map(({ calculationResultId }) => calculationResultId),
  )
  const actualCounts = new Map<string, number>()
  for (const occupancy of actual.tenants) {
    actualCounts.set(occupancy.id, (actualCounts.get(occupancy.id) ?? 0) + 1)
  }
  const actualById = new Map(
    actual.tenants.map((occupancy) => [occupancy.id, occupancy]),
  )

  for (const occupancy of expected.occupancies) {
    const result = actualById.get(occupancy.calculationResultId)
    if (result === undefined) {
      issues.push({
        code: 'missing_occupancy',
        reference: occupancy.reference,
      })
      continue
    }
    if (result.isVacancy !== occupancy.isVacancy) {
      issues.push({
        code: 'occupancy_kind_mismatch',
        reference: occupancy.reference,
      })
    }
    comparisons.push(
      comparison(
        'share_cents',
        occupancy.reference,
        occupancy.shareCents,
        result.shareCents,
        1,
      ),
      comparison(
        'prepayment_cents',
        occupancy.reference,
        occupancy.prepaymentCents,
        result.prepaymentCents,
        0,
      ),
      comparison(
        'balance_cents',
        occupancy.reference,
        occupancy.balanceCents,
        result.balanceCents,
        1,
      ),
    )
  }

  const unexpectedCount = actual.tenants.filter(
    ({ id }) => !expectedIds.has(id),
  ).length
  if (unexpectedCount > 0) {
    issues.push({ code: 'unexpected_occupancy', count: unexpectedCount })
  }
  const duplicateCount = Array.from(actualCounts.values()).filter(
    (count) => count > 1,
  ).length
  if (duplicateCount > 0) {
    issues.push({ code: 'duplicate_actual_occupancy', count: duplicateCount })
  }

  return {
    reference: expected.reference,
    passed: issues.length === 0 && comparisons.every(({ passed }) => passed),
    comparisons,
    issues,
  }
}
