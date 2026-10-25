/**
 * Prüfungen zum Entgelt der Abrechnungsdienstleistung (ADR-0015):
 * Doppelansätze je Heizkreis und Abgleich der Rechnungsangaben (Netto,
 * Umsatzsteuer) mit dem Belegbetrag.
 */
import { isBillingServiceCategory } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  CostCategory,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

const euro = (cents: number) =>
  `${(cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`

function amountCents(data: AppDataFile, category: CostCategory): number {
  const entries = data.billingData.costEntries.filter(
    ({ costCategoryId }) => costCategoryId === category.id,
  )
  return entries.length > 0
    ? entries.reduce((sum, entry) => sum + entry.amountCents, 0)
    : (category.totalAmountCents ?? 0)
}

/** Mehr als eine Abrechnungsdienstleistung mit Betrag im Heizkreis. */
export function billingServiceDuplicateIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  for (const circuit of data.billingData.heatingCircuits) {
    if (circuit.billingPeriodId !== period.id) continue
    const services = data.billingData.costCategories.filter(
      (category) =>
        category.billingPeriodId === period.id &&
        category.scope?.kind === 'building' &&
        category.scope.buildingId === circuit.buildingId &&
        isBillingServiceCategory(category) &&
        amountCents(data, category) !== 0,
    )
    if (services.length < 2) continue
    add(
      issue(
        'warning',
        'heating.billing_service_duplicate',
        'heating',
        'Abrechnungsdienstleistung möglicherweise doppelt angesetzt',
        {
          entity: { type: 'HeatingCircuit', id: circuit.id },
          detail: `Für diesen Heizkreis sind mehrere Kostenarten für die Erstellung der Heiz-/Warmwasserkostenabrechnung erfasst: ${services
            .map(
              (category) =>
                `„${category.label}“ (${euro(amountCents(data, category))})`,
            )
            .join(
              ', ',
            )}. Bitte prüfen, ob dieselbe Leistung doppelt berechnet wurde (z. B. Messdienst mit Abrechnung und zusätzlicher Abrechnungsdienstleister). Gerätemiete, Ablesung und Eichung als eigene Art des Entgelts kennzeichnen; sie zählen hier nicht.`,
        },
      ),
    )
  }
}

/**
 * Netto + Umsatzsteuer muss dem Belegbetrag entsprechen; mit Steuersatz
 * muss die Umsatzsteuer zum Nettobetrag passen (Toleranz 1 Cent).
 */
export function invoiceAmountIssues(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const categories = new Set(
    data.billingData.costCategories
      .filter(({ billingPeriodId }) => billingPeriodId === period.id)
      .map(({ id }) => id),
  )
  for (const entry of data.billingData.costEntries) {
    const invoice = entry.invoice
    if (!invoice || !categories.has(entry.costCategoryId)) continue
    const { netCents, vatCents, vatRatePercent } = invoice
    if (netCents == null || vatCents == null) continue
    const problems: string[] = []
    if (Math.abs(netCents + vatCents - entry.amountCents) > 1)
      problems.push(
        `Netto ${euro(netCents)} + Umsatzsteuer ${euro(vatCents)} = ${euro(netCents + vatCents)}, Belegbetrag ${euro(entry.amountCents)}`,
      )
    if (
      vatRatePercent != null &&
      Math.abs(Math.round((netCents * vatRatePercent) / 100) - vatCents) > 1
    )
      problems.push(
        `${vatRatePercent} % von ${euro(netCents)} sind ${euro(Math.round((netCents * vatRatePercent) / 100))}, angegeben ${euro(vatCents)}`,
      )
    if (problems.length === 0) continue
    add(
      issue(
        'warning',
        'costs.invoice_amount_mismatch',
        'costs',
        'Rechnungsangaben passen nicht zum Belegbetrag',
        {
          entity: { type: 'CostEntry', id: entry.id },
          detail: `${problems.join('; ')}. Bei Wohnraum ohne Vorsteuerabzug wird der Bruttobetrag umgelegt; bitte Netto, Umsatzsteuer und Belegbetrag anhand der Rechnung prüfen.`,
        },
      ),
    )
  }
}
