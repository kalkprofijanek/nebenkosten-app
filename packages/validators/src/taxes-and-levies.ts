/**
 * § 6a Abs. 3 Nr. 1 b HeizKV (ADR-0011): Die Abrechnung soll die in den
 * Energiekosten erhobenen Steuern und Abgaben ausweisen. Ohne erfasste
 * Angaben an den Lieferungen nennt die Einzelabrechnung nur einen
 * allgemeinen Hinweis mit dem CO₂-Betrag.
 */
import type {
  AppDataFile,
  BillingPeriod,
  FuelDelivery,
  HeatingCircuit,
  ValidationIssue,
} from '@nebenkosten/schema'
import { issue } from './issues'

function hasTaxesAndLevies(delivery: FuelDelivery): boolean {
  const taxes = delivery.taxesAndLevies
  return (
    taxes != null &&
    [
      taxes.vatCents,
      taxes.energyTaxCents,
      taxes.co2LevyCents,
      taxes.otherLeviesCents,
    ].some((value) => value != null)
  )
}

/**
 * Hinweis `heating.taxes_and_levies_missing` je Heizkreis, wenn für
 * Lieferungen mit Rechnungsbetrag im Zeitraum keine Steuern und Abgaben
 * erfasst sind. Schweregrad `info`: Ob eine fehlende Angabe das
 * Kürzungsrecht nach § 12 Abs. 1 HeizKV auslöst, ist streitig.
 */
export function taxesAndLeviesIssues(
  data: AppDataFile,
  period: BillingPeriod,
  circuit: HeatingCircuit,
  add: (value: ValidationIssue) => void,
): void {
  const sourceIds = new Set(
    data.billingData.energySources
      .filter(({ heatingCircuitId }) => heatingCircuitId === circuit.id)
      .map(({ id }) => id),
  )
  const invoices = data.billingData.fuelDeliveries.filter(
    (delivery) =>
      sourceIds.has(delivery.energySourceId) &&
      delivery.billingPeriodId === period.id &&
      (delivery.amountCents ?? 0) > 0,
  )
  const missing = invoices.filter((delivery) => !hasTaxesAndLevies(delivery))
  if (missing.length === 0) return
  const scope =
    missing.length === invoices.length
      ? 'Für keine Brennstoff- bzw. Energierechnung dieses Heizkreises'
      : `Für ${missing.length} von ${invoices.length} Brennstoff- bzw. Energierechnungen dieses Heizkreises`
  add(
    issue(
      'info',
      'heating.taxes_and_levies_missing',
      'heating',
      '§ 6a HeizKV: Steuern und Abgaben der Energierechnungen nicht erfasst',
      {
        entity: { type: 'HeatingCircuit', id: circuit.id },
        detail: `${scope} sind Umsatzsteuer, Energie- bzw. Stromsteuer, CO2-Kosten nach BEHG und sonstige Abgaben erfasst. Die Einzelabrechnung soll die erhobenen Steuern und Abgaben angeben (§ 6a Abs. 3 Nr. 1 b HeizKV); ohne Angaben nennt sie nur einen allgemeinen Hinweis mit den berechneten CO2-Kosten. Ob dann ein Kürzungsrecht von 3 % nach § 12 Abs. 1 HeizKV besteht, ist streitig. Bitte die Beträge aus den Rechnungen bei den Lieferungen ergänzen.`,
      },
    ),
  )
}
