import type { AppDataFile } from '@nebenkosten/schema'
import { applyEditableBillingPeriodChange } from '../release/edit-guard'

export function guardMeterPeriods(
  data: AppDataFile,
  periodIds: readonly (string | null | undefined)[],
): AppDataFile {
  return [
    ...new Set(periodIds.filter((id): id is string => id != null)),
  ].reduce(
    (current, periodId) =>
      applyEditableBillingPeriodChange(
        current,
        periodId,
        (editable) => editable,
      ),
    data,
  )
}

export function meterPeriodIds(
  data: AppDataFile,
  meterId: string,
): readonly string[] {
  return [
    ...new Set([
      ...data.billingData.heatingCircuits
        .filter((circuit) =>
          circuit.meterAssignments?.some(
            (assignment) => assignment.meterId === meterId,
          ),
        )
        .map((circuit) => circuit.billingPeriodId),
      ...data.billingData.meterReadings
        .filter((reading) => reading.meterId === meterId)
        .flatMap((reading) =>
          reading.billingPeriodId ? [reading.billingPeriodId] : [],
        ),
    ]),
  ]
}

export function shiftMeterDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
