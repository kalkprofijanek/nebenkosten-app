import { section9bShares, type Section9bShare } from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'

const flexible = (value: number) =>
  value.toLocaleString('de-DE', { maximumFractionDigits: 3 })

/** Anteil nach § 9b Abs. 3 HeizKV dieser Nutzung, falls festgelegt. */
export function occupancySection9bShare(
  context: TenantStatementContext,
): Section9bShare | undefined {
  return section9bShares(
    context.appData.billingData.occupancyPeriods.filter(
      ({ billingPeriodId }) => billingPeriodId === context.billingPeriod.id,
    ),
    context.billingPeriod,
  ).get(context.occupancyPeriod.id)
}

/**
 * Faktor der Grundkosten im Rechenweg: „90/365 Tage“ bzw. nach § 9b Abs. 3
 * „450 ‰ ÷ 1.000 ‰“ (bei Teilabdeckung mit dem Zeitanteil der Gruppe).
 * Gleicher Faktor wie im Rechenkern (`heatingBaseTimeFactor`), damit der
 * gedruckte Rechenweg den Betrag ergibt.
 */
export function section9bBaseFactorText(
  share: Section9bShare | undefined,
  timeText: string,
  periodDays: number,
): string {
  if (share?.allocation !== 'degree_days') return timeText
  const ratio = `${flexible(share.permille)} ‰ ÷ ${flexible(share.groupPermille)} ‰`
  const groupDays = Math.round(share.groupTimeFactor * periodDays)
  return groupDays === periodDays
    ? ratio
    : `${groupDays}/${periodDays} Tage × ${ratio}`
}
