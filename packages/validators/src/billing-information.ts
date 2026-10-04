/**
 * Prüfungen der Abrechnungsangaben, die Mieter in der Einzelabrechnung
 * nachvollziehen können müssen: § 6a HeizKV (Vergleichswerte, Anteile der
 * Energieträger), Energierechnungen leitungsgebundener Energie und eindeutig
 * bezeichnete Belege.
 */
import { isGridEnergySource } from '@nebenkosten/core'
import type {
  AppDataFile,
  BillingPeriod,
  EnergySource,
  FuelDelivery,
  ValidationIssue,
} from '@nebenkosten/schema'
import { blank, periodCategories } from './helpers'
import { issue } from './issues'

type Add = (value: ValidationIssue) => void

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

function formatEuro(cents: number): string {
  return `${(cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function hasQuantity(delivery: FuelDelivery): boolean {
  return (delivery.quantity?.value ?? 0) > 0
}

function stocksFor(data: AppDataFile, period: BillingPeriod, sourceId: string) {
  return data.billingData.fuelStocks.filter(
    ({ energySourceId, billingPeriodId }) =>
      energySourceId === sourceId && billingPeriodId === period.id,
  )
}

/** Leitungsgebundene Energie ohne Lagerbestand im Abrechnungsjahr. */
function isGridWithoutStock(
  data: AppDataFile,
  period: BillingPeriod,
  source: EnergySource,
): boolean {
  return (
    isGridEnergySource(source) &&
    stocksFor(data, period, source.id).every(
      (stock) =>
        (stock.openingQuantity?.value ?? 0) <= 0 &&
        (stock.openingValueCents ?? 0) === 0 &&
        (stock.remainingQuantity?.value ?? 0) <= 0,
    )
  )
}

function energyInvoices(
  data: AppDataFile,
  period: BillingPeriod,
  source: EnergySource,
  deliveries: readonly FuelDelivery[],
  add: Add,
): void {
  const grid = isGridWithoutStock(data, period, source)
  for (const delivery of deliveries) {
    if (!delivery.amountCents) continue
    const entity = { type: 'FuelDelivery', id: delivery.id }
    const invoice = delivery.date
      ? `Rechnung vom ${formatDate(delivery.date)} über ${formatEuro(delivery.amountCents)}`
      : `Rechnung ohne Datum über ${formatEuro(delivery.amountCents)}`
    if (grid && !hasQuantity(delivery))
      add(
        issue(
          'warning',
          'heating.energy_invoice_quantity_missing',
          'heating',
          'Energierechnung ohne Mengenangabe (kWh)',
          {
            entity,
            detail: `${invoice}: Bitte die abgerechnete Menge in kWh und den Liefer-/Verbrauchszeitraum aus der Rechnung ergänzen. Ohne Menge lassen sich die Anteile der Energieträger (§ 6a HeizKV) nicht angeben.`,
          },
        ),
      )
    const outsidePeriod =
      !delivery.date ||
      delivery.date < period.periodStart ||
      delivery.date > period.periodEnd
    if (grid && outsidePeriod && blank(delivery.description))
      add(
        issue(
          'warning',
          'heating.energy_invoice_period_missing',
          'heating',
          'Verbrauchszeitraum der Energierechnung fehlt',
          {
            entity,
            detail: `${invoice} liegt außerhalb des Abrechnungszeitraums. Bitte in der Beschreibung angeben, welchen Liefer- bzw. Verbrauchszeitraum die Rechnung abrechnet (z. B. „Jahresabrechnung Verbrauchszeitraum 01.01.–31.12.${period.year}“).`,
          },
        ),
      )
    if (!grid && !hasQuantity(delivery) && blank(delivery.description))
      add(
        issue(
          'warning',
          'heating.cost_only_delivery_unlabelled',
          'heating',
          'Rechnung ohne Liefermenge ist nicht bezeichnet',
          {
            entity,
            detail: `${invoice}: Bitte in der Beschreibung angeben, wofür der Betrag anfällt (z. B. Fracht oder Mindermengenzuschlag laut Rechnung), damit die Position in der Abrechnung nicht als Lieferung ohne Menge erscheint.`,
          },
        ),
      )
  }
}

/** Energieeinsatz in kWh ist nur mit Menge und (außer bei kWh) Heizwert ermittelbar. */
function energyInputKnown(
  data: AppDataFile,
  period: BillingPeriod,
  source: EnergySource,
  deliveries: readonly FuelDelivery[],
): boolean {
  const stocks = stocksFor(data, period, source.id)
  const quantities = [
    ...deliveries.flatMap(({ quantity }) =>
      quantity && quantity.value > 0 ? [quantity] : [],
    ),
    ...stocks.flatMap(({ openingQuantity }) =>
      openingQuantity && openingQuantity.value > 0 ? [openingQuantity] : [],
    ),
  ]
  const hasCost =
    deliveries.some(({ amountCents }) => (amountCents ?? 0) > 0) ||
    stocks.some(({ openingValueCents }) => (openingValueCents ?? 0) > 0)
  if (!hasCost) return true
  if (quantities.length === 0) return false
  return (
    quantities.every(({ unit }) => unit === 'kWh') ||
    (source.calorificValueKwhPerUnit ?? 0) > 0
  )
}

export function heatingInformation(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  const circuits = data.billingData.heatingCircuits.filter(
    ({ billingPeriodId }) => billingPeriodId === period.id,
  )
  if (circuits.length === 0) return
  add(
    issue(
      'warning',
      'heating.consumption_benchmark_missing',
      'heating',
      '§ 6a HeizKV: Vergleich mit normiertem Durchschnittsnutzer fehlt',
      {
        entity: { type: 'BillingPeriod', id: period.id },
        detail:
          'Die Einzelabrechnungen enthalten keinen Vergleich mit einem normierten oder durch Vergleichstests ermittelten Durchschnittsnutzer derselben Nutzerkategorie (§ 6a Abs. 3 HeizKV). Der mittlere Verbrauch des eigenen Heizkreises ersetzt diesen Vergleich nicht. Bei unvollständigen Angaben nach § 6a HeizKV kann der Mieter seinen Heizkostenanteil um 3 % kürzen (§ 12 Abs. 1 HeizKV).',
      },
    ),
  )
  for (const circuit of circuits) {
    const sources = data.billingData.energySources.filter(
      ({ heatingCircuitId }) => heatingCircuitId === circuit.id,
    )
    const unknownShare: string[] = []
    for (const source of sources) {
      const deliveries = data.billingData.fuelDeliveries.filter(
        ({ energySourceId, billingPeriodId }) =>
          energySourceId === source.id && billingPeriodId === period.id,
      )
      energyInvoices(data, period, source, deliveries, add)
      if (!energyInputKnown(data, period, source, deliveries))
        unknownShare.push(source.name ?? source.sourceType ?? source.key)
    }
    if (sources.length > 1 && unknownShare.length > 0)
      add(
        issue(
          'warning',
          'heating.energy_share_not_determinable',
          'heating',
          'Anteile der Energieträger nicht ermittelbar',
          {
            entity: { type: 'HeatingCircuit', id: circuit.id },
            detail: `Für ${unknownShare.join(', ')} fehlt die Menge oder der Heizwert. Die Einzelabrechnung nennt dann nur die Energieträger ohne ihre Anteile am Energieeinsatz (§ 6a Abs. 3 HeizKV).`,
          },
        ),
      )
  }
}

function normalizedDescription(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE')
}

/**
 * Gleich bezeichnete Belege derselben Kostenart am selben Tag wirken in der
 * Abrechnung wie eine Doppelposition. Nicht löschen, sondern eindeutig
 * bezeichnen oder Doppelerfassung prüfen.
 */
export function ambiguousCostEntries(
  data: AppDataFile,
  period: BillingPeriod,
  add: Add,
): void {
  for (const category of periodCategories(data, period.id)) {
    const groups = new Map<string, typeof data.billingData.costEntries>()
    for (const entry of data.billingData.costEntries) {
      if (entry.costCategoryId !== category.id || !entry.date) continue
      if (entry.amountCents === 0) continue
      const key = `${entry.date}|${normalizedDescription(entry.description)}`
      groups.set(key, [...(groups.get(key) ?? []), entry])
    }
    for (const entries of groups.values()) {
      if (entries.length < 2) continue
      const [first] = entries
      const label = category.statementText ?? category.label
      const description = first!.description?.trim() || 'ohne Beschreibung'
      add(
        issue(
          'warning',
          'costs.entry_ambiguous',
          'costs',
          'Gleich bezeichnete Belege am selben Tag',
          {
            entity: { type: 'CostEntry', id: first!.id },
            detail: `${label}: ${entries.length} Belege vom ${formatDate(first!.date!)} mit der Bezeichnung „${description}“ (${entries
              .map(({ amountCents }) => formatEuro(amountCents))
              .join(
                ', ',
              )}). Bitte anhand der Originalrechnungen die Leistungen eindeutig bezeichnen (z. B. „Abgaswegeüberprüfung/Emissionsmessung“ und „Kehrarbeiten“) oder eine Doppelerfassung bereinigen.`,
          },
        ),
      )
    }
  }
}
