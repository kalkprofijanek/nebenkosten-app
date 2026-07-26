import type { CalculationRun } from '@nebenkosten/schema'

/** Wählt den zeitlich jüngsten Lauf; bei Gleichstand gewinnt der spätere Eintrag. */
export function latestCalculationRun(
  runs: readonly CalculationRun[],
  billingPeriodId: string,
): CalculationRun | undefined {
  return runs
    .filter((run) => run.billingPeriodId === billingPeriodId)
    .reduce<CalculationRun | undefined>((latest, run) => {
      if (!latest) return run
      return Date.parse(run.startedAt) >= Date.parse(latest.startedAt)
        ? run
        : latest
    }, undefined)
}
