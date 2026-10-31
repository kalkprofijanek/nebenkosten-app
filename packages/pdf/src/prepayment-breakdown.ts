import {
  calculateMonthlyOccupancyFactor,
  calculateOccupancyDays,
  calculatePeriodDays,
} from '@nebenkosten/core'
import type { TenantStatementContext } from './contracts'
import { formatEuroCents } from './format'

const monthCount = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

/**
 * Rechenweg der Vorauszahlungen für die Zusammenfassung der Einzelabrechnung,
 * z. B. „12 × 280,00 € = 3.360,00 €“. Er folgt derselben Logik wie
 * calculatePrepaymentCents: Monatsbetrag × Monate der Nutzung bzw.
 * Jahresbetrag anteilig nach Tagen. Ohne vereinbarte Vorauszahlung entfällt
 * die Zeile.
 *
 * Grundlage ist der vereinbarte Betrag (Soll); tatsächliche Zahlungseingänge
 * sind nicht Teil der Abrechnungsdaten.
 */
export function prepaymentBreakdown(
  context: TenantStatementContext,
  prepaymentCents: number,
): string | undefined {
  const { appData, billingPeriod, occupancyPeriod } = context
  const prepayment = appData.billingData.prepayments.find(
    (candidate) => candidate.occupancyPeriodId === occupancyPeriod.id,
  )
  if (!prepayment || prepayment.mode === 'none_agreed') return undefined
  const total = formatEuroCents(prepaymentCents)

  if (prepayment.mode === 'monthly') {
    if (prepayment.monthlyAmountCents === 0) return undefined
    const months = calculateMonthlyOccupancyFactor(
      billingPeriod.periodStart,
      billingPeriod.periodEnd,
      occupancyPeriod.from,
      occupancyPeriod.to,
    )
    const amount = formatEuroCents(prepayment.monthlyAmountCents)
    const factor = Number.isInteger(months)
      ? String(months)
      : `${monthCount.format(months)} Monate`
    return `${factor} × ${amount} = ${total}`
  }

  if (prepayment.annualAmountCents === 0) return undefined
  const periodDays = calculatePeriodDays(
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
  )
  const occupiedDays = calculateOccupancyDays(
    billingPeriod.periodStart,
    billingPeriod.periodEnd,
    occupancyPeriod.from,
    occupancyPeriod.to,
  )
  const annual = formatEuroCents(prepayment.annualAmountCents)
  if (occupiedDays >= periodDays) return `Jahresbetrag ${annual}`
  return `${annual} × ${occupiedDays}/${periodDays} Tage = ${total}`
}
