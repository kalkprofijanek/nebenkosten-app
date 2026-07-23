import {
  CURRENT_SCHEMA_VERSION,
  appDataFileSchema,
  type ValidationIssue,
} from '@nebenkosten/schema'
import { calculateBilling, createCalculationInput } from '@nebenkosten/core'
import { issue, keyed } from './issues'
import { collectStaticIssues } from './static-validation'
import type { ValidationOptions, ValidationReport } from './types'

function report(
  id: string,
  rawIssues: ValidationIssue[],
  options: ValidationOptions,
): ValidationReport {
  const issues = rawIssues.map(keyed).sort((a, b) => a.key.localeCompare(b.key))
  const confirmed = new Set(options.confirmedWarningKeys ?? [])
  const unconfirmedWarningKeys = issues
    .filter(
      ({ severity, key }) => severity === 'warning' && !confirmed.has(key),
    )
    .map(({ key }) => key)
  const errorCount = issues.filter(
    ({ severity }) => severity === 'error',
  ).length
  const warningCount = issues.filter(
    ({ severity }) => severity === 'warning',
  ).length
  const infoCount = issues.length - errorCount - warningCount
  return {
    billingPeriodId: id,
    issues,
    errorCount,
    warningCount,
    infoCount,
    unconfirmedWarningKeys,
    canBecomeReady: errorCount === 0 && unconfirmedWarningKeys.length === 0,
  }
}

export function validateBillingPeriod(
  data: unknown,
  billingPeriodId: string,
  options: ValidationOptions = {},
): ValidationReport {
  const schemaVersion =
    data && typeof data === 'object'
      ? Reflect.get(data, 'schemaVersion')
      : undefined
  if (schemaVersion !== CURRENT_SCHEMA_VERSION)
    return report(
      billingPeriodId,
      [
        issue(
          'error',
          'schema.unsupported_version',
          'schema',
          'Nicht unterstützte Schema-Version',
        ),
      ],
      options,
    )
  const parsed = appDataFileSchema.safeParse(data)
  if (!parsed.success)
    return report(
      billingPeriodId,
      [
        issue(
          'error',
          'schema.unsupported_version',
          'schema',
          'Dateiformat ist ungültig',
          { detail: 'Die Datei entspricht nicht dem unterstützten Schema.' },
        ),
      ],
      options,
    )
  const period = parsed.data.billingData.billingPeriods.find(
    ({ id }) => id === billingPeriodId,
  )
  if (!period)
    return report(
      billingPeriodId,
      [
        issue(
          'error',
          'billing_period.not_found',
          'billing_period',
          'Abrechnungsperiode wurde nicht gefunden',
        ),
      ],
      options,
    )
  const issues = collectStaticIssues(parsed.data, period)
  try {
    const output = calculateBilling(
      createCalculationInput(parsed.data, billingPeriodId),
    )
    if (Math.abs(output.totals.controlDifferenceCents) > 1)
      issues.push(
        issue(
          'error',
          'totals.control_difference',
          'totals',
          'Kontrolldifferenz ist größer als 1 Cent',
          { entity: { type: 'BillingPeriod', id: billingPeriodId } },
        ),
      )
    if (Math.abs(output.heating.unallocatedLandlordCents) > 1)
      issues.push(
        issue(
          'error',
          'heating.unallocated_share',
          'heating',
          'Heizkostenanteil ist nicht zugeordnet',
          { entity: { type: 'BillingPeriod', id: billingPeriodId } },
        ),
      )
    if (Math.abs(output.heating.operatingElectricity.uncoveredCents) > 1)
      issues.push(
        issue(
          'warning',
          'heating.operating_electricity_uncovered',
          'heating',
          'Betriebsstrom ist nicht vollständig gedeckt',
          { entity: { type: 'BillingPeriod', id: billingPeriodId } },
        ),
      )
    for (const circuit of output.heating.trace.circuits)
      if (Math.abs(circuit.reconciliation.roundingDifferenceCents) > 1)
        issues.push(
          issue(
            'error',
            'co2.reconciliation_failed',
            'co2',
            'Heiz-/CO₂-Abstimmung ist nicht ausgeglichen',
            {
              entity: {
                type: 'HeatingCircuit',
                id: circuit.heatingCircuitId ?? circuit.buildingId,
              },
            },
          ),
        )
    if (Math.abs(output.totals.unallocatedCents) > 1)
      issues.push(
        issue(
          'error',
          'totals.unallocated_costs',
          'totals',
          'Kosten sind nicht vollständig zugeordnet',
          { entity: { type: 'BillingPeriod', id: billingPeriodId } },
        ),
      )
  } catch {
    issues.push(
      issue(
        'error',
        'totals.calculation_missing',
        'totals',
        'Aktuelle Berechnung konnte nicht erstellt werden',
        { entity: { type: 'BillingPeriod', id: billingPeriodId } },
      ),
    )
  }
  return report(billingPeriodId, issues, options)
}
